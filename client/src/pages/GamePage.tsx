import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';
import type { RoomState, GameResult } from '../types';
import RoomLobby from '../components/multiplayer/RoomLobby';
import LiveSidebar from '../components/multiplayer/LiveSidebar';
import ResultsScreen from '../components/multiplayer/ResultsScreen';
import WordleGame from '../components/puzzles/Wordle/WordleGame';
import StarBattleGame from '../components/puzzles/StarBattle/StarBattleGame';
import ConnectionsGame from '../components/puzzles/Connections/ConnectionsGame';

export default function GamePage() {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [results, setResults] = useState<GameResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Keep a ref to the latest room so the game:finished handler can read puzzleType
  // without needing to re-register the socket listener on every room update.
  const roomRef = useRef<RoomState | null>(null);
  useEffect(() => { roomRef.current = room; }, [room]);

  useEffect(() => {
    if (!socket || !code || !user) return;

    const handleRoomUpdated = (r: RoomState) => setRoom(r);
    const handleCountdown = ({ countdownEnd, room: r }: { countdownEnd: number; room: RoomState }) => {
      setRoom(r);
      const tick = () => {
        const ms = countdownEnd - Date.now();
        if (ms <= 0) { setCountdown(null); return; }
        setCountdown(Math.ceil(ms / 1000));
        requestAnimationFrame(tick);
      };
      tick();
    };
    const handleGameStarted = (r: RoomState) => { setRoom(r); setCountdown(null); };
    const handleGameFinished = ({ results }: { results: GameResult[] }) => {
      // For Wordle, wait for the flip animation on the last row to finish
      // (4 tiles × 350 ms stagger + 500 ms flip + 300 ms buffer ≈ 2200 ms)
      // before replacing the board with the results screen.
      const delay = roomRef.current?.puzzleType === 'wordle' ? 2200 : 0;
      setTimeout(() => setResults(results), delay);
    };
    const handleProgress = (r: RoomState) => setRoom(r);
    const handleError = ({ message }: { message: string }) => setError(message);

    socket.on('room:updated', handleRoomUpdated);
    socket.on('room:joined', handleRoomUpdated);
    socket.on('game:countdown', handleCountdown);
    socket.on('game:started', handleGameStarted);
    socket.on('game:finished', handleGameFinished);
    socket.on('game:progress', handleProgress);
    socket.on('room:error', handleError);

    return () => {
      socket.off('room:updated', handleRoomUpdated);
      socket.off('room:joined', handleRoomUpdated);
      socket.off('game:countdown', handleCountdown);
      socket.off('game:started', handleGameStarted);
      socket.off('game:finished', handleGameFinished);
      socket.off('game:progress', handleProgress);
      socket.off('room:error', handleError);
    };
  }, [socket, code, user]);

  const handleLeave = useCallback(() => {
    socket?.emit('room:leave');
    navigate('/lobby');
  }, [socket, navigate]);

  if (!room && !error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-gray-400">
          <div className="animate-spin text-4xl mb-3">⚡</div>
          <p>Loading room…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => navigate('/lobby')} className="btn-primary">Back to Lobby</button>
        </div>
      </div>
    );
  }

  if (results) {
    return <ResultsScreen results={results} room={room!} onLeave={handleLeave} />;
  }

  const myPlayer = room ? room.players[user!.id] : null;
  const isSpectator = myPlayer?.isSpectator ?? true;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Countdown overlay */}
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-dark-900/90 flex items-center justify-center z-50"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="text-9xl font-extrabold text-brand-400"
            >
              {countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Main puzzle area */}
        <div className="flex-1 min-w-0">
          {room?.status === 'waiting' && (
            <RoomLobby room={room} userId={user!.id} socket={socket!} onLeave={handleLeave} />
          )}

          {(room?.status === 'active' || room?.status === 'countdown') && room.puzzle && (
            <>
              {room.puzzleType === 'wordle' && (
                <WordleGame
                  room={room}
                  userId={user!.id}
                  socket={socket!}
                  isSpectator={isSpectator}
                />
              )}
              {room.puzzleType === 'star-battle' && (
                <StarBattleGame
                  room={room}
                  userId={user!.id}
                  socket={socket!}
                  isSpectator={isSpectator}
                />
              )}
              {room.puzzleType === 'connections' && (
                <ConnectionsGame
                  room={room}
                  userId={user!.id}
                  socket={socket!}
                  isSpectator={isSpectator}
                />
              )}
            </>
          )}
        </div>

        {/* Sidebar */}
        {room && (room.status === 'active' || room.status === 'countdown' || room.status === 'finished') && (
          <LiveSidebar room={room} userId={user!.id} onLeave={handleLeave} />
        )}
      </div>
    </div>
  );
}
