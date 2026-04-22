import { nanoid } from 'nanoid';
import type {
  Room, Player, PuzzleType, Difficulty, GameMode,
  WordlePlayerState, StarBattlePlayerState, ConnectionsPlayerState,
  GauntletPlayerState, GauntletPuzzles,
} from '../types/index';
import { generateWordle } from './puzzleService/wordle';
import { generateStarBattle } from './puzzleService/starBattle';
import { generateConnections } from './puzzleService/connections';

const rooms = new Map<string, Room>();

export function createRoom(
  hostId: string,
  username: string,
  puzzleType: PuzzleType,
  difficulty: Difficulty,
  isGuest: boolean,
  gameMode: GameMode = 'classic'
): Room {
  const code = nanoid(6).toUpperCase();
  const host: Player = {
    userId: hostId,
    username,
    status: 'waiting',
    progress: 0,
    isSpectator: false,
    isHost: true,
    isGuest,
  };
  const players = new Map<string, Player>();
  players.set(hostId, host);

  const room: Room = {
    code,
    hostId,
    puzzleType,
    difficulty,
    players,
    status: 'waiting',
    puzzle: null,
    startTime: null,
    countdownEnd: null,
    gameId: null,
    gameMode,
    playerStates: new Map(),
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function joinRoom(
  code: string,
  userId: string,
  username: string,
  isGuest: boolean,
  asSpectator = false
): { success: boolean; error?: string; room?: Room } {
  const room = rooms.get(code);
  if (!room) return { success: false, error: 'Room not found' };
  if (room.status !== 'waiting' && !asSpectator) {
    return { success: false, error: 'Game already in progress — join as spectator' };
  }
  if (room.players.size >= 8 && !asSpectator) {
    return { success: false, error: 'Room is full (max 8 players)' };
  }

  const player: Player = {
    userId,
    username,
    status: 'waiting',
    progress: 0,
    isSpectator: asSpectator,
    isHost: false,
    isGuest,
  };
  room.players.set(userId, player);
  return { success: true, room };
}

// Rejoin an existing room after a page refresh or socket reconnect.
// The player must already be present in the room (we never removed them
// during an active game — see leaveRoom below).
export function rejoinRoom(
  code: string,
  userId: string
): { success: boolean; error?: string; room?: Room } {
  const room = rooms.get(code);
  if (!room) return { success: false, error: 'Room not found' };
  if (!room.players.has(userId)) return { success: false, error: 'You are not in this room' };
  return { success: true, room };
}

// Intentional leave (player clicked "Back to Lobby" / "Leave Game").
// Always removes the player regardless of game status.
export function leaveRoom(code: string, userId: string): Room | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;

  room.players.delete(userId);
  room.playerStates.delete(userId);

  if (room.players.size === 0) {
    rooms.delete(code);
    return undefined;
  }

  if (room.hostId === userId) {
    const nextPlayer = [...room.players.values()].find(p => !p.isSpectator);
    if (nextPlayer) {
      nextPlayer.isHost = true;
      room.hostId = nextPlayer.userId;
    }
  }
  return room;
}

// Socket disconnect (browser closed / network drop).
// During an active/countdown game we keep the player so they can reconnect;
// in the lobby we remove them immediately (same as an intentional leave).
export function disconnectFromRoom(code: string, userId: string): Room | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;

  if (room.status === 'active' || room.status === 'countdown') {
    return room; // keep player; they can rejoin
  }

  return leaveRoom(code, userId);
}

export function startGame(code: string, userId: string): { success: boolean; error?: string; room?: Room } {
  const room = rooms.get(code);
  if (!room) return { success: false, error: 'Room not found' };
  if (room.hostId !== userId) return { success: false, error: 'Only the host can start the game' };
  if (room.status !== 'waiting') return { success: false, error: 'Game already started' };

  const activePlayers = [...room.players.values()].filter(p => !p.isSpectator);
  if (activePlayers.length < 1) return { success: false, error: 'Not enough players' };

  const seed = `${code}-${Date.now()}`;

  if (room.gameMode === 'gauntlet') {
    const gauntletPuzzles: GauntletPuzzles = {
      starBattle: generateStarBattle(room.difficulty, `${seed}-sb`) as import('../types/index').StarBattlePuzzle,
      wordle: generateWordle(room.difficulty, `${seed}-w`) as import('../types/index').WordlePuzzle,
      connections: generateConnections(room.difficulty, `${seed}-c`, code) as import('../types/index').ConnectionsPuzzle,
    };
    room.gauntletPuzzles = gauntletPuzzles;
    room.puzzle = gauntletPuzzles.starBattle; // first puzzle shown

    for (const player of activePlayers) {
      const sbPuzzle = gauntletPuzzles.starBattle;
      const sbGrid = Array.from({ length: sbPuzzle.size }, (_, r) =>
        Array.from({ length: sbPuzzle.size }, (_, c) =>
          sbPuzzle.hints?.[r]?.[c] ? 1 : 0
        )
      );
      const gauntletState: GauntletPlayerState = {
        phase: 'star-battle',
        phaseTimes: {},
        starBattleState: { grid: sbGrid, solved: false },
        wordleState: { guesses: [], currentGuess: '', solved: false, failed: false },
        connectionsState: { solvedCategories: [], selectedWords: [], mistakes: 0, solved: false },
        retries: {},
        penaltyMs: {},
      };
      room.playerStates.set(player.userId, gauntletState);
      player.status = 'playing';
      player.gauntletPhase = 'star-battle';
    }
  } else {
    switch (room.puzzleType) {
      case 'wordle':      room.puzzle = generateWordle(room.difficulty, seed); break;
      case 'star-battle': room.puzzle = generateStarBattle(room.difficulty, seed); break;
      case 'connections': room.puzzle = generateConnections(room.difficulty, seed, code); break;
    }

    for (const player of activePlayers) {
      room.playerStates.set(player.userId, initPlayerState(room.puzzleType, room.puzzle));
      player.status = 'playing';
    }
  }

  room.status = 'countdown';
  room.countdownEnd = Date.now() + 3000;
  return { success: true, room };
}

export function activateGame(code: string): Room | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  room.status = 'active';
  room.startTime = Date.now();
  return room;
}

// Reset a room back to waiting so the same players can play another round.
// Works from any status — used for both "Play Again" and the host's "Force Reset".
export function resetRoom(
  code: string,
  hostId: string,
  puzzleType?: PuzzleType,
  difficulty?: Difficulty
): { success: boolean; error?: string; room?: Room } {
  const room = rooms.get(code);
  if (!room) return { success: false, error: 'Room not found' };
  if (room.hostId !== hostId) return { success: false, error: 'Only the host can reset the room' };

  room.status = 'waiting';
  room.puzzle = null;
  room.startTime = null;
  room.countdownEnd = null;
  room.gameId = null;
  room.playerStates = new Map();
  room.gauntletPuzzles = undefined;
  if (puzzleType) room.puzzleType = puzzleType;
  if (difficulty)  room.difficulty = difficulty;

  for (const player of room.players.values()) {
    player.status = 'waiting';
    player.progress = 0;
    delete player.finishTime;
    delete player.gauntletPhase;
    delete player.gauntletPhaseTimes;
  }

  return { success: true, room };
}

function initPlayerState(
  puzzleType: PuzzleType,
  puzzle: Room['puzzle']
): WordlePlayerState | StarBattlePlayerState | ConnectionsPlayerState {
  switch (puzzleType) {
    case 'wordle':
      return { guesses: [], currentGuess: '', solved: false, failed: false };
    case 'star-battle': {
      const sb = puzzle as import('../types/index').StarBattlePuzzle;
      // Pre-fill locked hint stars (hard mode only); everything else starts empty
      const grid = Array.from({ length: sb.size }, (_, r) =>
        Array.from({ length: sb.size }, (_, c) =>
          sb.hints?.[r]?.[c] ? 1 : 0
        )
      );
      return { grid, solved: false };
    }
    case 'connections':
      return { solvedCategories: [], selectedWords: [], mistakes: 0, solved: false };
    default:
      return { guesses: [], currentGuess: '', solved: false, failed: false };
  }
}

export function getRoomPublicView(room: Room): object {
  const { puzzle, puzzleType, gauntletPuzzles, ...rest } = room;
  let publicPuzzle: object | null = puzzle;
  if (puzzle && puzzleType === 'wordle') {
    const { answer, ...safeWordle } = puzzle as import('../types/index').WordlePuzzle;
    publicPuzzle = safeWordle;
  }

  let publicGauntletPuzzles: object | undefined;
  if (gauntletPuzzles) {
    const { answer: _a, ...safeGauntletWordle } = gauntletPuzzles.wordle;
    publicGauntletPuzzles = {
      starBattle: gauntletPuzzles.starBattle,
      wordle: safeGauntletWordle,
      connections: gauntletPuzzles.connections,
    };
  }

  return {
    ...rest,
    puzzleType,
    puzzle: publicPuzzle,
    gauntletPuzzles: publicGauntletPuzzles,
    players: Object.fromEntries(room.players),
    playerStates: Object.fromEntries(room.playerStates),
  };
}

export function getPlayerState(code: string, userId: string) {
  return rooms.get(code)?.playerStates.get(userId);
}

export function setPlayerState(code: string, userId: string, state: WordlePlayerState | StarBattlePlayerState | ConnectionsPlayerState | GauntletPlayerState) {
  const room = rooms.get(code);
  if (!room) return;
  room.playerStates.set(userId, state);
}

export function getPlayer(code: string, userId: string): Player | undefined {
  return rooms.get(code)?.players.get(userId);
}

export function updatePlayer(code: string, userId: string, update: Partial<Player>) {
  const room = rooms.get(code);
  if (!room) return;
  const player = room.players.get(userId);
  if (player) Object.assign(player, update);
}

export function checkAllFinished(code: string): boolean {
  const room = rooms.get(code);
  if (!room) return false;
  const activePlayers = [...room.players.values()].filter(p => !p.isSpectator);
  return activePlayers.every(p => p.status === 'finished');
}

export function finishRoom(code: string) {
  const room = rooms.get(code);
  if (room) room.status = 'finished';
}

// Periodic cleanup:
//  • Finished rooms   → delete after 1 hour
//  • Active/countdown rooms with no activity for 2 hours → reset to waiting
//    (lets players come back without the "game already started" wall)
//  • Countdown rooms where the 3-second window expired but activateGame never ran
//    (e.g. server restart mid-countdown) → reset immediately
setInterval(() => {
  const now = Date.now();
  const finishedCutoff  = now - 3_600_000;  // 1 hour
  const staleCutoff     = now - 7_200_000;  // 2 hours

  for (const [code, room] of rooms) {
    if (room.status === 'finished' && room.startTime && room.startTime < finishedCutoff) {
      rooms.delete(code);
      continue;
    }

    // Reset stale active games so returning players don't hit "game already started"
    if (
      (room.status === 'active' || room.status === 'countdown') &&
      room.startTime && room.startTime < staleCutoff
    ) {
      room.status = 'waiting';
      room.puzzle = null;
      room.startTime = null;
      room.countdownEnd = null;
      room.gameId = null;
      room.playerStates = new Map();
      for (const player of room.players.values()) {
        player.status = 'waiting';
        player.progress = 0;
        delete player.finishTime;
      }
      continue;
    }

    // Countdown that never transitioned to active (server restart / crash mid-count)
    if (room.status === 'countdown' && room.countdownEnd && room.countdownEnd < now - 30_000) {
      room.status = 'waiting';
      room.puzzle = null;
      room.countdownEnd = null;
      room.gameId = null;
      room.playerStates = new Map();
      for (const player of room.players.values()) {
        player.status = 'waiting';
        player.progress = 0;
        delete player.finishTime;
      }
    }
  }
}, 300_000);
