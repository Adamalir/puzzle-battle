import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';

const router = Router();
const prisma = new PrismaClient();

const RegisterSchema = z.object({
  username: z.string().min(2).max(20).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6),
});

const LoginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const GuestSchema = z.object({
  displayName: z.string().min(1).max(20),
});

function signToken(id: string, username: string, isGuest: boolean) {
  return jwt.sign(
    { id, username, isGuest },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );
}

router.post('/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { username, password } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return res.status(409).json({ error: 'Username already taken' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash, stats: { create: {} } },
  });

  return res.json({ token: signToken(user.id, user.username, false), username: user.username, id: user.id });
});

router.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid credentials' });

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  return res.json({ token: signToken(user.id, user.username, false), username: user.username, id: user.id });
});

router.post('/guest', (req, res) => {
  const parsed = GuestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Display name required' });

  const guestId = `guest_${nanoid(8)}`;
  const token = signToken(guestId, parsed.data.displayName, true);
  return res.json({ token, username: parsed.data.displayName, id: guestId, isGuest: true });
});

export default router;
