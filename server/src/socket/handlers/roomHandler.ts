import { Server, Socket } from 'socket.io';
import type { CreateRoomPayload, JoinRoomPayload, StartGamePayload } from '../../types/index';
import {
  createRoom, joinRoom, leaveRoom, startGame, activateGame,
  getRoomPublicView, getRoom,
} from '../../services/roomService';

export function registerRoomHandlers(io: Server, socket: Socket) {
  socket.on('room:create', (payload: CreateRoomPayload) => {
    const room = createRoom(
      payload.userId,
      payload.username,
      payload.puzzleType,
      payload.difficulty,
      payload.isGuest
    );
    socket.join(room.code);
    socket.data.userId = payload.userId;
    socket.data.roomCode = room.code;
    socket.emit('room:created', getRoomPublicView(room));
    io.to(room.code).emit('room:updated', getRoomPublicView(room));
  });

  socket.on('room:join', (payload: JoinRoomPayload) => {
    const code = payload.roomCode.toUpperCase();
    const result = joinRoom(code, payload.userId, payload.username, payload.isGuest, payload.asSpectator);

    if (!result.success || !result.room) {
      socket.emit('room:error', { message: result.error });
      return;
    }

    socket.join(code);
    socket.data.userId = payload.userId;
    socket.data.roomCode = code;
    socket.emit('room:joined', getRoomPublicView(result.room));
    io.to(code).emit('room:updated', getRoomPublicView(result.room));
    io.to(code).emit('room:player-joined', { username: payload.username });
  });

  socket.on('room:start', (payload: StartGamePayload) => {
    const code = payload.roomCode.toUpperCase();
    const result = startGame(code, payload.userId);

    if (!result.success || !result.room) {
      socket.emit('room:error', { message: result.error });
      return;
    }

    io.to(code).emit('game:countdown', {
      countdownEnd: result.room.countdownEnd,
      room: getRoomPublicView(result.room),
    });

    // After countdown, activate game
    setTimeout(() => {
      const activeRoom = activateGame(code);
      if (activeRoom) {
        io.to(code).emit('game:started', getRoomPublicView(activeRoom));
      }
    }, 3000);
  });

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

  socket.on('disconnect', () => {
    const { userId, roomCode } = socket.data;
    if (!userId || !roomCode) return;
    const updatedRoom = leaveRoom(roomCode, userId);
    if (updatedRoom) {
      io.to(roomCode).emit('room:updated', getRoomPublicView(updatedRoom));
      io.to(roomCode).emit('room:player-left', { userId });
    }
  });
}
