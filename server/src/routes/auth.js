import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { rateLimit } from 'express-rate-limit';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { sendPasswordResetEmail } from '../services/mailer.js';

const router = Router();
const sensitiveLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
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
  res.cookie('csrfToken', crypto.randomBytes(32).toString('hex'), { ...cookieOptions(), httpOnly: false });
};

const oauthStateCookie = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000, path: '/api/auth/google' };
const googleClient = () => new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_CALLBACK_URL);

router.post('/register', sensitiveLimiter, async (req, res, next) => {
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

router.post('/login', sensitiveLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    issueSession(res, user);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.get('/google', sensitiveLimiter, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) return res.status(503).json({ error: 'Google login is not configured' });
  const state = crypto.randomBytes(32).toString('hex');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  res.cookie('oauth_state', `${state}.${verifier}`, oauthStateCookie);
  res.redirect(googleClient().generateAuthUrl({ access_type: 'offline', scope: ['openid', 'email', 'profile'], state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' }));
});

router.get('/google/callback', async (req, res, next) => {
  try {
    const stored = req.cookies?.oauth_state?.split('.');
    if (!stored || stored.length !== 2 || !req.query.state || !crypto.timingSafeEqual(Buffer.from(stored[0]), Buffer.from(String(req.query.state))) || !req.query.code) return res.redirect(`${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}?oauthError=cancelled`);
    const client = googleClient();
    const { tokens } = await client.getToken({ code: req.query.code, codeVerifier: stored[1] });
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.sub || payload.iss !== 'https://accounts.google.com' || !payload.email_verified || !payload.email) return res.redirect(`${process.env.CLIENT_ORIGIN}?oauthError=invalid`);
    let user = await User.findOne({ googleSubject: payload.sub });
    if (!user) {
      const existing = await User.findOne({ email: payload.email.toLowerCase() });
      if (existing) return res.redirect(`${process.env.CLIENT_ORIGIN}?oauthError=account-exists`);
      user = await User.create({ name: payload.name || payload.email.split('@')[0], email: payload.email.toLowerCase(), googleSubject: payload.sub });
    }
    issueSession(res, user); res.clearCookie('oauth_state', oauthStateCookie);
    return res.redirect(process.env.CLIENT_ORIGIN || 'http://localhost:5173');
  } catch (error) { next(error); }
});

router.post('/forgot-password', sensitiveLimiter, async (req, res, next) => {
  const generic = { message: 'If an account exists for that email, a reset link has been sent.' };
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const user = await User.findOne({ email });
    if (!user) return res.json(generic);
    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    user.resetTokenExpiresAt = new Date(Date.now() + 20 * 60 * 1000);
    await user.save();
    await sendPasswordResetEmail(user.email, token);
    return res.json(generic);
  } catch (error) { next(error); }
});

router.post('/reset-password', sensitiveLimiter, async (req, res, next) => {
  try {
    const token = typeof req.body.token === 'string' ? req.body.token : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!token || password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Invalid token or password' });
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({ resetTokenHash: hash, resetTokenExpiresAt: { $gt: new Date() } }).select('+passwordHash +resetTokenHash +resetTokenExpiresAt');
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });
    user.passwordHash = await bcrypt.hash(password, 12); user.resetTokenHash = undefined; user.resetTokenExpiresAt = undefined; await user.save();
    issueSession(res, user); return res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' });
  res.clearCookie('csrfToken', { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' });
  res.status(204).end();
});

export default router;
