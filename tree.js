// Turns a solved spoiler into a requirement tree for one target.
//
// Tree node: { key, kind, cat, label, sub, why, sphere, ok, route, ref, shown, closed, target, detail, kids, lazy }
//   kind  goal | item | start | check | region | gate | event | group | all | any | alts | alt | time | missing | not | note
//   cat   for boxes that stand for an item, the kind of item (see itemCategory), used for colour
//   ok    false when the thing is not obtainable/reachable in this seed
//   ref   the same thing is expanded elsewhere in the tree (same key)
//   closed  built, but starts collapsed
//   lazy  () => kids, for branches that are only built when the user expands them
(function (root) {
    const RG = (root.RG = root.RG || {});
    const START = "RR_MAX";
    const GOAL_REGION = "RR_MOON_MAJORAS_LAIR";
    const MAX_DEPTH = 300;

    // The kind of item, as players think of it. Songs and souls are "major" items to the game, so names decide.
    function itemCategory(data, ri) {
        const type = data.items[ri] ? data.items[ri].type : "";
        if (/^RI_(SONG_|PROGRESSIVE_LULLABY)/.test(ri)) {
            return "song";
        }
        if (type === "RITYPE_MASK") {
            return "mask";
        }
        if (type === "RITYPE_SMALL_KEY" || type === "RITYPE_BOSS_KEY") {
            return "key";
        }
        if (type === "RITYPE_STRAY_FAIRY" || type === "RITYPE_SKULLTULA_TOKEN" || /^RI_TRIFORCE_PIECE/.test(ri)) {
            return "collect";
        }
        if (/^RI_SOUL_/.test(ri)) {
            return "soul";
        }
        if (type === "RITYPE_JUNK") {
            return "junk";
        }
        return "gear";
    }

    const checkLabel = (id) => RG.humanize(id.replace(/^RC_/, ""));
    const regionLabel = (id) => (id === START ? "Start" : RG.humanize(id.replace(/^RR_/, "")));
    const eventLabel = (id) => RG.humanize(id.replace(/^RE_/, ""));

    function listTargets(result) {
        const { data, logic, placements, checkRegions, checkInfo } = result;
        const targets = [{ id: "goal:majora", kind: "goal", label: "Beat the game", sub: "Reach Majora's Lair" }];

        const copies = new Map();
        for (const check of checkRegions.keys()) {
            const ri = placements.get(check);
            const item = data.items[ri];
            if (!item || item.type === "RITYPE_JUNK") {
                continue;
            }
            copies.set(ri, (copies.get(ri) || 0) + 1);
        }
        for (const [ri, count] of [...copies].sort((a, b) => logic.itemName(a[0]).localeCompare(logic.itemName(b[0])))) {
            targets.push({ id: `item:${ri}`, kind: "item", label: logic.itemName(ri), sub: count === 1 ? "1 location" : `${count} locations` });
        }
        for (const check of [...checkRegions.keys()].sort()) {
            targets.push({
                id: `check:${check}`,
                kind: "check",
                label: checkLabel(check),
                sub: `holds ${logic.itemName(placements.get(check))}${checkInfo.has(check) ? "" : " (out of logic)"}`,
            });
        }
        for (const id of [...result.regions.keys()].sort()) {
            if (id !== START) {
                targets.push({ id: `region:${id}`, kind: "region", label: regionLabel(id), sub: "region" });
            }
        }
        for (const event of [...result.eventInfo.keys()].sort()) {
            targets.push({ id: `event:${event}`, kind: "event", label: eventLabel(event), sub: "event" });
        }
        return targets;
    }

    function buildTree(result, target, buildOptions) {
        const { data, logic, state, placements, regionInfo, timeStates, checkRegions, checkInfo, eventInfo, incoming } = result;
        const hideStart = !buildOptions || buildOptions.hideStart !== false;
        const seen = new Set();
        const category = (ri) => itemCategory(data, ri);

        const finalTime = (regionId) => (timeStates.has(regionId) ? timeStates.get(regionId).mask : 0n);

        // When a resolved condition first became true, as { order, sphere }; order is Infinity when it never did.
        const NEVER = { order: Infinity, sphere: null };
        const ALWAYS = { order: 0, sphere: 0 };
        function avail(node, regionId) {
            switch (node.t) {
                case "const":
                    return node.v ? ALWAYS : NEVER;
                case "and":
                    return node.kids.map((kid) => avail(kid, regionId)).reduce((a, b) => (b.order > a.order ? b : a), ALWAYS);
                case "or":
                    return node.kids.map((kid) => avail(kid, regionId)).reduce((a, b) => (b.order < a.order ? b : a), NEVER);
                case "group":
                    return avail(node.kid, regionId);
                case "fact":
                    return state.source.get(node.fact) || NEVER;
                case "event": {
                    const def = (eventInfo.get(node.event) || [])[node.count - 1];
                    return def && def.info ? def.info : NEVER;
                }
                case "time":
                    return finalTime(regionId) & node.mask ? ALWAYS : NEVER;
                case "not":
                    return result.evaluate(node, finalTime(regionId)) ? ALWAYS : NEVER;
                default:
                    return NEVER;
            }
        }

        function summarize(node) {
            switch (node.t) {
                case "const":
                    return node.v ? "Always" : "Never";
                case "and":
                    return node.kids.map(summarize).join(" + ");
                case "or":
                    return `(${node.kids.map(summarize).join(" or ")})`;
                case "group":
                    return node.label;
                case "fact":
                    return node.label;
                case "event":
                    return eventLabel(node.event) + (node.count > 1 ? ` ×${node.count}` : "");
                case "time":
                    return node.label;
                case "not":
                    return `not ${summarize(node.kid)}`;
                default:
                    return node.t;
            }
        }

        function regionPath(regionId) {
            const path = [];
            for (let id = regionId; id && regionInfo.has(id); ) {
                path.unshift(id);
                const parent = regionInfo.get(id).parent;
                id = parent ? parent.from : null;
            }
            return path;
        }

        // The same requirement often appears several times in one list (every door needing the Deku Mask...).
        function dedupe(kids) {
            const keys = new Set();
            return kids.filter((kid) => {
                const id = kid.key || (kid.kind === "start" ? `start:${kid.label}` : null);
                if (!id) {
                    return true;
                }
                if (keys.has(id)) {
                    return false;
                }
                keys.add(id);
                return true;
            });
        }

        const wrapAll = (label, kids, extra) =>
            kids.length === 1 && !extra ? kids[0] : { kind: "all", label, sub: "all of these", kids, ...extra };

        function explainCond(node, regionId, depth) {
            if (depth > MAX_DEPTH) {
                return [{ kind: "note", label: "…", sub: "too deep to show" }];
            }
            if (hideStart && node.t !== "const" && avail(node, regionId).order === 0) {
                return [];
            }
            switch (node.t) {
                case "const":
                    return node.v ? [] : [{ kind: "missing", ok: false, label: "Never possible", sub: "ruled out by this seed's settings" }];
                case "and":
                    return dedupe(node.kids.flatMap((kid) => explainCond(kid, regionId, depth)));
                case "group": {
                    const kids = explainCond(node.kid, regionId, depth + 1);
                    if (kids.length === 0) {
                        return [];
                    }
                    if (kids.length === 1) {
                        const only = kids[0];
                        if (only.kind === "any") {
                            return [{ ...only, label: node.label, sub: "any one of these" }];
                        }
                        return [{ ...only, why: only.why || node.label }];
                    }
                    const ok = kids.every((kid) => kid.ok !== false);
                    return [{ kind: "group", label: node.label, sub: "all of these", ok, kids }];
                }
                case "or": {
                    const ranked = node.kids.map((kid) => ({ kid, when: avail(kid, regionId) })).sort((a, b) => a.when.order - b.when.order);
                    const best = ranked[0];
                    const altNode = ({ kid, when }) => ({
                        kind: "alt",
                        label: summarize(kid),
                        sub: when.order === Infinity ? "not available in this seed" : when.sphere ? `available in sphere ${when.sphere}` : "available from the start",
                        ok: when.order !== Infinity,
                        sphere: when.sphere,
                        lazy: () => explainCond(kid, regionId, 0),
                    });
                    if (best.when.order === Infinity) {
                        return [{ kind: "any", label: "Any one of", sub: "none available in this seed", ok: false, kids: ranked.map(altNode) }];
                    }
                    const routeKids = explainCond(best.kid, regionId, depth + 1);
                    const route = routeKids.length === 0
                        ? { kind: "start", label: summarize(best.kid), sub: "available from the start" }
                        : wrapAll(summarize(best.kid), routeKids);
                    const others = ranked.slice(1);
                    return [
                        {
                            kind: "any",
                            label: "Any one of",
                            sub: `${ranked.length} ways`,
                            sphere: best.when.sphere,
                            shown: Boolean(route.ref || route.shown),
                            kids: [
                                { ...route, route: true },
                                {
                                    kind: "alts",
                                    label: others.length === 1 ? "1 other way" : `${others.length} other ways`,
                                    sub: `${others.filter((o) => o.when.order !== Infinity).length} available in this seed`,
                                    lazy: () => others.map(altNode),
                                },
                            ],
                        },
                    ];
                }
                case "fact":
                    return [explainFact(node.fact, depth)];
                case "event":
                    return [explainEvent(node.event, node.count, depth)];
                case "time": {
                    const ok = (finalTime(regionId) & node.mask) !== 0n;
                    return [{ kind: "time", label: node.label, sub: ok ? "time of day" : "this time is never available here", ok }];
                }
                case "not": {
                    const ok = result.evaluate(node, finalTime(regionId));
                    return [{ kind: "not", label: `Not: ${summarize(node.kid)}`, sub: ok ? "" : "not satisfied", ok }];
                }
                default:
                    return [{ kind: "note", label: node.t }];
            }
        }

        // Which placed items could ever grant a fact, for facts the seed never grants in logic.
        let providerIndex = null;
        const baseFact = (fact) => fact.replace(/#\d+$/, "#*");
        function providers(fact) {
            if (!providerIndex) {
                providerIndex = new Map();
                for (const ri of new Set(placements.values())) {
                    const scratch = logic.newState();
                    logic.give(scratch, ri, {});
                    logic.give(scratch, ri, {});
                    for (const granted of scratch.facts) {
                        const key = baseFact(granted);
                        if (!providerIndex.has(key)) {
                            providerIndex.set(key, new Set());
                        }
                        providerIndex.get(key).add(ri);
                    }
                }
            }
            return providerIndex.get(baseFact(fact)) || new Set();
        }

        function itemNode(src, depth, collapsed) {
            if (src.start) {
                return { kind: "start", cat: category(src.ri), label: logic.itemName(src.ri), sub: "starting item", sphere: 0 };
            }
            const key = `item:${src.check}`;
            const base = {
                key,
                kind: "item",
                cat: category(src.ri),
                label: logic.itemName(src.ri),
                sub: `at ${checkLabel(src.check)}`,
                sphere: src.sphere,
                target: `check:${src.check}`,
                detail: checkDetail(src.check),
            };
            if (seen.has(key)) {
                return { ...base, sub: `${base.sub} · shown elsewhere`, ref: true };
            }
            seen.add(key);
            if (collapsed) {
                return { ...base, lazy: () => explainCheck(src.check, 0) };
            }
            return { ...base, kids: explainCheck(src.check, depth + 1) };
        }

        function explainFact(fact, depth) {
            const label = logic.factLabel(fact);
            const first = state.source.get(fact);
            if (!first) {
                const candidates = providers(fact);
                const holders = [...checkRegions.keys()].filter((check) => candidates.has(placements.get(check)));
                return {
                    kind: "missing",
                    ok: false,
                    label,
                    sub: holders.length ? "not obtainable in logic" : "no item in this seed provides it",
                    lazy: holders.length
                        ? () =>
                              holders.map((check) => {
                                  const info = checkInfo.get(check);
                                  return {
                                      kind: "item",
                                      cat: category(placements.get(check)),
                                      ok: Boolean(info),
                                      label: logic.itemName(placements.get(check)),
                                      sub: `at ${checkLabel(check)}${info ? "" : " (out of logic)"}`,
                                      sphere: info ? info.sphere : null,
                                      target: `check:${check}`,
                                      detail: checkDetail(check),
                                      lazy: () => explainCheck(check, 0),
                                  };
                              })
                        : null,
                };
            }

            // Counted and progressive facts depend on the copies collected before them.
            const sources = [];
            const used = new Set();
            for (let name = fact; name; ) {
                const src = state.source.get(name);
                const id = src.start ? `start:${src.ri}:${name}` : src.check;
                if (!used.has(id)) {
                    used.add(id);
                    sources.push(src);
                }
                name = src.dep;
            }
            if (sources.length === 1) {
                const node = itemNode(first, depth, false);
                return node.label === label ? node : { ...node, why: label };
            }
            const found = sources.filter((src) => !src.start);
            if (found.length === 0) {
                return { kind: "start", label, sub: "starting items", sphere: 0 };
            }
            found.sort((a, b) => a.order - b.order);
            const collapse = found.length > 3;
            return {
                kind: "all",
                label,
                sub: `${found.length} items${sources.length > found.length ? ` + ${sources.length - found.length} from the start` : ""}`,
                sphere: first.sphere,
                kids: found.map((src) => itemNode(src, depth, collapse)),
            };
        }

        function checkDetail(check) {
            const info = checkInfo.get(check);
            const entries = checkRegions.get(check) || [];
            const via = info ? info.via : entries[0];
            const lines = [
                ["Check", check],
                ["Holds", `${logic.itemName(placements.get(check))} (${placements.get(check)})`],
                ["Shuffled", result.shuffled.has(check) ? "yes" : "no (vanilla item)"],
                ["Sphere", info ? String(info.sphere) : "out of logic"],
            ];
            if (via) {
                lines.push(["Region", `${regionLabel(via.region)} (${via.region})`]);
                lines.push(["Condition", via.cond]);
                lines.push(["Route", regionPath(via.region).map(regionLabel).join(" → ") || "not reachable"]);
            }
            return lines;
        }

        function entryReqs(entry, depth) {
            const reach = regionNode(entry.region, depth);
            return dedupe([...(reach ? [reach] : []), ...explainCond(entry.node, entry.region, depth)]);
        }

        // What it takes to collect a check: reach one of the regions that list it and meet that region's condition.
        function explainCheck(check, depth) {
            const entries = checkRegions.get(check) || [];
            const info = checkInfo.get(check);
            const place = (entry, lazy) => ({
                kind: "alt",
                label: `In ${regionLabel(entry.region)}`,
                sub: regionInfo.has(entry.region) ? "" : "region not reachable",
                ok: regionInfo.has(entry.region),
                ...(lazy ? { lazy: () => entryReqs(entry, 0) } : { kids: entryReqs(entry, depth + 1) }),
            });
            if (!info) {
                return entries.length === 1 ? entryReqs(entries[0], depth) : entries.map((entry) => place(entry, true));
            }
            const reqs = entryReqs(info.via, depth);
            const others = entries.filter((entry) => entry !== info.via);
            if (others.length === 0) {
                return reqs;
            }
            return [
                ...reqs,
                {
                    kind: "alts",
                    label: others.length === 1 ? "1 other place to get this" : `${others.length} other places to get this`,
                    sub: "same check, different region",
                    lazy: () => others.map((entry) => place(entry, true)),
                },
            ];
        }

        // Reaching a region is shown as its nearest gate: the last edge on the seed's route that has a requirement.
        // Regions whose whole route is free are left out.
        function regionNode(regionId, depth, forRoot) {
            if (regionId === START) {
                return null;
            }
            const info = regionInfo.get(regionId);
            const detail = [
                ["Region", regionId],
                ["Route", regionPath(regionId).map(regionLabel).join(" → ") || "not reachable"],
            ];
            const otherRoutes = (excludeEdge) => {
                // Edges from regions that are themselves only reached through this one would be circular.
                const edges = (incoming.get(regionId) || []).filter(
                    (edge) => edge !== excludeEdge && edge.from !== regionId && !regionPath(edge.from).includes(regionId)
                );
                return edges.length === 0
                    ? null
                    : () =>
                          edges.map((edge) => {
                              const when = avail(edge.node, edge.from);
                              const ok = regionInfo.has(edge.from) && when.order !== Infinity;
                              return {
                                  kind: "alt",
                                  label: `From ${regionLabel(edge.from)}`,
                                  sub: ok ? "open in this seed" : regionInfo.has(edge.from) ? "requirement not met" : "that region is not reachable",
                                  ok,
                                  detail: [["Edge", `${edge.from} → ${edge.to}`], ["Condition", edge.cond]],
                                  lazy: () => {
                                      const reach = regionNode(edge.from, 0);
                                      return [...(reach ? [reach] : []), ...explainCond(edge.node, edge.from, 0)];
                                  },
                              };
                          });
            };

            if (!info) {
                return {
                    kind: "region",
                    ok: false,
                    label: `Reach ${regionLabel(regionId)}`,
                    sub: "not reachable in logic",
                    target: `region:${regionId}`,
                    detail,
                    lazy: otherRoutes(null),
                };
            }

            // The gates: edges on the seed's route that need something.
            const gates = [];
            for (let id = regionId; id !== START; ) {
                const edge = regionInfo.get(id).parent;
                if (explainCondIsNeeded(edge)) {
                    gates.unshift(edge);
                }
                id = edge.from;
            }
            if (gates.length === 0) {
                return forRoot
                    ? { kind: "region", label: `Reach ${regionLabel(regionId)}`, sub: "open from the start", sphere: info.sphere, detail }
                    : null;
            }

            const last = gates[gates.length - 1];
            const key = `region:${last.from}>${last.to}`;
            const base = {
                key,
                kind: "region",
                label: `Reach ${regionLabel(regionId)}`,
                sub: gates.length === 1 ? "1 gate on the route" : `${gates.length} gates on the route`,
                sphere: info.sphere,
                target: `region:${regionId}`,
                detail,
            };
            if (seen.has(key) && !forRoot) {
                return { ...base, sub: "route shown elsewhere in this tree", ref: true };
            }
            seen.add(key);

            const gateNode = (edge, asRef) => ({
                key: `gate:${edge.from}>${edge.to}`,
                kind: "gate",
                label: `${regionLabel(edge.from)} → ${regionLabel(edge.to)}`,
                sub: asRef ? "shown elsewhere in this tree" : edge.kind === "exit" ? "door / loading zone" : "within the area",
                sphere: regionInfo.get(edge.to).sphere,
                detail: [["Edge", `${edge.from} → ${edge.to}`], ["Condition", edge.cond]],
                ...(asRef ? { ref: true } : { kids: dedupe(explainCond(edge.node, edge.from, depth + 1)) }),
            });
            // Gates that only need things the tree already shows are folded away so the new requirements stand out.
            const kids = [];
            const shown = [];
            const minor = [];
            for (const edge of gates) {
                const gateKey = `gate:${edge.from}>${edge.to}`;
                if (seen.has(gateKey)) {
                    shown.push(edge);
                    continue;
                }
                seen.add(gateKey);
                const node = gateNode(edge, false);
                (node.kids.every((kid) => kid.ref || kid.shown) ? minor : kids).push(node);
            }
            if (minor.length) {
                kids.push({
                    kind: "note",
                    label: minor.length === 1 ? "1 more gate" : `${minor.length} more gates`,
                    sub: "needing only things already shown",
                    kids: minor,
                    closed: true,
                });
            }
            if (shown.length) {
                kids.unshift({
                    kind: "note",
                    label: shown.length === 1 ? "1 earlier gate" : `${shown.length} earlier gates`,
                    sub: "already shown in this tree",
                    lazy: () => shown.map((edge) => gateNode(edge, true)),
                });
            }
            const alternatives = otherRoutes(regionInfo.get(regionId).parent);
            if (alternatives) {
                kids.push({ kind: "alts", label: "Other ways in", sub: `to ${regionLabel(regionId)}`, lazy: alternatives });
            }
            return { ...base, kids };
        }

        function explainCondIsNeeded(edge) {
            if (edge.node.t === "const") {
                return false;
            }
            return !(hideStart && avail(edge.node, edge.from).order === 0);
        }

        function explainEvent(event, count, depth, forRoot) {
            const defs = eventInfo.get(event) || [];
            const done = defs.filter((def) => def.info);
            const label = eventLabel(event) + (count > 1 ? ` ×${count}` : "");
            const place = (def, lazy) => ({
                kind: "alt",
                label: `In ${regionLabel(def.region)}`,
                sub: def.info ? `sphere ${def.info.sphere}` : "not possible in this seed",
                ok: Boolean(def.info),
                sphere: def.info ? def.info.sphere : null,
                detail: [["Event", event], ["Region", def.region], ["Condition", def.cond]],
                ...(lazy ? { lazy: () => entryReqs(def, 0) } : { kids: entryReqs(def, depth + 1) }),
            });
            const base = { kind: "event", label, target: `event:${event}` };

            if (done.length < count) {
                return {
                    ...base,
                    ok: false,
                    sub: count > 1 ? `only ${done.length} of ${count} possible in logic` : "not possible in logic",
                    lazy: defs.length ? () => defs.map((def) => place(def, true)) : null,
                };
            }
            const key = `event:${event}:${count}`;
            const sphere = done[count - 1].info.sphere;
            if (seen.has(key) && !forRoot) {
                return { ...base, key, sphere, sub: "event", ref: true };
            }
            seen.add(key);
            if (count > 1) {
                return { ...base, key, sphere, sub: `${count} of ${defs.length} places`, kids: done.slice(0, count).map((def) => place(def, count > 3)) };
            }
            const first = done[0];
            const kids = entryReqs(first, depth + 1);
            const others = defs.filter((def) => def !== first);
            if (others.length) {
                kids.push({
                    kind: "alts",
                    label: others.length === 1 ? "1 other place" : `${others.length} other places`,
                    sub: "same event, different region",
                    lazy: () => others.map((def) => place(def, true)),
                });
            }
            return {
                ...base,
                key,
                sphere,
                sub: `event in ${regionLabel(first.region)}`,
                detail: [["Event", event], ["Region", first.region], ["Condition", first.cond]],
                kids,
            };
        }

        const [kind, id] = target.id.split(/:(.*)/s);
        switch (kind) {
            case "goal": {
                const yes = data.optionValues.RO_GENERIC_YES;
                if (result.options.RO_SHUFFLE_TRIFORCE_PIECES === yes) {
                    const need = result.options.RO_TRIFORCE_PIECES_REQUIRED;
                    const pieces = explainFact(`triforce#${need}`, 0);
                    return { kind: "goal", label: "Beat the game", sub: `collect ${need} Triforce Pieces`, ok: pieces.ok !== false, kids: [pieces] };
                }
                const reach = regionNode(GOAL_REGION, 0, true);
                const kids = [reach];
                if (result.options.RO_SHUFFLE_BOSS_SOULS === yes) {
                    kids.push(explainFact("soul:RI_SOUL_BOSS_MAJORA", 0));
                }
                return {
                    kind: "goal",
                    label: "Beat the game",
                    sub: "reach Majora's Lair",
                    ok: kids.every((kid) => kid.ok !== false),
                    sphere: regionInfo.has(GOAL_REGION) ? regionInfo.get(GOAL_REGION).sphere : null,
                    kids,
                };
            }
            case "item": {
                const holders = [...checkRegions.keys()]
                    .filter((check) => placements.get(check) === id)
                    .sort((a, b) => (checkInfo.has(a) ? checkInfo.get(a).order : Infinity) - (checkInfo.has(b) ? checkInfo.get(b).order : Infinity));
                const copy = (check, index) => {
                    const info = checkInfo.get(check);
                    return {
                        key: `item:${check}`,
                        kind: "check",
                        cat: category(id),
                        ok: Boolean(info),
                        label: checkLabel(check),
                        sub: info ? "location" : "location (out of logic)",
                        sphere: info ? info.sphere : null,
                        target: `check:${check}`,
                        detail: checkDetail(check),
                        ...(index === 0 ? { kids: explainCheck(check, 1) } : { lazy: () => explainCheck(check, 0) }),
                    };
                };
                if (holders.length) {
                    seen.add(`item:${holders[0]}`);
                }
                return {
                    kind: "item",
                    cat: category(id),
                    label: logic.itemName(id),
                    sub: holders.length === 1 ? "1 location" : `${holders.length} locations`,
                    ok: holders.some((check) => checkInfo.has(check)),
                    sphere: holders.length && checkInfo.has(holders[0]) ? checkInfo.get(holders[0]).sphere : null,
                    kids: holders.map(copy),
                };
            }
            case "check": {
                const info = checkInfo.get(id);
                seen.add(`item:${id}`);
                return {
                    key: `item:${id}`,
                    kind: "check",
                    cat: category(placements.get(id)),
                    label: checkLabel(id),
                    sub: `holds ${logic.itemName(placements.get(id))}${info ? "" : " (out of logic)"}`,
                    ok: Boolean(info),
                    sphere: info ? info.sphere : null,
                    detail: checkDetail(id),
                    kids: explainCheck(id, 0),
                };
            }
            case "region":
                return regionNode(id, 0, true);
            case "event":
                return explainEvent(id, 1, 0, true);
            default:
                throw new Error(`unknown target ${target.id}`);
        }
    }

    RG.itemCategory = itemCategory;
    RG.listTargets = listTargets;
    RG.buildTree = buildTree;
})(globalThis);
