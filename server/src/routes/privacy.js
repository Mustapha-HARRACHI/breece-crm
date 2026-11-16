import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import Contact from '../models/Contact.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const confirmation = 'DELETE MY ACCOUNT';
const publicContactFields = ['firstName', 'lastName', 'photo', 'meetingDate', 'meetingPlace', 'email', 'phone', 'company', 'jobTitle', 'mainSocialNetwork', 'category', 'notes', 'relationshipStatus', 'createdAt', 'updatedAt'];
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' };

const csrfValid = (req) => {
  const cookie = req.cookies?.csrfToken;
  const header = req.get('x-csrf-token');
  return cookie && header && cookie.length === header.length && crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
};

const googleClient = () => new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_CALLBACK_URL);

router.get('/export', authenticate, async (req, res, next) => {
  try {
    const contacts = await Contact.find({ owner: req.user._id }).select(publicContactFields.join(' ')).lean();
    const data = { exportedAt: new Date().toISOString(), profile: { name: req.user.name, email: req.user.email }, contacts };
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="breece-crm-data.json"', 'Cache-Control': 'no-store' });
    res.json(data);
  } catch (error) { next(error); }
});

router.delete('/account', authenticate, async (req, res, next) => {
  try {
    if (!csrfValid(req) || req.body.confirmation !== confirmation) return res.status(400).json({ error: 'Confirmation and security verification are required' });
    const user = await User.findById(req.user._id).select('+passwordHash +googleSubject');
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (user.passwordHash) {
      if (typeof req.body.currentPassword !== 'string' || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) return res.status(401).json({ error: 'Identity verification failed' });
    } else {
      if (!req.body.googleIdToken || !process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ error: 'Fresh Google verification is required' });
      const ticket = await googleClient().verifyIdToken({ idToken: req.body.googleIdToken, audience: process.env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      if (!payload?.sub || payload.sub !== user.googleSubject || !payload.email_verified) return res.status(401).json({ error: 'Identity verification failed' });
    }
    await Contact.deleteMany({ owner: user._id });
    await User.deleteOne({ _id: user._id });
    res.clearCookie('session', cookieOptions); res.clearCookie('csrfToken', { ...cookieOptions, httpOnly: false });
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
