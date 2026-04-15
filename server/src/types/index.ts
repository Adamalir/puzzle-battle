export type PuzzleType = 'wordle' | 'star-battle' | 'connections';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameStatus = 'waiting' | 'countdown' | 'active' | 'finished';
export type PlayerStatus = 'waiting' | 'playing' | 'finished';

export interface AuthUser {
  id: string;
  username: string;
  isGuest: boolean;
}

export interface Player {
  userId: string;
  username: string;
  status: PlayerStatus;
  progress: number; // 0–100
  finishTime?: number; // ms from game start
  isSpectator: boolean;
  isHost: boolean;
  isGuest: boolean;
}

// ── Wordle ────────────────────────────────────────────────────────────────────

export type LetterState = 'correct' | 'present' | 'absent' | 'empty';

export interface WordleGuess {
  word: string;
  result: LetterState[];
}

export interface WordlePuzzle {
  answer: string; // only sent to server-side validation, never to clients
  wordLength: number;
  maxGuesses: number;
}

export interface WordlePlayerState {
  guesses: WordleGuess[];
  currentGuess: string;
  solved: boolean;
  failed: boolean;
}

// ── Star Battle ───────────────────────────────────────────────────────────────

export interface StarBattlePuzzle {
  size: number;          // grid dimension (8, 10, or 14)
  starsPerUnit: number;  // stars per row/col/region
  regions: number[][];   // size×size matrix, each cell = region index (0-based)
  solution: boolean[][]; // size×size, true = star
  hints?: boolean[][];   // pre-revealed stars for players (hard mode only)
}

export interface StarBattlePlayerState {
  grid: number[][];  // 0=empty, 1=star, 2=dot (marked empty)
  solved: boolean;
}

// ── Connections ───────────────────────────────────────────────────────────────

export interface ConnectionsCategory {
  label: string;
  color: 'yellow' | 'green' | 'blue' | 'purple';
  words: string[];
}

export interface ConnectionsPuzzle {
  categories: ConnectionsCategory[];
  shuffledWords: string[];
}

export interface ConnectionsPlayerState {
  solvedCategories: string[]; // category labels solved
  selectedWords: string[];
  mistakes: number;
  solved: boolean;
}

// ── Room ──────────────────────────────────────────────────────────────────────

export interface Room {
  code: string;
  hostId: string;
  puzzleType: PuzzleType;
  difficulty: Difficulty;
  players: Map<string, Player>;
  status: GameStatus;
  puzzle: WordlePuzzle | StarBattlePuzzle | ConnectionsPuzzle | null;
  startTime: number | null;
  countdownEnd: number | null;
  gameId: string | null;
  // per-player game state (keyed by userId)
  playerStates: Map<string, WordlePlayerState | StarBattlePlayerState | ConnectionsPlayerState>;
}

// ── Socket event payloads ─────────────────────────────────────────────────────

export interface CreateRoomPayload {
  puzzleType: PuzzleType;
  difficulty: Difficulty;
  username: string;
  userId: string;
  isGuest: boolean;
}

export interface JoinRoomPayload {
  roomCode: string;
  username: string;
  userId: string;
  isGuest: boolean;
  asSpectator?: boolean;
}

export interface StartGamePayload {
  roomCode: string;
  userId: string;
}

export interface WordleGuessPayload {
  roomCode: string;
  userId: string;
  guess: string;
}

export interface StarBattleMovePayload {
  roomCode: string;
  userId: string;
  row: number;
  col: number;
  value: number; // 0, 1, or 2
}

export interface ConnectionsSelectPayload {
  roomCode: string;
  userId: string;
  words: string[];
}
