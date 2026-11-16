import { Router } from 'express';
import mongoose from 'mongoose';
import Goal from '../models/Goal.js';
import Contact from '../models/Contact.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const validMonth = (month) => typeof month === 'string' && monthPattern.test(month);
const progress = async (owner, month) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  return Contact.countDocuments({ owner, createdAt: { $gte: start, $lt: end } });
};

router.use(authenticate);
router.get('/', async (req, res, next) => {
  try {
    const goals = await Goal.find({ owner: req.user._id }).sort({ month: -1 }).lean();
    const result = await Promise.all(goals.map(async (goal) => { const current = await progress(req.user._id, goal.month); return { ...goal, current, percentage: Math.min(100, Math.round(current / goal.target * 100)) }; }));
    res.json({ goals: result });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const month = req.body.month; const target = Number(req.body.target);
    if (!validMonth(month) || !Number.isInteger(target) || target < 1 || target > 100000) return res.status(400).json({ error: 'Valid month and positive integer target are required' });
    const goal = await Goal.create({ owner: req.user._id, month, target });
    const current = await progress(req.user._id, month);
    res.status(201).json({ goal: { ...goal.toObject(), current, percentage: Math.min(100, Math.round(current / target * 100)) } });
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ error: 'An objective already exists for this month' }); next(error); }
});

router.patch('/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid objective ID' });
  try {
    const update = {}; if (req.body.month !== undefined) { if (!validMonth(req.body.month)) return res.status(400).json({ error: 'Invalid month' }); update.month = req.body.month; }
    if (req.body.target !== undefined) { const target = Number(req.body.target); if (!Number.isInteger(target) || target < 1 || target > 100000) return res.status(400).json({ error: 'Invalid target' }); update.target = target; }
    const goal = await Goal.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, update, { new: true, runValidators: true });
    if (!goal) return res.status(404).json({ error: 'Objective not found' });
    const current = await progress(req.user._id, goal.month); res.json({ goal: { ...goal.toObject(), current, percentage: Math.min(100, Math.round(current / goal.target * 100)) } });
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ error: 'An objective already exists for this month' }); next(error); }
});

router.delete('/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid objective ID' });
  try { const goal = await Goal.findOneAndDelete({ _id: req.params.id, owner: req.user._id }); if (!goal) return res.status(404).json({ error: 'Objective not found' }); res.status(204).end(); } catch (error) { next(error); }
});

export default router;
