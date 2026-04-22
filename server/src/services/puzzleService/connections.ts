import type { ConnectionsCategory, ConnectionsPuzzle } from '../../types/index';

// ── Seeded helpers ────────────────────────────────────────────────────────────

function lcg(seed: number): number {
  return (Math.imul(1664525, seed) + 1013904223) & 0x7fffffff;
}

function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = Math.abs(seed);
  for (let i = a.length - 1; i > 0; i--) {
    s = lcg(s);
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function strToSeed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(33, h) ^ s.charCodeAt(i)) & 0x7fffffff;
  }
  return h || 1;
}

// ── Puzzle bank ───────────────────────────────────────────────────────────────

interface PuzzleSet {
  difficulty: 'easy' | 'medium' | 'hard';
  categories: ConnectionsCategory[];
}

const PUZZLE_BANK: PuzzleSet[] = [
  // ── EASY ──────────────────────────────────────────────────────────────────

  {
    difficulty: 'easy',
    categories: [
      { label: 'Fruits', color: 'yellow', words: ['APPLE', 'MANGO', 'GRAPE', 'PEACH'] },
      { label: 'Shades of blue', color: 'green', words: ['AZURE', 'COBALT', 'NAVY', 'TEAL'] },
      { label: 'Dog breeds', color: 'blue', words: ['HUSKY', 'BOXER', 'POODLE', 'BEAGLE'] },
      { label: 'Card games', color: 'purple', words: ['POKER', 'RUMMY', 'BRIDGE', 'SNAP'] },
    ],
  },
  {
    difficulty: 'easy',
    categories: [
      { label: 'Planets', color: 'yellow', words: ['MARS', 'VENUS', 'EARTH', 'SATURN'] },
      { label: 'Musical instruments', color: 'green', words: ['FLUTE', 'HARP', 'CELLO', 'OBOE'] },
      { label: 'Currencies', color: 'blue', words: ['EURO', 'POUND', 'YEN', 'PESO'] },
      { label: '___ ball', color: 'purple', words: ['BASKET', 'FOOT', 'BASE', 'SOFT'] },
    ],
  },
  {
    difficulty: 'easy',
    categories: [
      { label: 'Vegetables', color: 'yellow', words: ['CARROT', 'ONION', 'CELERY', 'KALE'] },
      { label: 'Ocean creatures', color: 'green', words: ['SHARK', 'SQUID', 'LOBSTER', 'ORCA'] },
      { label: 'Types of hat', color: 'blue', words: ['BERET', 'FEDORA', 'BEANIE', 'BOWLER'] },
      { label: 'Board games', color: 'purple', words: ['CHESS', 'RISK', 'CLUE', 'SORRY'] },
    ],
  },
  {
    difficulty: 'easy',
    categories: [
      { label: 'Trees', color: 'yellow', words: ['MAPLE', 'BIRCH', 'CEDAR', 'WILLOW'] },
      { label: 'Ice cream flavors', color: 'green', words: ['VANILLA', 'MINT', 'CARAMEL', 'MANGO'] },
      { label: 'Dance styles', color: 'blue', words: ['SALSA', 'TANGO', 'WALTZ', 'JIVE'] },
      { label: 'Things in a kitchen', color: 'purple', words: ['WHISK', 'LADLE', 'COLANDER', 'SPATULA'] },
    ],
  },
  {
    difficulty: 'easy',
    categories: [
      { label: 'African animals', color: 'yellow', words: ['LION', 'GIRAFFE', 'HYENA', 'ZEBRA'] },
      { label: 'Types of pasta', color: 'green', words: ['PENNE', 'ORZO', 'FUSILLI', 'RIGATONI'] },
      { label: 'Gems and jewels', color: 'blue', words: ['RUBY', 'OPAL', 'SAPPHIRE', 'TOPAZ'] },
      { label: 'Things that fly', color: 'purple', words: ['KITE', 'DRONE', 'BLIMP', 'HAWK'] },
    ],
  },
  {
    difficulty: 'easy',
    categories: [
      { label: 'Car brands', color: 'yellow', words: ['HONDA', 'FORD', 'TESLA', 'BMW'] },
      { label: 'Pizza toppings', color: 'green', words: ['PEPPERONI', 'ANCHOVY', 'MUSHROOM', 'OLIVE'] },
      { label: 'Baby animals', color: 'blue', words: ['FOAL', 'CYGNET', 'KITTEN', 'CALF'] },
      { label: 'Things in a classroom', color: 'purple', words: ['CHALK', 'RULER', 'ERASER', 'GLOBE'] },
    ],
  },
  {
    difficulty: 'easy',
    categories: [
      { label: 'Cocktails', color: 'yellow', words: ['MOJITO', 'COSMO', 'NEGRONI', 'GIMLET'] },
      { label: 'Insects', color: 'green', words: ['BEETLE', 'MANTIS', 'APHID', 'CICADA'] },
      { label: 'Famous Johns', color: 'blue', words: ['LENNON', 'KERRY', 'CLEESE', 'LEGEND'] },
      { label: 'Types of bread', color: 'purple', words: ['BRIOCHE', 'CIABATTA', 'NAAN', 'PUMPERNICKEL'] },
    ],
  },
  {
    difficulty: 'easy',
    categories: [
      { label: 'Olympic sports', color: 'yellow', words: ['JUDO', 'FENCING', 'ARCHERY', 'ROWING'] },
      { label: 'Things in a hospital', color: 'green', words: ['SCALPEL', 'SYRINGE', 'GURNEY', 'STETHOSCOPE'] },
      { label: 'Shades of red', color: 'blue', words: ['CRIMSON', 'SCARLET', 'RUBY', 'MAROON'] },
      { label: 'Famous Elizabeths', color: 'purple', words: ['WARREN', 'TAYLOR', 'BENNETT', 'HURLEY'] },
    ],
  },
  {
    difficulty: 'easy',
    categories: [
      { label: 'Words meaning happy', color: 'yellow', words: ['ELATED', 'JOLLY', 'GLEEFUL', 'CHIPPER'] },
      { label: 'Things in an office', color: 'green', words: ['STAPLER', 'BINDER', 'TONER', 'CUBICLE'] },
      { label: 'European countries', color: 'blue', words: ['LATVIA', 'MOLDOVA', 'ALBANIA', 'CYPRUS'] },
      { label: 'Types of music', color: 'purple', words: ['JAZZ', 'BLUES', 'SOUL', 'FUNK'] },
    ],
  },
  {
    difficulty: 'easy',
    categories: [
      { label: 'Breakfast foods', color: 'yellow', words: ['WAFFLE', 'BAGEL', 'CREPE', 'GRANOLA'] },
      { label: 'Things that can be "scrambled"', color: 'green', words: ['EGGS', 'SIGNAL', 'WORDS', 'JETS'] },
      { label: 'Parts of a ship', color: 'blue', words: ['BOW', 'STERN', 'HULL', 'KEEL'] },
      { label: 'Cartoon characters', color: 'purple', words: ['SHAGGY', 'GOOFY', 'PLUTO', 'GARFIELD'] },
    ],
  },
  {
    difficulty: 'easy',
    categories: [
      { label: 'Things at the beach', color: 'yellow', words: ['SEASHELL', 'DUNE', 'JETTY', 'PIER'] },
      { label: 'Words meaning tired', color: 'green', words: ['WEARY', 'DROWSY', 'SPENT', 'GROGGY'] },
      { label: 'Country capitals', color: 'blue', words: ['OSLO', 'LIMA', 'CAIRO', 'SEOUL'] },
      { label: 'Disney animated films', color: 'purple', words: ['MOANA', 'ENCANTO', 'RAYA', 'COCO'] },
    ],
  },
  {
    difficulty: 'easy',
    categories: [
      { label: 'Spices and herbs', color: 'yellow', words: ['CUMIN', 'DILL', 'SAGE', 'PAPRIKA'] },
      { label: 'Things with a trunk', color: 'green', words: ['ELEPHANT', 'CAR', 'TREE', 'SWIMMER'] },
      { label: 'Words meaning fast', color: 'blue', words: ['SWIFT', 'BRISK', 'NIMBLE', 'RAPID'] },
      { label: 'Phobias (what they fear)', color: 'purple', words: ['HEIGHTS', 'SPIDERS', 'THUNDER', 'CLOWNS'] },
    ],
  },

  // ── MEDIUM ────────────────────────────────────────────────────────────────

  {
    difficulty: 'medium',
    categories: [
      { label: 'Types of cheese', color: 'yellow', words: ['BRIE', 'GOUDA', 'FETA', 'EDAM'] },
      { label: 'James ___ (Bond actors)', color: 'green', words: ['CRAIG', 'MOORE', 'DALTON', 'BROSNAN'] },
      { label: 'Winter Olympic sports', color: 'blue', words: ['LUGE', 'CURLING', 'BIATHLON', 'SKELETON'] },
      { label: 'Shades of blue', color: 'purple', words: ['PERIWINKLE', 'CERULEAN', 'INDIGO', 'SLATE'] },
    ],
  },
  {
    difficulty: 'medium',
    categories: [
      { label: 'Poker hands', color: 'yellow', words: ['FLUSH', 'STRAIGHT', 'QUADS', 'BOAT'] },
      { label: 'Coffee drinks', color: 'green', words: ['LATTE', 'MOCHA', 'ESPRESSO', 'LUNGO'] },
      { label: 'Shakespeare plays', color: 'blue', words: ['HAMLET', 'OTHELLO', 'MACBETH', 'TEMPEST'] },
      { label: 'Nobel Prize categories', color: 'purple', words: ['PEACE', 'PHYSICS', 'CHEMISTRY', 'LITERATURE'] },
    ],
  },
  {
    difficulty: 'medium',
    categories: [
      { label: 'Words that follow "BLACK"', color: 'yellow', words: ['BIRD', 'BOARD', 'BERRY', 'OUT'] },
      { label: 'Famous Michaels', color: 'green', words: ['JORDAN', 'JACKSON', 'SCOTT', 'MYERS'] },
      { label: '___ Park', color: 'blue', words: ['HYDE', 'JURASSIC', 'LINKIN', 'CENTRAL'] },
      { label: 'Things that have rings', color: 'purple', words: ['SATURN', 'TREE', 'BOXER', 'CIRCUS'] },
    ],
  },
  {
    difficulty: 'medium',
    categories: [
      { label: 'Words that follow "THUNDER"', color: 'yellow', words: ['BOLT', 'BIRD', 'STORM', 'STRUCK'] },
      { label: 'Famous Taylors', color: 'green', words: ['SWIFT', 'LAUTNER', 'HAWKE', 'SHERIDAN'] },
      { label: '___ ball games', color: 'blue', words: ['PINBALL', 'HANDBALL', 'DODGEBALL', 'PAINTBALL'] },
      { label: 'Words that can follow "ROCK"', color: 'purple', words: ['STAR', 'SLIDE', 'ET', 'BAND'] },
    ],
  },
  {
    difficulty: 'medium',
    categories: [
      { label: 'Famous Bobs', color: 'yellow', words: ['DYLAN', 'MARLEY', 'ROSS', 'HOPE'] },
      { label: '___ stone', color: 'green', words: ['ROLLING', 'KIDNEY', 'LIME', 'CORNER'] },
      { label: 'Things found in a jail', color: 'blue', words: ['CELL', 'WARDEN', 'BAIL', 'YARD'] },
      { label: 'Parts of a symphony', color: 'purple', words: ['CODA', 'OVERTURE', 'MOVEMENT', 'CADENZA'] },
    ],
  },
  {
    difficulty: 'medium',
    categories: [
      { label: 'Words that mean "steal"', color: 'yellow', words: ['PILFER', 'SWIPE', 'FILCH', 'PINCH'] },
      { label: 'Famous Emilys', color: 'green', words: ['BRONTE', 'BLUNT', 'DICKINSON', 'RATAJKOWSKI'] },
      { label: 'Things associated with Halloween', color: 'blue', words: ['CAULDRON', 'COBWEB', 'LANTERN', 'SHROUD'] },
      { label: 'Monopoly properties', color: 'purple', words: ['BOARDWALK', 'MARVIN', 'VENTNOR', 'INDIANA'] },
    ],
  },
  {
    difficulty: 'medium',
    categories: [
      { label: 'Hobbies that are also verbs', color: 'yellow', words: ['KNIT', 'SKETCH', 'SCULPT', 'BLOG'] },
      { label: 'Things associated with bees', color: 'green', words: ['DRONE', 'HIVE', 'POLLEN', 'WAX'] },
      { label: 'Famous left-handers', color: 'blue', words: ['OBAMA', 'JIMI', 'NAPOLEON', 'OPRAH'] },
      { label: 'Words before "cake"', color: 'purple', words: ['CHEESE', 'CUP', 'PANCAKE', 'FISH'] },
    ],
  },
  {
    difficulty: 'medium',
    categories: [
      { label: '___ day', color: 'yellow', words: ['BIRTH', 'HOLID', 'MON', 'DOOMS'] },
      { label: 'Countries ending in "-stan"', color: 'green', words: ['PAKISTAN', 'IRAN', 'AFGHAN', 'KAZAKH'] },
      { label: 'Things that can pop', color: 'blue', words: ['BUBBLE', 'BALLOON', 'CORN', 'COLLAR'] },
      { label: 'Things that are also a number slang', color: 'purple', words: ['GRAND', 'CENTURY', 'SCORE', 'DOZEN'] },
    ],
  },
  {
    difficulty: 'medium',
    categories: [
      { label: 'Fictional detectives', color: 'yellow', words: ['POIROT', 'MONK', 'COLUMBO', 'MORSE'] },
      { label: 'Things with a pitch', color: 'green', words: ['MUSIC', 'CRICKET', 'SALES', 'TAR'] },
      { label: 'Famous Jameses', color: 'blue', words: ['BROWN', 'BOND', 'DEAN', 'CORDON'] },
      { label: 'Words following "under"', color: 'purple', words: ['COVER', 'TONE', 'WORLD', 'MINE'] },
    ],
  },
  {
    difficulty: 'medium',
    categories: [
      { label: 'Things that can be "grand"', color: 'yellow', words: ['PIANO', 'JURY', 'SLAM', 'TOUR'] },
      { label: 'Words meaning to deceive', color: 'green', words: ['DUPE', 'HOODWINK', 'BAMBOOZLE', 'SWINDLE'] },
      { label: 'Types of bridge', color: 'blue', words: ['DRAWBRIDGE', 'SUSPENSION', 'ARCH', 'ROPE'] },
      { label: 'Famous Smiths', color: 'purple', words: ['WILL', 'JADA', 'MAGGIE', 'MEL'] },
    ],
  },
  {
    difficulty: 'medium',
    categories: [
      { label: 'Things that can be "flat"', color: 'yellow', words: ['TYRE', 'RATE', 'SCREEN', 'BATTERY'] },
      { label: '___ fish', color: 'green', words: ['SWORD', 'STAR', 'CAT', 'BLOW'] },
      { label: 'Words that follow "BRAIN"', color: 'blue', words: ['STORM', 'WASH', 'DEAD', 'WAVE'] },
      { label: 'Things that "run"', color: 'purple', words: ['PROGRAM', 'STOCKINGS', 'NOSE', 'RIVER'] },
    ],
  },
  {
    difficulty: 'medium',
    categories: [
      { label: 'Words that can precede "line"', color: 'yellow', words: ['HAIR', 'DEAD', 'SIDE', 'LAND'] },
      { label: 'South American countries', color: 'green', words: ['ECUADOR', 'BOLIVIA', 'URUGUAY', 'GUYANA'] },
      { label: 'Things associated with chess', color: 'blue', words: ['GAMBIT', 'ROOK', 'STALEMATE', 'PAWN'] },
      { label: 'Words that are also names', color: 'purple', words: ['ROSE', 'CLIFF', 'DAWN', 'HUNTER'] },
    ],
  },

  // ── HARD ─────────────────────────────────────────────────────────────────

  {
    difficulty: 'hard',
    categories: [
      { label: '___ key (keyboard)', color: 'yellow', words: ['ESCAPE', 'ENTER', 'SHIFT', 'SPACE'] },
      { label: 'Homophones of numbers', color: 'green', words: ['ATE', 'WON', 'TOO', 'FOR'] },
      { label: 'Words hiding a metal', color: 'blue', words: ['GOLDEN', 'SILVER', 'COPPER', 'IRONY'] },
      { label: 'Anagram of a planet', color: 'purple', words: ['STEAM', 'URNS', 'SNUV', 'ERMA'] },
    ],
  },
  {
    difficulty: 'hard',
    categories: [
      { label: 'Palindromes', color: 'yellow', words: ['RADAR', 'LEVEL', 'CIVIC', 'MADAM'] },
      { label: 'Greek letters', color: 'green', words: ['DELTA', 'SIGMA', 'OMEGA', 'KAPPA'] },
      { label: 'Words that follow "FIRE"', color: 'blue', words: ['WORKS', 'PLACE', 'SIDE', 'TRUCK'] },
      { label: 'Rhymes with "moon"', color: 'purple', words: ['SPOON', 'TUNE', 'CROON', 'DUNE'] },
    ],
  },
  {
    difficulty: 'hard',
    categories: [
      { label: 'Words that are their own antonym', color: 'yellow', words: ['CLEAVE', 'SANCTION', 'OVERSIGHT', 'DUST'] },
      { label: 'Celebrities known by one name', color: 'green', words: ['ADELE', 'CHER', 'DRAKE', 'BJÖRK'] },
      { label: 'Words hidden inside "MANCHESTER"', color: 'blue', words: ['MAN', 'ACHE', 'CHEST', 'ASTER'] },
      { label: 'Things that can be "raw"', color: 'purple', words: ['DEAL', 'NERVE', 'EGG', 'DATA'] },
    ],
  },
  {
    difficulty: 'hard',
    categories: [
      { label: 'Phrases with "cold"', color: 'yellow', words: ['TURKEY', 'SHOULDER', 'SNAP', 'FRONT'] },
      { label: 'Words containing a day of the week', color: 'green', words: ['MONDAY', 'SUNDAY', 'FRIDAY', 'WEDNESDAY'] },
      { label: 'Things that are both a fruit and a color', color: 'blue', words: ['ORANGE', 'LIME', 'PLUM', 'LEMON'] },
      { label: 'Oxymorons', color: 'purple', words: ['DEAFENING', 'FREEZING', 'LIVING', 'ALONE'] },
    ],
  },
  {
    difficulty: 'hard',
    categories: [
      { label: 'Words that precede "fall"', color: 'yellow', words: ['DOWN', 'FREE', 'NIGHT', 'WATER'] },
      { label: 'Types of clouds', color: 'green', words: ['CIRRUS', 'NIMBUS', 'STRATUS', 'CUMULUS'] },
      { label: 'Words containing "EAR"', color: 'blue', words: ['EARLY', 'LEARN', 'PEARL', 'HEARD'] },
      { label: 'Phrases with "hot"', color: 'purple', words: ['DOG', 'SHOT', 'TEMPER', 'PURSUIT'] },
    ],
  },
  {
    difficulty: 'hard',
    categories: [
      { label: 'Words with silent letters', color: 'yellow', words: ['KNIFE', 'GNOME', 'WRECK', 'PSALM'] },
      { label: '___ berry', color: 'green', words: ['GOOSE', 'STRAW', 'ELDER', 'CRAN'] },
      { label: 'Things that can be "scrambled"', color: 'blue', words: ['EGGS', 'SIGNAL', 'WORDS', 'JETS'] },
      { label: 'Words that follow "THUNDER"', color: 'purple', words: ['BOLT', 'BIRD', 'STORM', 'CLAP'] },
    ],
  },
  {
    difficulty: 'hard',
    categories: [
      { label: 'Things associated with witches', color: 'yellow', words: ['COVEN', 'CAULDRON', 'BROOMSTICK', 'FAMILIAR'] },
      { label: 'Parts of a shoe', color: 'green', words: ['TONGUE', 'SOLE', 'WELT', 'VAMP'] },
      { label: 'Words that follow "UNDER"', color: 'blue', words: ['COVER', 'TONE', 'WORLD', 'CURRENT'] },
      { label: 'Anagram of something edible', color: 'purple', words: ['LEMON', 'PASTA', 'STEAK', 'CREAM'] },
    ],
  },
  {
    difficulty: 'hard',
    categories: [
      { label: 'Things that can be "grand"', color: 'yellow', words: ['PIANO', 'JURY', 'SLAM', 'STAND'] },
      { label: 'Words that are verbs and nouns', color: 'green', words: ['PARK', 'BOOK', 'COOK', 'DRILL'] },
      { label: '___ Pool', color: 'blue', words: ['CAR', 'DEAD', 'SWIMMING', 'GENE'] },
      { label: 'Shades of green', color: 'purple', words: ['SAGE', 'LIME', 'JADE', 'MOSS'] },
    ],
  },
  {
    difficulty: 'hard',
    categories: [
      { label: 'Words that follow "OVER"', color: 'yellow', words: ['HAUL', 'BOARD', 'SEAS', 'WHELM'] },
      { label: 'Things you can "crack"', color: 'green', words: ['JOKE', 'SAFE', 'KNUCKLE', 'CODE'] },
      { label: 'Famous people named after places', color: 'blue', words: ['PARIS', 'BROOKLYN', 'DALLAS', 'FLORENCE'] },
      { label: 'Words that precede "work"', color: 'purple', words: ['FRAME', 'TEAM', 'GROUND', 'NET'] },
    ],
  },
  {
    difficulty: 'hard',
    categories: [
      { label: 'Things that can be "blind"', color: 'yellow', words: ['SPOT', 'DATE', 'FOLD', 'SIDED'] },
      { label: 'Words hidden inside a country', color: 'green', words: ['RAN', 'RAIN', 'RANCH', 'FRANK'] },
      { label: 'Things that can "break"', color: 'blue', words: ['DAWN', 'GROUND', 'WATER', 'EVEN'] },
      { label: 'Words that follow "STAR"', color: 'purple', words: ['FISH', 'LIGHT', 'BOARD', 'DUST'] },
    ],
  },
  {
    difficulty: 'hard',
    categories: [
      { label: 'Words containing a number (spelled out)', color: 'yellow', words: ['OFTEN', 'STONE', 'FOXES', 'NINTH'] },
      { label: 'Types of wrestling move', color: 'green', words: ['SUPLEX', 'ELBOW', 'CHOKE', 'CROSSFACE'] },
      { label: 'Things that can follow "HEAD"', color: 'blue', words: ['BAND', 'LINE', 'STONE', 'LIGHT'] },
      { label: 'Words that can mean "fired"', color: 'purple', words: ['CANNED', 'AXED', 'SACKED', 'RELEASED'] },
    ],
  },
  {
    difficulty: 'hard',
    categories: [
      { label: 'Words that follow "BREAK"', color: 'yellow', words: ['THROUGH', 'DOWN', 'FAST', 'POINT'] },
      { label: '___ Smith (famous Smiths)', color: 'green', words: ['WILL', 'JADA', 'MAGGIE', 'MEL'] },
      { label: 'Things that "float"', color: 'blue', words: ['IDEA', 'BOAT', 'LOAN', 'STOCK'] },
      { label: 'Words that can precede "back"', color: 'purple', words: ['FLASH', 'DRAW', 'SET', 'CUT'] },
    ],
  },
];

// ── Recent-use guard (per-room, server memory) ────────────────────────────────

const recentByRoom = new Map<string, number[]>(); // roomCode → last 5 puzzle indices used
const RECENT_WINDOW = 5;

function getRecentIndices(roomCode: string): number[] {
  return recentByRoom.get(roomCode) ?? [];
}

function recordUsed(roomCode: string, idx: number) {
  const recent = getRecentIndices(roomCode);
  const updated = [...recent, idx].slice(-RECENT_WINDOW);
  recentByRoom.set(roomCode, updated);
}

// ── Puzzle selection ──────────────────────────────────────────────────────────

function selectPuzzle(
  difficulty: 'easy' | 'medium' | 'hard',
  seed: string,
  roomCode: string
): { categories: ConnectionsCategory[]; idx: number } {
  const candidates = PUZZLE_BANK
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => p.difficulty === difficulty);

  const recent = getRecentIndices(roomCode);
  // Prefer puzzles not recently used; fall back to full list if all are recent
  const fresh = candidates.filter(({ idx }) => !recent.includes(idx));
  const pool = fresh.length > 0 ? fresh : candidates;

  const s = strToSeed(seed);
  const chosen = pool[s % pool.length];
  recordUsed(roomCode, chosen.idx);
  return { categories: chosen.p.categories, idx: chosen.idx };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateConnections(
  difficulty: string,
  seed: string,
  roomCode = ''
): ConnectionsPuzzle {
  const diff = (['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium') as 'easy' | 'medium' | 'hard';
  const { categories } = selectPuzzle(diff, seed, roomCode);
  const allWords = categories.flatMap(c => c.words);
  const shuffledWords = shuffleSeeded(allWords, strToSeed(seed + ':shuffle'));
  return { categories, shuffledWords };
}

export function checkConnectionsGuess(
  words: string[],
  puzzle: ConnectionsPuzzle
): ConnectionsCategory | null {
  const sorted = [...words].sort();
  for (const cat of puzzle.categories) {
    const catSorted = [...cat.words].sort();
    if (sorted.length === catSorted.length && sorted.every((w, i) => w === catSorted[i])) {
      return cat;
    }
  }
  return null;
}

export function calcConnectionsProgress(solvedCategories: string[], total: number): number {
  return Math.round((solvedCategories.length / total) * 100);
}
