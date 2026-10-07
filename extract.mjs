// Reads the rando logic out of the C++ source and records it under logic/ for the viewer.
// Usage: node extract.mjs              record the game's working tree as the latest logic
//        node extract.mjs --accept     same, and accept changes to hand-mirrored code (updates ported.json)
//        node extract.mjs --history N  record the logic of the last N commits (default 300)
//        ... --strict                  with --history: exit 1 if the newest commit needs attention
// The 2ship2harkinian checkout is found through --source <path>, then $RANDO_SOURCE, then ../2ship2harkinian.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const sourceAt = args.indexOf("--source");
const repoRoot = resolve(sourceAt >= 0 ? args[sourceAt + 1] : process.env.RANDO_SOURCE || join(here, "..", "2ship2harkinian"));
const randoDir = join(repoRoot, "mm", "2s2h", "Rando");
if (!existsSync(join(randoDir, "Logic", "Logic.h"))) {
    console.error(`No 2ship2harkinian source at ${repoRoot}. Pass --source <path to the game repo> or set RANDO_SOURCE.`);
    process.exit(2);
}


function stripComments(text) {
    let out = "";
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (c === '"') {
            const end = text.indexOf('"', i + 1);
            out += text.slice(i, end + 1);
            i = end + 1;
        } else if (c === "/" && text[i + 1] === "/") {
            while (i < text.length && text[i] !== "\n") {
                i++;
            }
        } else if (c === "/" && text[i + 1] === "*") {
            i = text.indexOf("*/", i + 2) + 2;
        } else {
            out += c;
            i++;
        }
    }
    return out;
}

// Index of the bracket closing the one at `open`.
function matchBracket(text, open) {
    const pairs = { "(": ")", "{": "}", "[": "]" };
    const openCh = text[open];
    const closeCh = pairs[openCh];
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '"') {
            i = text.indexOf('"', i + 1);
        } else if (text[i] === openCh) {
            depth++;
        } else if (text[i] === closeCh) {
            if (--depth === 0) {
                return i;
            }
        }
    }
    throw new Error(`Unbalanced '${openCh}' at ${open}`);
}

function splitTopLevel(text) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            i = text.indexOf('"', i + 1);
        } else if ("([{".includes(c)) {
            depth++;
        } else if (")]}".includes(c)) {
            depth--;
        } else if (c === "," && depth === 0) {
            parts.push(text.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(text.slice(start));
    return parts.map((p) => p.replace(/\s+/g, " ").trim());
}

// Every `NAME(...)` invocation in text, as its list of top-level arguments.
function scanCalls(text, name) {
    const calls = [];
    const re = new RegExp(`\\b${name}\\(`, "g");
    let m;
    while ((m = re.exec(text))) {
        const open = m.index + name.length;
        const close = matchBracket(text, open);
        calls.push(splitTopLevel(text.slice(open + 1, close)));
        re.lastIndex = close;
    }
    return calls;
}

const normalizeEntrance = (text) => text.replace(/\s+/g, "");

function extractRegions(text, regions) {
    const re = /Regions\[(RR_\w+)\]\s*=\s*RandoRegion\s*\{/g;
    let m;
    while ((m = re.exec(text))) {
        const open = m.index + m[0].length - 1;
        const close = matchBracket(text, open);
        const body = text.slice(open + 1, close);
        re.lastIndex = close;

        const region = {
            name: (body.match(/\.name\s*=\s*"([^"]*)"/) || [])[1] || "",
            scene: (body.match(/\.sceneId\s*=\s*(\w+)/) || [])[1] || "",
            canStay: (body.match(/\.canStayOverTime\s*=\s*(true|false)/) || [])[1] !== "false",
            checks: scanCalls(body, "CHECK").map(([check, cond]) => ({ check, cond })),
            exits: scanCalls(body, "EXIT").map(([to, from, cond]) => ({
                to: normalizeEntrance(to),
                from: normalizeEntrance(from),
                cond,
            })),
            connections: scanCalls(body, "CONNECTION").map(([region, cond]) => ({ region, cond })),
            events: scanCalls(body, "EVENT").map(([event, cond]) => ({ event, cond })),
            stays: scanCalls(body, "STAY").map(([slice, cond]) => ({ slice, cond })),
            oneWayEntrances: [],
        };

        const oneWay = body.match(/\.oneWayEntrances\s*=\s*\{/);
        if (oneWay) {
            const owOpen = oneWay.index + oneWay[0].length - 1;
            const owBody = body.slice(owOpen + 1, matchBracket(body, owOpen));
            region.oneWayEntrances = scanCalls(owBody, "ENTRANCE").map((args) => `ENTRANCE(${args.join(",")})`);
        }

        regions[m[1]] = region;
    }
}

function extractMacros(rawText, macros) {
    const text = stripComments(rawText.replace(/\\\n/g, " "));
    const re = /^[ \t]*#define[ \t]+(\w+)(\(([^)]*)\))?[ \t]+(.+)$/gm;
    let m;
    while ((m = re.exec(text))) {
        macros[m[1]] = {
            params: m[2] ? m[3].split(",").map((p) => p.trim()).filter(Boolean) : null,
            body: m[4].replace(/\s+/g, " ").trim(),
        };
    }
}

function extractEnemyTable(logicH) {
    const start = logicH.indexOf("inline bool CanKillEnemy");
    const open = logicH.indexOf("{", start);
    const body = logicH.slice(open + 1, matchBracket(logicH, open));
    const switchOpen = body.indexOf("{", body.indexOf("switch (EnemyId)"));
    const cases = body.slice(switchOpen + 1, matchBracket(body, switchOpen));

    const table = {};
    let pending = [];
    const re = /case\s+(\w+)\s*:|return\s+([^;]+);|default\s*:/g;
    let m;
    while ((m = re.exec(cases))) {
        if (m[1]) {
            pending.push(m[1]);
        } else if (m[2]) {
            for (const actor of pending) {
                table[actor] = m[2].replace(/\s+/g, " ").trim();
            }
            pending = [];
        } else {
            pending = [];
        }
    }
    return table;
}

// name -> value for every member of every enum in the text, plus the ordered member list of each enum.
function extractEnums(text) {
    const values = {};
    const lists = [];
    const re = /enum\s*\w*\s*\{/g;
    let m;
    while ((m = re.exec(text))) {
        const open = m.index + m[0].length - 1;
        const close = matchBracket(text, open);
        let next = 0;
        const list = [];
        for (const member of splitTopLevel(text.slice(open + 1, close))) {
            const mm = member.match(/^(\w+)(?:\s*=\s*(.+))?$/);
            if (!mm) {
                continue;
            }
            if (mm[2] !== undefined) {
                const explicit = Number(mm[2]);
                next = Number.isNaN(explicit) ? (values[mm[2]] ?? next) : explicit;
            }
            values[mm[1]] = next++;
            list.push(mm[1]);
        }
        lists.push(list);
        re.lastIndex = close;
    }
    return { values, lists };
}

// Everything the viewer needs from one version of the source. `source` reads files under mm/2s2h/Rando.
function extractLogic(source) {
    const read = (...parts) => source.read(parts.join("/"));
    const logicH = read("Logic", "Logic.h");
    const logicHClean = stripComments(logicH);

    const regions = {};
    const macros = {};
    extractMacros(logicH, macros);
    // Which source file each region came from, so unchanged files can share storage between versions.
    const regionGroups = [];
    const addRegions = (text) => {
        const before = new Set(Object.keys(regions));
        extractRegions(text, regions);
        regionGroups.push(Object.keys(regions).filter((id) => !before.has(id)));
    };
    addRegions(stripComments(read("Logic", "Logic.cpp")));
    for (const file of source.list("Logic/Regions").filter((f) => f.endsWith(".cpp")).sort()) {
        const raw = read("Logic", "Regions", file);
        extractMacros(raw, macros);
        addRegions(stripComments(raw));
    }
    for (const structural of ["EVENT", "EXIT", "CONNECTION", "CHECK", "STAY", "RANDO_LOGIC_H"]) {
        delete macros[structural];
    }

    const types = extractEnums(stripComments(read("Types.h")));
    const enumList = (first) => types.lists.find((list) => list[0] === first) || [];
    const regionOrder = types.lists.find((list) => list.includes("RR_MAX")) || [];

    const optionValues = {};
    for (const [name, value] of Object.entries(types.values)) {
        if (name.startsWith("RO_")) {
            optionValues[name] = value;
        }
    }

    const timeSlices = extractEnums(logicHClean).lists.find((list) => list[0] === "TIME_DAY1_AM_06_00");
    if (!timeSlices) {
        throw new Error("Logic.h has no TimeSlice enum (logic from before time-of-day tracking)");
    }

    const checks = {};
    for (const args of scanCalls(stripComments(read("StaticData", "Checks.cpp")), "RC")) {
        if (/^RC_\w+$/.test(args[0]) && args.length >= 6) {
            checks[args[0]] = { type: args[1], scene: args[2], vanilla: args[5] };
        }
    }

    const items = {};
    for (const args of scanCalls(stripComments(read("StaticData", "Items.cpp")), "RI")) {
        if (/^RI_\w+$/.test(args[0]) && args.length >= 5) {
            items[args[0]] = { name: args[2].replace(/^"|"$/g, ""), type: args[3], itemId: args[4] };
        }
    }

    const optionDefaults = {};
    for (const args of scanCalls(stripComments(read("StaticData", "Options.cpp")), "RO")) {
        if (/^RO_\w+$/.test(args[0]) && args.length >= 2) {
            optionDefaults[args[0]] = args[1];
        }
    }

    // { ACTOR_X, RI_SOUL_Y } pairs of enemySoulMap in Souls.cpp
    const enemySouls = {};
    for (const m of stripComments(read("ActorBehavior", "Souls.cpp")).matchAll(/\{\s*(ACTOR_\w+)\s*,\s*(RI_SOUL_\w+)\s*\}/g)) {
        enemySouls[m[1]] = m[2];
    }

    // SOUL_RI_TO_RANDO_INF: soul items and their flags line up by enum offset.
    const soulInfs = {};
    const riList = types.lists.find((list) => list.includes("RI_SOUL_BOSS_GOHT")) || [];
    const infList = types.lists.find((list) => list.includes("RANDO_INF_OBTAINED_SOUL_OF_BOSS_GOHT")) || [];
    for (const ri of riList.filter((name) => name.startsWith("RI_SOUL_"))) {
        soulInfs[ri] =
            infList[infList.indexOf("RANDO_INF_OBTAINED_SOUL_OF_BOSS_GOHT") + riList.indexOf(ri) - riList.indexOf("RI_SOUL_BOSS_GOHT")];
    }

    // Code that primitives.js and solver.js mirror by hand. Differing hashes mean those may not match this version.
    const hash = (text) => createHash("sha1").update(text.replace(/\s+/g, " ")).digest("hex").slice(0, 12);
    const ported = {};
    for (const name of [
        "canPlaySong",
        "CanAccessDungeon",
        "MoonMaskCount",
        "RemainsCount",
        "MeetsMoonRequirements",
        "OwnsHalfDayForMode",
        "ClockFilter",
        "RawAt",
        "RawBefore",
        "RawAfter",
        "RawBetween",
    ]) {
        ported[`Logic.h ${name}`] = hash(functionBody(logicHClean, name));
    }
    const southClean = stripComments(read("Logic", "Regions", "South.cpp"));
    for (const name of ["CanGetPastBigOctoWithoutBoat", "CanGetPastBigOcto"]) {
        ported[`South.cpp ${name}`] = hash(functionBody(southClean, name));
    }
    for (const file of ["GiveItem.cpp", "ConvertItem.cpp", "Logic/TimeLogic.cpp", "Logic/GlitchlessLogic.cpp"]) {
        ported[file] = hash(stripComments(read(file)));
    }

    // Starting items are read per version. Only builds that predate GetComputedStartingItems() fall back to the
    // hand-written rules, and are flagged for it.
    const startingText = stripComments(read("StartingItems.cpp"));
    const itemOrder = types.lists.find((list) => list.includes("RI_UNKNOWN")) || [];
    const startingRules = parseStartingRules(startingText, itemOrder);
    if (!startingRules) {
        ported["StartingItems.cpp"] = hash(startingText);
    }
    ported["Logic/Logic.cpp FindReachableRegions"] = hash(functionBody(stripComments(read("Logic", "Logic.cpp")), "FindReachableRegions"));

    const data = {
        regions,
        regionOrder,
        macros,
        enemies: extractEnemyTable(logicHClean),
        enemySouls,
        soulInfs,
        timeSlices,
        optionValues,
        optionDefaults,
        optionIds: enumList("RO_ACCESS_DUNGEONS"),
        checks,
        items,
        startingRules,
        ported,
    };
    return { data, regionGroups };
}

function functionBody(text, name) {
    const m = new RegExp(`\\b${name}\\s*\\([^)]*\\)\\s*\\{`).exec(text);
    if (!m) {
        return "";
    }
    const open = m.index + m[0].length - 1;
    return text.slice(open, matchBracket(text, open) + 1);
}

// Reads the option-driven starting items out of StartingItems.cpp as rules: { when, items: [[item, count]] }, where
// `when` is a condition over RANDO_SAVE_OPTIONS (null: always) and count may be a number or a named constant.
// The Clock Shuffle block picks an item with the game's RNG, so it becomes { when, clock: true } for primitives.js.
// Throws on any statement it does not understand, so a new kind of rule cannot be silently dropped.
function parseStartingRules(text, riList) {
    const rules = [];
    const options = (cond) => cond.replace(/\b\w+(\.|->)randoSaveOptions\[/g, "RANDO_SAVE_OPTIONS[");
    const range = (from, to) => {
        const a = riList.indexOf(from);
        const b = riList.indexOf(to);
        if (a < 0 || b < a) {
            throw new Error(`starting items: bad item range ${from}..${to}`);
        }
        return riList.slice(a, b + 1);
    };

    // Declarations are lifted out of nested blocks too, so inner blocks inherit them.
    function parseBlock(block, when, outer) {
        const vectors = { ...outer };
        const body = block.replace(/std::vector<RandoItemId>\s+(\w+)\s*=\s*\{([^}]*)\}\s*;/g, (_, name, list) => {
            vectors[name] = list.split(",").map((item) => item.trim()).filter(Boolean);
            return "";
        });
        const add = (items) => rules.push({ when, items });
        // One push_back/insert statement, applied to each of `each` (or to the literal item it names).
        const statement = (stmt, each) => {
            let m;
            if ((m = stmt.match(/^startingItems\.push_back\(\s*(?:\(RandoItemId\)\s*)?(\w+)\s*\)$/))) {
                add((each || [m[1]]).map((item) => [item, 1]));
            } else if ((m = stmt.match(/^startingItems\.insert\(\s*startingItems\.end\(\)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)$/))) {
                add((each || [m[2]]).map((item) => [item, /^\d+$/.test(m[1]) ? Number(m[1]) : m[1]]));
            } else {
                throw new Error(`starting items: cannot read "${stmt.slice(0, 80)}"`);
            }
        };

        for (let i = 0; i < body.length; ) {
            const rest = body.slice(i);
            const lead = rest.match(/^\s*/)[0].length;
            if (lead === rest.length) {
                break;
            }
            i += lead;
            const keyword = body.slice(i).match(/^(if|for)\s*\(/);
            if (keyword) {
                const open = i + keyword[0].length - 1;
                const close = matchBracket(body, open);
                const header = body.slice(open + 1, close).replace(/\s+/g, " ").trim();
                const braceOpen = body.indexOf("{", close);
                const braceClose = matchBracket(body, braceOpen);
                const inner = body.slice(braceOpen + 1, braceClose);
                i = braceClose + 1;
                if (keyword[1] === "if") {
                    if (/^\s*else\b/.test(body.slice(i))) {
                        throw new Error("starting items: if/else is not supported");
                    }
                    const cond = options(header);
                    const both = when ? `(${when}) && (${cond})` : cond;
                    if (/RO_CLOCK_SHUFFLE\b/.test(cond)) {
                        rules.push({ when: both, clock: true });
                    } else {
                        parseBlock(inner, both, vectors);
                    }
                } else {
                    let m;
                    let each;
                    if ((m = header.match(/^(?:const )?(?:RandoItemId|auto)&? \w+ : (\w+)$/)) && vectors[m[1]]) {
                        each = vectors[m[1]];
                    } else if ((m = header.match(/^int (\w+) = (RI_\w+); \1 <= (RI_\w+); \1\+\+$/))) {
                        each = range(m[2], m[3]);
                    } else {
                        throw new Error(`starting items: cannot read loop "${header}"`);
                    }
                    for (const stmt of inner.split(";").map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean)) {
                        statement(stmt, each);
                    }
                }
                continue;
            }
            const end = body.indexOf(";", i);
            if (end < 0) {
                throw new Error(`starting items: cannot read "${body.slice(i, i + 80).trim()}"`);
            }
            const stmt = body.slice(i, end).replace(/\s+/g, " ").trim();
            i = end + 1;
            if (stmt && !/^return\b/.test(stmt) && !/^std::vector<RandoItemId> startingItems$/.test(stmt)) {
                statement(stmt, null);
            }
        }
    }

    const computed = functionBody(text, "GetComputedStartingItems");
    if (!computed) {
        return null;
    }
    parseBlock(computed.slice(1, -1), null, {});

    // GrantStartingItems() also gives items directly under an option.
    const grant = functionBody(text, "GrantStartingItems");
    for (const m of grant.matchAll(/if\s*\(\s*(RANDO_SAVE_OPTIONS\[\w+\][^)]*)\)\s*\{/g)) {
        const open = m.index + m[0].length - 1;
        const items = [...grant.slice(open, matchBracket(grant, open)).matchAll(/Rando::GiveItem\(\s*(RI_\w+)\s*\)/g)].map((g) => [g[1], 1]);
        if (items.length) {
            rules.push({ when: m[1].trim(), items });
        }
    }
    return rules;
}

const RANDO_PATH = "mm/2s2h/Rando";
const git = (...args) =>
    execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });

const worktreeSource = {
    read: (path) => readFileSync(join(randoDir, path), "utf8").replace(/\r\n/g, "\n"),
    list: (path) => readdirSync(join(randoDir, path)),
};
const commitSource = (commit) => ({
    read: (path) => git("show", `${commit}:${RANDO_PATH}/${path}`).replace(/\r\n/g, "\n"),
    list: (path) =>
        git("ls-tree", "--name-only", commit, `${RANDO_PATH}/${path}/`)
            .split("\n")
            .filter(Boolean)
            .map((name) => name.split("/").pop()),
});

await import("./expr.js");
await import("./primitives.js");
await import("./solver.js");

const digest = (value) => createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 10);

// Extracts and checks one version. A version is stored as chunks (one per region source file, one for the check
// table, one for the rest) because most commits only touch one of them.
function build(source) {
    const { data, regionGroups } = extractLogic(source);
    const problems = globalThis.RG.validateLogic(data);
    if (problems.length === 0) {
        // Resolving is not enough: the item and option handling has to run against this version's tables too.
        try {
            const solved = globalThis.RG.solve(data, globalThis.RG.vanillaSpoiler(data));
            if (solved.unreached.length) {
                problems.push(`vanilla placement leaves ${solved.unreached.length} checks unreachable, e.g. ${solved.unreached[0]}`);
            }
        } catch (error) {
            problems.push(`solver failed on vanilla placement: ${error.message}`);
        }
    }
    const { regions, checks, ...rest } = data;
    const chunks = [
        ...regionGroups
            .filter((ids) => ids.length)
            .map((ids) => ({ regions: Object.fromEntries(ids.map((id) => [id, regions[id]])) })),
        { checks },
        rest,
    ].map((chunk) => ({ id: digest(chunk), chunk }));
    return { id: digest(chunks.map((entry) => entry.id)), data, chunks, problems };
}

// logic/index.js maps build commits to logic files; many commits share one file.
const logicDir = join(here, "logic");
const indexPath = join(logicDir, "index.js");
const INDEX_PREFIX = "globalThis.RG_LOGIC_INDEX = ";
mkdirSync(logicDir, { recursive: true });
const index = existsSync(indexPath)
    ? JSON.parse(
          readFileSync(indexPath, "utf8")
              .split("\n")
              .find((line) => line.startsWith(INDEX_PREFIX))
              .slice(INDEX_PREFIX.length)
              .replace(/;$/, "")
      )
    : { latest: null, accepted: {}, versions: {}, commits: {} };

// ported.json: the state of the hand-mirrored game code that primitives.js/solver.js were last checked against.
// It is committed, unlike logic/, so a fresh build knows what "checked" means.
const portedPath = join(here, "ported.json");
index.accepted = existsSync(portedPath) ? JSON.parse(readFileSync(portedPath, "utf8")) : {};
const portedById = {};

// `commit` and `date` describe the newest commit known to have this logic (null commit: an uncommitted working tree).
function writeLogic({ id, chunks }, commit, date) {
    for (const entry of chunks) {
        const path = join(logicDir, `${entry.id}.js`);
        if (!existsSync(path)) {
            writeFileSync(path, `(globalThis.RG_LOGIC_CHUNKS ||= {})["${entry.id}"] = ${JSON.stringify(entry.chunk)};\n`);
        }
    }
    const known = index.versions[id];
    index.versions[id] = {
        chunks: chunks.map((entry) => entry.id),
        ...(known && known.commit && (!commit || known.date >= date) ? { commit: known.commit, date: known.date } : { commit, date }),
    };
}

const historyAt = args.indexOf("--history");

if (historyAt >= 0) {
    // Record the logic of past commits, reading them straight out of git.
    const limit = /^\d+$/.test(args[historyAt + 1] || "") ? Number(args[historyAt + 1]) : 300;
    const dates = {};
    const commits = git("log", `-n${limit}`, "--format=%H %cI")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const [commit, date] = line.split(" ");
            dates[commit] = date;
            return commit;
        });
    const trees = git("rev-parse", ...commits.map((commit) => `${commit}:${RANDO_PATH}`)).split("\n").filter(Boolean);
    const byTree = new Map();
    let unsupported = 0;
    commits.forEach((commit, i) => {
        if (!byTree.has(trees[i])) {
            let id = null;
            try {
                const built = build(commitSource(commit));
                if (built.problems.length) {
                    throw new Error(`${built.problems.length} problem(s), e.g. ${built.problems[0]}`);
                }
                writeLogic(built, commit, dates[commit]);
                id = built.id;
                portedById[id] = built.data.ported;
            } catch (error) {
                console.log(`${commit.slice(0, 9)} not usable: ${String(error.message).split("\n")[0]}`);
            }
            byTree.set(trees[i], id);
        }
        index.commits[commit] = byTree.get(trees[i]);
        unsupported += byTree.get(trees[i]) ? 0 : 1;
    });
    // The newest readable commit is the latest logic, unless an uncommitted working tree was recorded as latest.
    const latestKnown = index.versions[index.latest];
    if (!latestKnown || latestKnown.commit) {
        index.latest = commits.map((commit) => index.commits[commit]).find(Boolean) || null;
    }

    if (args.includes("--strict")) {
        const newest = index.commits[commits[0]];
        const drift = newest ? Object.keys(portedById[newest] || {}).filter((key) => index.accepted[key] !== portedById[newest][key]) : [];
        if (!newest) {
            console.error(`\nThe newest commit (${commits[0].slice(0, 9)}) is not usable; spoilers from it fall back to older logic.`);
            process.exitCode = 1;
        } else if (drift.length) {
            console.error(`\nHand-mirrored game code changed and needs review against primitives.js/solver.js:\n  ${drift.join("\n  ")}`);
            console.error("After reviewing, run: node extract.mjs --source <game repo> --accept, and commit ported.json");
            process.exitCode = 1;
        }
    }
    const ids = new Set(commits.map((commit) => index.commits[commit]).filter(Boolean));
    console.log(`${commits.length} commits -> ${ids.size} distinct logic version(s), ${unsupported} commit(s) not usable`);
} else {
    // Record the working tree as the latest logic.
    const built = build(worktreeSource);
    const { data, problems } = built;
    const count = (key) => Object.values(data.regions).reduce((sum, region) => sum + region[key].length, 0);
    console.log(
        `regions ${Object.keys(data.regions).length}, checks ${count("checks")}, exits ${count("exits")}, ` +
            `connections ${count("connections")}, events ${count("events")}, stays ${count("stays")}, ` +
            `macros ${Object.keys(data.macros).length}, enemies ${Object.keys(data.enemies).length}, ` +
            `static checks ${Object.keys(data.checks).length}, items ${Object.keys(data.items).length}`
    );

    // Drift guard: every condition has to resolve against the hand-written primitives.
    if (problems.length) {
        console.error(`\n${problems.length} condition(s) use something primitives.js does not know:`);
        for (const problem of problems.slice(0, 60)) {
            console.error(`  ${problem}`);
        }
        process.exitCode = 1;
    }

    if (args.includes("--accept") || Object.keys(index.accepted).length === 0) {
        index.accepted = data.ported;
        writeFileSync(portedPath, JSON.stringify(data.ported, null, 4) + "\n");
    } else {
        const changed = Object.keys(data.ported).filter((key) => index.accepted[key] !== data.ported[key]);
        if (changed.length) {
            console.warn("\nwarning: hand-ported code changed since primitives.js/solver.js were last checked:");
            for (const key of changed) {
                console.warn(`  ${key}`);
            }
            console.warn("Review them against the source, then run: node extract.mjs --accept");
        }
    }

    let head = null;
    let headDate = new Date().toISOString();
    try {
        // Only a clean tree is the logic of the commit it sits on.
        if (git("status", "--porcelain", "--", RANDO_PATH).trim() === "") {
            [head, headDate] = git("log", "-n1", "--format=%H %cI").trim().split(" ");
        }
    } catch {
        // No git: the viewer can still use this as the latest logic.
    }
    writeLogic(built, head, headDate);
    index.latest = built.id;
    if (head) {
        index.commits[head] = built.id;
    }
    console.log(`logic ${built.id} is now the latest${problems.length ? " (with unresolved conditions, see above)" : ""}`);
}

const live = new Set([index.latest, ...Object.values(index.commits)].filter(Boolean));
for (const id of Object.keys(index.versions)) {
    if (!live.has(id)) {
        delete index.versions[id];
    }
}
const used = new Set(Object.values(index.versions).flatMap((version) => version.chunks));
for (const file of readdirSync(logicDir)) {
    if (file !== "index.js" && !used.has(file.replace(/\.js$/, ""))) {
        unlinkSync(join(logicDir, file));
    }
}
writeFileSync(indexPath, `// Generated by extract.mjs. Do not edit.\n${INDEX_PREFIX}${JSON.stringify(index)};\n`);
