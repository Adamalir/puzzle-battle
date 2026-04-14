import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getRoom, getRoomPublicView } from '../services/roomService';

const router = Router();

router.get('/:code', authMiddleware, (req: AuthRequest, res) => {
  const room = getRoom(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  return res.json(getRoomPublicView(room));
});

export default router;
