// Picks and assembles the logic version for a spoiler from the records under logic/ (written by extract.mjs).
//   RG_LOGIC_INDEX = { latest, accepted, versions: { id: { chunks, commit, date } }, commits: { hash: id | null } }
(function (root) {
    const RG = (root.RG = root.RG || {});

    // A spoiler stores the build's short hash; older files may hold it as an array of character codes.
    function spoilerCommit(spoiler) {
        const raw = spoiler && spoiler.commitHash;
        const text = Array.isArray(raw) ? String.fromCharCode(...raw.filter((code) => code > 0)) : typeof raw === "string" ? raw : "";
        return /^[0-9a-f]{6,40}$/i.test(text.trim()) ? text.trim().toLowerCase() : "";
    }

    // Which logic to use for a build: { id, match, commit }
    //   match  "exact"     this build's logic is on record
    //          "unusable"  the build is on record but its logic predates what this tool can read
    //          "unknown"   no record for the build (or the spoiler names none)
    function pickLogic(index, commit) {
        if (commit) {
            const hit = Object.keys(index.commits).find((full) => full.startsWith(commit) || commit.startsWith(full));
            if (hit) {
                return index.commits[hit] ? { id: index.commits[hit], match: "exact", commit } : { id: index.latest, match: "unusable", commit };
            }
        }
        return { id: index.latest, match: "unknown", commit };
    }

    // Recorded versions, newest first, for a version picker.
    function listLogic(index) {
        return Object.entries(index.versions)
            .map(([id, version]) => ({
                id,
                date: version.date,
                label: `${String(version.date).slice(0, 10)} · ${version.commit ? version.commit.slice(0, 7) : "working copy"}${id === index.latest ? " (latest)" : ""}`,
            }))
            .sort((a, b) => (a.date < b.date ? 1 : -1));
    }

    // Names of hand-mirrored source that differs between a version and what primitives.js/solver.js were checked against.
    function portedDrift(index, data) {
        return Object.keys(data.ported || {}).filter((key) => index.accepted[key] !== data.ported[key]);
    }

    // What each piece of hand-mirrored source decides, in the words the page uses to explain a difference.
    const PORTED_TOPICS = [
        [/^StartingItems\.cpp$/, "which items the settings hand you at the start"],
        [/^(GiveItem|ConvertItem)\.cpp$/, "what receiving an item does (progressive upgrades, keys, duplicates)"],
        [/GlitchlessLogic\.cpp$|FindReachableRegions$/, "how reachable areas and checks are searched"],
        [/TimeLogic\.cpp$|Raw(At|Before|After|Between)$/, "how time of day is tracked"],
        [/OwnsHalfDayForMode$|ClockFilter$/, "how Clock Shuffle limits the time you own"],
        [/canPlaySong$/, "which ocarina buttons each song needs"],
        [/CanAccessDungeon$/, "what opens the dungeon entrances"],
        [/(MoonMaskCount|RemainsCount|MeetsMoonRequirements)$/, "what the Moon requires"],
        [/CanGetPastBigOcto/, "how to get past the Big Octo in the swamp"],
    ];

    // The distinct topics behind a list of drifted source names.
    function describeDrift(names) {
        const topics = names.map((name) => {
            const macro = name.match(/^#define (\w+)$/);
            if (macro) {
                return `the ${macro[1]} rule`;
            }
            return (PORTED_TOPICS.find(([pattern]) => pattern.test(name)) || [null, name])[1];
        });
        return [...new Set(topics)];
    }

    const assembled = new Map();

    // loadChunk(chunkId) must make RG_LOGIC_CHUNKS[chunkId] available and return a promise.
    async function loadLogic(index, id, loadChunk) {
        if (assembled.has(id)) {
            return assembled.get(id);
        }
        const version = index.versions[id];
        if (!version) {
            throw new Error(`no logic recorded under ${id}`);
        }
        await Promise.all(version.chunks.map((chunkId) => (root.RG_LOGIC_CHUNKS && root.RG_LOGIC_CHUNKS[chunkId] ? null : loadChunk(chunkId))));
        const data = { regions: {} };
        for (const chunkId of version.chunks) {
            const chunk = root.RG_LOGIC_CHUNKS && root.RG_LOGIC_CHUNKS[chunkId];
            if (!chunk) {
                throw new Error(`logic file logic/${chunkId}.js is missing`);
            }
            for (const [key, value] of Object.entries(chunk)) {
                if (key === "regions") {
                    Object.assign(data.regions, value);
                } else {
                    data[key] = value;
                }
            }
        }
        assembled.set(id, data);
        return data;
    }

    RG.spoilerCommit = spoilerCommit;
    RG.pickLogic = pickLogic;
    RG.listLogic = listLogic;
    RG.portedDrift = portedDrift;
    RG.describeDrift = describeDrift;
    RG.loadLogic = loadLogic;
})(globalThis);
