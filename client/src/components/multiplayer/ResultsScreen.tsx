import { useState } from 'react';
import { motion } from 'framer-motion';
import type { GameResult, RoomState, PuzzleType, Difficulty, GauntletPhase } from '../../types';

interface Props {
  results: GameResult[];
  room: RoomState;
  userId: string;
  onPlayAgain: (puzzleType: PuzzleType, difficulty: Difficulty) => void;
  onLeave: () => void;
}

const MEDALS = ['🥇', '🥈', '🥉'];
const PUZZLE_ICONS: Record<string, string> = { wordle: '🔤', 'star-battle': '⭐', connections: '🔗' };
const PUZZLE_OPTIONS: { type: PuzzleType; label: string }[] = [
  { type: 'wordle',      label: 'Wordle' },
  { type: 'star-battle', label: 'Star Battle' },
  { type: 'connections', label: 'Connections' },
];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const GAUNTLET_PHASES: GauntletPhase[] = ['star-battle', 'wordle', 'connections'];
const PHASE_LABELS: Record<GauntletPhase, string> = {
  'star-battle': 'Star Battle',
  wordle: 'Wordle',
  connections: 'Connections',
};

function formatTime(ms?: number): string {
  if (!ms) return 'DNF';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export default function ResultsScreen({ results, room, userId, onPlayAgain, onLeave }: Props) {
  const winner = results[0];
  const isHost = room.hostId === userId;
  const isGauntlet = room.gameMode === 'gauntlet';

  const [showNewGame, setShowNewGame] = useState(false);
  const [newPuzzle,   setNewPuzzle]   = useState<PuzzleType>(room.puzzleType);
  const [newDiff,     setNewDiff]     = useState<Difficulty>(room.difficulty);

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', duration: 0.6 }}
      >
        {/* Winner banner */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">{isGauntlet ? '⚡' : '🏆'}</div>
          <h1 className="text-3xl font-extrabold mb-1">{winner?.username} wins!</h1>
          <p className="text-gray-400">
            {isGauntlet
              ? `Puzzle Gauntlet · ${room.difficulty}`
              : `${PUZZLE_ICONS[room.puzzleType]} ${room.puzzleType.replace('-', ' ')} · ${room.difficulty}`}
          </p>
          {isGauntlet && (
            <p className="text-xs text-yellow-400/70 mt-1">⭐ Star Battle → 🔤 Wordle → 🔗 Connections</p>
          )}
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
                className={`p-3 rounded-xl ${
                  i === 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-dark-700'
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-2xl w-8 text-center">{MEDALS[i] ?? `${i + 1}`}</span>
                  <div className="flex-1">
                    <div className="font-semibold">{r.username}</div>
                    <div className="text-sm text-gray-400">
                      {r.finishTime ? `Finished in ${formatTime(r.finishTime)}` : 'Did not finish'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono text-brand-400">{formatTime(r.finishTime)}</div>
                    {!isGauntlet && (
                      <div className="text-xs text-gray-500">{r.progress}% complete</div>
                    )}
                  </div>
                </div>

                {/* Gauntlet: per-puzzle time breakdown + retries/penalty */}
                {isGauntlet && r.gauntletPhaseTimes && (
                  <div className="mt-2 ml-10 space-y-1">
                    <div className="flex gap-3">
                      {GAUNTLET_PHASES.map(ph => {
                        const t = r.gauntletPhaseTimes?.[ph];
                        const retries = r.gauntletRetries?.[ph] ?? 0;
                        return (
                          <div key={ph} className="text-xs text-gray-500">
                            <span className="mr-1">{PUZZLE_ICONS[ph]}</span>
                            <span className="font-mono">{t ? formatTime(t) : '—'}</span>
                            {retries > 0 && (
                              <span className="ml-1 text-red-400">
                                ({retries}× retry)
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {(r.gauntletPenaltyMs ?? 0) > 0 && (
                      <div className="text-xs text-red-400/80">
                        +{Math.round((r.gauntletPenaltyMs ?? 0) / 1000)}s total penalty
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* New-game picker — host only, shown when "New Game" is clicked */}
        {isHost && showNewGame && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="card mb-4 space-y-4"
          >
            <h3 className="font-semibold text-gray-200">Choose next game</h3>

            {!isGauntlet && (
              <div>
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Puzzle</p>
                <div className="flex gap-2">
                  {PUZZLE_OPTIONS.map(p => (
                    <button
                      key={p.type}
                      onClick={() => setNewPuzzle(p.type)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                        newPuzzle === p.type
                          ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                          : 'border-dark-500 bg-dark-700 text-gray-400 hover:border-dark-400'
                      }`}
                    >
                      {PUZZLE_ICONS[p.type]} {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Difficulty</p>
              <div className="flex gap-2">
                {DIFFICULTIES.map(d => (
                  <button
                    key={d}
                    onClick={() => setNewDiff(d)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize border transition-all ${
                      newDiff === d
                        ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                        : 'border-dark-500 bg-dark-700 text-gray-400 hover:border-dark-400'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowNewGame(false); onPlayAgain(newPuzzle, newDiff); }}
                className="btn-primary flex-1"
              >
                Start
              </button>
              <button onClick={() => setShowNewGame(false)} className="btn-ghost px-4">
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {/* Action row */}
        <div className="flex gap-3 items-center">
          <button onClick={onLeave} className="btn-secondary flex-1">Back to Lobby</button>

          {isHost && !showNewGame && (
            <>
              <button
                onClick={() => onPlayAgain(room.puzzleType, room.difficulty)}
                className="btn-primary flex-1"
              >
                Play Again
              </button>
              <button
                onClick={() => setShowNewGame(true)}
                className="btn-ghost px-4"
                title="Choose a different puzzle or difficulty"
              >
                New Game
              </button>
            </>
          )}

          {!isHost && (
            <p className="flex-1 text-center text-sm text-gray-500">
              Waiting for host to start next round…
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
