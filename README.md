# 2Ship rando requirement tree

Drop a [2 Ship 2 Harkinian](https://github.com/2ship2harkinian/2ship2harkinian) randomizer spoiler file on the page
and see what any item, check, region or event needs, as a tree. The file is read in your browser and never uploaded.

A spoiler file only says where things are. The rules come from the game's C++ logic, which `extract.mjs` reads out
of the game's source and records under `logic/`, one record per version of the logic.

## Use

- Where there are several ways to meet a requirement, the one that opens earliest in this seed is expanded and
  highlighted. The rest sit behind an "N other ways" box.
- `S3` on a box is its sphere: the number of rounds of "collect everything reachable" it takes to get there.
- Requirements already met by starting items are hidden unless you untick the box in the sidebar.
- Select a box to see the raw condition and route in the sidebar, and to re-root the tree on it.
- Item boxes are coloured by kind of item (gear, mask, song, key, fairy / token, soul).
- A dashed box with ↗ is expanded elsewhere in the tree; click the ↗ to go there, and "Back to where you were" to
  return.
- "Find in this tree" highlights every matching box and steps through them with Enter / Shift+Enter, opening
  closed branches as needed. Alternatives that were never opened are not searched.

`?example` loads a vanilla-placement example; `&target=item:RI_HOOKSHOT` picks a target, `&version=<logic id>` a
logic version and `&find=<text>` runs a search.

## Logic versions

A spoiler names the build that made it (a short commit hash). The page looks that build up in `logic/index.js` and
uses the logic recorded for it. If the build is not on record it uses the latest logic and says so. The "Logic
version" box in the sidebar switches to any recorded version by hand.

Most commits do not change the logic, so many builds point at the same version, and versions share the parts that
did not change between them (one file per region source file, one for the check table, one for the rest).

Each version carries its own conditions, check and item tables, and the starting items its settings grant. The rest
of an older version is read with today's `primitives.js` and `solver.js`. When the game code those mirror was
different in a version, the page lists what differed, since results for that version may be slightly off.

A version is only recorded if every condition resolves and a vanilla placement solves completely with it. Commits
that fail are kept on record as unusable, and their spoilers fall back to the latest logic. Logic from before
time-of-day tracking (January 2026) cannot be read.

## How it is published

`logic/` is not committed. The workflow in `.github/workflows/pages.yml` builds it and deploys the page to GitHub
Pages on every push to `main`, once a day, and on demand:

1. checks out the game repository with full history (`GAME_REPO` / `GAME_REF` at the top of the workflow),
2. records the logic of the last `HISTORY` commits,
3. runs the tests,
4. publishes the page with the recorded logic.

The run goes red, without holding back the deploy, when the newest game commit could not be recorded cleanly:
either the logic uses a macro, helper or flag `primitives.js` does not know, or game code that is mirrored by hand
changed. See "Keeping up with the game" below.

GitHub turns scheduled workflows off after 60 days without repository activity; re-enable it from the Actions tab.

## Run it locally

Needs Node 22+ (no packages) and a clone of the game repository.

```
node extract.mjs --source ../2ship2harkinian                  record that checkout's working tree as the latest logic
node extract.mjs --source ../2ship2harkinian --history 300    record its last 300 commits, read straight from git
node test.mjs
```

`--source` can be left out if the game is at `../2ship2harkinian` or `RANDO_SOURCE` is set. Then open `index.html`
in a browser; no server is needed.

`test.mjs` solves a vanilla placement (everything must be reachable), checks that removing key items locks things,
builds every tree, and solves a vanilla placement with every recorded logic version. Put real spoiler files in
`samples/` (or pass paths) and it also checks that every shuffled check of a Glitchless seed is reachable, which is
the strongest test of the port.

## Keeping up with the game

- **Unknown name.** `extract.mjs` exits non-zero and lists the conditions when the logic uses something
  `primitives.js` does not know. Add it there.
- **Mirrored code changed.** `GiveItem.cpp`, `ConvertItem.cpp`, `TimeLogic.cpp`, `GlitchlessLogic.cpp` and helpers
  such as `canPlaySong` or `CanAccessDungeon` are mirrored by hand in `primitives.js` / `solver.js`. `ported.json`
  holds the state they were last checked against. When the game's copy changes, compare, update the mirror if needed,
  then run `node extract.mjs --source <game> --accept` and commit `ported.json`.
- **Starting items changed shape.** They are read from `StartingItems.cpp` by a small parser in `extract.mjs`, which
  stops with an error on a statement it cannot read rather than dropping a rule.

## Files

| File | Role |
|---|---|
| `extract.mjs` | Reads the game's `mm/2s2h/Rando` (working tree or past commits) and writes `logic/` |
| `ported.json` | Hashes of the hand-mirrored game code as last reviewed |
| `logic/` | Generated: `index.js` (build → version) and the shared logic files |
| `store.js` | Picks and assembles the logic version for a spoiler |
| `expr.js` | Parser for the condition expressions |
| `primitives.js` | What each leaf predicate means, and what receiving each item does (hand-maintained) |
| `solver.js` | Reachability over a spoiler: port of the generator's search, without placement |
| `tree.js` | Builds the requirement tree for a target |
| `index.html`, `app.js`, `style.css` | The page |

## Limits

- Only Glitchless has rules. Seeds made with No Logic, Nearly No Logic or Vanilla are shown against the Glitchless
  rules, with a warning, and may have things marked out of logic.
- Only commits of the configured game repository and branch are on record. Spoilers from forks or unpushed local
  builds are shown against the latest logic, with a warning.
- Time of day is solved but not drawn: a box's raw condition (sidebar) shows it. With Clock Shuffle the clock items
  do appear as requirements.
- Clock Shuffle in random mode grants a starting clock that the spoiler file does not record, so early spheres can
  look locked.
- A region is explained by the route it was first reached by. If a check needs a time of day that only another route
  provides, the tree still shows the first route.
- Trade items that share an inventory slot (Moon's Tear and the title deeds) are treated as all held at once.
