import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { registerRoomHandlers } from './handlers/roomHandler';
import { registerGameHandlers } from './handlers/gameHandler';

export function initSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Keep idle connections alive — prevents routers/load balancers from
    // closing the socket after 30–60 s of inactivity.
    pingInterval: 25_000,  // send a ping every 25 s
    pingTimeout:  60_000,  // wait up to 60 s for a pong before disconnecting
  });

  // Auth middleware — verify JWT on connect
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
        id: string; username: string; isGuest: boolean;
      };
      socket.data.userId = payload.id;
      socket.data.username = payload.username;
      socket.data.isGuest = payload.isGuest;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);
  });

  return io;
}
