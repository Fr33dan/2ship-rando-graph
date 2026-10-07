// Walks a spoiler file the way the generator's glitchless search does (GlitchlessLogic.cpp, FindReachableRegions in
// Logic.cpp, TimeLogic.cpp), minus item placement, and records when and how everything became reachable.
(function (root) {
    const RG = (root.RG = root.RG || {});

    function solve(data, spoiler) {
        const warnings = [];
        // Things the spoiler mentions that this logic version has never heard of, reported once per kind.
        const unknown = { option: [], check: [], item: [] };
        const options = RG.defaultOptions(data);
        for (const [name, value] of Object.entries(spoiler.options || {})) {
            if (name in options) {
                options[name] = value;
            } else {
                unknown.option.push(name);
            }
        }

        // Checks missing from the spoiler were not shuffled and still hold their vanilla item.
        const placements = new Map();
        const shuffled = new Set();
        const prices = {};
        for (const [check, entry] of Object.entries(spoiler.checks || {})) {
            if (!data.checks[check]) {
                unknown.check.push(check);
                continue;
            }
            const item = typeof entry === "string" ? entry : entry.randoItemId;
            if (typeof entry === "object" && typeof entry.price === "number") {
                prices[check] = entry.price;
            }
            if (!data.items[item]) {
                unknown.item.push(item);
            }
            placements.set(check, item);
            shuffled.add(check);
        }
        for (const [check, info] of Object.entries(data.checks)) {
            if (!placements.has(check)) {
                placements.set(check, info.vanilla);
            }
        }

        for (const [kind, names] of Object.entries(unknown)) {
            const distinct = [...new Set(names)];
            if (distinct.length) {
                warnings.push(
                    `The spoiler has ${distinct.length} ${kind}${distinct.length === 1 ? "" : "s"} this logic version does not know ` +
                        `(${distinct.slice(0, 3).join(", ")}${distinct.length > 3 ? ", …" : ""}). They are ignored.`
                );
            }
        }

        const logic = RG.createLogic(data, options, prices);
        const START = "RR_MAX";

        // The C++ containers are std::map, so a repeated key inside one region keeps its first entry and regions are
        // visited in enum order.
        const regionIds = data.regionOrder.filter((id) => data.regions[id]);
        const firstByKey = (entries, key) => {
            const seen = new Set();
            return entries.filter((entry) => !seen.has(entry[key]) && seen.add(entry[key]));
        };

        // GetRegionIdFromEntrance()
        const entranceRegion = new Map();
        for (const id of regionIds) {
            const region = data.regions[id];
            for (const exit of firstByKey(region.exits, "to")) {
                if (exit.from !== "ONE_WAY_EXIT") {
                    entranceRegion.set(exit.from, id);
                }
            }
            for (const entrance of region.oneWayEntrances) {
                entranceRegion.set(entrance, id);
            }
        }

        const regions = new Map();
        const checkRegions = new Map();
        const eventDefs = [];
        const incoming = new Map(regionIds.map((id) => [id, []]));
        for (const id of regionIds) {
            const source = data.regions[id];
            const edges = [];
            for (const connection of firstByKey(source.connections, "region")) {
                edges.push({ from: id, to: connection.region, kind: "connection", cond: connection.cond, node: logic.resolve(connection.cond) });
            }
            for (const exit of firstByKey(source.exits, "to")) {
                edges.push({
                    from: id,
                    to: entranceRegion.get(exit.to) || START,
                    kind: "exit",
                    entrance: exit.to,
                    cond: exit.cond,
                    node: logic.resolve(exit.cond),
                });
            }
            for (const edge of edges) {
                if (incoming.has(edge.to)) {
                    incoming.get(edge.to).push(edge);
                }
            }

            const checks = firstByKey(source.checks, "check").map((entry) => ({
                check: entry.check,
                region: id,
                cond: entry.cond,
                node: logic.resolve(entry.cond),
            }));
            for (const entry of checks) {
                if (!checkRegions.has(entry.check)) {
                    checkRegions.set(entry.check, []);
                }
                checkRegions.get(entry.check).push(entry);
            }

            const events = source.events.map((entry) => ({
                event: entry.event,
                region: id,
                cond: entry.cond,
                node: logic.resolve(entry.cond),
                info: null,
            }));
            eventDefs.push(...events);

            const stays = new Map(source.stays.map((entry) => [logic.sliceIndex[entry.slice], logic.resolve(entry.cond)]));
            regions.set(id, { id, name: source.name, scene: source.scene, canStay: source.canStay, edges, checks, events, stays });
        }

        const state = logic.newState();
        const eventCount = new Map();

        function evaluate(node, time) {
            switch (node.t) {
                case "const":
                    return node.v;
                case "and":
                    return node.kids.every((kid) => evaluate(kid, time));
                case "or":
                    return node.kids.some((kid) => evaluate(kid, time));
                case "not":
                    return !evaluate(node.kid, time);
                case "group":
                    return evaluate(node.kid, time);
                case "fact":
                    return state.facts.has(node.fact);
                case "event":
                    return (eventCount.get(node.event) || 0) >= node.count;
                case "time":
                    return (time & node.mask) !== 0n;
                default:
                    throw new Error(`cannot evaluate ${node.t}`);
            }
        }

        const spoilerStart = (spoiler.startingItems || []).filter((ri) => data.items[ri]);
        const computed = logic.computedStartingItems(spoilerStart);
        if (computed.unknownStartingClock) {
            warnings.push(
                "Clock Shuffle (random) grants one starting clock that is not recorded in the spoiler file; " +
                    "results before the first clock is found may be too pessimistic."
            );
        }
        const startingItems = [...spoilerStart, ...computed.items];
        for (const ri of startingItems) {
            logic.give(state, ri, { start: true, sphere: 0, order: 0 });
        }

        // TimeLogic::ExpandTimeForward()
        function expandTime(mask, region) {
            if (region.stays.size === 0 && !logic.clockShuffle) {
                return mask === 0n ? 0n : logic.ALL_SLICES & ~((mask & -mask) - 1n);
            }
            const filtered = logic.clockShuffle ? mask & logic.ownedTimeSlices(state) : mask;
            let expanded = filtered;
            let canWait = false;
            for (let i = 0; i < logic.sliceCount; i++) {
                const bit = 1n << BigInt(i);
                if (filtered & bit) {
                    canWait = true;
                } else if (canWait) {
                    if (!logic.sliceOwned(state, i)) {
                        canWait = false;
                        continue;
                    }
                    const stay = region.stays.get(i);
                    if (stay === undefined || evaluate(stay, expanded)) {
                        expanded |= bit;
                    } else {
                        canWait = false;
                    }
                }
            }
            return expanded;
        }

        let order = 0;
        let sphere = 1;
        const regionInfo = new Map([[START, { sphere: 0, order: 0, parent: null }]]);
        const timeStates = new Map([
            [START, { mask: logic.clockShuffle ? logic.ownedTimeSlices(state) : 1n, canStay: false }],
        ]);
        const regionsInLogic = [START];
        let progressed = false;

        // FindReachableRegions()
        function explore(id) {
            const region = regions.get(id);
            if (!timeStates.has(id)) {
                timeStates.set(id, { mask: logic.ownedTimeSlices(state), canStay: region.canStay });
            }
            const timeState = timeStates.get(id);
            if (timeState.canStay) {
                const expanded = expandTime(timeState.mask, region);
                if (expanded !== timeState.mask) {
                    timeState.mask = expanded;
                    progressed = true;
                }
            }
            const time = timeState.mask;

            for (const edge of region.edges) {
                if (!regions.has(edge.to) || !evaluate(edge.node, time)) {
                    continue;
                }
                const existing = timeStates.get(edge.to);
                if (existing) {
                    if ((existing.mask | time) === existing.mask) {
                        continue;
                    }
                    existing.mask |= time;
                    existing.canStay = existing.canStay || regions.get(edge.to).canStay;
                } else {
                    timeStates.set(edge.to, { mask: time, canStay: regions.get(edge.to).canStay });
                }
                if (!regionInfo.has(edge.to)) {
                    regionInfo.set(edge.to, { sphere, order: ++order, parent: edge });
                    regionsInLogic.push(edge.to);
                }
                progressed = true;
                explore(edge.to);
            }
        }

        const checkInfo = new Map();
        const spheres = [];
        for (let guard = 0; guard < 10000; guard++) {
            // Everything reachable without picking up anything new: regions and events feed each other.
            do {
                progressed = false;
                for (let i = 0; i < regionsInLogic.length; i++) {
                    explore(regionsInLogic[i]);
                }
                for (const id of regionsInLogic) {
                    const time = timeStates.get(id).mask;
                    for (const def of regions.get(id).events) {
                        if (!def.info && evaluate(def.node, time)) {
                            def.info = { sphere, order: ++order };
                            eventCount.set(def.event, (eventCount.get(def.event) || 0) + 1);
                            progressed = true;
                        }
                    }
                }
            } while (progressed);

            const found = [];
            for (const id of regionsInLogic) {
                const time = timeStates.get(id).mask;
                for (const entry of regions.get(id).checks) {
                    if (!checkInfo.has(entry.check) && evaluate(entry.node, time)) {
                        checkInfo.set(entry.check, { sphere, order: ++order, via: entry });
                        found.push(entry.check);
                    }
                }
            }
            if (found.length === 0) {
                break;
            }
            spheres.push(found);

            let gotClock = false;
            for (const check of found) {
                const ri = placements.get(check);
                logic.give(state, ri, { check, sphere, order: ++order });
                gotClock = gotClock || /^RI_TIME_/.test(ri);
            }
            if (gotClock) {
                const owned = logic.ownedTimeSlices(state);
                for (const [id, timeState] of timeStates) {
                    timeState.mask = timeState.canStay ? expandTime(owned, regions.get(id)) : owned;
                }
            }
            sphere++;
        }

        const eventInfo = new Map();
        for (const def of eventDefs) {
            if (!eventInfo.has(def.event)) {
                eventInfo.set(def.event, []);
            }
            eventInfo.get(def.event).push(def);
        }
        for (const defs of eventInfo.values()) {
            defs.sort((a, b) => (a.info ? a.info.order : Infinity) - (b.info ? b.info.order : Infinity));
        }

        const unreached = [...checkRegions.keys()].filter((check) => !checkInfo.has(check));

        return {
            data,
            spoiler,
            logic,
            options,
            warnings,
            placements,
            shuffled,
            startingItems,
            state,
            regions,
            regionInfo,
            timeStates,
            incoming,
            checkRegions,
            checkInfo,
            eventInfo,
            spheres,
            unreached,
            evaluate,
        };
    }

    // Every check holding its vanilla item, default settings: a seed that must be fully completable.
    function vanillaSpoiler(data) {
        return {
            type: "2S2H_RANDO_SPOILER",
            options: {},
            startingItems: ["RI_PROGRESSIVE_SWORD", "RI_SHIELD_HERO", "RI_OCARINA", "RI_SONG_TIME"],
            checks: Object.fromEntries(Object.entries(data.checks).map(([id, info]) => [id, info.vanilla])),
        };
    }

    RG.solve = solve;
    RG.vanillaSpoiler = vanillaSpoiler;
})(globalThis);
