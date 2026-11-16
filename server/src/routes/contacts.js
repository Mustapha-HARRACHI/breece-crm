import { Router } from 'express';
import mongoose from 'mongoose';
import Contact from '../models/Contact.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const fields = ['firstName', 'lastName', 'photo', 'meetingDate', 'meetingPlace', 'email', 'phone', 'company', 'jobTitle', 'mainSocialNetwork', 'category', 'notes', 'relationshipStatus'];
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
    const contact = await Contact.create({ ...cleanBody(req.body), owner: req.user._id });
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
    const contact = await Contact.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, cleanBody(req.body), { new: true, runValidators: true });
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

export default router;
