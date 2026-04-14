import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.user || req.user.isGuest) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { stats: true, badges: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({
    id: user.id,
    username: user.username,
    stats: user.stats,
    badges: user.badges,
    createdAt: user.createdAt,
  });
});

export default router;
