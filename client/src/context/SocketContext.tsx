import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  reconnecting: boolean; // true = was connected, now trying to reconnect
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  reconnecting: false,
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  // Track whether we've had at least one successful connection this session
  const everConnectedRef = useRef(false);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      setReconnecting(false);
      everConnectedRef.current = false;
      return;
    }

    const socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001', {
      auth: { token: user.token },
      // Try WebSocket first; fall back to long-polling so the connection
      // works even on networks that block WebSocket upgrades.
      transports: ['websocket', 'polling'],
      // Reconnect automatically every 3 s, indefinitely
      reconnection: true,
      reconnectionDelay: 3_000,
      reconnectionDelayMax: 3_000, // keep it constant, no exponential back-off
      reconnectionAttempts: Infinity,
    });

    socket.on('connect', () => {
      everConnectedRef.current = true;
      setConnected(true);
      setReconnecting(false);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      // Only show "Reconnecting…" if this isn't a deliberate logout disconnect
      if (everConnectedRef.current) setReconnecting(true);
    });

    // Socket.io fires this while actively trying to reconnect
    socket.on('reconnect_attempt', () => setReconnecting(true));
    socket.on('reconnect', () => {
      setConnected(true);
      setReconnecting(false);
    });
    socket.on('reconnect_error', () => setReconnecting(true));

    socketRef.current = socket;

    return () => {
      everConnectedRef.current = false;
      socket.disconnect();
    };
  }, [user?.token]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, reconnecting }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
