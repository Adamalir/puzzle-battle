import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import type { RoomState, ConnectionsPlayerState, ConnectionsPuzzle, ConnectionsCategory } from '../../../types';

interface Props {
  room: RoomState;
  userId: string;
  socket: Socket;
  isSpectator: boolean;
}

const COLOR_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  yellow: { bg: 'bg-connections-yellow',  text: 'text-dark-900', border: 'border-yellow-400' },
  green:  { bg: 'bg-connections-green',   text: 'text-white',    border: 'border-green-600' },
  blue:   { bg: 'bg-connections-blue',    text: 'text-white',    border: 'border-blue-600'  },
  purple: { bg: 'bg-connections-purple',  text: 'text-white',    border: 'border-purple-600' },
};

const DIFF_LABEL: Record<string, string> = {
  yellow: 'Straightforward',
  green:  'Moderate',
  blue:   'Tricky',
  purple: 'Expert',
};

export default function ConnectionsGame({ room, userId, socket, isSpectator }: Props) {
  const puzzle = room.puzzle as ConnectionsPuzzle | null;
  const myState = room.playerStates[userId] as ConnectionsPlayerState | undefined;

  const [selected, setSelected] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wrongFlash, setWrongFlash] = useState(false);

  const solvedLabels = myState?.solvedCategories ?? [];
  const mistakes = myState?.mistakes ?? 0;
  const gameSolved = myState?.solved ?? false;

  const solvedCategories: ConnectionsCategory[] = (puzzle?.categories ?? [])
    .filter(c => solvedLabels.includes(c.label));
  const remainingWords: string[] = puzzle
    ? puzzle.shuffledWords.filter(w =>
        !solvedCategories.some(c => c.words.includes(w))
      )
    : [];

  useEffect(() => {
    const handleCorrect = ({ category }: { category: ConnectionsCategory; state: ConnectionsPlayerState }) => {
      setSelected([]);
      setMessage(`✓ ${category.label}!`);
      setTimeout(() => setMessage(null), 2000);
    };
    const handleWrong = () => {
      setShake(true);
      setWrongFlash(true);
      setMessage('Not quite — try again!');
      setTimeout(() => { setShake(false); setWrongFlash(false); }, 600);
      setTimeout(() => setMessage(null), 1800);
    };
    socket.on('connections:correct', handleCorrect);
    socket.on('connections:wrong', handleWrong);
    return () => {
      socket.off('connections:correct', handleCorrect);
      socket.off('connections:wrong', handleWrong);
    };
  }, [socket]);

  const toggleWord = (word: string) => {
    if (isSpectator || gameSolved) return;
    setSelected(prev =>
      prev.includes(word)
        ? prev.filter(w => w !== word)
        : prev.length < 4 ? [...prev, word] : prev
    );
  };

  const handleSubmit = () => {
    if (selected.length !== 4 || isSpectator || gameSolved) return;
    socket.emit('connections:submit', { roomCode: room.code, userId, words: selected });
  };

  const handleDeselect = () => setSelected([]);

  if (!puzzle) return null;

  return (
    <div className="flex flex-col items-center gap-5 max-w-lg mx-auto">
      <div className="text-center">
        <h2 className="text-xl font-bold">Connections</h2>
        <p className="text-sm text-gray-400 mt-1">Find groups of 4 words that share something in common</p>
      </div>

      {/* Solved categories */}
      <div className="w-full space-y-2">
        {solvedCategories.map(cat => {
          const style = COLOR_STYLES[cat.color];
          return (
            <motion.div
              key={cat.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={clsx('rounded-xl p-3 text-center border', style.bg, style.text, style.border)}
            >
              <div className="font-bold text-sm uppercase tracking-wider mb-1">{cat.label}</div>
              <div className="text-sm opacity-90">{cat.words.join(', ')}</div>
            </motion.div>
          );
        })}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={clsx(
              'px-4 py-2 rounded-lg font-semibold text-sm',
              wrongFlash ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-green-500/20 text-green-300 border border-green-500/30'
            )}
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Word grid */}
      <motion.div
        animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="w-full grid grid-cols-4 gap-2"
      >
        {remainingWords.map(word => {
          const isSelected = selected.includes(word);
          return (
            <motion.button
              key={word}
              whileTap={!isSpectator ? { scale: 0.93 } : {}}
              onClick={() => toggleWord(word)}
              disabled={isSpectator || gameSolved}
              className={clsx(
                'py-3 px-1 rounded-xl font-bold text-sm uppercase tracking-wide border-2 transition-all',
                isSelected
                  ? 'bg-dark-400 border-brand-400 text-white'
                  : 'bg-dark-700 border-dark-600 text-gray-200 hover:border-dark-400 hover:bg-dark-600',
                (isSpectator || gameSolved) ? 'cursor-default' : 'cursor-pointer'
              )}
            >
              {word}
            </motion.button>
          );
        })}
      </motion.div>

      {/* Controls */}
      {!isSpectator && !gameSolved && (
        <div className="flex gap-3">
          <button onClick={handleDeselect} disabled={selected.length === 0} className="btn-secondary text-sm px-5">
            Deselect All
          </button>
          <button
            onClick={handleSubmit}
            disabled={selected.length !== 4}
            className="btn-primary text-sm px-5"
          >
            Submit ({selected.length}/4)
          </button>
        </div>
      )}

      {/* Mistakes */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span>Mistakes:</span>
        <div className="flex gap-1">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={clsx('w-3 h-3 rounded-full', i < mistakes ? 'bg-red-500' : 'bg-dark-500')} />
          ))}
        </div>
      </div>

      {gameSolved && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="px-6 py-3 rounded-xl font-bold text-lg bg-green-500/20 text-green-300 border border-green-500/30"
        >
          🎉 Solved! Waiting for others…
        </motion.div>
      )}
    </div>
  );
}
