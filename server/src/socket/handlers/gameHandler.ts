import { Server, Socket } from 'socket.io';
import type {
  WordleGuessPayload, StarBattleMovePayload, ConnectionsSelectPayload,
  WordlePlayerState, StarBattlePlayerState, ConnectionsPlayerState,
  WordlePuzzle, StarBattlePuzzle, ConnectionsPuzzle,
  GauntletPlayerState, GauntletPhase,
} from '../../types/index';
import {
  getRoom, getPlayer, getPlayerState, setPlayerState, updatePlayer,
  checkAllFinished, finishRoom, getRoomPublicView,
} from '../../services/roomService';
import { evaluateGuess, isValidWord, checkWordleSolved, calcWordleProgress } from '../../services/puzzleService/wordle';
import { checkStarBattleSolved, calcStarBattleProgress } from '../../services/puzzleService/starBattle';
import { checkConnectionsGuess, calcConnectionsProgress } from '../../services/puzzleService/connections';

const GAUNTLET_PHASES: GauntletPhase[] = ['star-battle', 'wordle', 'connections'];

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

// Gauntlet: advance phase when a player completes one puzzle
function handleGauntletPhaseComplete(
  io: Server,
  socket: Socket,
  roomCode: string,
  userId: string,
  completedPhase: GauntletPhase,
  gauntletState: GauntletPlayerState
) {
  const elapsed = getElapsed(roomCode);
  gauntletState.phaseTimes[completedPhase] = elapsed;

  const currentIndex = GAUNTLET_PHASES.indexOf(completedPhase);
  const nextPhase = GAUNTLET_PHASES[currentIndex + 1] as GauntletPhase | undefined;

  if (nextPhase) {
    gauntletState.phase = nextPhase;
    setPlayerState(roomCode, userId, gauntletState);
    updatePlayer(roomCode, userId, { gauntletPhase: nextPhase });
    broadcastProgress(io, roomCode);
    socket.emit('gauntlet:advance', { phase: nextPhase });
  } else {
    // All 3 phases done
    gauntletState.phase = 'done';
    setPlayerState(roomCode, userId, gauntletState);
    updatePlayer(roomCode, userId, {
      gauntletPhase: 'done',
      gauntletPhaseTimes: { ...gauntletState.phaseTimes },
      progress: 100,
    });
    broadcastProgress(io, roomCode);
    socket.emit('gauntlet:advance', { phase: 'done' });
    handleFinish(io, socket, roomCode, userId);
  }
}

export function registerGameHandlers(io: Server, socket: Socket) {
  // ── Wordle ────────────────────────────────────────────────────────────────
  socket.on('wordle:guess', (payload: WordleGuessPayload) => {
    const { roomCode, userId, guess } = payload;
    const room = getRoom(roomCode);
    if (!room || room.status !== 'active') return;

    const upper = guess.toUpperCase();

    if (room.gameMode === 'gauntlet') {
      const gauntletState = getPlayerState(roomCode, userId) as GauntletPlayerState;
      if (!gauntletState || gauntletState.phase !== 'wordle') return;

      const puzzle = room.gauntletPuzzles!.wordle;
      const state = gauntletState.wordleState;
      if (state.solved || state.failed) return;

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

      const phaseProgress = calcWordleProgress(state.guesses, puzzle.maxGuesses, solved);
      // Gauntlet progress: phase 2 of 3 = 33–66%
      const progress = Math.floor(33 + phaseProgress * 0.33);
      updatePlayer(roomCode, userId, { progress });
      setPlayerState(roomCode, userId, gauntletState);

      socket.emit('wordle:guess-result', { guess: upper, result, solved, failed, state });
      broadcastProgress(io, roomCode);

      if (solved || failed) {
        handleGauntletPhaseComplete(io, socket, roomCode, userId, 'wordle', gauntletState);
      }
      return;
    }

    // Classic mode
    const puzzle = room.puzzle as WordlePuzzle;
    const state = getPlayerState(roomCode, userId) as WordlePlayerState;
    if (!state || state.solved || state.failed) return;

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

    if (room.gameMode === 'gauntlet') {
      const gauntletState = getPlayerState(roomCode, userId) as GauntletPlayerState;
      if (!gauntletState || gauntletState.phase !== 'star-battle') return;

      const puzzle = room.gauntletPuzzles!.starBattle;
      const state = gauntletState.starBattleState;
      if (state.solved) return;

      if (puzzle.hints?.[row]?.[col]) return;

      state.grid[row][col] = value;

      const solved = checkStarBattleSolved(state.grid, puzzle);
      state.solved = solved;

      const phaseProgress = calcStarBattleProgress(state.grid, puzzle);
      // Gauntlet progress: phase 1 of 3 = 0–33%
      const progress = Math.floor(phaseProgress * 0.33);
      updatePlayer(roomCode, userId, { progress });
      setPlayerState(roomCode, userId, gauntletState);

      socket.emit('starbattle:state', { state, solved });
      broadcastProgress(io, roomCode);

      if (solved) {
        handleGauntletPhaseComplete(io, socket, roomCode, userId, 'star-battle', gauntletState);
      }
      return;
    }

    // Classic mode
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

    if (room.gameMode === 'gauntlet') {
      const gauntletState = getPlayerState(roomCode, userId) as GauntletPlayerState;
      if (!gauntletState || gauntletState.phase !== 'connections') return;

      const puzzle = room.gauntletPuzzles!.connections;
      const state = gauntletState.connectionsState;
      if (state.solved) return;

      const matched = checkConnectionsGuess(words, puzzle);
      if (matched) {
        state.solvedCategories.push(matched.label);
        const solved = state.solvedCategories.length === puzzle.categories.length;
        state.solved = solved;

        const phaseProgress = calcConnectionsProgress(state.solvedCategories, puzzle.categories.length);
        // Gauntlet progress: phase 3 of 3 = 66–99%
        const progress = Math.floor(66 + phaseProgress * 0.33);
        updatePlayer(roomCode, userId, { progress });
        setPlayerState(roomCode, userId, gauntletState);

        socket.emit('connections:correct', { category: matched, state });
        broadcastProgress(io, roomCode);

        if (solved) {
          handleGauntletPhaseComplete(io, socket, roomCode, userId, 'connections', gauntletState);
        }
      } else {
        state.mistakes++;
        setPlayerState(roomCode, userId, gauntletState);
        socket.emit('connections:wrong', { state });
      }
      return;
    }

    // Classic mode
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
