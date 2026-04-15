import { Server, Socket } from 'socket.io';
import type {
  WordleGuessPayload, StarBattleMovePayload, ConnectionsSelectPayload,
  WordlePlayerState, StarBattlePlayerState, ConnectionsPlayerState,
  WordlePuzzle, StarBattlePuzzle, ConnectionsPuzzle,
} from '../../types/index';
import {
  getRoom, getPlayer, getPlayerState, setPlayerState, updatePlayer,
  checkAllFinished, finishRoom, getRoomPublicView,
} from '../../services/roomService';
import { evaluateGuess, isValidWord, checkWordleSolved, calcWordleProgress } from '../../services/puzzleService/wordle';
import { checkStarBattleSolved, calcStarBattleProgress } from '../../services/puzzleService/starBattle';
import { checkConnectionsGuess, calcConnectionsProgress } from '../../services/puzzleService/connections';

function getElapsed(roomCode: string): number {
  const room = getRoom(roomCode);
  return room?.startTime ? Date.now() - room.startTime : 0;
}

function broadcastProgress(io: Server, roomCode: string) {
  const room = getRoom(roomCode);
  if (!room) return;
  io.to(roomCode).emit('game:progress', getRoomPublicView(room));
}

function handleFinish(io: Server, socket: Socket, roomCode: string, userId: string) {
  const elapsed = getElapsed(roomCode);
  updatePlayer(roomCode, userId, { status: 'finished', finishTime: elapsed });
  broadcastProgress(io, roomCode);

  socket.emit('game:player-finished', { userId, finishTime: elapsed });
  io.to(roomCode).emit('game:player-finished', { userId, finishTime: elapsed });

  if (checkAllFinished(roomCode)) {
    finishRoom(roomCode);
    const room = getRoom(roomCode);
    if (room) {
      const results = [...room.players.values()]
        .filter(p => !p.isSpectator)
        .sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity))
        .map((p, i) => ({ ...p, placement: i + 1 }));
      io.to(roomCode).emit('game:finished', { results });
    }
  }
}

export function registerGameHandlers(io: Server, socket: Socket) {
  // ── Wordle ────────────────────────────────────────────────────────────────
  socket.on('wordle:guess', (payload: WordleGuessPayload) => {
    const { roomCode, userId, guess } = payload;
    const room = getRoom(roomCode);
    if (!room || room.status !== 'active') return;

    const puzzle = room.puzzle as WordlePuzzle;
    const state = getPlayerState(roomCode, userId) as WordlePlayerState;
    if (!state || state.solved || state.failed) return;

    const upper = guess.toUpperCase();
    if (!isValidWord(upper)) {
      socket.emit('wordle:invalid', { message: 'Not in word list' });
      return;
    }

    const result = evaluateGuess(upper, puzzle.answer);
    state.guesses.push({ word: upper, result });

    const solved = checkWordleSolved(state.guesses, puzzle.answer);
    const failed = !solved && state.guesses.length >= puzzle.maxGuesses;
    state.solved = solved;
    state.failed = failed;
    state.currentGuess = '';

    const progress = calcWordleProgress(state.guesses, puzzle.maxGuesses, solved);
    updatePlayer(roomCode, userId, { progress });
    setPlayerState(roomCode, userId, state);

    // Send full guess result to the guesser
    socket.emit('wordle:guess-result', { guess: upper, result, solved, failed, state });
    // Broadcast progress to room (without revealing answer in other players' states)
    broadcastProgress(io, roomCode);

    if (solved || failed) {
      handleFinish(io, socket, roomCode, userId);
    }
  });

  // ── Star Battle ───────────────────────────────────────────────────────────
  socket.on('starbattle:move', (payload: StarBattleMovePayload) => {
    const { roomCode, userId, row, col, value } = payload;
    const room = getRoom(roomCode);
    if (!room || room.status !== 'active') return;

    const puzzle = room.puzzle as StarBattlePuzzle;
    const state = getPlayerState(roomCode, userId) as StarBattlePlayerState;
    if (!state || state.solved) return;

    // Prevent changing pre-revealed hint cells
    if (puzzle.hints?.[row]?.[col]) return;

    state.grid[row][col] = value;

    const solved = checkStarBattleSolved(state.grid, puzzle);
    state.solved = solved;

    const progress = calcStarBattleProgress(state.grid, puzzle);
    updatePlayer(roomCode, userId, { progress });
    setPlayerState(roomCode, userId, state);

    socket.emit('starbattle:state', { state, solved });
    broadcastProgress(io, roomCode);

    if (solved) handleFinish(io, socket, roomCode, userId);
  });

  // ── Connections ───────────────────────────────────────────────────────────
  socket.on('connections:submit', (payload: ConnectionsSelectPayload) => {
    const { roomCode, userId, words } = payload;
    const room = getRoom(roomCode);
    if (!room || room.status !== 'active') return;

    const puzzle = room.puzzle as ConnectionsPuzzle;
    const state = getPlayerState(roomCode, userId) as ConnectionsPlayerState;
    if (!state || state.solved) return;

    const matched = checkConnectionsGuess(words, puzzle);
    if (matched) {
      state.solvedCategories.push(matched.label);
      const solved = state.solvedCategories.length === puzzle.categories.length;
      state.solved = solved;

      const progress = calcConnectionsProgress(state.solvedCategories, puzzle.categories.length);
      updatePlayer(roomCode, userId, { progress });
      setPlayerState(roomCode, userId, state);

      socket.emit('connections:correct', { category: matched, state });
      broadcastProgress(io, roomCode);

      if (solved) handleFinish(io, socket, roomCode, userId);
    } else {
      state.mistakes++;
      setPlayerState(roomCode, userId, state);
      socket.emit('connections:wrong', { state });
    }
  });
}
