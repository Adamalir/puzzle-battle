import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { motion } from 'framer-motion';
import type { PuzzleType, Difficulty, GameMode } from '../types';

const PUZZLE_OPTIONS: { type: PuzzleType; icon: string; label: string; desc: string }[] = [
  { type: 'wordle',      icon: '🔤', label: 'Wordle',      desc: 'Guess the 5-letter word' },
  { type: 'star-battle', icon: '⭐', label: 'Star Battle', desc: 'Place stars on the grid' },
  { type: 'connections', icon: '🔗', label: 'Connections', desc: 'Find the hidden groups' },
];

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export default function LobbyPage() {
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const navigate = useNavigate();

  const [gameMode, setGameMode] = useState<GameMode>('classic');
  const [puzzleType, setPuzzleType] = useState<PuzzleType>('wordle');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [joinCode, setJoinCode] = useState('');
  const [asSpectator, setAsSpectator] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = () => {
    if (!socket || !user) return;
    setCreating(true); setError(null);
    socket.emit('room:create', {
      puzzleType: gameMode === 'gauntlet' ? 'star-battle' : puzzleType,
      difficulty,
      gameMode,
      username: user.username, userId: user.id, isGuest: user.isGuest,
    });
    socket.once('room:created', (room) => {
      setCreating(false);
      navigate(`/room/${room.code}`);
    });
    socket.once('room:error', ({ message }: { message: string }) => {
      setCreating(false); setError(message);
    });
  };

  const handleJoin = () => {
    if (!socket || !user || !joinCode.trim()) return;
    setJoining(true); setError(null);
    socket.emit('room:join', {
      roomCode: joinCode.trim().toUpperCase(),
      username: user.username, userId: user.id,
      isGuest: user.isGuest, asSpectator,
    });
    socket.once('room:joined', (room) => {
      setJoining(false);
      navigate(`/room/${room.code}`);
    });
    socket.once('room:error', ({ message }: { message: string }) => {
      setJoining(false); setError(message);
    });
  };

  if (!connected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-gray-400">
          <div className="text-4xl mb-3">🔌</div>
          <p>Connecting to server…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold mb-8">Game Lobby</h1>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Create Room */}
          <div className="card space-y-5">
            <h2 className="text-xl font-semibold">Create Room</h2>

            {/* Mode toggle */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-400">Mode</label>
              <div className="space-y-2">
                <button
                  onClick={() => setGameMode('classic')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                    gameMode === 'classic'
                      ? 'border-brand-500 bg-brand-500/10 text-white'
                      : 'border-dark-500 bg-dark-700 text-gray-300 hover:border-dark-400'
                  }`}
                >
                  <span className="text-xl">🎮</span>
                  <span>
                    <span className="font-medium block text-sm">Single Puzzle</span>
                    <span className="text-xs text-gray-500">Pick one puzzle type to race on</span>
                  </span>
                </button>
                <button
                  onClick={() => setGameMode('gauntlet')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                    gameMode === 'gauntlet'
                      ? 'border-yellow-500 bg-yellow-500/10 text-white'
                      : 'border-dark-500 bg-dark-700 text-gray-300 hover:border-dark-400'
                  }`}
                >
                  <span className="text-xl">⚡</span>
                  <span>
                    <span className="font-medium block text-sm">Puzzle Gauntlet</span>
                    <span className="text-xs text-gray-500">Complete all 3 puzzles in sequence</span>
                  </span>
                </button>
              </div>
            </div>

            {/* Puzzle type picker — only in classic mode */}
            {gameMode === 'classic' && (
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-400">Puzzle</label>
                <div className="space-y-2">
                  {PUZZLE_OPTIONS.map((p) => (
                    <button
                      key={p.type}
                      onClick={() => setPuzzleType(p.type)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                        puzzleType === p.type
                          ? 'border-brand-500 bg-brand-500/10 text-white'
                          : 'border-dark-500 bg-dark-700 text-gray-300 hover:border-dark-400'
                      }`}
                    >
                      <span className="text-xl">{p.icon}</span>
                      <span>
                        <span className="font-medium block text-sm">{p.label}</span>
                        <span className="text-xs text-gray-500">{p.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Gauntlet info banner */}
            {gameMode === 'gauntlet' && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2.5 text-sm text-yellow-300">
                <p className="font-medium mb-1">⭐ → 🔤 → 🔗</p>
                <p className="text-xs text-yellow-400/70">Star Battle → Wordle → Connections</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-400">Difficulty</label>
              <div className="flex gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all border ${
                      difficulty === d
                        ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                        : 'border-dark-500 bg-dark-700 text-gray-400 hover:border-dark-400'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleCreate} disabled={creating} className="btn-primary w-full py-2.5">
              {creating ? 'Creating…' : 'Create Room'}
            </button>
          </div>

          {/* Join Room */}
          <div className="card space-y-5">
            <h2 className="text-xl font-semibold">Join Room</h2>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-400">Room Code</label>
              <input
                className="input uppercase font-mono tracking-widest text-center text-lg"
                placeholder="ABCD12"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                maxLength={6}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={asSpectator}
                onChange={e => setAsSpectator(e.target.checked)}
                className="w-4 h-4 accent-brand-500"
              />
              <span className="text-sm text-gray-300">Join as spectator</span>
            </label>

            <button
              onClick={handleJoin}
              disabled={joining || joinCode.length < 4}
              className="btn-primary w-full py-2.5"
            >
              {joining ? 'Joining…' : 'Join Room'}
            </button>

            <div className="border-t border-dark-600 pt-4">
              <p className="text-xs text-gray-500 text-center">
                Have a link? It includes the room code automatically.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
