import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Contact from '../models/Contact.js';
import Goal from '../models/Goal.js';
import { buildDemoDataset, validateDemoConfig } from './demoData.js';

const dryRun = process.argv.includes('--dry-run');

async function seed() {
  if (process.argv.slice(2).some((arg) => arg !== '--dry-run')) throw new Error('Unsupported seed option.');
  const { email, anchor } = validateDemoConfig(process.env, { write: !dryRun });
  const data = buildDemoDataset(anchor, email);
  if (dryRun) {
    console.log(`Dry run only: ${data.contacts.length} contacts, ${data.goals.length} objectives and ${data.contacts.filter((contact) => contact.followUpAt).length} reminders planned for one synthetic user. No database connection made.`);
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    if (mongoose.connection.name !== 'breece_crm_demo') throw new Error('Refusing to write outside the dedicated demo database.');
    const existingUser = await User.findById(data.user._id).select('+deletionStatus +passwordHash');
    const emailOwner = await User.findOne({ email });
    if ((existingUser && (existingUser.email !== email || existingUser.name !== data.user.name || existingUser.deletionStatus !== 'Active' || !existingUser.passwordHash)) || (emailOwner && !emailOwner._id.equals(data.user._id))) throw new Error('Demo account identity does not match; no data inserted.');
    if (!existingUser) await User.create({ ...data.user, passwordHash: await bcrypt.hash(process.env.DEMO_USER_PASSWORD, 12) });
    else if (!(await bcrypt.compare(process.env.DEMO_USER_PASSWORD, existingUser.passwordHash))) await User.updateOne({ _id: data.user._id }, { $set: { passwordHash: await bcrypt.hash(process.env.DEMO_USER_PASSWORD, 12) }, $inc: { sessionVersion: 1 } });

    const storedContacts = await Contact.find({ _id: { $in: data.contacts.map((contact) => contact._id) } }).select('_id owner').lean();
    const storedGoals = await Goal.find({ _id: { $in: data.goals.map((goal) => goal._id) } }).select('_id owner').lean();
    if ([...storedContacts, ...storedGoals].some((record) => !record.owner.equals(data.user._id))) throw new Error('Demo record ownership conflict; no data inserted.');
    const contactIds = new Set(storedContacts.map((contact) => contact._id.toString()));
    const goalIds = new Set(storedGoals.map((goal) => goal._id.toString()));
    const missingContacts = data.contacts.filter((contact) => !contactIds.has(contact._id.toString()));
    const missingGoals = data.goals.filter((goal) => !goalIds.has(goal._id.toString()));
    if (missingContacts.length) await Contact.insertMany(missingContacts);
    if (missingGoals.length) await Goal.insertMany(missingGoals);
    console.log(`Demo seed complete: ${await User.countDocuments()} user(s), ${await Contact.countDocuments({ owner: data.user._id })} contacts, ${await Goal.countDocuments({ owner: data.user._id })} objectives; inserted ${missingContacts.length} contacts and ${missingGoals.length} objectives this run.`);
  } finally { await mongoose.disconnect(); }
}

seed().catch((error) => {
  if (/^(Refusing|Demo |Set a unique|Unsupported)/.test(error.message)) console.error(error.message);
  else console.error('Demo seed failed. Existing demo records were not deleted; rerun is safe after checking the configuration.');
  process.exitCode = 1;
});
