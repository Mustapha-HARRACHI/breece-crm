import Contact from '../models/Contact.js';
import User from '../models/User.js';
import { sendReminderEmail } from './mailer.js';

const intervalMs = 60 * 1000;
const claimMs = 10 * 60 * 1000;
const maxAttempts = 3;

export const processDueReminders = async () => {
  const now = new Date();
  let processed = 0;
  while (true) {
    const claim = new Date();
    const contact = await Contact.findOneAndUpdate({ followUpAt: { $lte: now }, followUpStatus: 'Scheduled', reminderEmailEnabled: true, notificationStatus: { $in: ['Pending', 'Failed'] }, notificationAttempts: { $lt: maxAttempts }, $and: [{ $or: [{ notificationNextAttemptAt: null }, { notificationNextAttemptAt: { $lte: now } }] }, { $or: [{ notificationClaimedAt: null }, { notificationClaimedAt: { $lt: new Date(Date.now() - claimMs) } }] }] }, { $set: { notificationClaimedAt: claim } }, { new: true }).select('+notificationAttempts +notificationClaimedAt +notificationNextAttemptAt');
    if (!contact) break;
    const owner = await User.findById(contact.owner).select('email');
    if (!owner || contact.followUpStatus !== 'Scheduled' || !contact.reminderEmailEnabled) {
      await Contact.updateOne({ _id: contact._id, notificationClaimedAt: claim }, { $unset: { notificationClaimedAt: 1 } });
      continue;
    }
    try {
      await sendReminderEmail({ email: owner.email, contactName: `${contact.firstName} ${contact.lastName || ''}`.trim(), followUpAt: contact.followUpAt, note: contact.reminderNote });
      await Contact.updateOne({ _id: contact._id, notificationClaimedAt: claim }, { $set: { notificationStatus: 'Sent', notificationSentAt: new Date() }, $unset: { notificationClaimedAt: 1, notificationNextAttemptAt: 1, notificationLastError: 1 } });
      processed += 1;
    } catch (error) {
      const attempts = contact.notificationAttempts + 1;
      await Contact.updateOne({ _id: contact._id, notificationClaimedAt: claim }, { $set: { notificationStatus: 'Failed', notificationNextAttemptAt: new Date(Date.now() + Math.min(30 * 60 * 1000, 2 ** attempts * 60 * 1000)), notificationLastError: 'SMTP delivery failed' }, $inc: { notificationAttempts: 1 }, $unset: { notificationClaimedAt: 1 } });
    }
  }
  return processed;
};

export const startReminderScheduler = () => {
  const timer = setInterval(() => { processDueReminders().catch(() => {}); }, intervalMs);
  timer.unref?.();
  processDueReminders().catch(() => {});
  return timer;
};
