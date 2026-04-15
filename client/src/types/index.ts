export type PuzzleType = 'wordle' | 'star-battle' | 'connections';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameStatus = 'waiting' | 'countdown' | 'active' | 'finished';
export type PlayerStatus = 'waiting' | 'playing' | 'finished';
export type LetterState = 'correct' | 'present' | 'absent' | 'empty';

export interface AuthUser {
  id: string;
  username: string;
  isGuest: boolean;
  token: string;
}

export interface Player {
  userId: string;
  username: string;
  status: PlayerStatus;
  progress: number;
  finishTime?: number;
  isSpectator: boolean;
  isHost: boolean;
  isGuest: boolean;
}

// ── Puzzle state types (received from server) ─────────────────────────────────

export interface WordleGuess {
  word: string;
  result: LetterState[];
}

export interface WordlePlayerState {
  guesses: WordleGuess[];
  currentGuess: string;
  solved: boolean;
  failed: boolean;
}

export interface StarBattlePlayerState {
  grid: number[][];
  solved: boolean;
}

export interface ConnectionsPlayerState {
  solvedCategories: string[];
  selectedWords: string[];
  mistakes: number;
  solved: boolean;
}

// ── Puzzle definition types ───────────────────────────────────────────────────

export interface WordlePuzzle {
  wordLength: number;
  maxGuesses: number;
  // answer is NOT sent to client
}

export interface StarBattlePuzzle {
  size: number;
  starsPerUnit: number;
  regions: number[][];
  solution: boolean[][];  // sent for client-side display after game
  hints?: boolean[][];    // pre-revealed stars (hard mode only)
}

export interface ConnectionsCategory {
  label: string;
  color: 'yellow' | 'green' | 'blue' | 'purple';
  words: string[];
}

export interface ConnectionsPuzzle {
  categories: ConnectionsCategory[];
  shuffledWords: string[];
}

// ── Room ──────────────────────────────────────────────────────────────────────

export interface RoomState {
  code: string;
  hostId: string;
  puzzleType: PuzzleType;
  difficulty: Difficulty;
  status: GameStatus;
  players: Record<string, Player>;
  playerStates: Record<string, WordlePlayerState | StarBattlePlayerState | ConnectionsPlayerState>;
  puzzle: WordlePuzzle | StarBattlePuzzle | ConnectionsPuzzle | null;
  startTime: number | null;
  countdownEnd: number | null;
}

// ── Results ───────────────────────────────────────────────────────────────────

export interface GameResult {
  userId: string;
  username: string;
  finishTime?: number;
  placement: number;
  progress: number;
}
