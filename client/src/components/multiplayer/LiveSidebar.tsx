import { useEffect, useState } from 'react';
import type { RoomState, GauntletPhase } from '../../types';

interface Props {
  room: RoomState;
  userId: string;
  onLeave: () => void;
  onForceReset?: () => void;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const GAUNTLET_PHASES: GauntletPhase[] = ['star-battle', 'wordle', 'connections'];

const PHASE_ICONS: Record<GauntletPhase, string> = {
  'star-battle': '⭐',
  wordle: '🔤',
  connections: '🔗',
};

function GauntletPhaseIndicator({ phase }: { phase: GauntletPhase | 'done' | undefined }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      {GAUNTLET_PHASES.map((ph, i) => {
        const phaseOrder: GauntletPhase[] = ['star-battle', 'wordle', 'connections'];
        const currentIdx = phase && phase !== 'done' ? phaseOrder.indexOf(phase) : 3;
        const thisIdx = phaseOrder.indexOf(ph);
        const isDone = phase === 'done' || thisIdx < currentIdx;
        const isCurrent = ph === phase;
        return (
          <span key={ph} className={`transition-all ${
            isCurrent ? 'opacity-100' :
            isDone    ? 'opacity-40' :
                        'opacity-20'
          }`}>
            {i > 0 && <span className="text-gray-600 mx-0.5">›</span>}
            {PHASE_ICONS[ph]}
          </span>
        );
      })}
      {phase === 'done' && <span className="text-green-400 ml-1">✓</span>}
    </div>
  );
}

export default function LiveSidebar({ room, userId, onLeave, onForceReset }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!room.startTime) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - (room.startTime ?? Date.now()));
    }, 500);
    return () => clearInterval(interval);
  }, [room.startTime]);

  const isGauntlet = room.gameMode === 'gauntlet';

  // In Star Battle (classic or gauntlet phase), hide the local player's own
  // progress — they can see their board directly and it spoils nothing about
  // opponents.
  const isStarBattleActive =
    (room.puzzleType === 'star-battle' && !isGauntlet) ||
    (isGauntlet && Object.values(room.players).find(p => p.userId === userId)?.gauntletPhase === 'star-battle');

  const players = Object.values(room.players)
    .filter(p => !p.isSpectator)
    .sort((a, b) => {
      if (a.status === 'finished' && b.status !== 'finished') return -1;
      if (b.status === 'finished' && a.status !== 'finished') return 1;
      return b.progress - a.progress;
    });

  const spectators = Object.values(room.players).filter(p => p.isSpectator);

  return (
    <div className="lg:w-72 shrink-0">
      <div className="card sticky top-20 space-y-4">
        {/* Timer */}
        <div className="text-center">
          <div className="text-3xl font-mono font-bold text-brand-400">{formatTime(elapsed)}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {isGauntlet ? 'Total time' : 'Elapsed'}
          </div>
        </div>

        {isGauntlet && (
          <div className="text-center">
            <p className="text-xs text-yellow-400/80 font-medium">⚡ Puzzle Gauntlet</p>
          </div>
        )}

        <div className="border-t border-dark-600" />

        {/* Player progress */}
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Players</h3>
          <div className="space-y-3">
            {players.map((player, idx) => (
              <div key={player.userId} className={`${player.userId === userId ? 'ring-1 ring-brand-500 rounded-lg p-1' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500 w-4 shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium truncate ${player.userId === userId ? 'text-brand-300' : ''}`}>
                        {player.username}
                        {player.userId === userId && ' (you)'}
                      </span>
                      {/* Hide own progress in Star Battle — player can see their own board */}
                      {!(isStarBattleActive && player.userId === userId && player.status !== 'finished') && (
                        <span className="text-xs text-gray-500 shrink-0 ml-1">
                          {player.status === 'finished'
                            ? player.finishTime != null ? `✓ ${formatTime(player.finishTime)}` : '✓'
                            : `${player.progress}%`}
                        </span>
                      )}
                    </div>
                    {isGauntlet && (
                      <div className="mt-0.5">
                        <GauntletPhaseIndicator phase={player.gauntletPhase} />
                      </div>
                    )}
                  </div>
                </div>
                {/* Progress bar — hidden for own row in Star Battle */}
                {!(isStarBattleActive && player.userId === userId && player.status !== 'finished') && (
                <div className="ml-6 h-1.5 bg-dark-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      player.status === 'finished' ? 'bg-green-400' : 'bg-brand-500'
                    }`}
                    style={{ width: `${player.progress}%` }}
                  />
                </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {spectators.length > 0 && (
          <>
            <div className="border-t border-dark-600" />
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-2">Watching</h3>
              <div className="space-y-1">
                {spectators.map(s => (
                  <div key={s.userId} className="text-xs text-gray-500 flex items-center gap-1">
                    <span>👁️</span> {s.username}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="border-t border-dark-600 pt-2 space-y-1">
          {onForceReset && room.hostId === userId && (
            <button
              onClick={onForceReset}
              className="btn-ghost w-full text-sm text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
            >
              Reset Room
            </button>
          )}
          <button onClick={onLeave} className="btn-ghost w-full text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10">
            Leave Game
          </button>
        </div>
      </div>
    </div>
  );
}
