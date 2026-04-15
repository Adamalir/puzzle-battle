import { Server, Socket } from 'socket.io';
import type { CreateRoomPayload, JoinRoomPayload, StartGamePayload } from '../../types/index';
import {
  createRoom, joinRoom, rejoinRoom, leaveRoom, startGame, activateGame,
  resetRoom, getRoomPublicView, getRoom,
} from '../../services/roomService';

interface PlayAgainPayload {
  roomCode: string;
  userId: string;
  puzzleType?: import('../../types/index').PuzzleType;
  difficulty?: import('../../types/index').Difficulty;
}

export function registerRoomHandlers(io: Server, socket: Socket) {
  // ── Create ──────────────────────────────────────────────────────────────────
  socket.on('room:create', (payload: CreateRoomPayload) => {
    const room = createRoom(
      payload.userId, payload.username,
      payload.puzzleType, payload.difficulty, payload.isGuest
    );
    socket.join(room.code);
    socket.data.userId   = payload.userId;
    socket.data.roomCode = room.code;
    socket.emit('room:created', getRoomPublicView(room));
    io.to(room.code).emit('room:updated', getRoomPublicView(room));
  });

  // ── Join (fresh) ────────────────────────────────────────────────────────────
  socket.on('room:join', (payload: JoinRoomPayload) => {
    const code   = payload.roomCode.toUpperCase();
    const result = joinRoom(code, payload.userId, payload.username, payload.isGuest, payload.asSpectator);

    if (!result.success || !result.room) {
      socket.emit('room:error', { message: result.error });
      return;
    }

    socket.join(code);
    socket.data.userId   = payload.userId;
    socket.data.roomCode = code;
    socket.emit('room:joined', getRoomPublicView(result.room));
    io.to(code).emit('room:updated', getRoomPublicView(result.room));
    io.to(code).emit('room:player-joined', { username: payload.username });
  });

  // ── Rejoin (page refresh / socket reconnect) ────────────────────────────────
  socket.on('room:rejoin', (payload: { roomCode: string; userId: string }) => {
    const code   = payload.roomCode.toUpperCase();
    const result = rejoinRoom(code, payload.userId);

    if (!result.success || !result.room) {
      socket.emit('room:error', { message: result.error });
      return;
    }

    socket.join(code);
    socket.data.userId   = payload.userId;
    socket.data.roomCode = code;
    socket.emit('room:rejoined', getRoomPublicView(result.room));
    io.to(code).emit('room:updated', getRoomPublicView(result.room));
  });

  // ── Start ───────────────────────────────────────────────────────────────────
  socket.on('room:start', (payload: StartGamePayload) => {
    const code   = payload.roomCode.toUpperCase();
    const result = startGame(code, payload.userId);

    if (!result.success || !result.room) {
      socket.emit('room:error', { message: result.error });
      return;
    }

    io.to(code).emit('game:countdown', {
      countdownEnd: result.room.countdownEnd,
      room: getRoomPublicView(result.room),
    });

    setTimeout(() => {
      const activeRoom = activateGame(code);
      if (activeRoom) io.to(code).emit('game:started', getRoomPublicView(activeRoom));
    }, 3000);
  });

  // ── Play again / New game ───────────────────────────────────────────────────
  socket.on('room:play-again', (payload: PlayAgainPayload) => {
    const code   = payload.roomCode.toUpperCase();
    const result = resetRoom(code, payload.userId, payload.puzzleType, payload.difficulty);

    if (!result.success || !result.room) {
      socket.emit('room:error', { message: result.error });
      return;
    }

    io.to(code).emit('room:reset', getRoomPublicView(result.room));
  });

  // ── Leave (explicit) ────────────────────────────────────────────────────────
  socket.on('room:leave', () => {
    const { userId, roomCode } = socket.data;
    if (!userId || !roomCode) return;
    const updatedRoom = leaveRoom(roomCode, userId);
    socket.leave(roomCode);
    if (updatedRoom) {
      io.to(roomCode).emit('room:updated', getRoomPublicView(updatedRoom));
      io.to(roomCode).emit('room:player-left', { userId });
    }
  });

  // ── Disconnect ──────────────────────────────────────────────────────────────
  // During an active game leaveRoom keeps the player in the room so they can
  // reconnect via room:rejoin.  In the lobby we remove them immediately.
  socket.on('disconnect', () => {
    const { userId, roomCode } = socket.data;
    if (!userId || !roomCode) return;

    const room = getRoom(roomCode);
    if (room && (room.status === 'active' || room.status === 'countdown')) {
      io.to(roomCode).emit('room:player-disconnected', { userId });
      return;
    }

    const updatedRoom = leaveRoom(roomCode, userId);
    if (updatedRoom) {
      io.to(roomCode).emit('room:updated', getRoomPublicView(updatedRoom));
      io.to(roomCode).emit('room:player-left', { userId });
    }
  });
}
