import { Router } from 'express';
import Contact from '../models/Contact.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const parseDateRange = (query) => {
  const { from, to } = query;
  if ((from && !datePattern.test(from)) || (to && !datePattern.test(to))) return { error: 'Dates must use YYYY-MM-DD format' };
  const range = {};
  if (from) range.$gte = new Date(`${from}T00:00:00.000Z`);
  if (to) {
    range.$lt = new Date(`${to}T00:00:00.000Z`);
    range.$lt.setUTCDate(range.$lt.getUTCDate() + 1);
  }
  if (range.$gte && range.$lt && range.$gte >= range.$lt) return { error: 'The start date must be before the end date' };
  return range;
};

router.get('/', authenticate, async (req, res, next) => {
  try {
    const dateRange = parseDateRange(req.query);
    if (dateRange.error) return res.status(400).json({ error: dateRange.error });
    const match = { owner: req.user._id };
    if (Object.keys(dateRange).length) match.createdAt = dateRange;
    const [result] = await Contact.aggregate([{ $match: match }, { $facet: {
      total: [{ $count: 'count' }],
      categories: [{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      monthly: [{ $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      meetingPlaces: [{ $group: { _id: { $ifNull: [{ $cond: [{ $eq: [{ $trim: { input: { $ifNull: ['$meetingPlace', ''] } } }, ''] }, null, '$meetingPlace'] }, 'Not specified'] }, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }],
      followUps: [{ $match: { relationshipStatus: 'ToContact' } }, { $count: 'count' }]
    } }]);
    const places = result.meetingPlaces || [];
    const topPlaces = places.slice(0, 5);
    const others = places.slice(5).reduce((sum, place) => sum + place.count, 0);
    if (others) topPlaces.push({ _id: 'Others', count: others });
    res.json({ total: result.total[0]?.count || 0, categories: result.categories, monthly: result.monthly, meetingPlaces: topPlaces, followUps: result.followUps[0]?.count || 0 });
  } catch (error) { next(error); }
});

export default router;
