import { useState } from 'react';
import { Socket } from 'socket.io-client';
import { motion } from 'framer-motion';
import type { RoomState } from '../../types';

interface Props {
  room: RoomState;
  userId: string;
  socket: Socket;
  onLeave: () => void;
  onForceReset?: () => void;
}

export default function RoomLobby({ room, userId, socket, onLeave, onForceReset }: Props) {
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === userId;
  const activePlayers = Object.values(room.players).filter(p => !p.isSpectator);
  const spectators = Object.values(room.players).filter(p => p.isSpectator);
  const shareUrl = `${window.location.origin}/room/${room.code}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStart = () => {
    socket.emit('room:start', { roomCode: room.code, userId });
  };

  const PUZZLE_ICONS: Record<string, string> = {
    wordle: '🔤', 'star-battle': '⭐', connections: '🔗',
  };

  return (
    <div className="max-w-lg mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Room header */}
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{PUZZLE_ICONS[room.puzzleType]}</span>
                <h2 className="text-xl font-bold capitalize">
                  {room.puzzleType.replace('-', ' ')} · {room.difficulty}
                </h2>
              </div>
              <p className="text-gray-400 text-sm">Waiting for players…</p>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-bold text-brand-400 tracking-widest">{room.code}</div>
              <div className="text-xs text-gray-500">Room code</div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={copyLink} className="btn-secondary flex-1 text-sm">
              {copied ? '✓ Copied!' : '🔗 Copy Link'}
            </button>
            <button onClick={onLeave} className="btn-ghost text-sm px-3">Leave</button>
          </div>
        </div>

        {/* Players */}
        <div className="card mb-4">
          <h3 className="font-semibold mb-3 text-gray-300">
            Players ({activePlayers.length}/8)
          </h3>
          <div className="space-y-2">
            {activePlayers.map(p => (
              <div key={p.userId} className="flex items-center gap-3 py-2 px-3 bg-dark-700 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-sm font-bold">
                  {p.username[0].toUpperCase()}
                </div>
                <span className="font-medium flex-1">{p.username}</span>
                <div className="flex gap-1.5">
                  {p.isHost && <span className="badge bg-yellow-500/20 text-yellow-300">Host</span>}
                  {p.isGuest && <span className="badge bg-gray-500/20 text-gray-400">Guest</span>}
                  {p.userId === userId && <span className="badge bg-brand-500/20 text-brand-300">You</span>}
                </div>
              </div>
            ))}
          </div>

          {spectators.length > 0 && (
            <>
              <h3 className="font-semibold mt-4 mb-3 text-gray-400 text-sm">
                Spectators ({spectators.length})
              </h3>
              <div className="space-y-1">
                {spectators.map(p => (
                  <div key={p.userId} className="flex items-center gap-2 py-1.5 px-3 bg-dark-700/50 rounded text-gray-400 text-sm">
                    <span>👁️</span>
                    <span>{p.username}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {isHost ? (
          <button
            onClick={handleStart}
            disabled={activePlayers.length < 1}
            className="btn-primary w-full py-3 text-base font-bold"
          >
            Start Game
          </button>
        ) : (
          <div className="card text-center text-gray-400 py-4">
            Waiting for the host to start the game…
          </div>
        )}
      </motion.div>
    </div>
  );
}
