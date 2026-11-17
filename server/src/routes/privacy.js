import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import Contact from '../models/Contact.js';
import Goal from '../models/Goal.js';
import { authenticate, authenticateForDeletion } from '../middleware/auth.js';

const router = Router();
const confirmation = 'DELETE MY ACCOUNT';
const publicContactFields = ['firstName', 'lastName', 'photo', 'meetingDate', 'meetingPlace', 'email', 'phone', 'company', 'jobTitle', 'mainSocialNetwork', 'category', 'notes', 'relationshipStatus', 'followUpAt', 'reminderNote', 'followUpStatus', 'reminderEmailEnabled', 'notificationStatus', 'createdAt', 'updatedAt'];
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', path: '/' };

const csrfValid = (req) => {
  const cookie = req.cookies?.csrfToken;
  const header = req.get('x-csrf-token');
  return cookie && header && cookie.length === header.length && crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
};

const googleClient = () => new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_CALLBACK_URL);
const reauthCookie = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 5 * 60 * 1000, path: '/api/privacy/account' };
const reauthStateCookie = { ...reauthCookie, maxAge: 10 * 60 * 1000, path: '/' };

router.get('/export', authenticate, async (req, res, next) => {
  try {
    const contacts = await Contact.find({ owner: req.user._id }).select(publicContactFields.join(' ')).lean();
    const objectives = await Goal.find({ owner: req.user._id }).select('month target createdAt updatedAt').lean();
    const data = { exportedAt: new Date().toISOString(), profile: { name: req.user.name, email: req.user.email }, contacts, objectives };
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="breece-crm-data.json"', 'Cache-Control': 'no-store' });
    res.json(data);
  } catch (error) { next(error); }
});

router.get('/account/google', authenticateForDeletion, async (req, res) => {
  const user = await User.findById(req.user._id).select('+googleSubject +sessionVersion');
  if (!user?.googleSubject || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) return res.status(400).json({ error: 'Google reauthentication is unavailable' });
  const state = crypto.randomBytes(32).toString('hex');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  res.cookie('delete_oauth_state', `${state}.${verifier}`, reauthStateCookie);
  res.redirect(googleClient().generateAuthUrl({ scope: ['openid', 'email'], state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'login select_account', login_hint: user.email }));
});

router.get('/account/google/callback', authenticateForDeletion, async (req, res) => {
  const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  try {
    const stored = req.cookies?.delete_oauth_state?.split('.');
    if (!stored || stored.length !== 2 || !req.query.state || !req.query.code || stored[0].length !== String(req.query.state).length || !crypto.timingSafeEqual(Buffer.from(stored[0]), Buffer.from(String(req.query.state)))) return res.redirect(`${origin}?googleDeleteError=cancelled`);
    const { tokens } = await googleClient().getToken({ code: req.query.code, codeVerifier: stored[1] });
    const payload = (await googleClient().verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID })).getPayload();
    const user = await User.findById(req.user._id).select('+googleSubject +sessionVersion');
    if (!user || !payload?.sub || payload.sub !== user.googleSubject || !payload.email_verified) return res.redirect(`${origin}?googleDeleteError=identity`);
    const proof = jwt.sign({ userId: user._id.toString(), sessionVersion: user.sessionVersion, purpose: 'account-delete' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    res.cookie('delete_reauth', proof, reauthCookie); res.clearCookie('delete_oauth_state', reauthStateCookie);
    res.redirect(`${origin}?googleDeleteVerified=1`);
  } catch { res.redirect(`${origin}?googleDeleteError=failed`); }
});

router.delete('/account', authenticateForDeletion, async (req, res, next) => {
  try {
    if (!csrfValid(req) || req.body.confirmation !== confirmation) return res.status(400).json({ error: 'Confirmation and security verification are required' });
    const user = await User.findById(req.user._id).select('+passwordHash +googleSubject +sessionVersion +deletionStatus');
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (user.passwordHash) {
      if (typeof req.body.currentPassword !== 'string' || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) return res.status(401).json({ error: 'Identity verification failed' });
    } else {
      let proof;
      try { proof = jwt.verify(req.cookies?.delete_reauth || '', process.env.JWT_SECRET); } catch { proof = null; }
      if (!proof || proof.purpose !== 'account-delete' || proof.userId !== user._id.toString() || proof.sessionVersion !== user.sessionVersion) return res.status(401).json({ error: 'Fresh Google verification is required' });
    }
    await User.updateOne({ _id: user._id }, { $set: { deletionStatus: 'Pending' }, $unset: { deletionError: 1 } });
    try {
      await Contact.deleteMany({ owner: user._id });
      await Goal.deleteMany({ owner: user._id });
      await User.deleteOne({ _id: user._id, deletionStatus: 'Pending' });
    } catch (error) {
      await User.updateOne({ _id: user._id }, { $set: { deletionStatus: 'Pending', deletionError: 'Deletion interrupted; retry required' } });
      return res.status(503).json({ error: 'Account deletion is pending; please retry.' });
    }
    res.clearCookie('session', cookieOptions); res.clearCookie('csrfToken', { ...cookieOptions, httpOnly: false }); res.clearCookie('delete_reauth', reauthCookie);
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
