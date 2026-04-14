import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { initSocket } from './socket/index';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';
import profileRoutes from './routes/profile';

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/profile', profileRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

initSocket(server);

const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, () => {
  console.log(`Puzzle Battle server running on port ${PORT}`);
});
