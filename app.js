// Page logic: load a spoiler, pick a target, draw its requirement tree.
(function () {
    const { RG, RG_LOGIC_INDEX: index } = globalThis;
    const SVG = "http://www.w3.org/2000/svg";
    const NODE_W = 250;
    const NODE_H = 46;
    const GAP_X = 46;
    const GAP_Y = 10;
    const INITIAL_VISIBLE = 70;
    const KIND_ORDER = { goal: 0, item: 1, check: 2, region: 3, event: 4 };

    const $ = (id) => document.getElementById(id);
    const svgEl = (name, attrs) => {
        const el = document.createElementNS(SVG, name);
        for (const [key, value] of Object.entries(attrs || {})) {
            el.setAttribute(key, value);
        }
        return el;
    };
    const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

    let data = null; // the logic version in use
    let loaded = null; // { spoiler, name, pick }
    let result = null;
    let targets = [];
    let current = null;
    let root = null;
    let selected = null;
    let cameFrom = null; // the "shown elsewhere" box the last jump started from
    let flashed = null;
    const find = { hits: [], set: new Set(), at: -1 };
    const history = [];
    const view = { x: 40, y: 40, k: 1 };

    // ---- Loading ----

    function showError(message) {
        $("error").textContent = message;
        $("error").hidden = !message;
    }

    // Logic files are plain scripts so the page works when opened straight from disk.
    const loadChunk = (id) =>
        new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `logic/${id}.js`;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`logic/${id}.js could not be loaded`));
            document.head.append(script);
        });

    // forcedId: a logic version picked by hand instead of the one matched to the spoiler's build.
    async function loadSpoiler(spoiler, name, forcedId) {
        showError("");
        if (!spoiler || spoiler.type !== "2S2H_RANDO_SPOILER" || typeof spoiler.checks !== "object") {
            showError(`${name} does not look like a 2Ship rando spoiler file.`);
            return;
        }
        const matched = RG.pickLogic(index, RG.spoilerCommit(spoiler));
        const pick = forcedId && forcedId !== matched.id ? { ...matched, id: forcedId, match: "manual" } : matched;
        try {
            data = await RG.loadLogic(index, pick.id, loadChunk);
            result = RG.solve(data, spoiler);
        } catch (error) {
            console.error(error);
            showError(`Could not work through ${name}: ${error.message}`);
            return;
        }
        loaded = { spoiler, name, pick };
        targets = RG.listTargets(result);
        for (const target of targets) {
            target.haystack = `${target.label} ${target.id}`.toLowerCase();
        }
        const keep = current && targets.find((target) => target.id === current.id);
        history.length = 0;
        current = null;
        renderSeed(name);
        for (const id of ["seed", "pick", "legend", "toolbar"]) {
            $(id).hidden = false;
        }
        $("empty").hidden = true;
        show((forcedId && keep) || targets[0], false);
    }

    function versionNotes(pick) {
        const build = pick.commit ? `build ${pick.commit}` : "this spoiler's build";
        const notes = [];
        if (pick.match === "manual") {
            notes.push(`Showing a logic version you picked, not the one matched to ${build}.`);
        } else if (pick.match === "unusable") {
            notes.push(`The logic of ${build} is on record as too different for this tool to read. Using the latest logic instead; rules may differ.`);
        } else if (pick.match === "unknown") {
            notes.push(
                pick.commit
                    ? `No logic is recorded for ${build}. Using the latest logic instead; rules may differ. (extract.mjs --history records more builds.)`
                    : "The spoiler does not name the build that made it. Using the latest logic."
            );
        }
        const drift = RG.portedDrift(index, data);
        if (drift.length) {
            // The conditions of this version are exact; these parts of the game are not stored per version.
            notes.push(
                `The requirements shown are this build's own, but the tool only knows how the current game handles: ` +
                    `${RG.describeDrift(drift).join("; ")}. That code was different in this build, so anything depending on it may be shown wrong. ` +
                    `(Changed: ${drift.join(", ")})`
            );
        }
        return notes;
    }

    function renderSeed(name) {
        const { spoiler, options, checkRegions, checkInfo, spheres, warnings } = result;
        const { pick } = loaded;
        const logicName = Object.keys(data.optionValues).find(
            (key) => key.startsWith("RO_LOGIC_") && data.optionValues[key] === options.RO_LOGIC
        );
        const glitchless = options.RO_LOGIC === data.optionValues.RO_LOGIC_GLITCHLESS;
        const info = [
            ["File", name],
            ["Seed", spoiler.finalSeed === undefined ? "—" : String(spoiler.finalSeed)],
            ["Build", pick.commit ? `${pick.commit}${pick.match === "exact" ? " (logic on record)" : ""}` : "—"],
            ["Logic", logicName ? RG.humanize(logicName.replace("RO_LOGIC_", "")) : String(options.RO_LOGIC)],
            ["In logic", `${checkInfo.size} of ${checkRegions.size} checks, ${spheres.length} spheres`],
        ];
        fillList($("seed-info"), info);

        const select = $("version");
        if (select.options.length === 0) {
            for (const version of RG.listLogic(index)) {
                select.append(new Option(version.label, version.id));
            }
        }
        select.value = pick.id;

        const notes = [...versionNotes(pick), ...warnings];
        if (!glitchless) {
            notes.unshift(
                "This seed was not generated with Glitchless logic. The tree still uses the Glitchless rules, so parts of the seed may show as out of logic."
            );
        }
        const list = $("warnings");
        list.replaceChildren(
            ...notes.map((text) => {
                const li = document.createElement("li");
                li.textContent = text;
                return li;
            })
        );

        const defaults = RG.defaultOptions(data);
        const changed = Object.keys(options)
            .filter((key) => options[key] !== defaults[key])
            .map((key) => [RG.humanize(key.replace(/^RO_/, "")), `${options[key]} (default ${defaults[key]})`]);
        fillList($("option-list"), changed.length ? changed : [["—", "all default"]]);
    }

    function fillList(dl, lines) {
        dl.replaceChildren();
        for (const [term, value] of lines) {
            const dt = document.createElement("dt");
            dt.textContent = term;
            const dd = document.createElement("dd");
            dd.textContent = value;
            if (term === "Condition") {
                dd.className = "code";
            }
            dl.append(dt, dd);
        }
    }

    function readFile(file) {
        if (!file) {
            return;
        }
        file.text().then((text) => {
            let spoiler;
            try {
                spoiler = JSON.parse(text);
            } catch {
                showError(`${file.name} is not valid JSON.`);
                return;
            }
            loadSpoiler(spoiler, file.name);
        });
    }

    $("file").addEventListener("change", (event) => readFile(event.target.files[0]));
    window.addEventListener("dragover", (event) => {
        event.preventDefault();
        document.body.classList.add("dragging");
    });
    window.addEventListener("dragleave", () => document.body.classList.remove("dragging"));
    window.addEventListener("drop", (event) => {
        event.preventDefault();
        document.body.classList.remove("dragging");
        readFile(event.dataTransfer.files[0]);
    });
    async function loadExample() {
        const latest = await RG.loadLogic(index, index.latest, loadChunk);
        const commit = index.versions[index.latest].commit;
        await loadSpoiler({ ...RG.vanillaSpoiler(latest), ...(commit ? { commitHash: commit.slice(0, 7) } : {}) }, "vanilla placement example");
    }
    $("example").addEventListener("click", () => loadExample().catch((error) => showError(error.message)));
    $("version").addEventListener("change", (event) => {
        if (loaded) {
            loadSpoiler(loaded.spoiler, loaded.name, event.target.value);
        }
    });

    // ---- Target picking ----

    function show(target, remember) {
        if (remember && current) {
            history.push(current);
        }
        current = target;
        root = RG.buildTree(result, target, { hideStart: $("hide-start").checked });
        selected = null;
        cameFrom = null;
        $("back").disabled = history.length === 0;
        $("crumb").textContent = target.label;
        $("detail").hidden = true;
        openInitial();
        runFind(false);
        render();
        fit();
    }

    function matches(query) {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        const found = targets.filter((target) => words.every((word) => target.haystack.includes(word)));
        const first = words[0] || "";
        const rank = (target) => KIND_ORDER[target.kind] * 2 + (target.label.toLowerCase().startsWith(first) ? 0 : 1);
        return found.sort((a, b) => rank(a) - rank(b)).slice(0, 60);
    }

    let shown = [];
    let active = 0;
    function renderResults() {
        const list = $("results");
        shown = matches($("search").value);
        active = Math.min(active, Math.max(0, shown.length - 1));
        list.hidden = shown.length === 0;
        list.replaceChildren(
            ...shown.map((target, index) => {
                const li = document.createElement("li");
                li.className = index === active ? "active" : "";
                for (const [cls, text] of [["kind", target.kind], ["name", target.label], ["sub", target.sub || ""]]) {
                    const span = document.createElement("span");
                    span.className = cls;
                    span.textContent = text;
                    li.append(span);
                }
                li.addEventListener("mousedown", (event) => {
                    event.preventDefault();
                    choose(target);
                });
                return li;
            })
        );
        const activeEl = list.children[active];
        if (activeEl) {
            activeEl.scrollIntoView({ block: "nearest" });
        }
    }

    function choose(target) {
        $("search").value = "";
        $("results").hidden = true;
        $("search").blur();
        show(target, true);
    }

    $("search").addEventListener("input", () => {
        active = 0;
        renderResults();
    });
    $("search").addEventListener("focus", renderResults);
    $("search").addEventListener("blur", () => {
        $("results").hidden = true;
    });
    $("search").addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            active = Math.max(0, Math.min(shown.length - 1, active + (event.key === "ArrowDown" ? 1 : -1)));
            renderResults();
        } else if (event.key === "Enter" && shown[active]) {
            choose(shown[active]);
        } else if (event.key === "Escape") {
            $("search").blur();
        }
    });
    $("hide-start").addEventListener("change", () => current && show(current, false));
    $("back").addEventListener("click", () => {
        if (history.length) {
            show(history.pop(), false);
        }
    });

    // ---- Tree state ----

    const hasKids = (node) => Boolean((node.kids && node.kids.length) || node.lazy);

    function open(node) {
        if (node.lazy) {
            node.kids = node.lazy() || [];
            node.lazy = null;
            if (node.kids.length === 0) {
                node.kids = [{ kind: "note", label: "Nothing more needed", sub: "" }];
            }
        }
        node.open = true;
    }

    // ---- Find in tree ----

    // Matches every box that has been built, including ones inside closed branches. Alternatives that were never
    // opened do not exist yet, so they are not searched.
    function runFind(keepPlace) {
        const words = $("find").value.toLowerCase().split(/\s+/).filter(Boolean);
        const previous = keepPlace ? find.hits[find.at] : null;
        find.hits = [];
        if (root && words.length) {
            eachBuilt(root, (node, parent) => {
                node.parent = parent;
                const text = `${node.label} ${node.why || ""} ${node.sub || ""}`.toLowerCase();
                if (words.every((word) => text.includes(word))) {
                    find.hits.push(node);
                }
            });
        }
        find.set = new Set(find.hits);
        find.at = previous ? find.hits.indexOf(previous) : -1;
        const count = $("find-count");
        count.textContent = !words.length ? "" : find.hits.length ? `${find.at + 1 || "–"} / ${find.hits.length}` : "none";
        count.className = words.length && !find.hits.length ? "none" : "";
        $("find-prev").disabled = $("find-next").disabled = find.hits.length === 0;
    }

    function stepFind(direction) {
        if (find.hits.length === 0) {
            return;
        }
        find.at = find.at < 0 ? (direction > 0 ? 0 : find.hits.length - 1) : (find.at + direction + find.hits.length) % find.hits.length;
        $("find-count").textContent = `${find.at + 1} / ${find.hits.length}`;
        reveal(find.hits[find.at]);
    }

    $("find").addEventListener("input", () => {
        runFind(false);
        render();
    });
    $("find").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            stepFind(event.shiftKey ? -1 : 1);
        } else if (event.key === "Escape") {
            $("find").value = "";
            runFind(false);
            render();
        }
    });
    $("find-next").addEventListener("click", () => stepFind(1));
    $("find-prev").addEventListener("click", () => stepFind(-1));

    // Open the seed's route breadth-first until the picture gets big; the rest stays one click away.
    function openInitial() {
        let visible = 1;
        const queue = [root];
        while (queue.length) {
            const node = queue.shift();
            if (!node.kids || node.closed || node.kids.length === 0 || visible + node.kids.length > INITIAL_VISIBLE) {
                continue;
            }
            node.open = true;
            visible += node.kids.length;
            queue.push(...node.kids);
        }
    }

    function eachBuilt(node, visit, parent) {
        visit(node, parent);
        for (const kid of node.kids || []) {
            eachBuilt(kid, visit, node);
        }
    }

    $("expand").addEventListener("click", () => {
        eachBuilt(root, (node) => {
            if (node.kids && node.kids.length && !node.closed) {
                node.open = true;
            }
        });
        render();
        fit();
    });
    $("collapse").addEventListener("click", () => {
        eachBuilt(root, (node) => {
            node.open = false;
        });
        root.open = true;
        render();
        fit();
    });

    // ---- Layout and drawing ----

    let bounds = { w: 0, h: 0 };

    function layout() {
        let nextY = 0;
        let maxDepth = 0;
        const place = (node, depth, parent) => {
            node.parent = parent;
            node.x = depth * (NODE_W + GAP_X);
            maxDepth = Math.max(maxDepth, depth);
            const kids = node.open ? node.kids || [] : [];
            if (kids.length === 0) {
                node.y = nextY;
                nextY += NODE_H + GAP_Y;
            } else {
                for (const kid of kids) {
                    place(kid, depth + 1, node);
                }
                node.y = (kids[0].y + kids[kids.length - 1].y) / 2;
            }
        };
        place(root, 0, null);
        bounds = { w: (maxDepth + 1) * (NODE_W + GAP_X) - GAP_X, h: nextY - GAP_Y };
    }

    function render() {
        if (!root) {
            return;
        }
        layout();
        const links = [];
        const nodes = [];
        const draw = (node) => {
            nodes.push(drawNode(node));
            if (!node.open) {
                return;
            }
            for (const kid of node.kids || []) {
                const x1 = node.x + NODE_W;
                const y1 = node.y + NODE_H / 2;
                const x2 = kid.x;
                const y2 = kid.y + NODE_H / 2;
                const mid = (x1 + x2) / 2;
                const cls = ["edge", kid.route ? "route" : "", kid.kind === "alts" || kid.kind === "alt" ? "alt" : ""].join(" ");
                links.push(svgEl("path", { class: cls, d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}` }));
                draw(kid);
            }
        };
        draw(root);
        $("links").replaceChildren(...links);
        $("nodes").replaceChildren(...nodes);
        applyView();
    }

    function drawNode(node) {
        const classes = ["node", `k-${node.kind}`];
        if (node.cat) classes.push(`c-${node.cat}`);
        if (find.set.has(node)) classes.push("match");
        if (find.hits[find.at] === node) classes.push("current");
        if (node.route) classes.push("route");
        if (node.ok === false) classes.push("no");
        if (node.ref) classes.push("ref");
        if (node === selected) classes.push("selected");
        if (node === flashed) classes.push("flash");
        const g = svgEl("g", { class: classes.join(" "), transform: `translate(${node.x},${node.y})`, tabindex: 0 });

        const sub = [node.why, node.sub].filter(Boolean).join(" — ");
        const title = svgEl("title");
        title.textContent = sub ? `${node.label}\n${sub}` : node.label;
        g.append(title);
        g.append(svgEl("rect", { class: "box", width: NODE_W, height: NODE_H, rx: 7 }));
        g.append(svgEl("rect", { class: "stripe", width: 5, height: NODE_H - 10, x: 5, y: 5, rx: 2.5 }));

        const hasSphere = typeof node.sphere === "number" && node.sphere > 0;
        const label = svgEl("text", { class: "label", x: 17, y: sub ? 19 : 28 });
        label.textContent = clip(node.label, hasSphere ? 30 : 34);
        g.append(label);
        if (sub) {
            const subEl = svgEl("text", { class: "sub", x: 17, y: 35 });
            subEl.textContent = clip(sub, 41);
            g.append(subEl);
        }
        if (hasSphere) {
            const sphere = svgEl("text", { class: "sphere", x: NODE_W - 14, y: 19 });
            sphere.textContent = `S${node.sphere}`;
            g.append(sphere);
        }

        g.addEventListener("click", (event) => {
            if (dragged) {
                return;
            }
            event.stopPropagation();
            select(node);
        });
        const jumps = Boolean(node.ref && node.key);
        g.addEventListener("dblclick", (event) => {
            event.stopPropagation();
            if (jumps) {
                jump(node);
            } else {
                toggle(node);
            }
        });
        g.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                select(node);
                if (jumps) {
                    jump(node);
                } else {
                    toggle(node);
                }
            }
        });

        // A box that is expanded somewhere else gets an arrow handle that goes there.
        if (jumps) {
            const handle = svgEl("g", { class: "handle jump", transform: `translate(${NODE_W},${NODE_H / 2})` });
            const tip = svgEl("title");
            tip.textContent = "Go to where this is expanded";
            handle.append(tip, svgEl("circle", { r: 9 }));
            const arrow = svgEl("text");
            arrow.textContent = "↗";
            handle.append(arrow);
            handle.addEventListener("click", (event) => {
                event.stopPropagation();
                if (!dragged) {
                    jump(node);
                }
            });
            g.append(handle);
        }

        if (hasKids(node)) {
            const handle = svgEl("g", { class: "handle", transform: `translate(${NODE_W},${NODE_H / 2})` });
            handle.append(svgEl("circle", { r: 9 }));
            const sign = svgEl("text");
            sign.textContent = node.open ? "−" : "+";
            handle.append(sign);
            handle.addEventListener("click", (event) => {
                event.stopPropagation();
                if (!dragged) {
                    toggle(node);
                }
            });
            g.append(handle);
        }
        return g;
    }

    function toggle(node) {
        if (!hasKids(node)) {
            return;
        }
        if (node.open) {
            node.open = false;
        } else {
            const built = !node.lazy;
            open(node);
            if (!built) {
                // Newly built boxes may match the search.
                runFind(true);
            }
        }
        // Keep the toggled node under the cursor while everything around it reflows.
        const before = { x: node.x, y: node.y };
        layout();
        view.x += (before.x - node.x) * view.k;
        view.y += (before.y - node.y) * view.k;
        render();
    }

    function select(node) {
        selected = node;
        $("detail").hidden = false;
        $("detail-title").textContent = node.label;
        const lines = [];
        if (node.why) {
            lines.push(["Needed for", node.why]);
        }
        if (node.sub) {
            lines.push(["Note", node.sub]);
        }
        if (typeof node.sphere === "number") {
            lines.push(["Sphere", node.sphere === 0 ? "start" : String(node.sphere)]);
        }
        lines.push(...(node.detail || []).filter(([term]) => term !== "Sphere"));
        fillList($("detail-lines"), lines);

        const target = node.target && node.target !== current.id ? targets.find((t) => t.id === node.target) : null;
        $("reroot").hidden = !target;
        $("reroot").onclick = target ? () => show(target, true) : null;
        const original = node.ref && node.key ? findOriginal(node.key) : null;
        $("jump").hidden = !original;
        $("jump").onclick = original ? () => jump(node) : null;
        const back = cameFrom && node !== cameFrom ? cameFrom : null;
        $("jump-back").hidden = !back;
        $("jump-back").onclick = back
            ? () => {
                  cameFrom = null;
                  reveal(back);
              }
            : null;
        render();
    }

    function findOriginal(key) {
        let found = null;
        eachBuilt(root, (node, parent) => {
            node.parent = parent;
            if (!found && node.key === key && !node.ref) {
                found = node;
            }
        });
        return found;
    }

    // From a "shown elsewhere" box to the place the same thing is expanded, remembering the way back.
    function jump(node) {
        const original = findOriginal(node.key);
        if (original) {
            cameFrom = node;
            reveal(original);
        }
    }

    function reveal(node) {
        for (let up = node.parent; up; up = up.parent) {
            up.open = true;
        }
        selected = node;
        render();
        const stage = $("canvas").getBoundingClientRect();
        view.x = stage.width / 2 - (node.x + NODE_W / 2) * view.k;
        view.y = stage.height / 2 - (node.y + NODE_H / 2) * view.k;
        applyView();
        flashed = node;
        select(node);
        setTimeout(() => {
            if (flashed === node) {
                flashed = null;
                render();
            }
        }, 1400);
    }

    // ---- Pan and zoom ----

    function applyView() {
        $("viewport").setAttribute("transform", `translate(${view.x},${view.y}) scale(${view.k})`);
    }

    function fit() {
        const stage = $("canvas").getBoundingClientRect();
        const pad = 56;
        const scale = Math.min((stage.width - pad * 2) / bounds.w, (stage.height - pad * 2) / bounds.h, 1);
        view.k = Math.max(scale, 0.8);
        view.x = Math.max(pad, (stage.width - bounds.w * view.k) / 2);
        // When the tree is taller than the window, start with the root in view rather than the top edge.
        view.y = bounds.h * view.k + pad * 2 > stage.height ? stage.height / 2 - (root.y + NODE_H / 2) * view.k : (stage.height - bounds.h * view.k) / 2;
        if (bounds.w * view.k + pad * 2 > stage.width) {
            view.x = pad;
        }
        applyView();
    }
    $("fit").addEventListener("click", () => {
        const stage = $("canvas").getBoundingClientRect();
        const pad = 40;
        view.k = Math.max(Math.min((stage.width - pad * 2) / bounds.w, (stage.height - pad * 2) / bounds.h, 1), 0.08);
        view.x = (stage.width - bounds.w * view.k) / 2;
        view.y = (stage.height - bounds.h * view.k) / 2;
        applyView();
    });

    let drag = null;
    let dragged = false;
    const canvas = $("canvas");
    canvas.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
            return;
        }
        drag = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
        dragged = false;
    });
    window.addEventListener("pointermove", (event) => {
        if (!drag) {
            return;
        }
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!dragged && Math.hypot(dx, dy) < 4) {
            return;
        }
        dragged = true;
        canvas.classList.add("panning");
        view.x = drag.vx + dx;
        view.y = drag.vy + dy;
        applyView();
    });
    window.addEventListener("pointerup", () => {
        drag = null;
        canvas.classList.remove("panning");
        // Let the click that ends a drag see `dragged`, then reset it.
        setTimeout(() => {
            dragged = false;
        }, 0);
    });
    canvas.addEventListener(
        "wheel",
        (event) => {
            event.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const px = event.clientX - rect.left;
            const py = event.clientY - rect.top;
            const k = Math.max(0.08, Math.min(2.5, view.k * Math.exp(-event.deltaY * 0.0015)));
            view.x = px - ((px - view.x) / view.k) * k;
            view.y = py - ((py - view.y) / view.k) * k;
            view.k = k;
            applyView();
        },
        { passive: false }
    );

    if (!index || !index.latest) {
        showError("No logic is recorded yet. Run: node extract.mjs");
    } else if (new URLSearchParams(location.search).has("example")) {
        // index.html?example, optionally with &target=item:RI_HOOKSHOT, &version=<logic id> and &find=<text>
        const params = new URLSearchParams(location.search);
        loadExample()
            .then(() => (index.versions[params.get("version")] ? loadSpoiler(loaded.spoiler, loaded.name, params.get("version")) : null))
            .then(() => {
                const wanted = targets.find((target) => target.id === params.get("target"));
                if (wanted) {
                    show(wanted, true);
                }
                if (params.get("find")) {
                    $("find").value = params.get("find");
                    runFind(false);
                    stepFind(1);
                }
            });
    }
})();
