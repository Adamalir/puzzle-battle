export type PuzzleType = 'wordle' | 'star-battle' | 'connections';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameStatus = 'waiting' | 'countdown' | 'active' | 'finished';
export type PlayerStatus = 'waiting' | 'playing' | 'finished';
export type LetterState = 'correct' | 'present' | 'absent' | 'empty';
export type GameMode = 'classic' | 'gauntlet';
export type GauntletPhase = 'star-battle' | 'wordle' | 'connections';

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
  gauntletPhase?: GauntletPhase | 'done';
  gauntletPhaseTimes?: Partial<Record<GauntletPhase, number>>;
  gauntletRetries?: Partial<Record<GauntletPhase, number>>;
  gauntletPenaltyMs?: number;
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
  solution: boolean[][];       // sent for client-side display after game
  hints?: boolean[][];         // pre-revealed stars (hard mode only)
  initialMarks?: boolean[][];  // cells pre-excluded by logic (shown as starting dots)
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
  retries: Partial<Record<GauntletPhase, number>>;
  penaltyMs: Partial<Record<GauntletPhase, number>>;
  awaitingRetry?: boolean;
}

// ── Room ──────────────────────────────────────────────────────────────────────

export interface RoomState {
  code: string;
  hostId: string;
  puzzleType: PuzzleType;
  difficulty: Difficulty;
  status: GameStatus;
  gameMode: GameMode;
  gauntletPuzzles?: GauntletPuzzles;
  players: Record<string, Player>;
  playerStates: Record<string, WordlePlayerState | StarBattlePlayerState | ConnectionsPlayerState | GauntletPlayerState>;
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
  gauntletPhaseTimes?: Partial<Record<GauntletPhase, number>>;
  gauntletRetries?: Partial<Record<GauntletPhase, number>>;
  gauntletPenaltyMs?: number;
}
