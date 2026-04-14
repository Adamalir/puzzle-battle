import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import type { RoomState, WordlePlayerState, WordleGuess, LetterState } from '../../../types';

interface Props {
  room: RoomState;
  userId: string;
  socket: Socket;
  isSpectator: boolean;
}

const QWERTY = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
];

// How long each tile's flip takes and the stagger between tiles
const FLIP_MS = 500;
const STAGGER_MS = 350;

function getTileColor(state: LetterState): string {
  switch (state) {
    case 'correct': return 'bg-green-600 border-green-600 text-white';
    case 'present': return 'bg-yellow-500 border-yellow-500 text-white';
    case 'absent':  return 'bg-dark-500 border-dark-500 text-gray-400';
    default:        return 'bg-transparent border-dark-500 text-white';
  }
}

function getKeyColor(letter: string, guesses: WordleGuess[]): string {
  let rank = 0; // 0=none 1=absent 2=present 3=correct
  for (const guess of guesses) {
    for (let i = 0; i < guess.word.length; i++) {
      if (guess.word[i] === letter) {
        const s = guess.result[i];
        if (s === 'correct') { rank = 3; break; }
        if (s === 'present' && rank < 2) rank = 2;
        if (s === 'absent'  && rank < 1) rank = 1;
      }
    }
    if (rank === 3) break;
  }
  if (rank === 3) return 'bg-green-600 text-white';
  if (rank === 2) return 'bg-yellow-500 text-white';
  if (rank === 1) return 'bg-dark-500 text-gray-400';
  return 'bg-dark-600 text-white hover:bg-dark-500';
}

export default function WordleGame({ room, userId, socket, isSpectator }: Props) {
  const [currentGuess, setCurrentGuess] = useState('');
  const [shake, setShake] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // coloredKeys tracks which tiles have passed their flip midpoint and should show result colors.
  // Key format: "rowIndex-colIndex"
  const [coloredKeys, setColoredKeys] = useState<Set<string>>(new Set());
  // animatingRow is the row index currently running the flip animation (-1 = none)
  const [animatingRow, setAnimatingRow] = useState(-1);
  // gameOver banner is deferred until the flip animation on the last row finishes
  const [showGameOverBanner, setShowGameOverBanner] = useState(false);

  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const myState = room.playerStates[userId] as WordlePlayerState | undefined;
  const puzzle = room.puzzle as { wordLength: number; maxGuesses: number } | null;
  const maxGuesses = puzzle?.maxGuesses ?? 6;
  const guesses = myState?.guesses ?? [];
  const solved = myState?.solved ?? false;
  const failed = myState?.failed ?? false;
  const gameOver = solved || failed;

  // Pre-reveal any guesses that existed before this component mounted
  // (e.g. reconnecting mid-game) — show them instantly without animation
  useEffect(() => {
    if (guesses.length === 0) return;
    setColoredKeys(prev => {
      const next = new Set(prev);
      for (let r = 0; r < guesses.length; r++) {
        for (let c = 0; c < 5; c++) next.add(`${r}-${c}`);
      }
      return next;
    });
    if (gameOver) setShowGameOverBanner(true);
    // Only run once at mount — intentionally ignoring dep changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kick off the letter-by-letter flip reveal for a row
  const revealRow = useCallback((rowIndex: number, isLastGuess: boolean) => {
    // Clear any lingering timers
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];

    setAnimatingRow(rowIndex);

    for (let col = 0; col < 5; col++) {
      // Reveal color at the midpoint of each tile's flip
      const t = setTimeout(() => {
        setColoredKeys(prev => new Set([...prev, `${rowIndex}-${col}`]));
      }, col * STAGGER_MS + FLIP_MS / 2);
      timerRefs.current.push(t);
    }

    // After all tiles finish, clear animating state and show banner if game over
    const totalMs = 4 * STAGGER_MS + FLIP_MS + 100;
    const done = setTimeout(() => {
      setAnimatingRow(-1);
      if (isLastGuess) setShowGameOverBanner(true);
    }, totalMs);
    timerRefs.current.push(done);
  }, []);

  useEffect(() => {
    const handleResult = ({
      solved: s, failed: f, state,
    }: {
      guess: string; result: LetterState[]; solved: boolean; failed: boolean;
      state: WordlePlayerState;
    }) => {
      setCurrentGuess('');
      const rowIndex = state.guesses.length - 1;
      const isLastGuess = s || f;
      revealRow(rowIndex, isLastGuess);
      if (s) setMessage('Genius! 🎉');
    };

    const handleInvalid = ({ message: msg }: { message: string }) => {
      setMessage(msg);
      setShake(true);
      setTimeout(() => { setShake(false); setMessage(null); }, 1500);
    };

    socket.on('wordle:guess-result', handleResult);
    socket.on('wordle:invalid', handleInvalid);
    return () => {
      socket.off('wordle:guess-result', handleResult);
      socket.off('wordle:invalid', handleInvalid);
    };
  }, [socket, revealRow]);

  const handleKey = useCallback((key: string) => {
    if (gameOver || isSpectator) return;
    if (key === '⌫' || key === 'Backspace') {
      setCurrentGuess(g => g.slice(0, -1));
    } else if (key === 'ENTER' || key === 'Enter') {
      if (currentGuess.length < 5) {
        setMessage('Word must be 5 letters');
        setShake(true);
        setTimeout(() => { setShake(false); setMessage(null); }, 1500);
        return;
      }
      socket.emit('wordle:guess', { roomCode: room.code, userId, guess: currentGuess });
    } else if (/^[a-zA-Z]$/.test(key) && currentGuess.length < 5) {
      setCurrentGuess(g => g + key.toUpperCase());
    }
  }, [currentGuess, gameOver, isSpectator, socket, room.code, userId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (!e.ctrlKey && !e.metaKey) handleKey(e.key); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleKey]);

  // Build rows: past guesses + current input row + empty placeholder rows
  const rows: Array<{ word: string; result?: LetterState[]; isCurrent?: boolean }> = [
    ...guesses.map(g => ({ word: g.word, result: g.result })),
  ];
  if (!gameOver && guesses.length < maxGuesses) {
    rows.push({ word: currentGuess.padEnd(5, ' '), isCurrent: true });
  }
  while (rows.length < maxGuesses) {
    rows.push({ word: '     ' });
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-xl font-bold">Wordle</h2>
        {isSpectator && (
          <p className="text-sm text-gray-500 mt-1">
            Spectating — watching {Object.values(room.players).find(p => !p.isSpectator)?.username}
          </p>
        )}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="px-4 py-2 bg-white text-dark-900 font-semibold rounded-lg text-sm"
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid */}
      <motion.div
        className="grid gap-1.5"
        animate={shake ? { x: [0, -6, 6, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        {rows.map((row, r) => (
          <div key={r} className="flex gap-1.5">
            {Array.from(row.word).slice(0, 5).map((letter, c) => {
              const isFlippingRow = animatingRow === r;
              const hasColor = coloredKeys.has(`${r}-${c}`);
              const tileState: LetterState = row.result ? row.result[c] : 'empty';
              const filled = letter !== ' ';

              return (
                <div
                  key={c}
                  className={clsx(
                    'w-14 h-14 border-2 flex items-center justify-center text-2xl font-extrabold uppercase rounded',
                    // Color: show result only after the tile has passed its flip midpoint
                    hasColor && row.result
                      ? getTileColor(tileState)
                      : filled
                        ? 'border-gray-500 bg-transparent'
                        : 'border-dark-500 bg-transparent',
                    // Pop scale when a letter is typed into the current row
                    row.isCurrent && filled ? 'animate-pop' : ''
                  )}
                  style={isFlippingRow && !hasColor ? {
                    animation: `tileFlip ${FLIP_MS}ms ease-in-out`,
                    animationDelay: `${c * STAGGER_MS}ms`,
                    animationFillMode: 'both',
                  } : undefined}
                >
                  {filled ? letter : ''}
                </div>
              );
            })}
          </div>
        ))}
      </motion.div>

      {/* Keyboard */}
      {!isSpectator && (
        <div className="space-y-1.5">
          {QWERTY.map((row, r) => (
            <div key={r} className="flex gap-1 justify-center">
              {row.map(key => (
                <button
                  key={key}
                  onClick={() => handleKey(key)}
                  disabled={gameOver}
                  className={clsx(
                    'h-14 rounded font-bold text-sm transition-all',
                    key.length > 1 ? 'px-2 min-w-[4rem] text-xs' : 'w-10',
                    getKeyColor(key, guesses),
                    gameOver ? 'opacity-50 cursor-not-allowed' : ''
                  )}
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Game-over banner — only shown after the last row's flip finishes */}
      <AnimatePresence>
        {showGameOverBanner && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={clsx(
              'px-6 py-3 rounded-xl font-bold text-lg',
              solved
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
            )}
          >
            {solved ? '🎉 Solved!' : '💀 Out of guesses — waiting for others…'}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
