import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  RoomState, GameResult, PuzzleType, Difficulty,
  GauntletPhase, GauntletPlayerState, WordlePuzzle, ConnectionsPuzzle,
} from '../types';
import RoomLobby from '../components/multiplayer/RoomLobby';
import LiveSidebar from '../components/multiplayer/LiveSidebar';
import ResultsScreen from '../components/multiplayer/ResultsScreen';
import WordleGame from '../components/puzzles/Wordle/WordleGame';
import StarBattleGame from '../components/puzzles/StarBattle/StarBattleGame';
import ConnectionsGame from '../components/puzzles/Connections/ConnectionsGame';

const SESSION_KEY = 'puzzle-battle-room';

const PHASE_LABELS: Record<GauntletPhase, string> = {
  'star-battle': 'Star Battle',
  wordle: 'Wordle',
  connections: 'Connections',
};

const PHASE_ICONS: Record<GauntletPhase, string> = {
  'star-battle': '⭐',
  wordle: '🔤',
  connections: '🔗',
};

function formatPenalty(ms: number): string {
  return `+${Math.round(ms / 1000)}s`;
}

interface GauntletFailedInfo {
  phase: GauntletPhase;
  attempt: number;       // which attempt is coming up (2 = first retry)
  penaltyMs: number;
  totalPenaltyMs: number;
}

interface GauntletRetryPuzzles {
  wordle?: WordlePuzzle;
  connections?: ConnectionsPuzzle;
}

export default function GamePage() {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuth();
  const { socket, connected, reconnecting } = useSocket();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [results, setResults] = useState<GameResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Gauntlet local state
  const [gauntletPhase, setGauntletPhase] = useState<GauntletPhase | 'done' | null>(null);
  const [phaseTransition, setPhaseTransition] = useState<GauntletPhase | null>(null);
  const [gauntletFailed, setGauntletFailed] = useState<GauntletFailedInfo | null>(null);
  const [gauntletRetryPuzzles, setGauntletRetryPuzzles] = useState<GauntletRetryPuzzles>({});
  // Key to force remount puzzle component after retry
  const [retryKey, setRetryKey] = useState(0);

  const roomRef = useRef<RoomState | null>(null);
  useEffect(() => { roomRef.current = room; }, [room]);

  const wasReconnectingRef = useRef(false);

  // ── Session persistence helpers ──────────────────────────────────────────────

  const tryRejoin = useCallback(() => {
    if (!socket || !code || !user) return;
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved) return;
    try {
      const { roomCode } = JSON.parse(saved) as { roomCode: string };
      if (roomCode === code.toUpperCase()) {
        socket.emit('room:rejoin', { roomCode: code.toUpperCase(), userId: user.id });
      }
    } catch { /* ignore malformed JSON */ }
  }, [socket, code, user]);

  useEffect(() => {
    if (reconnecting) { wasReconnectingRef.current = true; return; }
    if (connected && wasReconnectingRef.current) {
      wasReconnectingRef.current = false;
      tryRejoin();
    }
  }, [connected, reconnecting, tryRejoin]);

  const didMountRejoin = useRef(false);
  useEffect(() => {
    if (!socket || !code || !user || !connected || didMountRejoin.current) return;
    didMountRejoin.current = true;
    tryRejoin();
  }, [socket, code, user, connected, tryRejoin]);

  // ── Socket event handlers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !code || !user) return;

    const syncGauntletPhase = (r: RoomState) => {
      if (r.gameMode === 'gauntlet') {
        const myPlayer = r.players[user.id];
        if (myPlayer?.gauntletPhase) {
          setGauntletPhase(myPlayer.gauntletPhase);
        }
      }
    };

    const handleRoomUpdated  = (r: RoomState) => { setRoom(r); syncGauntletPhase(r); };

    const handleRoomJoined   = (r: RoomState) => {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode: r.code }));
      setRoom(r);
      syncGauntletPhase(r);
    };

    const handleRoomRejoined = (r: RoomState) => {
      setRoom(r);
      syncGauntletPhase(r);
    };

    const handleCountdown = ({ countdownEnd, room: r }: { countdownEnd: number; room: RoomState }) => {
      setRoom(r);
      syncGauntletPhase(r);
      const tick = () => {
        const ms = countdownEnd - Date.now();
        if (ms <= 0) { setCountdown(null); return; }
        setCountdown(Math.ceil(ms / 1000));
        requestAnimationFrame(tick);
      };
      tick();
    };

    const handleGameStarted = (r: RoomState) => {
      setRoom(r);
      setCountdown(null);
      if (r.gameMode === 'gauntlet') {
        setGauntletPhase('star-battle');
      }
    };

    const handleGameFinished = ({ results: res }: { results: GameResult[] }) => {
      const delay = roomRef.current?.gameMode === 'gauntlet' ? 0
        : roomRef.current?.puzzleType === 'wordle' ? 2200 : 0;
      setTimeout(() => setResults(res), delay);
    };

    const handleProgress = (r: RoomState) => { setRoom(r); };

    const handleError = ({ message }: { message: string }) => {
      const rejoinErrors = ['Room not found', 'You are not in this room'];
      if (rejoinErrors.some(e => message.includes(e))) {
        localStorage.removeItem(SESSION_KEY);
        navigate('/lobby');
        return;
      }
      setError(message);
    };

    const handleReset = (r: RoomState) => {
      setResults(null);
      setCountdown(null);
      setGauntletPhase(null);
      setPhaseTransition(null);
      setGauntletFailed(null);
      setGauntletRetryPuzzles({});
      setRetryKey(0);
      setRoom(r);
    };

    const handleGauntletAdvance = ({ phase }: { phase: GauntletPhase | 'done' }) => {
      setGauntletFailed(null);
      if (phase === 'done') {
        setGauntletPhase('done');
        return;
      }
      setPhaseTransition(phase);
      setTimeout(() => {
        setGauntletPhase(phase);
        setPhaseTransition(null);
      }, 2000);
    };

    const handleGauntletFailed = (info: GauntletFailedInfo) => {
      setGauntletFailed(info);
    };

    const handleGauntletRetryReady = ({
      phase,
      puzzle,
    }: {
      phase: GauntletPhase;
      puzzle: WordlePuzzle | ConnectionsPuzzle;
      attempt: number;
    }) => {
      setGauntletRetryPuzzles(prev => ({
        ...prev,
        [phase === 'wordle' ? 'wordle' : 'connections']: puzzle,
      }));
      setGauntletFailed(null);
      setRetryKey(k => k + 1);
    };

    socket.on('room:updated',          handleRoomUpdated);
    socket.on('room:joined',           handleRoomJoined);
    socket.on('room:created',          handleRoomJoined);
    socket.on('room:rejoined',         handleRoomRejoined);
    socket.on('game:countdown',        handleCountdown);
    socket.on('game:started',          handleGameStarted);
    socket.on('game:finished',         handleGameFinished);
    socket.on('game:progress',         handleProgress);
    socket.on('room:error',            handleError);
    socket.on('room:reset',            handleReset);
    socket.on('gauntlet:advance',      handleGauntletAdvance);
    socket.on('gauntlet:failed',       handleGauntletFailed);
    socket.on('gauntlet:retry-ready',  handleGauntletRetryReady);

    return () => {
      socket.off('room:updated',          handleRoomUpdated);
      socket.off('room:joined',           handleRoomJoined);
      socket.off('room:created',          handleRoomJoined);
      socket.off('room:rejoined',         handleRoomRejoined);
      socket.off('game:countdown',        handleCountdown);
      socket.off('game:started',          handleGameStarted);
      socket.off('game:finished',         handleGameFinished);
      socket.off('game:progress',         handleProgress);
      socket.off('room:error',            handleError);
      socket.off('room:reset',            handleReset);
      socket.off('gauntlet:advance',      handleGauntletAdvance);
      socket.off('gauntlet:failed',       handleGauntletFailed);
      socket.off('gauntlet:retry-ready',  handleGauntletRetryReady);
    };
  }, [socket, code, user, navigate]);

  const handleLeave = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    socket?.emit('room:leave');
    navigate('/lobby');
  }, [socket, navigate]);

  const handlePlayAgain = useCallback((puzzleType: PuzzleType, difficulty: Difficulty) => {
    socket?.emit('room:play-again', {
      roomCode:   room?.code,
      userId:     user?.id,
      puzzleType,
      difficulty,
    });
  }, [socket, room?.code, user?.id]);

  const handleForceReset = useCallback(() => {
    socket?.emit('room:force-reset', { roomCode: room?.code, userId: user?.id });
  }, [socket, room?.code, user?.id]);

  const handleRetryRequest = useCallback((phase: GauntletPhase) => {
    socket?.emit('gauntlet:retry-request', { roomCode: room?.code, userId: user?.id, phase });
  }, [socket, room?.code, user?.id]);

  // ── Gauntlet: build a patched room for the current phase ─────────────────────
  function buildGauntletPatchedRoom(
    r: RoomState,
    phase: GauntletPhase,
    retryPuzzles: GauntletRetryPuzzles
  ): RoomState | null {
    if (!r.gauntletPuzzles) return null;

    const phaseToType: Record<GauntletPhase, PuzzleType> = {
      'star-battle': 'star-battle',
      wordle: 'wordle',
      connections: 'connections',
    };

    // Use retry puzzle if available, otherwise the shared gauntlet puzzle
    const phasePuzzle =
      phase === 'star-battle' ? r.gauntletPuzzles.starBattle :
      phase === 'wordle'      ? (retryPuzzles.wordle ?? r.gauntletPuzzles.wordle) :
                                (retryPuzzles.connections ?? r.gauntletPuzzles.connections);

    // Extract phase-specific player states from GauntletPlayerState
    const patchedPlayerStates: RoomState['playerStates'] = {};
    for (const [uid, state] of Object.entries(r.playerStates)) {
      const gs = state as GauntletPlayerState;
      if (gs.phase !== undefined && gs.starBattleState !== undefined) {
        patchedPlayerStates[uid] =
          phase === 'star-battle' ? gs.starBattleState :
          phase === 'wordle'      ? gs.wordleState :
                                    gs.connectionsState;
      } else {
        patchedPlayerStates[uid] = state;
      }
    }

    return {
      ...r,
      puzzleType: phaseToType[phase],
      puzzle: phasePuzzle,
      playerStates: patchedPlayerStates,
    };
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (!room && !error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-gray-400">
          <div className="animate-spin text-4xl mb-3">⚡</div>
          <p>Loading room…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => navigate('/lobby')} className="btn-primary">Back to Lobby</button>
        </div>
      </div>
    );
  }

  if (results) {
    return (
      <ResultsScreen
        results={results}
        room={room!}
        userId={user!.id}
        onPlayAgain={handlePlayAgain}
        onLeave={handleLeave}
      />
    );
  }

  const myPlayer    = room ? room.players[user!.id] : null;
  const isSpectator = myPlayer?.isSpectator ?? true;
  const isGauntlet  = room?.gameMode === 'gauntlet';

  const activePhase = gauntletPhase && gauntletPhase !== 'done' ? gauntletPhase : null;
  const patchedRoom = (isGauntlet && room && activePhase)
    ? buildGauntletPatchedRoom(room, activePhase, gauntletRetryPuzzles)
    : null;

  const renderRoom = patchedRoom ?? room;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Countdown overlay */}
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-dark-900/90 flex items-center justify-center z-50"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="text-9xl font-extrabold text-brand-400"
            >
              {countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gauntlet phase transition overlay */}
      <AnimatePresence>
        {phaseTransition && (
          <motion.div
            key={phaseTransition}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-dark-900/95 flex flex-col items-center justify-center z-50 gap-4"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-7xl"
            >
              {PHASE_ICONS[phaseTransition]}
            </motion.div>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-bold text-white"
            >
              Next: {PHASE_LABELS[phaseTransition]}
            </motion.p>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-gray-400 text-sm"
            >
              Get ready…
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gauntlet retry overlay */}
      <AnimatePresence>
        {gauntletFailed && (
          <motion.div
            key="retry-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-dark-900/95 flex flex-col items-center justify-center z-50 gap-5"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-6xl"
            >
              💀
            </motion.div>
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-center space-y-1"
            >
              <p className="text-2xl font-bold text-white">
                {PHASE_ICONS[gauntletFailed.phase]} {PHASE_LABELS[gauntletFailed.phase]} failed
              </p>
              <p className="text-red-400 font-semibold text-lg">
                {formatPenalty(gauntletFailed.penaltyMs)} time penalty
              </p>
              {gauntletFailed.totalPenaltyMs > gauntletFailed.penaltyMs && (
                <p className="text-gray-500 text-sm">
                  Total penalty: {formatPenalty(gauntletFailed.totalPenaltyMs)}
                </p>
              )}
            </motion.div>
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-center space-y-2"
            >
              <p className="text-gray-400 text-sm">
                Attempt {gauntletFailed.attempt} — a new puzzle is waiting
              </p>
              <button
                onClick={() => handleRetryRequest(gauntletFailed.phase)}
                className="btn-primary px-8 py-3 text-base font-bold"
              >
                Try Again
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-6 flex-col lg:flex-row">
        <div className="flex-1 min-w-0">
          {room?.status === 'waiting' && (
            <RoomLobby room={room} userId={user!.id} socket={socket!} onLeave={handleLeave} onForceReset={handleForceReset} />
          )}

          {(room?.status === 'active' || room?.status === 'countdown') && renderRoom && (
            <>
              {isGauntlet && activePhase && (
                <div className="mb-4 flex items-center gap-3">
                  {(['star-battle', 'wordle', 'connections'] as GauntletPhase[]).map((ph, i) => {
                    const phaseOrder: GauntletPhase[] = ['star-battle', 'wordle', 'connections'];
                    const myPhaseIdx = phaseOrder.indexOf(activePhase);
                    const thisIdx = phaseOrder.indexOf(ph);
                    const isDone = gauntletPhase === 'done' || thisIdx < myPhaseIdx;
                    const isCurrent = ph === activePhase;
                    return (
                      <div key={ph} className="flex items-center gap-2">
                        {i > 0 && <span className="text-gray-600">→</span>}
                        <span className={`text-sm font-medium px-2 py-1 rounded ${
                          isCurrent ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40' :
                          isDone    ? 'text-gray-500 line-through' :
                                      'text-gray-600'
                        }`}>
                          {PHASE_ICONS[ph]} {PHASE_LABELS[ph]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {renderRoom.puzzleType === 'wordle' && renderRoom.puzzle && (
                <WordleGame key={`wordle-${retryKey}`} room={renderRoom} userId={user!.id} socket={socket!} isSpectator={isSpectator} />
              )}
              {renderRoom.puzzleType === 'star-battle' && renderRoom.puzzle && (
                <StarBattleGame room={renderRoom} userId={user!.id} socket={socket!} isSpectator={isSpectator} />
              )}
              {renderRoom.puzzleType === 'connections' && renderRoom.puzzle && (
                <ConnectionsGame key={`connections-${retryKey}`} room={renderRoom} userId={user!.id} socket={socket!} isSpectator={isSpectator} />
              )}
            </>
          )}
        </div>

        {room && (room.status === 'active' || room.status === 'countdown' || room.status === 'finished') && (
          <LiveSidebar room={room} userId={user!.id} onLeave={handleLeave} onForceReset={handleForceReset} />
        )}
      </div>
    </div>
  );
}
