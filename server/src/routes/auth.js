import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/'
});

const publicUser = (user) => ({ id: user._id, name: user.name, email: user.email });

const issueSession = (res, user) => {
  const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('session', token, cookieOptions());
};

router.post('/register', async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!name || !emailPattern.test(email) || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Name, valid email, and password of 8–128 characters are required' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    issueSession(res, user);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'Email is already registered' });
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    issueSession(res, user);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' });
  res.status(204).end();
});

export default router;
