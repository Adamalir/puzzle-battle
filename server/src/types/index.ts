export type PuzzleType = 'wordle' | 'star-battle' | 'connections';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameStatus = 'waiting' | 'countdown' | 'active' | 'finished';
export type PlayerStatus = 'waiting' | 'playing' | 'finished';
export type GameMode = 'classic' | 'gauntlet';
export type GauntletPhase = 'star-battle' | 'wordle' | 'connections';

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
  gauntletPhase?: GauntletPhase | 'done';
  gauntletPhaseTimes?: Partial<Record<GauntletPhase, number>>;
  gauntletRetries?: Partial<Record<GauntletPhase, number>>;
  gauntletPenaltyMs?: number;
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
  size: number;                // grid dimension (8, 10, or 14)
  starsPerUnit: number;        // stars per row/col/region
  regions: number[][];         // size×size matrix, each cell = region index (0-based)
  solution: boolean[][];       // size×size, true = star
  hints?: boolean[][];         // pre-revealed stars for players (hard mode only)
  initialMarks?: boolean[][];  // cells pre-excluded by logic (shown as starting dots)
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

// ── Gauntlet ──────────────────────────────────────────────────────────────────

export interface GauntletPuzzles {
  starBattle: StarBattlePuzzle;
  wordle: WordlePuzzle;
  connections: ConnectionsPuzzle;
}

export interface GauntletPlayerState {
  phase: GauntletPhase | 'done';
  phaseTimes: Partial<Record<GauntletPhase, number>>;
  starBattleState: StarBattlePlayerState;
  wordleState: WordlePlayerState;
  connectionsState: ConnectionsPlayerState;
  // Retry tracking (gauntlet-only)
  retries: Partial<Record<GauntletPhase, number>>;
  penaltyMs: Partial<Record<GauntletPhase, number>>;
  // Per-player override puzzles for retries (replaces shared gauntletPuzzles for that phase)
  currentWordlePuzzle?: WordlePuzzle;
  currentConnectionsPuzzle?: ConnectionsPuzzle;
  // Whether the player is currently waiting for a retry (failed, hasn't clicked Try Again yet)
  awaitingRetry?: boolean;
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
  gameMode: GameMode;
  gauntletPuzzles?: GauntletPuzzles;
  // per-player game state (keyed by userId)
  playerStates: Map<string, WordlePlayerState | StarBattlePlayerState | ConnectionsPlayerState | GauntletPlayerState>;
}

// ── Socket event payloads ─────────────────────────────────────────────────────

export interface CreateRoomPayload {
  puzzleType: PuzzleType;
  difficulty: Difficulty;
  username: string;
  userId: string;
  isGuest: boolean;
  gameMode?: GameMode;
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
