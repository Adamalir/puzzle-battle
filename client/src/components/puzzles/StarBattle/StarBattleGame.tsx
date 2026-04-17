import React, { useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import type { RoomState, StarBattlePlayerState, StarBattlePuzzle } from '../../../types';

interface Props {
  room: RoomState;
  userId: string;
  socket: Socket;
  isSpectator: boolean;
}

// ── Pastel region colors ───────────────────────────────────────────────────────
// Light enough that dark stars/dots are clearly visible on top.
const REGION_BG = [
  '#BFDBFE', // blue-200
  '#E9D5FF', // purple-200
  '#BBF7D0', // green-200
  '#FEF08A', // yellow-200
  '#FECACA', // red-200
  '#A5F3FC', // cyan-200
  '#FBCFE8', // pink-200
  '#FED7AA', // orange-200
  '#99F6E4', // teal-200
  '#C7D2FE', // indigo-200
  '#FECDD3', // rose-200
  '#FDE68A', // amber-200
  '#D9F99D', // lime-200
  '#DDD6FE', // violet-200
];

/** Darken a hex colour by `factor` (0–1). */
function darken(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`;
}

// ── Border constants ──────────────────────────────────────────────────────────
const THICK = '3px solid rgba(15,15,15,0.82)'; // region boundary
const THIN  = '1px solid rgba(15,15,15,0.14)'; // same-region internal

/** Per-cell inline border style (right + bottom only; container handles outer). */
function cellBorders(r: number, c: number, size: number, regions: number[][]): React.CSSProperties {
  const reg = regions[r]?.[c] ?? 0;
  return {
    borderTop:    '0',
    borderLeft:   '0',
    borderRight:  c < size - 1 ? ((regions[r]?.[c + 1] ?? -1) !== reg ? THICK : THIN) : '0',
    borderBottom: r < size - 1 ? ((regions[r + 1]?.[c] ?? -1) !== reg ? THICK : THIN) : '0',
  };
}

// ── Validation helpers ────────────────────────────────────────────────────────
interface ValidationState {
  overRows: Set<number>;
  overCols: Set<number>;
  overRegs: Set<number>;
  adjacent: Set<string>; // "r,c" keys of stars that touch another star
}

function validate(grid: number[][], size: number, k: number, regions: number[][]): ValidationState {
  const rowCounts = new Array(size).fill(0);
  const colCounts = new Array(size).fill(0);
  const regCounts = new Array(size).fill(0);
  const adjacent  = new Set<string>();

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if ((grid[r]?.[c] ?? 0) !== 1) continue;
      rowCounts[r]++;
      colCounts[c]++;
      regCounts[regions[r]?.[c] ?? 0]++;
      // Flag 8-directional neighbours
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size && (grid[nr]?.[nc] ?? 0) === 1) {
            adjacent.add(`${r},${c}`);
          }
        }
      }
    }
  }

  return {
    overRows: new Set(rowCounts.flatMap((v, i) => v > k ? [i] : [])),
    overCols: new Set(colCounts.flatMap((v, i) => v > k ? [i] : [])),
    overRegs: new Set(regCounts.flatMap((v, i) => v > k ? [i] : [])),
    adjacent,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function StarBattleGame({ room, userId, socket, isSpectator }: Props) {
  const puzzle  = room.puzzle as StarBattlePuzzle | null;
  const myState = room.playerStates[userId] as StarBattlePlayerState | undefined;
  const grid    = myState?.grid  ?? [];
  const solved  = myState?.solved ?? false;

  const handleCellClick = useCallback((row: number, col: number) => {
    if (isSpectator || solved || !puzzle) return;
    if (puzzle.hints?.[row]?.[col]) return;            // locked hint
    const current = grid[row]?.[col] ?? 0;
    const CYCLE: Record<number, number> = { 0: 2, 2: 1, 1: 0 };
    socket.emit('starbattle:move', {
      roomCode: room.code, userId, row, col,
      value: CYCLE[current] ?? 0,
    });
  }, [isSpectator, solved, puzzle, grid, socket, room.code, userId]);

  if (!puzzle) return null;

  const { size, starsPerUnit, regions } = puzzle;

  // Cell pixel size scaled to grid difficulty
  const cellPx = size <= 8 ? 52 : size <= 10 ? 44 : 32;
  const starFs = Math.round(cellPx * 0.52);
  const dotFs  = Math.round(cellPx * 0.44);

  // Validation (cheap — O(size²) = max 196 iterations)
  const v = validate(grid, size, starsPerUnit, regions);

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold">Star Battle</h2>
        <p className="text-sm text-gray-400 mt-1">
          Place {starsPerUnit} ★ per row, column &amp; region — stars cannot touch
        </p>
      </div>

      {/* Legend */}
      <div className="flex gap-5 text-sm text-gray-300">
        {[
          { symbol: '★', label: 'Star',     bg: '#BFDBFE', color: '#1F2937' },
          { symbol: '•', label: 'Excluded', bg: '#BFDBFE', color: '#6B7280' },
          { symbol: '',  label: 'Empty',    bg: '#BFDBFE', color: 'transparent' },
        ].map(({ symbol, label, bg, color }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              style={{
                width: 24, height: 24, background: bg,
                border: '1px solid rgba(0,0,0,0.25)',
                borderRadius: 3,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: symbol === '★' ? 14 : 18,
                fontWeight: 'bold',
                color,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {symbol}
            </span>
            <span className="text-xs text-gray-400">{label}</span>
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto max-w-full">
        <motion.div
          animate={solved ? { boxShadow: '0 0 0 4px #22c55e, 0 0 24px rgba(34,197,94,0.45)' } : { boxShadow: '0 0 0 3px rgba(15,15,15,0.82)' }}
          transition={{ duration: 0.4 }}
          style={{
            display: 'inline-grid',
            gridTemplateColumns: `repeat(${size}, ${cellPx}px)`,
            borderRadius: 4,
            overflow: 'hidden',
            // Outer border provided by the animated boxShadow above;
            // We use a real border so the grid edge cells have their outer wall.
            border: '3px solid rgba(15,15,15,0.82)',
          }}
        >
          {Array.from({ length: size }, (_, r) =>
            Array.from({ length: size }, (_, c) => {
              const reg    = regions[r]?.[c] ?? 0;
              const value  = grid[r]?.[c] ?? 0;
              const isHint = puzzle.hints?.[r]?.[c] ?? false;

              const isStar  = value === 1;
              const isDot   = value === 2;
              const isError = isStar && !isHint && (
                v.overRows.has(r) || v.overCols.has(c) ||
                v.overRegs.has(reg) || v.adjacent.has(`${r},${c}`)
              );

              const baseBg   = REGION_BG[reg % REGION_BG.length];
              const bgColor  = isError ? '#FCA5A5' : isHint ? darken(baseBg, 0.78) : baseBg;
              const starColor = isHint ? '#B45309' : isError ? '#991B1B' : '#1F2937';

              return (
                <motion.div
                  key={`${r}-${c}`}
                  whileTap={!isSpectator && !solved && !isHint ? { scale: 0.82 } : {}}
                  onClick={() => handleCellClick(r, c)}
                  style={{
                    width:           cellPx,
                    height:          cellPx,
                    backgroundColor: bgColor,
                    cursor:          isSpectator || solved || isHint ? 'default' : 'pointer',
                    display:         'flex',
                    alignItems:      'center',
                    justifyContent:  'center',
                    boxSizing:       'border-box',
                    userSelect:      'none',
                    transition:      'background-color 0.12s',
                    position:        'relative',
                    ...cellBorders(r, c, size, regions),
                  }}
                >
                  {/* Star */}
                  {isStar && (
                    <span
                      style={{
                        fontSize:   starFs,
                        lineHeight: 1,
                        color:      starColor,
                        fontWeight: 'bold',
                        ...(isHint && {
                          textShadow: '0 0 6px rgba(217,119,6,0.7)',
                        }),
                        ...(solved && {
                          textShadow: '0 0 8px rgba(34,197,94,0.8)',
                          color: '#166534',
                        }),
                      }}
                    >
                      ★
                    </span>
                  )}

                  {/* Lock badge on hint stars */}
                  {isHint && (
                    <span
                      style={{
                        position:   'absolute',
                        bottom:     2,
                        right:      3,
                        fontSize:   Math.round(cellPx * 0.22),
                        lineHeight: 1,
                        opacity:    0.7,
                        pointerEvents: 'none',
                      }}
                    >
                      🔒
                    </span>
                  )}

                  {/* Dot / exclusion marker */}
                  {isDot && (
                    <span
                      style={{
                        fontSize:   dotFs,
                        lineHeight: 1,
                        color:      'rgba(0,0,0,0.38)',
                        fontWeight: 'bold',
                      }}
                    >
                      •
                    </span>
                  )}

                  {/* Adjacency error indicator — small red corner dot */}
                  {isError && v.adjacent.has(`${r},${c}`) && (
                    <span
                      style={{
                        position:        'absolute',
                        top:             3,
                        right:           3,
                        width:           6,
                        height:          6,
                        borderRadius:    '50%',
                        backgroundColor: '#EF4444',
                      }}
                    />
                  )}
                </motion.div>
              );
            })
          )}
        </motion.div>
      </div>

      {/* Controls hint */}
      {!isSpectator && !solved && (
        <p className="text-xs text-gray-500 text-center">
          Click: empty → exclude (•) → star (★) → empty
        </p>
      )}

      {/* Success banner */}
      <AnimatePresence>
        {solved && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="px-6 py-3 rounded-xl font-bold text-lg bg-green-500/20 text-green-300 border border-green-500/40"
          >
            ★ Solved! Waiting for others…
          </motion.div>
        )}
      </AnimatePresence>

      {isSpectator && <p className="text-sm text-gray-500">Spectating</p>}
    </div>
  );
}
