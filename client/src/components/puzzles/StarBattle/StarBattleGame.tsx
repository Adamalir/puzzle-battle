import { useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { RoomState, StarBattlePlayerState, StarBattlePuzzle } from '../../../types';

interface Props {
  room: RoomState;
  userId: string;
  socket: Socket;
  isSpectator: boolean;
}

// 14 distinct region colors — enough for a 14×14 hard grid
const REGION_COLORS = [
  'bg-blue-900/60',
  'bg-purple-900/60',
  'bg-green-900/60',
  'bg-yellow-900/60',
  'bg-red-900/60',
  'bg-cyan-900/60',
  'bg-pink-900/60',
  'bg-orange-900/60',
  'bg-teal-900/60',
  'bg-indigo-900/60',
  'bg-rose-900/60',
  'bg-amber-900/60',
  'bg-lime-900/60',
  'bg-violet-900/60',
];

const REGION_BORDERS = [
  'border-blue-600/50',
  'border-purple-600/50',
  'border-green-600/50',
  'border-yellow-600/50',
  'border-red-600/50',
  'border-cyan-600/50',
  'border-pink-600/50',
  'border-orange-600/50',
  'border-teal-600/50',
  'border-indigo-600/50',
  'border-rose-600/50',
  'border-amber-600/50',
  'border-lime-600/50',
  'border-violet-600/50',
];

export default function StarBattleGame({ room, userId, socket, isSpectator }: Props) {
  const puzzle  = room.puzzle as StarBattlePuzzle | null;
  const myState = room.playerStates[userId] as StarBattlePlayerState | undefined;

  const grid   = myState?.grid  ?? [];
  const solved = myState?.solved ?? false;

  useEffect(() => {
    // State arrives via room:updated broadcasts; no extra action needed here
    socket.on('starbattle:state', () => {});
    return () => { socket.off('starbattle:state'); };
  }, [socket]);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (isSpectator || solved || !puzzle) return;
    if (puzzle.hints?.[row]?.[col]) return; // hint cells are locked

    const current = grid[row]?.[col] ?? 0;
    // Cycle: empty(0) → dot(2) → star(1) → empty(0)
    const CYCLE: Record<number, number> = { 0: 2, 2: 1, 1: 0 };
    const next = CYCLE[current] ?? 0;
    socket.emit('starbattle:move', { roomCode: room.code, userId, row, col, value: next });
  }, [isSpectator, solved, puzzle, grid, socket, room.code, userId]);

  if (!puzzle) return null;

  const { size, starsPerUnit, regions } = puzzle;

  // Cell sizing scaled to difficulty: easy=8×8, medium=10×10, hard=14×14
  const cellSize =
    size <= 8  ? 'w-11 h-11 text-xl'  :
    size <= 10 ? 'w-9  h-9  text-base':
    size <= 12 ? 'w-8  h-8  text-sm'  :
                 'w-6  h-6  text-xs';

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-xl font-bold">Star Battle</h2>
        <p className="text-sm text-gray-400 mt-1">
          Place {starsPerUnit} star{starsPerUnit > 1 ? 's' : ''} per row, column &amp; region · No stars can touch
        </p>
        {puzzle.hints && (
          <p className="text-xs text-yellow-400/80 mt-0.5">
            Gold stars are pre-placed hints and cannot be moved
          </p>
        )}
      </div>

      <div className="flex gap-4 text-sm text-gray-400">
        <span>⭐ = star</span>
        <span>· = marked empty</span>
        <span className="text-gray-600">Click to cycle</span>
      </div>

      {/* Grid — overflow-x-auto so 14×14 doesn't overflow on small screens */}
      <div className="inline-block p-2 bg-dark-800 rounded-xl border border-dark-600 max-w-full overflow-x-auto">
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: size }, (_, r) =>
            Array.from({ length: size }, (_, c) => {
              const region       = regions[r]?.[c] ?? 0;
              const value        = grid[r]?.[c] ?? 0;
              const isHint       = puzzle.hints?.[r]?.[c] ?? false;
              const regionColor  = REGION_COLORS[region % REGION_COLORS.length];
              const regionBorder = REGION_BORDERS[region % REGION_BORDERS.length];

              return (
                <motion.button
                  key={`${r}-${c}`}
                  whileTap={!isSpectator && !solved && !isHint ? { scale: 0.88 } : {}}
                  onClick={() => handleCellClick(r, c)}
                  disabled={isSpectator || solved || isHint}
                  className={clsx(
                    cellSize,
                    'border rounded flex items-center justify-center font-bold transition-all select-none',
                    regionColor,
                    regionBorder,
                    isHint
                      ? 'cursor-default ring-2 ring-yellow-400/80 brightness-125'
                      : !isSpectator && !solved
                        ? 'cursor-pointer hover:brightness-125'
                        : 'cursor-default',
                    value === 1 && !isHint && 'ring-2 ring-yellow-400/60'
                  )}
                >
                  {value === 1
                    ? '⭐'
                    : value === 2
                      ? <span className="text-gray-500 leading-none">·</span>
                      : null}
                </motion.button>
              );
            })
          )}
        </div>
      </div>

      {!isSpectator && !solved && (
        <div className="text-xs text-gray-500 text-center">
          Click once for · (mark empty) · Click again for ⭐ · Click again to clear
        </div>
      )}

      {solved && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="px-6 py-3 rounded-xl font-bold text-lg bg-green-500/20 text-green-300 border border-green-500/30"
        >
          ⭐ Solved! Waiting for others…
        </motion.div>
      )}

      {isSpectator && <p className="text-sm text-gray-500">Spectating</p>}
    </div>
  );
}
