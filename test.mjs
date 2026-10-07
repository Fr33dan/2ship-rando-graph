// Sanity checks for the extracted logic and the solver.
// Usage: node test.mjs [spoiler.json ...]
// Spoilers in samples/ are picked up automatically.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
await import("./logic/index.js");
await import("./store.js");
await import("./expr.js");
await import("./primitives.js");
await import("./solver.js");
await import("./tree.js");

const { RG, RG_LOGIC_INDEX: index } = globalThis;
const loadChunk = (id) => import(`./logic/${id}.js`);
const data = await RG.loadLogic(index, index.latest, loadChunk);
let failures = 0;
const check = (ok, message) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
    failures += ok ? 0 : 1;
};

// 1. Every condition resolves.
const problems = RG.validateLogic(data);
check(problems.length === 0, `all conditions resolve${problems.length ? `: ${problems.slice(0, 5).join("; ")}` : ""}`);

// 2. The guard actually notices unknown names.
const broken = structuredClone(data);
broken.regions.RR_MAX.checks.push({ check: "RC_STARTING_ITEM_DEKU_MASK", cond: "SOME_NEW_HELPER(ITEM_BOW)" });
check(RG.validateLogic(broken).some((p) => p.includes("SOME_NEW_HELPER")), "unknown names are reported");

// 3. Vanilla placement with default options: the whole game has to be completable.
const vanilla = RG.vanillaSpoiler(data);
const vanillaResult = RG.solve(data, vanilla);
check(vanillaResult.regionInfo.has("RR_MOON_MAJORAS_LAIR"), "vanilla placement reaches Majora's Lair");
check(
    vanillaResult.unreached.length === 0,
    `vanilla placement reaches every check (${vanillaResult.unreached.length} unreached` +
        `${vanillaResult.unreached.length ? `: ${vanillaResult.unreached.slice(0, 15).join(", ")}` : ""})`
);
const unreachedRegions = [...vanillaResult.regions.keys()].filter((id) => !vanillaResult.regionInfo.has(id));
check(unreachedRegions.length === 0, `vanilla placement reaches every region (${unreachedRegions.slice(0, 10).join(", ")})`);

// 3b. Taking key items away has to lock things: guards against a solver that says yes to everything.
const without = (items, startingItems) =>
    RG.solve(data, {
        ...vanilla,
        startingItems: startingItems || vanilla.startingItems,
        checks: Object.fromEntries(Object.entries(vanilla.checks).map(([id, ri]) => [id, items.includes(ri) ? "RI_RUPEE_GREEN" : ri])),
    });
check(!without(["RI_SONG_OATH"]).regionInfo.has("RR_MOON"), "no Oath to Order: the Moon is unreachable");
check(!without(["RI_REMAINS_GOHT"]).regionInfo.has("RR_MOON"), "missing boss remains: the Moon is unreachable");
check(!without(["RI_BOW", "RI_PROGRESSIVE_BOW", "RI_QUIVER_40", "RI_QUIVER_50"]).regionInfo.has("RR_MOON_MAJORAS_LAIR"), "no bow: Majora's Lair is unreachable");
check(!without(["RI_MASK_DEKU"]).checkInfo.has("RC_WOODFALL_TEMPLE_BOSS_CONTAINER"), "no Deku Mask: Odolwa's heart container is out of logic");
check(!without(["RI_OCARINA"], ["RI_PROGRESSIVE_SWORD", "RI_SHIELD_HERO", "RI_SONG_TIME"]).regionInfo.has("RR_MOON"), "no Ocarina: the Moon is unreachable");
const noHookshot = without(["RI_HOOKSHOT"]);
check(noHookshot.unreached.length > 50 && noHookshot.unreached.length < 2000, `no Hookshot: some but not all checks are locked (${noHookshot.unreached.length})`);

// 4. Trees build for every reachable check without throwing or looping.
function exerciseTrees(result, label) {
    let nodes = 0;
    let error = null;
    try {
        for (const target of RG.listTargets(result)) {
            const tree = RG.buildTree(result, target);
            // Lazy branches are opened two levels down, the way a user poking at alternatives would.
            const walk = (node, depth, opens) => {
                nodes++;
                if (depth > 400) {
                    throw new Error(`tree for ${target.id} is deeper than 400`);
                }
                if (typeof node.label !== "string") {
                    throw new Error(`node without a label under ${target.id}`);
                }
                const kids = node.kids || (node.lazy && opens > 0 ? node.lazy() : []);
                for (const kid of kids) {
                    walk(kid, depth + 1, node.kids ? opens : opens - 1);
                }
            };
            walk(tree, 0, 2);
        }
    } catch (e) {
        error = e;
    }
    check(!error, `${label}: every target builds a tree (${nodes} nodes)${error ? `: ${error.stack}` : ""}`);
}
exerciseTrees(vanillaResult, "vanilla");
exerciseTrees(noHookshot, "vanilla without Hookshot");

// 5. Every recorded logic version loads and solves a vanilla placement; builds map to versions as expected.
let versionsOk = 0;
let versionError = "";
for (const id of Object.keys(index.versions)) {
    try {
        const version = await RG.loadLogic(index, id, loadChunk);
        const solved = RG.solve(version, RG.vanillaSpoiler(version));
        if (solved.unreached.length) {
            throw new Error(`${solved.unreached.length} checks unreachable`);
        }
        versionsOk++;
    } catch (error) {
        versionError = `${id}: ${error.message}`;
    }
}
check(!versionError, `all ${Object.keys(index.versions).length} recorded logic versions solve vanilla placement (${versionsOk} ok) ${versionError}`);
const recorded = Object.entries(index.commits).find(([, id]) => id && id !== index.latest);
if (recorded) {
    const short = RG.pickLogic(index, recorded[0].slice(0, 7));
    check(short.match === "exact" && short.id === recorded[1], "a build's short hash picks its own logic version");
}
const unknownPick = RG.pickLogic(index, "0000000");
check(unknownPick.match === "unknown" && unknownPick.id === index.latest, "an unrecorded build falls back to the latest logic");
check(RG.spoilerCommit({ commitHash: [101, 56, 55, 53, 55, 99, 49, 0] }) === "e8757c1", "commit hashes stored as byte arrays are read");

// 6. Real spoilers: a glitchless seed must have every shuffled check reachable.
const samplesDir = join(here, "samples");
const files = [
    ...process.argv.slice(2),
    ...(existsSync(samplesDir) ? readdirSync(samplesDir).filter((f) => f.endsWith(".json")).map((f) => join(samplesDir, f)) : []),
];
if (files.length === 0) {
    console.log("note no real spoiler files given; put some in samples/ for the strongest check");
}
for (const file of files) {
    const spoiler = JSON.parse(readFileSync(file, "utf8"));
    const pick = RG.pickLogic(index, RG.spoilerCommit(spoiler));
    console.log(`note ${file}: build ${pick.commit || "unknown"}, logic ${pick.id} (${pick.match})`);
    const data = await RG.loadLogic(index, pick.id, loadChunk);
    const result = RG.solve(data, spoiler);
    const glitchless = result.options.RO_LOGIC === data.optionValues.RO_LOGIC_GLITCHLESS;
    const missed = result.unreached.filter((id) => result.shuffled.has(id));
    for (const warning of result.warnings) {
        console.log(`note ${file}: ${warning}`);
    }
    if (glitchless) {
        check(missed.length === 0, `${file}: all shuffled checks reachable (${missed.length} missed: ${missed.slice(0, 15).join(", ")})`);
    } else {
        console.log(`note ${file}: not a glitchless seed, ${missed.length} shuffled checks are out of logic`);
    }
    exerciseTrees(result, file);
}

process.exitCode = failures ? 1 : 0;
