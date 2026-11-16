import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.session;
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId).select('_id name email');
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }
};
