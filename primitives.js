// The hand-maintained half of the tool: what the leaf predicates of the logic mean in terms of items, and what
// receiving each item does. Everything here mirrors Logic.h, GiveItem.cpp and ConvertItem.cpp; extract.mjs fails when
// the logic uses a name this file does not know, and warns when one of the mirrored functions changes.
(function (root) {
    const RG = (root.RG = root.RG || {});

    const CONSTANTS = {
        SPIDER_HOUSE_TOKENS_REQUIRED: 30,
        STRAY_FAIRY_SCATTERED_TOTAL: 15,
        DEFAULT_TRIFORCE_PIECES_MAX: 15,
        EQUIP_VALUE_SWORD_NONE: 0,
        EQUIP_VALUE_SWORD_KOKIRI: 1,
        EQUIP_VALUE_SWORD_RAZOR: 2,
        EQUIP_VALUE_SWORD_GILDED: 3,
        EQUIP_VALUE_SHIELD_NONE: 0,
        EQUIP_VALUE_SHIELD_HERO: 1,
        EQUIP_VALUE_SHIELD_MIRROR: 2,
    };

    // Options this file reads that older builds did not have yet, with the value that matches how the game behaved
    // before the option existed. Lets logic recorded from those builds still be used.
    const LEGACY_OPTIONS = {
        RO_PLACEMENT_SMALL_KEYS: 0,
        RO_PLACEMENT_BOSS_KEYS: 0,
        RO_PLACEMENT_STRAY_FAIRIES: 0,
        RO_STRAY_FAIRIES_REQUIRED: 15,
        RO_SKULLTULA_TOKENS_REQUIRED: 30,
        RO_SHUFFLE_TYCOON_WALLET: 0,
        RO_SHUFFLE_SWIM: 0,
        RO_SHUFFLE_OCARINA_BUTTONS: 0,
        RO_SHUFFLE_SONG_DOUBLE_TIME: 0,
        RO_SHUFFLE_SONG_INVERTED_TIME: 0,
        RO_SHUFFLE_TRIFORCE_PIECES: 0,
        RO_STARTING_CONSUMABLES: 0,
    };

    const DUNGEONS = ["WOODFALL_TEMPLE", "SNOWHEAD_TEMPLE", "GREAT_BAY_TEMPLE", "STONE_TOWER_TEMPLE"];
    const DUNGEON_ITEM_PREFIX = {
        WOODFALL_TEMPLE: "RI_WOODFALL",
        SNOWHEAD_TEMPLE: "RI_SNOWHEAD",
        GREAT_BAY_TEMPLE: "RI_GREAT_BAY",
        STONE_TOWER_TEMPLE: "RI_STONE_TOWER",
    };
    const SKELETON_KEY_COUNTS = { WOODFALL_TEMPLE: 1, SNOWHEAD_TEMPLE: 3, GREAT_BAY_TEMPLE: 1, STONE_TOWER_TEMPLE: 4 };
    const TOKEN_SCENES = { SCENE_KINSTA1: "swamp", SCENE_KINDAN2: "ocean" };

    // ITEM_MASK_TRUTH..ITEM_MASK_GIANT in z64item.h: the masks MoonMaskCount() counts.
    const MOON_MASKS = new Set(
        (
            "TRUTH KAFEIS_MASK ALL_NIGHT BUNNY KEATON GARO ROMANI CIRCUS_LEADER POSTMAN COUPLE GREAT_FAIRY GIBDO " +
            "DON_GERO KAMARO CAPTAIN STONE BREMEN BLAST SCENTS GIANT"
        )
            .split(" ")
            .map((name) => `ITEM_MASK_${name}`)
    );

    // canPlaySong() in Logic.h. A = A, D/L/R/U = C buttons.
    const SONG_BUTTONS = {
        OCARINA_SONG_SONATA: "ULAR",
        OCARINA_SONG_GORON_LULLABY: "ARL",
        OCARINA_SONG_GORON_LULLABY_INTRO: "ARL",
        OCARINA_SONG_NEW_WAVE: "LURD",
        OCARINA_SONG_ELEGY: "LURD",
        OCARINA_SONG_OATH: "RLDAU",
        OCARINA_SONG_WIND_FISH_ZORA: "RLDAU",
        OCARINA_SONG_TIME: "RAD",
        OCARINA_SONG_INVERTED_TIME: "RAD",
        OCARINA_SONG_DOUBLE_TIME: "RAD",
        OCARINA_SONG_WIND_FISH_GORON: "RAD",
        OCARINA_SONG_EVAN_PART1: "RAD",
        OCARINA_SONG_HEALING: "LRD",
        OCARINA_SONG_SARIAS: "LRD",
        OCARINA_SONG_EVAN_PART2: "LRD",
        OCARINA_SONG_EPONAS: "ULR",
        OCARINA_SONG_WIND_FISH_HUMAN: "ULR",
        OCARINA_SONG_SOARING: "DLU",
        OCARINA_SONG_STORMS: "ADU",
        OCARINA_SONG_SUNS: "RDU",
        OCARINA_SONG_WIND_FISH_DEKU: "RADL",
        OCARINA_SONG_TERMINA_WALL: "ADRLU",
    };
    const BUTTON_NAMES = { A: "A", D: "C_DOWN", L: "C_LEFT", R: "C_RIGHT", U: "C_UP" };
    // CAN_PLAY_SONG(song): QUEST_SONG_<song> lines up with these ocarina songs.
    const QUEST_SONG_TO_OCARINA = {
        SONATA: "OCARINA_SONG_SONATA",
        LULLABY: "OCARINA_SONG_GORON_LULLABY",
        BOSSA_NOVA: "OCARINA_SONG_NEW_WAVE",
        ELEGY: "OCARINA_SONG_ELEGY",
        OATH: "OCARINA_SONG_OATH",
        SARIA: "OCARINA_SONG_SARIAS",
        TIME: "OCARINA_SONG_TIME",
        HEALING: "OCARINA_SONG_HEALING",
        EPONA: "OCARINA_SONG_EPONAS",
        SOARING: "OCARINA_SONG_SOARING",
        STORMS: "OCARINA_SONG_STORMS",
        SUN: "OCARINA_SONG_SUNS",
        LULLABY_INTRO: "OCARINA_SONG_GORON_LULLABY_INTRO",
    };
    const SONG_NAMES = {
        SONATA: "Sonata of Awakening",
        LULLABY: "Goron Lullaby",
        BOSSA_NOVA: "New Wave Bossa Nova",
        ELEGY: "Elegy of Emptiness",
        OATH: "Oath to Order",
        SARIA: "Saria's Song",
        TIME: "Song of Time",
        HEALING: "Song of Healing",
        EPONA: "Epona's Song",
        SOARING: "Song of Soaring",
        STORMS: "Song of Storms",
        SUN: "Sun's Song",
        LULLABY_INTRO: "Lullaby Intro",
    };

    const TRADE_ITEMS = {
        RI_MOONS_TEAR: "MOONS_TEAR",
        RI_DEED_LAND: "DEED_LAND",
        RI_DEED_SWAMP: "DEED_SWAMP",
        RI_DEED_MOUNTAIN: "DEED_MOUNTAIN",
        RI_DEED_OCEAN: "DEED_OCEAN",
        RI_ROOM_KEY: "ROOM_KEY",
        RI_LETTER_TO_MAMA: "LETTER_TO_MAMA",
        RI_LETTER_TO_KAFEI: "LETTER_TO_KAFEI",
        RI_PENDANT_OF_MEMORIES: "PENDANT_OF_MEMORIES",
    };
    const WEEK_EVENT_ITEMS = {
        RI_CLOCK_TOWN_STRAY_FAIRY: "WEEKEVENTREG_08_80",
        RI_GREAT_SPIN_ATTACK: "WEEKEVENTREG_RECEIVED_GREAT_SPIN_ATTACK",
        RI_FROG_BLUE: "WEEKEVENTREG_33_01",
        RI_FROG_CYAN: "WEEKEVENTREG_32_40",
        RI_FROG_PINK: "WEEKEVENTREG_32_80",
        RI_FROG_WHITE: "WEEKEVENTREG_33_02",
    };
    const CLOCK_ITEMS = ["RI_TIME_DAY_1", "RI_TIME_NIGHT_1", "RI_TIME_DAY_2", "RI_TIME_NIGHT_2", "RI_TIME_DAY_3", "RI_TIME_NIGHT_3"];
    const HALF_DAY_NAMES = ["Day 1", "Night 1", "Day 2", "Night 2", "Day 3", "Night 3"];
    // HALF_DAY_TIME_RANGES in Logic.h
    const HALF_DAY_RANGES = [[0, 6], [7, 15], [16, 22], [23, 30], [31, 36], [37, 44]];

    const LEVEL_NAMES = {
        sword: ["Kokiri Sword", "Razor Sword", "Gilded Sword"],
        shield: ["Hero's Shield", "Mirror Shield"],
        wallet: ["Adult Wallet", "Giant Wallet", "Tycoon Wallet"],
        magic: ["Magic", "Double Magic"],
        quiver: ["Bow", "Large Quiver", "Largest Quiver"],
        bombbag: ["Bomb Bag", "Big Bomb Bag", "Biggest Bomb Bag"],
    };

    const GROUP_LABELS = {
        CAN_BE_DEKU: "Deku form",
        CAN_BE_ZORA: "Zora form",
        CAN_BE_GORON: "Goron form",
        CAN_BE_DEITY: "Fierce Deity form",
        CAN_USE_EXPLOSIVE: "Explosives",
        CAN_USE_SWORD: "Sword",
        CAN_USE_HUMAN_SWORD: "Human sword",
        CAN_USE_PROJECTILE: "Projectile",
        CAN_HOOK_SCARECROW: "Hookshot a scarecrow",
        CAN_GROW_BEAN_PLANT: "Grow a bean plant",
        CAN_USE_DAY2_RAIN_BEAN: "Grow a bean plant (or Day 2 rain)",
        CAN_LIGHT_TORCH_NEAR_ANOTHER: "Light a torch from another",
        CAN_RIDE_EPONA: "Ride Epona",
        CAN_FULLY_CUT_KEATON_GRASS: "Fully cut Keaton grass",
        CAN_TRAVERSE_WAIST_DEEP_WATER: "Cross waist-deep water",
        FOUND_ALL_FROGS: "All frogs found",
        GBT_CAN_REVERSE_WATER_FLOW: "Great Bay Temple: reverse water flow",
        GBT_GREEN_SWITCH_FLOW: "Great Bay Temple: green switches",
        IS_DAY1: "Day 1",
        IS_NIGHT1: "Night 1",
        IS_DAY2: "Day 2",
        IS_NIGHT2: "Night 2",
        IS_DAY3: "Day 3",
        IS_NIGHT3: "Night 3",
        IS_DAY: "Daytime",
        IS_NIGHT: "Night-time",
        FIRST_DAY: "First day",
        SECOND_DAY: "Second day",
        FINAL_DAY: "Final day",
        MIDNIGHT: "After midnight",
        MeetsMoonRequirements: "Moon access requirements",
        CanGetPastBigOcto: "Get past the Big Octo",
        CanGetPastBigOctoWithoutBoat: "Get past the Big Octo without the boat",
    };

    function humanize(id) {
        return id
            .toLowerCase()
            .split("_")
            .filter(Boolean)
            .map((word) => (/^\d+$/.test(word) ? word : word[0].toUpperCase() + word.slice(1)))
            .join(" ");
    }

    function sliceLabel(name) {
        const m = name.match(/^TIME_(DAY|NIGHT)(\d)_(AM|PM)_(\d\d)_(\d\d)$/);
        if (!m) {
            return humanize(name);
        }
        return `${m[1] === "DAY" ? "Day" : "Night"} ${m[2]} ${Number(m[4])}:${m[5]} ${m[3]}`;
    }

    const TRUE = { t: "const", v: true };
    const FALSE = { t: "const", v: false };

    function makeAnd(kids) {
        const out = [];
        for (const kid of kids) {
            if (kid.t === "const") {
                if (!kid.v) {
                    return FALSE;
                }
            } else if (kid.t === "and") {
                out.push(...kid.kids);
            } else {
                out.push(kid);
            }
        }
        return out.length === 0 ? TRUE : out.length === 1 ? out[0] : { t: "and", kids: out };
    }

    function makeOr(kids) {
        const out = [];
        for (const kid of kids) {
            if (kid.t === "const") {
                if (kid.v) {
                    return TRUE;
                }
            } else if (kid.t === "or") {
                out.push(...kid.kids);
            } else {
                out.push(kid);
            }
        }
        return out.length === 0 ? FALSE : out.length === 1 ? out[0] : { t: "or", kids: out };
    }

    // options: RO_* name -> int. prices: RC_* name -> rupees (shop checks only).
    function createLogic(data, options, prices) {
        const opt = (name) => {
            if (name in options) {
                return options[name];
            }
            if (name in LEGACY_OPTIONS) {
                return LEGACY_OPTIONS[name];
            }
            throw new Error(`unknown option ${name}`);
        };
        const optionValue = (name) => data.optionValues[name];
        const sliceIndex = Object.fromEntries(data.timeSlices.map((name, index) => [name, index]));
        const ALL_SLICES = (1n << BigInt(data.timeSlices.length)) - 1n;

        const clockShuffle = opt("RO_CLOCK_SHUFFLE") !== 0;
        const clockMode = opt("RO_CLOCK_SHUFFLE_PROGRESSIVE");
        const buttonsShuffled = opt("RO_SHUFFLE_OCARINA_BUTTONS") === optionValue("RO_GENERIC_YES");
        const swimShuffled = opt("RO_SHUFFLE_SWIM") === optionValue("RO_GENERIC_YES");
        const enemySoulsShuffled = opt("RO_SHUFFLE_ENEMY_SOULS") !== 0;

        const itemNameByItemId = {};
        for (const [ri, item] of Object.entries(data.items)) {
            if (item.itemId !== "ITEM_NONE" && !ri.startsWith("RI_PROGRESSIVE") && !(item.itemId in itemNameByItemId)) {
                itemNameByItemId[item.itemId] = item.name;
            }
        }
        const itemName = (ri) => (data.items[ri] ? data.items[ri].name : humanize(ri.replace(/^RI_/, "")));

        function factLabel(fact) {
            const [kind, rest] = fact.split(/:(.*)/s);
            const counter = fact.match(/^(.*)#(\d+)$/);
            if (counter) {
                const [, name, levelText] = counter;
                const level = Number(levelText);
                if (LEVEL_NAMES[name]) {
                    return LEVEL_NAMES[name][level - 1] || `${humanize(name)} level ${level}`;
                }
                const plural = (word) => `${level} ${word}${level === 1 ? "" : "s"}`;
                const [counterKind, counterArg] = name.split(":");
                switch (counterKind) {
                    case "key":
                        return `${plural("Small Key")} (${humanize(counterArg)})`;
                    case "fairy":
                        return `${plural("Stray Fairy").replace("Fairys", "Fairies")} (${humanize(counterArg)})`;
                    case "token":
                        return `${plural("Skulltula Token")} (${humanize(counterArg)})`;
                    case "moonmask":
                        return plural("non-transformation mask");
                    case "remains":
                        return `${level} Boss Remains`;
                    case "bottle":
                        return plural("Bottle");
                    case "qh":
                        return `${level / 4} extra heart${level === 4 ? "" : "s"}`;
                    case "clockcount":
                        return plural("Clock");
                    case "buttons":
                        return plural("Ocarina Button");
                    case "triforce":
                        return plural("Triforce Piece");
                    default:
                        return `${humanize(name)} ${level}`;
                }
            }
            switch (kind) {
                case "inv":
                    return itemNameByItemId[rest] || humanize(rest.replace(/^ITEM_/, ""));
                case "inf":
                    return humanize(rest.replace(/^RANDO_INF_OBTAINED_/, "").replace(/^SOUL_OF_/, "Soul of "));
                case "wer":
                    for (const [ri, reg] of Object.entries(WEEK_EVENT_ITEMS)) {
                        if (reg === rest) {
                            return itemName(ri);
                        }
                    }
                    return humanize(rest);
                case "quest":
                    if (rest.startsWith("QUEST_SONG_")) {
                        return SONG_NAMES[rest.slice(11)] || humanize(rest.slice(11));
                    }
                    return humanize(rest.replace(/^QUEST_/, ""));
                case "owl":
                    return `Owl Statue: ${humanize(rest.replace(/^OWL_WARP_/, ""))}`;
                case "soul":
                    return itemName(rest);
                case "bosskey":
                    return `Boss Key (${humanize(rest)})`;
                case "clock":
                    return `Clock: ${HALF_DAY_NAMES[Number(rest)]}`;
                default:
                    return fact;
            }
        }

        const fact = (name) => ({ t: "fact", fact: name, label: factLabel(name) });
        const threshold = (counter, level) => (level <= 0 ? TRUE : fact(`${counter}#${level}`));
        const group = (name, label, kid) => (kid.t === "const" ? kid : { t: "group", name, label, kid });

        const parsed = new Map();
        const parseCached = (src) => {
            if (!parsed.has(src)) {
                parsed.set(src, RG.parseExpr(src));
            }
            return parsed.get(src);
        };
        const fromSource = (src) => resolveBool(parseCached(src), null);

        // Follows macro parameters back to the argument that was actually written at the call site.
        function deref(ast, env) {
            while (ast.t === "id" && env && env.vars[ast.name]) {
                const bound = env.vars[ast.name];
                ast = bound.ast;
                env = bound.env;
            }
            return { ast, env };
        }
        function argName(ast, env) {
            const target = deref(ast, env).ast;
            if (target.t !== "id") {
                throw new Error(`expected a name, got ${target.t}`);
            }
            return target.name;
        }
        function argNumber(ast, env) {
            const value = resolve(ast, env);
            if (value.t !== "num") {
                throw new Error("expected a constant number");
            }
            return value.v;
        }

        function timeAtom(label, mask) {
            return { t: "time", label, mask };
        }
        const bit = (index) => 1n << BigInt(index);
        const below = (index) => bit(index) - 1n;

        function songButtons(ocarinaSong) {
            if (ocarinaSong === "OCARINA_SONG_SCARECROW_SPAWN") {
                return buttonsShuffled ? threshold("buttons", 2) : TRUE;
            }
            const buttons = SONG_BUTTONS[ocarinaSong];
            if (buttons === undefined) {
                throw new Error(`unknown song ${ocarinaSong}`);
            }
            if (!buttonsShuffled) {
                return TRUE;
            }
            return makeAnd([...buttons].map((b) => fact(`inf:RANDO_INF_OBTAINED_OCARINA_BUTTON_${BUTTON_NAMES[b]}`)));
        }

        function ownsHalfDay(index) {
            if (!clockShuffle) {
                return TRUE;
            }
            if (clockMode === optionValue("RO_CLOCK_SHUFFLE_RANDOM")) {
                return fact(`clock:${index}`);
            }
            if (clockMode === optionValue("RO_CLOCK_SHUFFLE_ASCENDING")) {
                return threshold("clockcount", index + 1);
            }
            return threshold("clockcount", 6 - index);
        }

        // name -> (args, env) => resolved node. Takes precedence over the macro of the same name in Logic.h.
        const handlers = {
            true: () => TRUE,
            false: () => FALSE,
            IS_DEKU: () => FALSE,
            IS_ZORA: () => FALSE,
            IS_GORON: () => FALSE,
            IS_DEITY: () => FALSE,
            IS_HUMAN: () => TRUE,
            HAS_ITEM: ([item], env) => fact(`inv:${argName(item, env)}`),
            HAS_MAGIC: () => fact("magic#1"),
            HAS_BOTTLE: () => fact("bottle#1"),
            CHECK_MAX_HP: ([hearts], env) => threshold("qh", (argNumber(hearts, env) - opt("RO_STARTING_HEALTH")) * 4),
            GET_CUR_EQUIP_VALUE: ([type], env) => {
                const name = argName(type, env);
                if (name === "EQUIP_TYPE_SWORD") {
                    return { t: "counter", name: "sword" };
                }
                if (name === "EQUIP_TYPE_SHIELD") {
                    return { t: "counter", name: "shield" };
                }
                throw new Error(`unsupported equip type ${name}`);
            },
            CUR_UPG_VALUE: ([upgrade], env) => {
                if (argName(upgrade, env) !== "UPG_WALLET") {
                    throw new Error(`unsupported upgrade ${argName(upgrade, env)}`);
                }
                return { t: "counter", name: "wallet" };
            },
            KEY_COUNT: ([dungeon], env) => {
                const name = argName(dungeon, env);
                if (!DUNGEONS.includes(name)) {
                    throw new Error(`unknown dungeon ${name}`);
                }
                return { t: "counter", name: `key:${name}` };
            },
            MoonMaskCount: () => ({ t: "counter", name: "moonmask" }),
            RemainsCount: () => ({ t: "counter", name: "remains" }),
            MeetsMoonRequirements: () =>
                group(
                    "MeetsMoonRequirements",
                    GROUP_LABELS.MeetsMoonRequirements,
                    fromSource(
                        "RemainsCount() >= RANDO_SAVE_OPTIONS[RO_ACCESS_MOON_REMAINS_COUNT] && " +
                            "MoonMaskCount() >= RANDO_SAVE_OPTIONS[RO_ACCESS_MOON_MASKS_COUNT]"
                    )
                ),
            HAS_ENOUGH_STRAY_FAIRIES: ([dungeon], env) => {
                const name = argName(dungeon, env).replace(/^DUNGEON_SCENE_INDEX_/, "");
                if (!DUNGEONS.includes(name)) {
                    throw new Error(`unknown dungeon ${name}`);
                }
                return threshold(`fairy:${name}`, opt("RO_STRAY_FAIRIES_REQUIRED"));
            },
            HAS_ENOUGH_SKULLTULA_TOKENS: ([scene], env) => {
                const house = TOKEN_SCENES[argName(scene, env)];
                if (!house) {
                    throw new Error(`unknown spider house ${argName(scene, env)}`);
                }
                return threshold(`token:${house}`, opt("RO_SKULLTULA_TOKENS_REQUIRED"));
            },
            CAN_OWL_WARP: ([owl], env) => fact(`owl:${argName(owl, env)}`),
            Flags_GetRandoInf: ([inf], env) => fact(`inf:${argName(inf, env)}`),
            CAN_USE_ABILITY: ([ability], env) => {
                const name = argName(ability, env);
                if (name !== "SWIM") {
                    throw new Error(`unknown ability ${name}`);
                }
                return swimShuffled ? fact("inf:RANDO_INF_OBTAINED_SWIM") : TRUE;
            },
            CHECK_WEEKEVENTREG: ([reg], env) => {
                const name = argName(reg, env);
                if (!Object.values(WEEK_EVENT_ITEMS).includes(name)) {
                    throw new Error(`no item is known to set ${name}`);
                }
                return fact(`wer:${name}`);
            },
            CHECK_QUEST_ITEM: ([quest], env) => fact(`quest:${argName(quest, env)}`),
            CHECK_DUNGEON_ITEM: ([item, dungeon], env) => {
                if (argName(item, env) !== "DUNGEON_BOSS_KEY") {
                    throw new Error(`unsupported dungeon item ${argName(item, env)}`);
                }
                return fact(`bosskey:${argName(dungeon, env).replace(/^DUNGEON_SCENE_INDEX_/, "")}`);
            },
            CAN_AFFORD: ([check], env) => {
                const price = prices[argName(check, env)] || 0;
                const need = price < 100 ? TRUE : price <= 200 ? threshold("wallet", 1) : threshold("wallet", 2);
                return group("CAN_AFFORD", `Afford ${price} rupees`, need);
            },
            CAN_ACCESS: ([access], env) => ({ t: "event", event: `RE_ACCESS_${argName(access, env)}`, count: 1 }),
            CAN_PLAY_SONG: ([song], env) => {
                const name = argName(song, env);
                if (!QUEST_SONG_TO_OCARINA[name]) {
                    throw new Error(`unknown song ${name}`);
                }
                return group(
                    `CAN_PLAY_SONG(${name})`,
                    `Play ${SONG_NAMES[name]}`,
                    makeAnd([
                        fact("inv:ITEM_OCARINA_OF_TIME"),
                        fact(`quest:QUEST_SONG_${name}`),
                        songButtons(QUEST_SONG_TO_OCARINA[name]),
                    ])
                );
            },
            canPlaySong: ([song], env) => {
                const name = argName(song, env);
                return group(`canPlaySong(${name})`, `Ocarina buttons for ${humanize(name.replace(/^OCARINA_SONG_/, ""))}`, songButtons(name));
            },
            CAN_USE_MAGIC_ARROW: ([type], env) => {
                const name = argName(type, env);
                return group(
                    `CAN_USE_MAGIC_ARROW(${name})`,
                    `Use ${humanize(name)} Arrows`,
                    makeAnd([fact("inv:ITEM_BOW"), fact(`inv:ITEM_ARROW_${name}`), fact("magic#1")])
                );
            },
            CanAccessDungeon: ([dungeon], env) => {
                const name = argName(dungeon, env).replace(/^DUNGEON_SCENE_INDEX_/, "");
                const access = {
                    WOODFALL_TEMPLE: ["CAN_PLAY_SONG(SONATA)", "CAN_BE_DEKU"],
                    SNOWHEAD_TEMPLE: ["CAN_PLAY_SONG(LULLABY)", "CAN_BE_GORON"],
                    GREAT_BAY_TEMPLE: ["CAN_PLAY_SONG(BOSSA_NOVA)", "CAN_BE_ZORA"],
                }[name];
                const song = access ? fromSource(access[0]) : FALSE;
                const form = access ? fromSource(`${access[1]} && HAS_ITEM(ITEM_OCARINA_OF_TIME)`) : FALSE;
                let inner;
                switch (opt("RO_ACCESS_DUNGEONS")) {
                    case optionValue("RO_ACCESS_DUNGEONS_FORM_OR_SONG"):
                        inner = makeOr([song, form]);
                        break;
                    case optionValue("RO_ACCESS_DUNGEONS_FORM_ONLY"):
                        inner = form;
                        break;
                    case optionValue("RO_ACCESS_DUNGEONS_SONG_ONLY"):
                        inner = song;
                        break;
                    case optionValue("RO_ACCESS_DUNGEONS_OPEN"):
                        inner = TRUE;
                        break;
                    default:
                        inner = makeAnd([song, form]);
                }
                return group(`CanAccessDungeon(${name})`, `Open ${humanize(name)}`, inner);
            },
            CanKillEnemy: ([actor], env) => {
                const name = argName(actor, env);
                const source = data.enemies[name];
                if (source === undefined) {
                    throw new Error(`CanKillEnemy has no case for ${name}`);
                }
                const soul = data.enemySouls[name];
                return group(
                    `CanKillEnemy(${name})`,
                    `Kill ${soul ? itemName(soul).replace(/^Soul of /, "") : humanize(name.replace(/^ACTOR_(EN_)?/, ""))}`,
                    makeAnd([enemySoulsShuffled && soul ? fact(`soul:${soul}`) : TRUE, fromSource(source)])
                );
            },
            CanGetPastBigOctoWithoutBoat: () =>
                group(
                    "CanGetPastBigOctoWithoutBoat",
                    GROUP_LABELS.CanGetPastBigOctoWithoutBoat,
                    fromSource(
                        "(RANDO_EVENTS[RE_SOUTHERN_SWAMP_KILL_OCTOROK] && CAN_BE_DEKU) || " +
                            "(RANDO_EVENTS[RE_CLEARED_WOODFALL_TEMPLE] && CAN_TRAVERSE_WAIST_DEEP_WATER)"
                    )
                ),
            CanGetPastBigOcto: () =>
                group(
                    "CanGetPastBigOcto",
                    GROUP_LABELS.CanGetPastBigOcto,
                    fromSource("RANDO_EVENTS[RE_SOUTHERN_SWAMP_RIDE_BOAT] || CanGetPastBigOctoWithoutBoat()")
                ),
            OwnsHalfDayForMode: ([index], env) => ownsHalfDay(argNumber(index, env)),
            ClockFilter: () =>
                clockShuffle
                    ? group(
                          "ClockFilter",
                          "An owned time period",
                          fromSource("IS_DAY1() || IS_NIGHT1() || IS_DAY2() || IS_NIGHT2() || IS_DAY3() || IS_NIGHT3()")
                      )
                    : TRUE,
            RawAt: ([slice], env) => {
                const name = argName(slice, env);
                return timeAtom(`At ${sliceLabel(name)}`, bit(sliceIndex[name]));
            },
            RawBefore: ([slice], env) => {
                const name = argName(slice, env);
                return timeAtom(`Before ${sliceLabel(name)}`, below(sliceIndex[name]));
            },
            RawAfter: ([slice], env) => {
                const name = argName(slice, env);
                return timeAtom(`From ${sliceLabel(name)}`, ALL_SLICES & ~below(sliceIndex[name]));
            },
            RawBetween: ([start, end], env) => {
                const from = argName(start, env);
                const to = argName(end, env);
                return timeAtom(
                    `${sliceLabel(from)} to ${sliceLabel(to)}`,
                    below(sliceIndex[to]) & ~below(sliceIndex[from])
                );
            },
        };
        handlers.GET_CUR_UPG_VALUE = handlers.CUR_UPG_VALUE;

        const cache = new Map();

        function resolveNamed(name, args, env) {
            const names = args.map((arg) => {
                const target = deref(arg, env).ast;
                return target.t === "id" ? target.name : target.t === "num" ? String(target.v) : null;
            });
            const key = names.includes(null) ? null : `${name}(${names.join(",")})`;
            if (key && cache.has(key)) {
                return cache.get(key);
            }

            let result;
            if (handlers[name]) {
                result = handlers[name](args, env);
            } else if (data.macros[name]) {
                const macro = data.macros[name];
                const params = macro.params || [];
                if (params.length !== args.length) {
                    throw new Error(`${name} expects ${params.length} argument(s)`);
                }
                const vars = {};
                params.forEach((param, index) => {
                    vars[param] = { ast: args[index], env };
                });
                const inner = resolve(parseCached(macro.body), { vars });
                const label = GROUP_LABELS[name] || humanize(name.replace(/^(CAN|IS|HAS)_/, ""));
                result = isBoolean(inner) ? group(key || name, label, inner) : inner;
            } else {
                throw new Error(`unknown name ${name}`);
            }

            if (key) {
                cache.set(key, result);
            }
            return result;
        }

        const isBoolean = (node) => node.t !== "num" && node.t !== "counter" && node.t !== "eventcount";

        function toBool(node) {
            switch (node.t) {
                case "num":
                    return node.v !== 0 ? TRUE : FALSE;
                case "counter":
                    return threshold(node.name, 1);
                case "eventcount":
                    return { t: "event", event: node.event, count: 1 };
                default:
                    return node;
            }
        }

        function resolveBool(ast, env) {
            return toBool(resolve(ast, env));
        }

        function compare(op, left, right) {
            if (left.t === "num" && right.t === "num") {
                const a = left.v;
                const b = right.v;
                const result = { "==": a === b, "!=": a !== b, ">=": a >= b, "<=": a <= b, ">": a > b, "<": a < b }[op];
                return result ? TRUE : FALSE;
            }
            if ((left.t === "counter" || left.t === "eventcount") && right.t === "num" && (op === ">=" || op === ">")) {
                const level = op === ">" ? right.v + 1 : right.v;
                if (left.t === "counter") {
                    return threshold(left.name, level);
                }
                return level <= 0 ? TRUE : { t: "event", event: left.event, count: level };
            }
            throw new Error(`unsupported comparison ${left.t} ${op} ${right.t}`);
        }

        function resolve(ast, env) {
            switch (ast.t) {
                case "num":
                    return ast;
                case "id": {
                    if (env && env.vars[ast.name]) {
                        const bound = env.vars[ast.name];
                        return resolve(bound.ast, bound.env);
                    }
                    if (ast.name in data.optionValues) {
                        return { t: "num", v: data.optionValues[ast.name] };
                    }
                    if (ast.name in CONSTANTS) {
                        return { t: "num", v: CONSTANTS[ast.name] };
                    }
                    return resolveNamed(ast.name, [], env);
                }
                case "call":
                    return resolveNamed(ast.name, ast.args, env);
                case "index": {
                    const key = argName(ast.arg, env);
                    if (ast.name === "RANDO_EVENTS") {
                        if (!eventNames.has(key)) {
                            throw new Error(`event ${key} is never set by any region`);
                        }
                        return { t: "eventcount", event: key };
                    }
                    if (ast.name === "RANDO_SAVE_OPTIONS") {
                        return { t: "num", v: opt(key) };
                    }
                    throw new Error(`unknown array ${ast.name}`);
                }
                case "not": {
                    const kid = resolveBool(ast.kid, env);
                    return kid.t === "const" ? (kid.v ? FALSE : TRUE) : { t: "not", kid };
                }
                case "and":
                    return makeAnd(ast.kids.map((kid) => resolveBool(kid, env)));
                case "or":
                    return makeOr(ast.kids.map((kid) => resolveBool(kid, env)));
                case "cmp":
                    return compare(ast.op, resolve(ast.l, env), resolve(ast.r, env));
                default:
                    throw new Error(`unsupported expression (${ast.t})`);
            }
        }

        const eventNames = new Set();
        for (const region of Object.values(data.regions)) {
            for (const event of region.events) {
                eventNames.add(event.event);
            }
        }

        // ---- State and item effects (GiveItem.cpp + ConvertItem.cpp) ----

        function newState() {
            return { facts: new Set(), counters: new Map(), source: new Map() };
        }

        function setFact(state, name, src, dep) {
            if (!state.facts.has(name)) {
                state.facts.add(name);
                state.source.set(name, { ...src, dep: dep || null });
            }
        }

        // `chain` marks levels that only exist because of the level before (progressive items, counted items).
        function raise(state, counter, to, chain, src) {
            const current = state.counters.get(counter) || 0;
            if (to <= current) {
                return false;
            }
            for (let level = current + 1; level <= to; level++) {
                setFact(state, `${counter}#${level}`, src, chain && current > 0 ? `${counter}#${current}` : null);
            }
            state.counters.set(counter, to);
            return true;
        }

        const walletCap = () => (opt("RO_SHUFFLE_TYCOON_WALLET") === optionValue("RO_GENERIC_YES") ? 3 : 2);

        // What an item can ever turn into, for progressive items: [counter, max level].
        const PROGRESSIVE = {
            RI_PROGRESSIVE_SWORD: ["sword", () => 3],
            RI_PROGRESSIVE_BOW: ["quiver", () => 3],
            RI_PROGRESSIVE_BOMB_BAG: ["bombbag", () => 3],
            RI_PROGRESSIVE_WALLET: ["wallet", walletCap],
            RI_PROGRESSIVE_MAGIC: ["magic", () => 2],
        };
        const FIXED_LEVEL = {
            RI_SWORD_KOKIRI: ["sword", 1],
            RI_SWORD_RAZOR: ["sword", 2],
            RI_SWORD_GILDED: ["sword", 3],
            RI_BOW: ["quiver", 1],
            RI_QUIVER_40: ["quiver", 2],
            RI_QUIVER_50: ["quiver", 3],
            RI_BOMB_BAG_20: ["bombbag", 1],
            RI_BOMB_BAG_30: ["bombbag", 2],
            RI_BOMB_BAG_40: ["bombbag", 3],
            RI_WALLET_ADULT: ["wallet", 1],
            RI_WALLET_GIANT: ["wallet", 2],
            RI_WALLET_TYCOON: ["wallet", 3],
            RI_SINGLE_MAGIC: ["magic", 1],
            RI_DOUBLE_MAGIC: ["magic", 2],
            RI_SHIELD_MIRROR: ["shield", 2],
        };
        const BOTTLES = new Set(["RI_BOTTLE_EMPTY", "RI_BOTTLE_CHATEAU_ROMANI", "RI_BOTTLE_MILK", "RI_BOTTLE_GOLD_DUST", "RI_BOTTLE_RED_POTION"]);

        function levelSideEffects(state, counter, src) {
            if (counter === "quiver") {
                setFact(state, "inv:ITEM_BOW", src);
            } else if (counter === "bombbag") {
                setFact(state, "inv:ITEM_BOMB", src);
                setFact(state, "inv:ITEM_BOMBCHU", src);
            }
        }

        function give(state, ri, origin) {
            const src = { ...origin, ri };
            const level = (counter) => state.counters.get(counter) || 0;
            const increment = (counter) => raise(state, counter, level(counter) + 1, true, src);
            const item = data.items[ri];
            if (!item) {
                return;
            }

            if (PROGRESSIVE[ri]) {
                const [counter, max] = PROGRESSIVE[ri];
                if (level(counter) < max()) {
                    increment(counter);
                    levelSideEffects(state, counter, src);
                }
                return;
            }
            if (FIXED_LEVEL[ri]) {
                const [counter, to] = FIXED_LEVEL[ri];
                if (raise(state, counter, to, false, src)) {
                    levelSideEffects(state, counter, src);
                }
                return;
            }
            if (ri === "RI_SHIELD_HERO") {
                // Only obtainable with no shield at all.
                raise(state, "shield", 1, false, src);
                return;
            }
            if (ri === "RI_PROGRESSIVE_LULLABY") {
                if (!state.facts.has("quest:QUEST_SONG_LULLABY_INTRO")) {
                    setFact(state, "quest:QUEST_SONG_LULLABY_INTRO", src);
                } else {
                    setFact(state, "quest:QUEST_SONG_LULLABY", src, "quest:QUEST_SONG_LULLABY_INTRO");
                }
                return;
            }
            if (BOTTLES.has(ri)) {
                increment("bottle");
                return;
            }
            if (ri === "RI_HEART_PIECE" || ri === "RI_HEART_CONTAINER") {
                raise(state, "qh", level("qh") + (ri === "RI_HEART_CONTAINER" ? 4 : 1), true, src);
                return;
            }
            if (ri === "RI_SKELETON_KEY") {
                for (const dungeon of DUNGEONS) {
                    raise(state, `key:${dungeon}`, SKELETON_KEY_COUNTS[dungeon], false, src);
                }
                return;
            }
            for (const dungeon of DUNGEONS) {
                const prefix = DUNGEON_ITEM_PREFIX[dungeon];
                if (ri === `${prefix}_SMALL_KEY`) {
                    increment(`key:${dungeon}`);
                    return;
                }
                if (ri === `${prefix}_BOSS_KEY`) {
                    setFact(state, `bosskey:${dungeon}`, src);
                    return;
                }
                if (ri === `${prefix}_STRAY_FAIRY`) {
                    increment(`fairy:${dungeon}`);
                    return;
                }
                if (ri === `${prefix}_MAP` || ri === `${prefix}_COMPASS`) {
                    return;
                }
            }
            if (ri === "RI_GS_TOKEN_SWAMP" || ri === "RI_GS_TOKEN_OCEAN") {
                increment(`token:${ri === "RI_GS_TOKEN_SWAMP" ? "swamp" : "ocean"}`);
                return;
            }
            if (ri === "RI_TRIFORCE_PIECE" || ri === "RI_TRIFORCE_PIECE_PREVIOUS") {
                increment("triforce");
                return;
            }
            if (WEEK_EVENT_ITEMS[ri]) {
                setFact(state, `wer:${WEEK_EVENT_ITEMS[ri]}`, src);
                return;
            }
            if (ri.startsWith("RI_OWL_")) {
                setFact(state, `owl:OWL_WARP_${ri === "RI_OWL_CLOCK_TOWN_SOUTH" ? "CLOCK_TOWN" : ri.slice(7)}`, src);
                return;
            }
            if (ri === "RI_TIME_PROGRESSIVE" || CLOCK_ITEMS.includes(ri)) {
                let index = CLOCK_ITEMS.indexOf(ri);
                if (ri === "RI_TIME_PROGRESSIVE") {
                    if (clockMode === optionValue("RO_CLOCK_SHUFFLE_RANDOM")) {
                        return;
                    }
                    const order = clockMode === optionValue("RO_CLOCK_SHUFFLE_DESCENDING") ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5];
                    index = order.find((i) => !state.facts.has(`clock:${i}`));
                    if (index === undefined) {
                        return;
                    }
                }
                if (!state.facts.has(`clock:${index}`)) {
                    setFact(state, `clock:${index}`, src);
                    increment("clockcount");
                }
                return;
            }
            if (ri.startsWith("RI_SOUL_")) {
                setFact(state, `soul:${ri}`, src);
                // Some conditions read the soul's rando inf directly instead of going through HaveEnemySoul().
                if (data.soulInfs[ri]) {
                    setFact(state, `inf:${data.soulInfs[ri]}`, src);
                }
                return;
            }
            if (ri.startsWith("RI_OCARINA_BUTTON_")) {
                const name = `inf:RANDO_INF_OBTAINED_${ri.slice(3)}`;
                if (!state.facts.has(name)) {
                    setFact(state, name, src);
                    increment("buttons");
                }
                return;
            }
            if (ri === "RI_ABILITY_SWIM") {
                setFact(state, "inf:RANDO_INF_OBTAINED_SWIM", src);
                return;
            }
            if (ri === "RI_SONG_DOUBLE_TIME" || ri === "RI_SONG_INVERTED_TIME") {
                setFact(state, `inf:RANDO_INF_OBTAINED_${ri.slice(3)}`, src);
                return;
            }
            if (TRADE_ITEMS[ri]) {
                setFact(state, `inf:RANDO_INF_OBTAINED_${TRADE_ITEMS[ri]}`, src);
            }

            const itemId = item.itemId;
            if (itemId.startsWith("ITEM_SONG_")) {
                setFact(state, `quest:QUEST_SONG_${itemId === "ITEM_SONG_NOVA" ? "BOSSA_NOVA" : itemId.slice(10)}`, src);
            } else if (itemId.startsWith("ITEM_REMAINS_")) {
                const name = `quest:QUEST_REMAINS_${itemId.slice(13)}`;
                if (!state.facts.has(name)) {
                    setFact(state, name, src);
                    increment("remains");
                }
            } else if (itemId.startsWith("ITEM_DEKU_STICK")) {
                setFact(state, "inv:ITEM_DEKU_STICK", src);
            } else if (itemId.startsWith("ITEM_DEKU_NUT")) {
                setFact(state, "inv:ITEM_DEKU_NUT", src);
            } else if (itemId !== "ITEM_NONE" && item.type !== "RITYPE_JUNK") {
                const name = `inv:${itemId}`;
                if (!state.facts.has(name)) {
                    setFact(state, name, src);
                    if (MOON_MASKS.has(itemId)) {
                        increment("moonmask");
                    }
                }
            }
        }

        // Items the options grant on top of spoiler.startingItems. Each logic version carries its own rules for this
        // (read from StartingItems.cpp by extract.mjs); legacyStartingItems() only serves builds too old to have them.
        function computedStartingItems(spoilerStartingItems) {
            let out = [];
            let grantsClock = clockShuffle;
            if (data.startingRules) {
                grantsClock = false;
                for (const rule of data.startingRules) {
                    const when = rule.when === null ? TRUE : fromSource(rule.when);
                    if (when.t !== "const") {
                        throw new Error(`starting item rule does not depend on options alone: ${rule.when}`);
                    }
                    if (!when.v) {
                        continue;
                    }
                    if (rule.clock) {
                        grantsClock = true;
                        continue;
                    }
                    for (const [ri, count] of rule.items) {
                        const times = typeof count === "number" ? count : CONSTANTS[count];
                        if (times === undefined) {
                            throw new Error(`starting item rule uses unknown count ${count}`);
                        }
                        for (let i = 0; i < times; i++) {
                            out.push(ri);
                        }
                    }
                }
            } else {
                out = legacyStartingItems();
            }
            // With Clock Shuffle and no configured clock the game grants one, chosen with its own RNG in random mode.
            // That choice is not in the spoiler file, so only the progressive case can be reproduced here.
            let unknownStartingClock = false;
            if (grantsClock && !spoilerStartingItems.some((ri) => ri === "RI_TIME_PROGRESSIVE" || CLOCK_ITEMS.includes(ri))) {
                if (clockMode === optionValue("RO_CLOCK_SHUFFLE_RANDOM")) {
                    unknownStartingClock = true;
                } else {
                    out.push("RI_TIME_PROGRESSIVE");
                }
            }
            return { items: out, unknownStartingClock };
        }

        function legacyStartingItems() {
            const out = [];
            const startWith = optionValue("RO_DUNGEON_ITEM_START_WITH");
            const yes = optionValue("RO_GENERIC_YES");
            if (opt("RO_PLACEMENT_SMALL_KEYS") === startWith) {
                for (const dungeon of DUNGEONS) {
                    for (let i = 0; i < SKELETON_KEY_COUNTS[dungeon]; i++) {
                        out.push(`${DUNGEON_ITEM_PREFIX[dungeon]}_SMALL_KEY`);
                    }
                }
            }
            if (opt("RO_PLACEMENT_BOSS_KEYS") === startWith) {
                out.push(...DUNGEONS.map((dungeon) => `${DUNGEON_ITEM_PREFIX[dungeon]}_BOSS_KEY`));
            }
            if (opt("RO_PLACEMENT_STRAY_FAIRIES") === startWith) {
                for (const dungeon of DUNGEONS) {
                    for (let i = 0; i < CONSTANTS.STRAY_FAIRY_SCATTERED_TOTAL; i++) {
                        out.push(`${DUNGEON_ITEM_PREFIX[dungeon]}_STRAY_FAIRY`);
                    }
                }
                out.push("RI_CLOCK_TOWN_STRAY_FAIRY");
            }
            if (opt("RO_SHUFFLE_SWIM") !== yes) {
                out.push("RI_ABILITY_SWIM");
            }
            if (opt("RO_SHUFFLE_ENEMY_SOULS") !== yes) {
                out.push(...Object.keys(data.items).filter((ri) => ri.startsWith("RI_SOUL_ENEMY_")));
            }
            if (opt("RO_SHUFFLE_OCARINA_BUTTONS") !== yes) {
                out.push(...Object.values(BUTTON_NAMES).map((name) => `RI_OCARINA_BUTTON_${name}`));
            }
            if (opt("RO_SHUFFLE_SONG_DOUBLE_TIME") !== yes) {
                out.push("RI_SONG_DOUBLE_TIME");
            }
            if (opt("RO_SHUFFLE_SONG_INVERTED_TIME") !== yes) {
                out.push("RI_SONG_INVERTED_TIME");
            }
            if (opt("RO_STARTING_CONSUMABLES")) {
                out.push("RI_DEKU_STICK", "RI_DEKU_NUT");
            }
            return out;
        }

        // TimeLogic::GetOwnedTimeSlices()
        function ownedTimeSlices(state) {
            if (!clockShuffle) {
                return ALL_SLICES;
            }
            let mask = 0n;
            HALF_DAY_RANGES.forEach(([start, end], index) => {
                if (state.facts.has(`clock:${index}`)) {
                    mask |= below(end + 1) & ~below(start);
                }
            });
            return mask || 1n;
        }

        const sliceOwned = (state, index) =>
            !clockShuffle || HALF_DAY_RANGES.some(([start, end], half) => index >= start && index <= end && state.facts.has(`clock:${half}`));

        return {
            data,
            options,
            prices,
            clockShuffle,
            ALL_SLICES,
            sliceCount: data.timeSlices.length,
            sliceIndex,
            resolve: fromSource,
            factLabel,
            itemName,
            newState,
            give,
            computedStartingItems,
            ownedTimeSlices,
            sliceOwned,
            hasEvent: (name) => eventNames.has(name),
        };
    }

    function defaultOptions(data) {
        const options = {};
        for (const [name, raw] of Object.entries(data.optionDefaults)) {
            options[name] = /^\d+$/.test(raw) ? Number(raw) : (data.optionValues[raw] ?? CONSTANTS[raw]);
        }
        return options;
    }

    // Every condition in the extracted data, resolved under several option sets so option-dependent paths get covered.
    function validateLogic(data) {
        const problems = new Set();
        const base = defaultOptions(data);
        for (const [name, value] of Object.entries(base)) {
            if (value === undefined) {
                problems.add(`option default for ${name} (${data.optionDefaults[name]}) is not a known constant`);
            }
        }
        const variants = [
            {},
            { RO_CLOCK_SHUFFLE: 1 },
            { RO_CLOCK_SHUFFLE: 1, RO_CLOCK_SHUFFLE_PROGRESSIVE: data.optionValues.RO_CLOCK_SHUFFLE_ASCENDING },
            { RO_SHUFFLE_ENEMY_SOULS: 1, RO_SHUFFLE_BOSS_SOULS: 1, RO_SHUFFLE_OCARINA_BUTTONS: 1, RO_SHUFFLE_SWIM: 1 },
            { RO_ACCESS_DUNGEONS: data.optionValues.RO_ACCESS_DUNGEONS_FORM_OR_SONG, RO_ACCESS_TRIALS: data.optionValues.RO_ACCESS_TRIALS_REMAINS },
        ];
        for (const variant of variants) {
            const logic = createLogic(data, { ...base, ...variant }, {});
            for (const [regionId, region] of Object.entries(data.regions)) {
                const entries = [
                    ...region.checks.map((entry) => [`check ${entry.check}`, entry.cond]),
                    ...region.exits.map((entry) => [`exit ${entry.to}`, entry.cond]),
                    ...region.connections.map((entry) => [`connection ${entry.region}`, entry.cond]),
                    ...region.events.map((entry) => [`event ${entry.event}`, entry.cond]),
                    ...region.stays.map((entry) => [`stay ${entry.slice}`, entry.cond]),
                ];
                for (const [what, cond] of entries) {
                    try {
                        logic.resolve(cond);
                    } catch (error) {
                        problems.add(`${regionId} ${what}: ${error.message}`);
                    }
                }
                for (const entry of region.checks) {
                    if (!data.checks[entry.check]) {
                        problems.add(`${regionId}: ${entry.check} is not in StaticData/Checks.cpp`);
                    }
                }
                for (const entry of region.connections) {
                    if (!data.regions[entry.region]) {
                        problems.add(`${regionId}: connection to undefined region ${entry.region}`);
                    }
                }
            }
        }
        return [...problems];
    }

    RG.createLogic = createLogic;
    RG.defaultOptions = defaultOptions;
    RG.validateLogic = validateLogic;
    RG.humanize = humanize;
    RG.sliceLabel = sliceLabel;
    RG.HALF_DAY_NAMES = HALF_DAY_NAMES;
})(globalThis);
