import { nanoid } from 'nanoid';
import type {
  Room, Player, PuzzleType, Difficulty, GameStatus,
  WordlePlayerState, StarBattlePlayerState, ConnectionsPlayerState,
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
  isGuest: boolean
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
    status: asSpectator ? 'waiting' : 'waiting',
    progress: 0,
    isSpectator: asSpectator,
    isHost: false,
    isGuest,
  };
  room.players.set(userId, player);
  return { success: true, room };
}

export function leaveRoom(code: string, userId: string): Room | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  room.players.delete(userId);
  room.playerStates.delete(userId);

  if (room.players.size === 0) {
    rooms.delete(code);
    return undefined;
  }

  // Transfer host if host left
  if (room.hostId === userId) {
    const nextPlayer = [...room.players.values()].find(p => !p.isSpectator);
    if (nextPlayer) {
      nextPlayer.isHost = true;
      room.hostId = nextPlayer.userId;
    }
  }
  return room;
}

export function startGame(code: string, userId: string): { success: boolean; error?: string; room?: Room } {
  const room = rooms.get(code);
  if (!room) return { success: false, error: 'Room not found' };
  if (room.hostId !== userId) return { success: false, error: 'Only the host can start the game' };
  if (room.status !== 'waiting') return { success: false, error: 'Game already started' };

  const activePlayers = [...room.players.values()].filter(p => !p.isSpectator);
  if (activePlayers.length < 1) return { success: false, error: 'Not enough players' };

  const seed = `${code}-${Date.now()}`;

  switch (room.puzzleType) {
    case 'wordle':
      room.puzzle = generateWordle(room.difficulty, seed);
      break;
    case 'star-battle':
      room.puzzle = generateStarBattle(room.difficulty, seed);
      break;
    case 'connections':
      room.puzzle = generateConnections(room.difficulty, seed);
      break;
  }

  // Initialize player states
  for (const player of activePlayers) {
    const state = initPlayerState(room.puzzleType, room.puzzle);
    room.playerStates.set(player.userId, state);
    player.status = 'playing';
  }

  room.status = 'countdown';
  room.countdownEnd = Date.now() + 3000; // 3s countdown
  return { success: true, room };
}

export function activateGame(code: string): Room | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;
  room.status = 'active';
  room.startTime = Date.now();
  return room;
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
      return {
        grid: Array.from({ length: sb.size }, () => new Array(sb.size).fill(0)),
        solved: false,
      };
    }
    case 'connections':
      return { solvedCategories: [], selectedWords: [], mistakes: 0, solved: false };
    default:
      return { guesses: [], currentGuess: '', solved: false, failed: false };
  }
}

export function getRoomPublicView(room: Room): object {
  // Strip sensitive puzzle data (e.g., Wordle answer) before sending to clients
  const { puzzle, puzzleType, ...rest } = room;
  let publicPuzzle: object | null = puzzle;
  if (puzzle && puzzleType === 'wordle') {
    const { answer, ...safeWordle } = puzzle as import('../types/index').WordlePuzzle;
    publicPuzzle = safeWordle;
  }
  return {
    ...rest,
    puzzleType,
    puzzle: publicPuzzle,
    players: Object.fromEntries(room.players),
    playerStates: Object.fromEntries(room.playerStates),
  };
}

export function getPlayerState(code: string, userId: string) {
  return rooms.get(code)?.playerStates.get(userId);
}

export function setPlayerState(code: string, userId: string, state: WordlePlayerState | StarBattlePlayerState | ConnectionsPlayerState) {
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

// Clean up old finished rooms after 1 hour
setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [code, room] of rooms) {
    if (room.status === 'finished' && room.startTime && room.startTime < cutoff) {
      rooms.delete(code);
    }
  }
}, 300_000);
