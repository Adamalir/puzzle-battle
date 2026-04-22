import { Server, Socket } from 'socket.io';
import type {
  WordleGuessPayload, StarBattleMovePayload, ConnectionsSelectPayload,
  WordlePlayerState, StarBattlePlayerState, ConnectionsPlayerState,
  WordlePuzzle, StarBattlePuzzle, ConnectionsPuzzle,
  GauntletPlayerState, GauntletPhase,
} from '../../types/index';
import {
  getRoom, getPlayerState, setPlayerState, updatePlayer,
  checkAllFinished, finishRoom, getRoomPublicView,
} from '../../services/roomService';
import { generateWordle } from '../../services/puzzleService/wordle';
import { generateConnections } from '../../services/puzzleService/connections';
import { evaluateGuess, isValidWord, checkWordleSolved, calcWordleProgress } from '../../services/puzzleService/wordle';
import { checkStarBattleSolved, calcStarBattleProgress } from '../../services/puzzleService/starBattle';
import { checkConnectionsGuess, calcConnectionsProgress } from '../../services/puzzleService/connections';

const GAUNTLET_PHASES: GauntletPhase[] = ['star-battle', 'wordle', 'connections'];
const GAUNTLET_PENALTY_MS = 60_000;
const GAUNTLET_MAX_MISTAKES = 4;

function getElapsed(roomCode: string): number {
  const room = getRoom(roomCode);
  return room?.startTime ? Date.now() - room.startTime : 0;
}

function broadcastProgress(io: Server, roomCode: string) {
  const room = getRoom(roomCode);
  if (!room) return;
  io.to(roomCode).emit('game:progress', getRoomPublicView(room));
}

function handleFinish(io: Server, socket: Socket, roomCode: string, userId: string, overrideFinishTime?: number) {
  const elapsed = overrideFinishTime ?? getElapsed(roomCode);
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
    // All 3 phases done — compute total time including penalties
    gauntletState.phase = 'done';
    const totalPenaltyMs = (Object.values(gauntletState.penaltyMs) as number[]).reduce((a, b) => a + b, 0);
    const finalTime = elapsed + totalPenaltyMs;

    setPlayerState(roomCode, userId, gauntletState);
    updatePlayer(roomCode, userId, {
      gauntletPhase: 'done',
      gauntletPhaseTimes: { ...gauntletState.phaseTimes },
      gauntletRetries: { ...gauntletState.retries },
      gauntletPenaltyMs: totalPenaltyMs,
      progress: 100,
    });
    broadcastProgress(io, roomCode);
    socket.emit('gauntlet:advance', { phase: 'done' });
    handleFinish(io, socket, roomCode, userId, finalTime);
  }
}

// Gauntlet: player failed a phase — register the failure and wait for retry request
function handleGauntletPhaseFailed(
  socket: Socket,
  roomCode: string,
  userId: string,
  phase: GauntletPhase,
  gauntletState: GauntletPlayerState
) {
  gauntletState.retries[phase] = (gauntletState.retries[phase] ?? 0) + 1;
  gauntletState.penaltyMs[phase] = (gauntletState.penaltyMs[phase] ?? 0) + GAUNTLET_PENALTY_MS;
  gauntletState.awaitingRetry = true;
  setPlayerState(roomCode, userId, gauntletState);

  const attempt = gauntletState.retries[phase]! + 1; // attempt number player is about to be on
  socket.emit('gauntlet:failed', {
    phase,
    attempt,
    penaltyMs: GAUNTLET_PENALTY_MS,
    totalPenaltyMs: gauntletState.penaltyMs[phase],
  });
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
      if (gauntletState.awaitingRetry) return;

      const puzzle = gauntletState.currentWordlePuzzle ?? room.gauntletPuzzles!.wordle;
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
      const progress = Math.floor(33 + phaseProgress * 0.33);
      updatePlayer(roomCode, userId, { progress });
      setPlayerState(roomCode, userId, gauntletState);

      socket.emit('wordle:guess-result', { guess: upper, result, solved, failed, state });
      broadcastProgress(io, roomCode);

      if (solved) {
        handleGauntletPhaseComplete(io, socket, roomCode, userId, 'wordle', gauntletState);
      } else if (failed) {
        handleGauntletPhaseFailed(socket, roomCode, userId, 'wordle', gauntletState);
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

    socket.emit('wordle:guess-result', { guess: upper, result, solved, failed, state });
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
      if (gauntletState.awaitingRetry) return;

      const puzzle = gauntletState.currentConnectionsPuzzle ?? room.gauntletPuzzles!.connections;
      const state = gauntletState.connectionsState;
      if (state.solved) return;

      const matched = checkConnectionsGuess(words, puzzle);
      if (matched) {
        state.solvedCategories.push(matched.label);
        const solved = state.solvedCategories.length === puzzle.categories.length;
        state.solved = solved;

        const phaseProgress = calcConnectionsProgress(state.solvedCategories, puzzle.categories.length);
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

        if (state.mistakes >= GAUNTLET_MAX_MISTAKES) {
          handleGauntletPhaseFailed(socket, roomCode, userId, 'connections', gauntletState);
        }
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

  // ── Gauntlet: retry request ───────────────────────────────────────────────
  socket.on('gauntlet:retry-request', (payload: { roomCode: string; userId: string; phase: GauntletPhase }) => {
    const { roomCode, userId, phase } = payload;
    const room = getRoom(roomCode);
    if (!room || room.status !== 'active' || room.gameMode !== 'gauntlet') return;

    const gauntletState = getPlayerState(roomCode, userId) as GauntletPlayerState;
    if (!gauntletState || gauntletState.phase !== phase || !gauntletState.awaitingRetry) return;

    const seed = `${roomCode}-retry-${userId}-${Date.now()}`;

    if (phase === 'wordle') {
      const newPuzzle = generateWordle(room.difficulty, seed) as WordlePuzzle;
      gauntletState.currentWordlePuzzle = newPuzzle;
      gauntletState.wordleState = { guesses: [], currentGuess: '', solved: false, failed: false };
      gauntletState.awaitingRetry = false;
      setPlayerState(roomCode, userId, gauntletState);

      // Send sanitized puzzle (no answer)
      const { answer: _a, ...safePuzzle } = newPuzzle;
      socket.emit('gauntlet:retry-ready', {
        phase,
        puzzle: safePuzzle,
        state: gauntletState.wordleState,
        attempt: (gauntletState.retries[phase] ?? 0) + 1,
      });
    } else if (phase === 'connections') {
      const newPuzzle = generateConnections(room.difficulty, seed) as ConnectionsPuzzle;
      gauntletState.currentConnectionsPuzzle = newPuzzle;
      gauntletState.connectionsState = { solvedCategories: [], selectedWords: [], mistakes: 0, solved: false };
      gauntletState.awaitingRetry = false;
      setPlayerState(roomCode, userId, gauntletState);

      socket.emit('gauntlet:retry-ready', {
        phase,
        puzzle: newPuzzle,
        state: gauntletState.connectionsState,
        attempt: (gauntletState.retries[phase] ?? 0) + 1,
      });
    }

    broadcastProgress(io, roomCode);
  });
}
