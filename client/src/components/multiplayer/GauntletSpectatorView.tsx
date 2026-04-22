import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  RoomState, PuzzleType, GauntletPhase, GauntletPlayerState,
} from '../../types';
import WordleGame from '../puzzles/Wordle/WordleGame';
import StarBattleGame from '../puzzles/StarBattle/StarBattleGame';
import ConnectionsGame from '../puzzles/Connections/ConnectionsGame';

interface Props {
  room: RoomState;
  userId: string;   // the finished player (the watcher)
  socket: Socket;
  onLeave: () => void;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const PHASE_ICONS: Record<GauntletPhase, string> = {
  'star-battle': '⭐',
  wordle: '🔤',
  connections: '🔗',
};

const PHASE_LABELS: Record<GauntletPhase, string> = {
  'star-battle': 'Star Battle',
  wordle: 'Wordle',
  connections: 'Connections',
};

// Build a patched room focused on a single watched player's current phase,
// so we can pass it to the existing puzzle components in spectator mode.
function buildWatchedRoom(room: RoomState, watchedUserId: string): RoomState | null {
  if (!room.gauntletPuzzles) return null;

  const watchedPlayer = room.players[watchedUserId];
  if (!watchedPlayer) return null;

  const phase = watchedPlayer.gauntletPhase;
  if (!phase || phase === 'done') return null;

  const phaseToType: Record<GauntletPhase, PuzzleType> = {
    'star-battle': 'star-battle',
    wordle: 'wordle',
    connections: 'connections',
  };

  const phasePuzzle =
    phase === 'star-battle' ? room.gauntletPuzzles.starBattle :
    phase === 'wordle'      ? room.gauntletPuzzles.wordle :
                              room.gauntletPuzzles.connections;

  const gs = room.playerStates[watchedUserId] as GauntletPlayerState | undefined;
  if (!gs || gs.phase !== phase) return null;

  const phaseState =
    phase === 'star-battle' ? gs.starBattleState :
    phase === 'wordle'      ? gs.wordleState :
                              gs.connectionsState;

  return {
    ...room,
    puzzleType: phaseToType[phase],
    puzzle: phasePuzzle,
    // Only include the watched player's state so the component renders their view
    playerStates: { [watchedUserId]: phaseState },
  };
}

export default function GauntletSpectatorView({ room, userId, socket, onLeave }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!room.startTime) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - (room.startTime ?? Date.now()));
    }, 500);
    return () => clearInterval(interval);
  }, [room.startTime]);

  const activePlayers = Object.values(room.players).filter(
    p => !p.isSpectator && p.status !== 'finished'
  );
  const finishedPlayers = Object.values(room.players)
    .filter(p => !p.isSpectator && p.status === 'finished')
    .sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity));
  const allNonSpectators = Object.values(room.players)
    .filter(p => !p.isSpectator)
    .sort((a, b) => {
      if (a.status === 'finished' && b.status !== 'finished') return -1;
      if (b.status === 'finished' && a.status !== 'finished') return 1;
      return b.progress - a.progress;
    });

  // Default to watching the first active player (or re-select when they finish)
  const [watchedUserId, setWatchedUserId] = useState<string>(
    activePlayers[0]?.userId ?? ''
  );

  // If the currently watched player just finished, switch to the next active one
  useEffect(() => {
    const watched = room.players[watchedUserId];
    if (watched?.status === 'finished' && activePlayers.length > 0) {
      setWatchedUserId(activePlayers[0].userId);
    }
  }, [room.players, watchedUserId, activePlayers]);

  const watchedRoom = watchedUserId ? buildWatchedRoom(room, watchedUserId) : null;
  const watchedPlayer = room.players[watchedUserId];
  const watchedPhase = watchedPlayer?.gauntletPhase;

  const MEDALS = ['🥇', '🥈', '🥉'];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex items-center justify-between"
      >
        <div>
          <h2 className="text-xl font-bold text-green-400">You finished! 🎉</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Watching {activePlayers.length} player{activePlayers.length !== 1 ? 's' : ''} still going…
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-mono text-lg font-bold text-brand-400">{formatElapsed(elapsed)}</div>
            <div className="text-xs text-gray-500">Total time</div>
          </div>
          <button onClick={onLeave} className="btn-ghost text-sm text-red-400 hover:text-red-300">
            Leave
          </button>
        </div>
      </motion.div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Main board — watched player's puzzle */}
        <div className="flex-1 min-w-0">
          {/* Player tabs */}
          {activePlayers.length > 0 && (
            <div className="flex gap-2 mb-5 flex-wrap">
              {activePlayers.map(p => (
                <button
                  key={p.userId}
                  onClick={() => setWatchedUserId(p.userId)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    p.userId === watchedUserId
                      ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                      : 'border-dark-500 bg-dark-700 text-gray-300 hover:border-dark-400'
                  }`}
                >
                  <span>
                    {p.gauntletPhase && p.gauntletPhase !== 'done'
                      ? PHASE_ICONS[p.gauntletPhase]
                      : '⏳'}
                  </span>
                  <span>{p.username}</span>
                  {p.gauntletPhase && p.gauntletPhase !== 'done' && (
                    <span className="text-xs text-gray-500">
                      {PHASE_LABELS[p.gauntletPhase]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Puzzle board */}
          <AnimatePresence mode="wait">
            {watchedRoom && watchedPlayer && watchedPhase && watchedPhase !== 'done' ? (
              <motion.div
                key={`${watchedUserId}-${watchedPhase}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-3 flex items-center gap-2 text-sm text-gray-400">
                  <span>Watching</span>
                  <span className="font-semibold text-white">{watchedPlayer.username}</span>
                  <span>·</span>
                  <span>{PHASE_ICONS[watchedPhase]} {PHASE_LABELS[watchedPhase]}</span>
                  <span className="text-gray-600">·</span>
                  <span>{watchedPlayer.progress}% complete</span>
                </div>

                {watchedRoom.puzzleType === 'wordle' && watchedRoom.puzzle && (
                  <WordleGame
                    room={watchedRoom}
                    userId={watchedUserId}
                    socket={socket}
                    isSpectator={true}
                  />
                )}
                {watchedRoom.puzzleType === 'star-battle' && watchedRoom.puzzle && (
                  <StarBattleGame
                    room={watchedRoom}
                    userId={watchedUserId}
                    socket={socket}
                    isSpectator={true}
                  />
                )}
                {watchedRoom.puzzleType === 'connections' && watchedRoom.puzzle && (
                  <ConnectionsGame
                    room={watchedRoom}
                    userId={watchedUserId}
                    socket={socket}
                    isSpectator={true}
                  />
                )}
              </motion.div>
            ) : activePlayers.length === 0 ? (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center min-h-[40vh]"
              >
                <div className="text-center text-gray-400">
                  <div className="text-4xl mb-3 animate-pulse">⏳</div>
                  <p>Waiting for results…</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="select"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center min-h-[40vh] text-gray-500"
              >
                <p>Select a player above to watch</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar — live leaderboard */}
        <div className="lg:w-72 shrink-0">
          <div className="card sticky top-20 space-y-4">
            <h3 className="font-semibold text-gray-300">Leaderboard</h3>

            {/* Finished */}
            {finishedPlayers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Finished</p>
                {finishedPlayers.map((p, i) => (
                  <div key={p.userId} className="flex items-center gap-2">
                    <span className="text-lg w-6 text-center shrink-0">
                      {MEDALS[i] ?? `${i + 1}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${p.userId === userId ? 'text-brand-300' : ''}`}>
                        {p.username}{p.userId === userId ? ' (you)' : ''}
                      </div>
                      {p.gauntletPenaltyMs != null && p.gauntletPenaltyMs > 0 && (
                        <div className="text-xs text-red-400/70">
                          +{Math.round(p.gauntletPenaltyMs / 1000)}s penalty
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-mono text-green-400 shrink-0">
                      {p.finishTime != null ? formatTime(p.finishTime) : '✓'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {finishedPlayers.length > 0 && activePlayers.length > 0 && (
              <div className="border-t border-dark-600" />
            )}

            {/* Still playing */}
            {activePlayers.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Still going</p>
                {allNonSpectators
                  .filter(p => p.status !== 'finished')
                  .map(p => (
                    <button
                      key={p.userId}
                      onClick={() => setWatchedUserId(p.userId)}
                      className={`w-full text-left transition-all rounded-lg p-1.5 ${
                        p.userId === watchedUserId
                          ? 'ring-1 ring-brand-500 bg-brand-500/5'
                          : 'hover:bg-dark-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base w-5 shrink-0">
                          {p.gauntletPhase && p.gauntletPhase !== 'done'
                            ? PHASE_ICONS[p.gauntletPhase]
                            : '⏳'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate">{p.username}</span>
                            <span className="text-xs text-gray-500 ml-1">{p.progress}%</span>
                          </div>
                          {p.gauntletPhase && p.gauntletPhase !== 'done' && (
                            <div className="text-xs text-gray-500">
                              {PHASE_LABELS[p.gauntletPhase]}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="ml-7 h-1.5 bg-dark-600 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full transition-all duration-500"
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
