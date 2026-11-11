import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const prisma = new PrismaClient();
export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'bunker-super-secret-2026';

const registerSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(6),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// 🔐 РЕГИСТРАЦИЯ
authRouter.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    
    const existing = await prisma.user.findUnique({ where: { username: data.username } });
    if (existing) return res.status(400).json({ error: 'Имя уже занято' });

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({ data: { username: data.username, passwordHash } });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ success: true, token, user: { id: user.id, username: user.username } });
  } catch (err: any) {
    res.status(400).json({ error: err.errors?.[0]?.message || 'Ошибка регистрации' });
  }
});

// 🔑 ВХОД
authRouter.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { username: data.username } });
    if (!user) return res.status(401).json({ error: 'Неверное имя или пароль' });

    const isValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: 'Неверное имя или пароль' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ success: true, token, user: { id: user.id, username: user.username } });
  } catch (err: any) {
    res.status(400).json({ error: 'Ошибка входа' });
  }
});


// 🏆 ТАБЛИЦА ЛИДЕРОВ (Топ-10)
authRouter.get('/leaderboard', async (req, res) => {
  try {
    const topUsers = await prisma.user.findMany({
      take: 10,
      orderBy: [
        { gamesWon: 'desc' },
        { gamesPlayed: 'asc' } // Если побед поровну, выше тот, кто сыграл меньше игр (лучший винрейт)
      ],
      select: {
        username: true,
        gamesWon: true,
        gamesPlayed: true,
      }
    });

    res.json({ success: true, leaderboard: topUsers });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения рейтинга' });
  }
});
