import { Router } from 'express';
import Contact from '../models/Contact.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.get('/', authenticate, async (req, res, next) => {
  try {
    const now = new Date(); const filter = { owner: req.user._id, followUpAt: { $ne: null }, followUpStatus: 'Scheduled' };
    if (req.query.status === 'overdue') filter.followUpAt.$lt = now; else if (req.query.status === 'upcoming') filter.followUpAt.$gte = now;
    res.json({ reminders: await Contact.find(filter).sort({ followUpAt: 1 }) });
  } catch (error) { next(error); }
});
export default router;
