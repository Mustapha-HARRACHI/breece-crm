import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const authenticateRequest = async (req, res, next, allowDeletionPending = false) => {
  try {
    const token = req.cookies?.session;
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!Number.isInteger(payload.sessionVersion)) return res.status(401).json({ error: 'Authentication required' });
    const user = await User.findById(payload.userId).select('_id name email +sessionVersion +googleSubject +deletionStatus');
    if (!user || !Number.isInteger(user.sessionVersion) || payload.sessionVersion !== user.sessionVersion || (!allowDeletionPending && user.deletionStatus === 'Pending')) return res.status(401).json({ error: 'Authentication required' });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }
};

export const authenticate = (req, res, next) => authenticateRequest(req, res, next);
export const authenticateForDeletion = (req, res, next) => authenticateRequest(req, res, next, true);
