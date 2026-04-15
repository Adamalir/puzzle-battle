import type { LetterState, WordleGuess, WordlePuzzle } from '../../types/index';
import { EASY_ANSWERS, MEDIUM_ANSWERS, HARD_ANSWERS, VALID_WORDS } from './wordList';

function getAnswerPool(difficulty: string): readonly string[] {
  switch (difficulty) {
    case 'easy': return EASY_ANSWERS;
    case 'hard': return HARD_ANSWERS;
    default:     return MEDIUM_ANSWERS;
  }
}

export function generateWordle(difficulty: string, seed: string): WordlePuzzle {
  const pool = getAnswerPool(difficulty);
  // Deterministic seed → same puzzle for every player in the room
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % pool.length;
  return {
    answer:     pool[idx].toUpperCase(),
    wordLength: 5,
    maxGuesses: 6,
  };
}

export function evaluateGuess(guess: string, answer: string): LetterState[] {
  const result: LetterState[] = new Array(5).fill('absent');
  const answerArr  = answer.split('');
  const guessArr   = guess.toUpperCase().split('');
  const answerUsed = new Array(5).fill(false);
  const guessUsed  = new Array(5).fill(false);

  // First pass: correct positions
  for (let i = 0; i < 5; i++) {
    if (guessArr[i] === answerArr[i]) {
      result[i]     = 'correct';
      answerUsed[i] = true;
      guessUsed[i]  = true;
    }
  }

  // Second pass: present but wrong position
  for (let i = 0; i < 5; i++) {
    if (guessUsed[i]) continue;
    for (let j = 0; j < 5; j++) {
      if (answerUsed[j]) continue;
      if (guessArr[i] === answerArr[j]) {
        result[i]     = 'present';
        answerUsed[j] = true;
        break;
      }
    }
  }

  return result;
}

// Server-side validation: must be a real English word in our list
export function isValidWord(word: string): boolean {
  return VALID_WORDS.has(word.toUpperCase());
}

export function checkWordleSolved(guesses: WordleGuess[], answer: string): boolean {
  return guesses.some(g => g.word === answer);
}

export function calcWordleProgress(guesses: WordleGuess[], maxGuesses: number, solved: boolean): number {
  if (solved) return 100;
  return Math.round((guesses.length / maxGuesses) * 90);
}
