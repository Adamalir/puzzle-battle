import type { ConnectionsCategory, ConnectionsPuzzle } from '../../types/index';

// Seeded shuffle
function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function strToSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = Math.imul(31, h) + s.charCodeAt(i) | 0; }
  return Math.abs(h);
}

const PUZZLE_BANK: { difficulty: string; categories: ConnectionsCategory[] }[] = [
  {
    difficulty: 'easy',
    categories: [
      { label: 'Fruits', color: 'yellow', words: ['APPLE', 'MANGO', 'GRAPE', 'PEACH'] },
      { label: 'Colors', color: 'green', words: ['AZURE', 'CORAL', 'OLIVE', 'MAUVE'] },
      { label: 'Dogs', color: 'blue', words: ['HUSKY', 'BOXER', 'POODLE', 'BEAGLE'] },
      { label: 'Card Games', color: 'purple', words: ['POKER', 'RUMMY', 'BRIDGE', 'SNAP'] },
    ],
  },
  {
    difficulty: 'easy',
    categories: [
      { label: 'Planets', color: 'yellow', words: ['MARS', 'VENUS', 'EARTH', 'SATURN'] },
      { label: 'Musical Instruments', color: 'green', words: ['FLUTE', 'HARP', 'CELLO', 'OBOE'] },
      { label: 'Currencies', color: 'blue', words: ['EURO', 'POUND', 'YEN', 'PESO'] },
      { label: '___ Ball', color: 'purple', words: ['BASKET', 'FOOT', 'BASE', 'SOFT'] },
    ],
  },
  {
    difficulty: 'medium',
    categories: [
      { label: 'Types of cheese', color: 'yellow', words: ['BRIE', 'GOUDA', 'FETA', 'EDAM'] },
      { label: 'James ___ (Bond actors)', color: 'green', words: ['CRAIG', 'MOORE', 'DALTON', 'BROSNAN'] },
      { label: 'Olympic sports', color: 'blue', words: ['LUGE', 'CURLING', 'BIATHLON', 'SKELETON'] },
      { label: 'Shades of blue', color: 'purple', words: ['NAVY', 'COBALT', 'CERULEAN', 'INDIGO'] },
    ],
  },
  {
    difficulty: 'medium',
    categories: [
      { label: 'Poker hands', color: 'yellow', words: ['FLUSH', 'STRAIGHT', 'PAIR', 'QUADS'] },
      { label: 'Coffee drinks', color: 'green', words: ['LATTE', 'MOCHA', 'ESPRESSO', 'LUNGO'] },
      { label: 'Shakespeare plays', color: 'blue', words: ['HAMLET', 'OTHELLO', 'MACBETH', 'TEMPEST'] },
      { label: 'Nobel Prize categories', color: 'purple', words: ['PEACE', 'PHYSICS', 'CHEMISTRY', 'LITERATURE'] },
    ],
  },
  {
    difficulty: 'hard',
    categories: [
      { label: '___ key (keyboard)', color: 'yellow', words: ['ESCAPE', 'ENTER', 'SHIFT', 'SPACE'] },
      { label: 'Anagram of a planet', color: 'green', words: ['STEAM', 'URNS', 'SNUV', 'ERMA'] },
      { label: 'Homophones of numbers', color: 'blue', words: ['ATE', 'WON', 'TOO', 'FOR'] },
      { label: 'Words hiding a metal', color: 'purple', words: ['GOLDEN', 'SILVER', 'COPPER', 'IRONY'] },
    ],
  },
  {
    difficulty: 'hard',
    categories: [
      { label: 'Palindromes', color: 'yellow', words: ['RADAR', 'LEVEL', 'CIVIC', 'MADAM'] },
      { label: 'Greek letters', color: 'green', words: ['DELTA', 'SIGMA', 'OMEGA', 'KAPPA'] },
      { label: 'Words that follow "FIRE"', color: 'blue', words: ['WORKS', 'PLACE', 'SIDE', 'TRUCK'] },
      { label: 'Rhyme with "moon"', color: 'purple', words: ['SPOON', 'TUNE', 'CROON', 'DUNE'] },
    ],
  },
];

function selectPuzzle(difficulty: string, seed: string): ConnectionsCategory[] {
  const candidates = PUZZLE_BANK.filter(p => p.difficulty === difficulty);
  const pool = candidates.length > 0 ? candidates : PUZZLE_BANK;
  const s = strToSeed(seed);
  return pool[Math.abs(s) % pool.length].categories;
}

export function generateConnections(difficulty: string, seed: string): ConnectionsPuzzle {
  const categories = selectPuzzle(difficulty, seed);
  const allWords = categories.flatMap(c => c.words);
  const shuffledWords = shuffleSeeded(allWords, strToSeed(seed + 'shuffle'));
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
