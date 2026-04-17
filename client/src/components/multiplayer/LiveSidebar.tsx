import { useEffect, useState } from 'react';
import type { RoomState } from '../../types';

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

export default function LiveSidebar({ room, userId, onLeave, onForceReset }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!room.startTime) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - (room.startTime ?? Date.now()));
    }, 500);
    return () => clearInterval(interval);
  }, [room.startTime]);

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
          <div className="text-xs text-gray-500 mt-0.5">Elapsed</div>
        </div>

        <div className="border-t border-dark-600" />

        {/* Player progress */}
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Players</h3>
          <div className="space-y-3">
            {players.map((player, idx) => (
              <div key={player.userId} className={`${player.userId === userId ? 'ring-1 ring-brand-500 rounded-lg' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500 w-4 shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium truncate ${player.userId === userId ? 'text-brand-300' : ''}`}>
                        {player.username}
                        {player.userId === userId && ' (you)'}
                      </span>
                      <span className="text-xs text-gray-500 shrink-0 ml-1">
                        {player.status === 'finished'
                          ? player.finishTime != null ? `✓ ${formatTime(player.finishTime)}` : '✓'
                          : `${player.progress}%`}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="ml-6 h-1.5 bg-dark-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      player.status === 'finished' ? 'bg-green-400' : 'bg-brand-500'
                    }`}
                    style={{ width: `${player.progress}%` }}
                  />
                </div>
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
