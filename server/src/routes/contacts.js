import { Router } from 'express';
import mongoose from 'mongoose';
import Contact from '../models/Contact.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const fields = ['firstName', 'lastName', 'photo', 'meetingDate', 'meetingPlace', 'email', 'phone', 'company', 'jobTitle', 'mainSocialNetwork', 'category', 'notes', 'relationshipStatus', 'followUpAt', 'reminderNote', 'followUpStatus', 'reminderEmailEnabled'];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const idIsValid = (id) => mongoose.isValidObjectId(id);
const cleanBody = (body = {}) => Object.fromEntries(fields.filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]]));

const handleValidation = (error, res, next) => {
  if (error?.name === 'ValidationError' || error?.name === 'CastError') return res.status(400).json({ error: 'Invalid contact data' });
  return next(error);
};

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const filter = { owner: req.user._id };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.relationshipStatus) filter.relationshipStatus = req.query.relationshipStatus;
    if (req.query.search?.trim()) {
      const search = new RegExp(escapeRegex(req.query.search.trim()), 'i');
      filter.$or = [{ firstName: search }, { lastName: search }];
    }
    res.json({ contacts: await Contact.find(filter).sort({ createdAt: -1 }) });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = cleanBody(req.body);
    if (data.reminderEmailEnabled && !data.followUpAt) return res.status(400).json({ error: 'A follow-up date is required for email notifications' });
    if (data.reminderEmailEnabled && data.followUpAt) data.notificationStatus = 'Pending';
    const contact = await Contact.create({ ...data, owner: req.user._id });
    res.status(201).json({ contact });
  } catch (error) { handleValidation(error, res, next); }
});

router.get('/:id', async (req, res, next) => {
  if (!idIsValid(req.params.id)) return res.status(400).json({ error: 'Invalid contact ID' });
  try {
    const contact = await Contact.findOne({ _id: req.params.id, owner: req.user._id });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ contact });
  } catch (error) { next(error); }
});

router.patch('/:id', async (req, res, next) => {
  if (!idIsValid(req.params.id)) return res.status(400).json({ error: 'Invalid contact ID' });
  try {
    const data = cleanBody(req.body);
    if (data.reminderEmailEnabled === true && data.followUpAt === null) return res.status(400).json({ error: 'A follow-up date is required for email notifications' });
    if (Object.hasOwn(data, 'followUpAt') || Object.hasOwn(data, 'reminderEmailEnabled') || Object.hasOwn(data, 'followUpStatus')) {
      data.notificationStatus = data.reminderEmailEnabled === false || data.followUpAt === null || data.followUpStatus === 'Completed' || data.followUpStatus === 'Cancelled' ? 'Disabled' : 'Pending';
      data.notificationAttempts = 0;
      data.$unset = { notificationClaimedAt: 1, notificationClaimId: 1, notificationNextAttemptAt: 1, notificationSentAt: 1, notificationLastError: 1 };
    }
    const contact = await Contact.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, data, { new: true, runValidators: true });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json({ contact });
  } catch (error) { handleValidation(error, res, next); }
});

router.delete('/:id', async (req, res, next) => {
  if (!idIsValid(req.params.id)) return res.status(400).json({ error: 'Invalid contact ID' });
  try {
    const contact = await Contact.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

router.patch('/:id/reminder', async (req, res, next) => {
  if (!idIsValid(req.params.id)) return res.status(400).json({ error: 'Invalid contact ID' });
  try {
    const allowed = ['followUpAt', 'reminderNote', 'followUpStatus', 'reminderEmailEnabled']; const update = Object.fromEntries(allowed.filter((key) => Object.hasOwn(req.body, key)).map((key) => [key, req.body[key]]));
    if (update.followUpAt !== undefined && update.followUpAt !== null && Number.isNaN(new Date(update.followUpAt).getTime())) return res.status(400).json({ error: 'Invalid follow-up date' });
    const existing = await Contact.findOne({ _id: req.params.id, owner: req.user._id });
    if (!existing) return res.status(404).json({ error: 'Contact not found' });
    const effectiveDate = Object.hasOwn(update, 'followUpAt') ? update.followUpAt : existing.followUpAt;
    const effectiveEnabled = Object.hasOwn(update, 'reminderEmailEnabled') ? update.reminderEmailEnabled : existing.reminderEmailEnabled;
    if (effectiveEnabled && !effectiveDate) return res.status(400).json({ error: 'A follow-up date is required for email notifications' });
    if (Object.keys(update).some((key) => ['followUpAt', 'followUpStatus', 'reminderEmailEnabled'].includes(key))) {
      update.notificationStatus = effectiveEnabled && effectiveDate && update.followUpStatus !== 'Completed' && update.followUpStatus !== 'Cancelled' ? 'Pending' : 'Disabled';
      update.notificationAttempts = 0;
      update.$unset = { notificationClaimedAt: 1, notificationClaimId: 1, notificationNextAttemptAt: 1, notificationSentAt: 1, notificationLastError: 1 };
    }
    const contact = await Contact.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, update, { new: true, runValidators: true });
    if (!contact) return res.status(404).json({ error: 'Contact not found' }); res.json({ contact });
  } catch (error) { handleValidation(error, res, next); }
});

export default router;
