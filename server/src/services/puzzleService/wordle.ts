import type { LetterState, WordleGuess, WordlePuzzle } from '../../types/index';

// Curated word lists by difficulty
const EASY_WORDS = [
  'apple', 'beach', 'chair', 'dance', 'earth', 'flame', 'grace', 'heart',
  'image', 'juice', 'kneel', 'light', 'music', 'night', 'ocean', 'peace',
  'queen', 'river', 'stone', 'table', 'uncle', 'voice', 'water', 'xerox',
  'youth', 'zebra', 'above', 'blade', 'crane', 'drive', 'eagle', 'fable',
  'giant', 'house', 'ivory', 'joker', 'karma', 'laser', 'manor', 'noble',
  'olive', 'piano', 'quest', 'raven', 'shame', 'tiger', 'ultra', 'vivid',
  'whale', 'xenon', 'yearn', 'zonal',
];

const MEDIUM_WORDS = [
  'blaze', 'crypt', 'dwarf', 'expel', 'fjord', 'glyph', 'havoc', 'irony',
  'joust', 'knack', 'llama', 'maxim', 'nymph', 'optic', 'plumb', 'quirk',
  'rivet', 'scone', 'trawl', 'umbra', 'vixen', 'waltz', 'axiom', 'broil',
  'chasm', 'depot', 'extol', 'flint', 'graft', 'heist', 'inept', 'julep',
  'knelt', 'lyric', 'mourn', 'nexus', 'onset', 'pixie', 'quaff', 'repel',
  'sprig', 'testy', 'unfit', 'vaunt', 'wrath', 'yacht', 'zesty', 'abhor',
  'brawl', 'cleft', 'dowry', 'envy', 'flail', 'grimy',
];

const HARD_WORDS = [
  'abuzz', 'brisk', 'cynic', 'dingy', 'ethos', 'furze', 'ghoul', 'husky',
  'idyll', 'jumpy', 'kinky', 'lusty', 'myrrh', 'nutty', 'outdo', 'pygmy',
  'qualm', 'raspy', 'skimp', 'twill', 'unwed', 'vouch', 'weedy', 'guppy',
  'aphid', 'bumpy', 'cozy', 'dizzy', 'ebony', 'fizzy', 'grimy', 'hammy',
  'jazzy', 'klutz', 'larva', 'matey', 'newsy', 'okapi', 'perky', 'rowdy',
  'savvy', 'tizzy', 'unify', 'verve', 'whiff', 'zingy', 'zippy', 'agony',
];

function getWordList(difficulty: string): string[] {
  switch (difficulty) {
    case 'easy': return EASY_WORDS;
    case 'hard': return HARD_WORDS;
    default: return MEDIUM_WORDS;
  }
}

export function generateWordle(difficulty: string, seed: string): WordlePuzzle {
  const words = getWordList(difficulty);
  // Seed-based selection so all players get the same puzzle
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % words.length;
  return {
    answer: words[idx].toUpperCase(),
    wordLength: 5,
    maxGuesses: 6,
  };
}

export function evaluateGuess(guess: string, answer: string): LetterState[] {
  const result: LetterState[] = new Array(5).fill('absent');
  const answerArr = answer.split('');
  const guessArr = guess.toUpperCase().split('');
  const answerUsed = new Array(5).fill(false);
  const guessUsed = new Array(5).fill(false);

  // First pass: correct positions
  for (let i = 0; i < 5; i++) {
    if (guessArr[i] === answerArr[i]) {
      result[i] = 'correct';
      answerUsed[i] = true;
      guessUsed[i] = true;
    }
  }

  // Second pass: present but wrong position
  for (let i = 0; i < 5; i++) {
    if (guessUsed[i]) continue;
    for (let j = 0; j < 5; j++) {
      if (answerUsed[j]) continue;
      if (guessArr[i] === answerArr[j]) {
        result[i] = 'present';
        answerUsed[j] = true;
        break;
      }
    }
  }

  return result;
}

// Validate a guess (basic 5-letter alpha check; extend with full word list)
export function isValidWord(word: string): boolean {
  return /^[a-zA-Z]{5}$/.test(word);
}

export function checkWordleSolved(guesses: WordleGuess[], answer: string): boolean {
  return guesses.some(g => g.word === answer);
}

export function calcWordleProgress(guesses: WordleGuess[], maxGuesses: number, solved: boolean): number {
  if (solved) return 100;
  return Math.round((guesses.length / maxGuesses) * 90);
}
