import { motion } from 'framer-motion';
import type { GameResult, RoomState } from '../../types';

interface Props {
  results: GameResult[];
  room: RoomState;
  onLeave: () => void;
}

const MEDALS = ['🥇', '🥈', '🥉'];
const PUZZLE_ICONS: Record<string, string> = { wordle: '🔤', 'star-battle': '⭐', connections: '🔗' };

function formatTime(ms?: number): string {
  if (!ms) return 'DNF';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export default function ResultsScreen({ results, room, onLeave }: Props) {
  const winner = results[0];

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', duration: 0.6 }}
      >
        {/* Winner banner */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🏆</div>
          <h1 className="text-3xl font-extrabold mb-1">
            {winner?.username} wins!
          </h1>
          <p className="text-gray-400">
            {PUZZLE_ICONS[room.puzzleType]} {room.puzzleType.replace('-', ' ')} · {room.difficulty}
          </p>
        </div>

        {/* Leaderboard */}
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-300 mb-4">Final Results</h2>
          <div className="space-y-3">
            {results.map((r, i) => (
              <motion.div
                key={r.userId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`flex items-center gap-4 p-3 rounded-xl ${
                  i === 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-dark-700'
                }`}
              >
                <span className="text-2xl w-8 text-center">
                  {MEDALS[i] ?? `${i + 1}`}
                </span>
                <div className="flex-1">
                  <div className="font-semibold">{r.username}</div>
                  <div className="text-sm text-gray-400">
                    {r.finishTime ? `Finished in ${formatTime(r.finishTime)}` : 'Did not finish'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono text-brand-400">{formatTime(r.finishTime)}</div>
                  <div className="text-xs text-gray-500">{r.progress}% complete</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onLeave} className="btn-secondary flex-1">Back to Lobby</button>
        </div>
      </motion.div>
    </div>
  );
}
