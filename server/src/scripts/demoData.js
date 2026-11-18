import { createHash } from 'node:crypto';
import mongoose from 'mongoose';

const demoUri = 'mongodb://demo-mongodb:27017/breece_crm_demo';
const dayMs = 24 * 60 * 60 * 1000;
const givenNames = ['Aveline', 'Bastien', 'Celina', 'Darian', 'Elora', 'Faris', 'Giselle', 'Hugo', 'Inaya', 'Jules', 'Kaia', 'Lior', 'Maren', 'Nolan', 'Oriana', 'Pavel', 'Rhea', 'Soren', 'Talia', 'Yanis'];
const familyNames = ['Vellin', 'Sorell', 'Noreval', 'Belmont', 'Ravelle', 'Mirel', 'Calderin', 'Fauver', 'Lemarie', 'Ardenne', 'Vireau', 'Dorel', 'Savel', 'Tremont', 'Elvane', 'Corentin', 'Navarre', 'Isorel', 'Marlowe', 'Tessier'];
const companies = ['Lumafern Studio (Demo)', 'Asterfield Works (Demo)', 'Cobalt Orchard Lab (Demo)', 'North Quay Atelier (Demo)', 'Mosaic Vale Group (Demo)', 'Silverleaf Collective (Demo)', 'Blue Lantern Research (Demo)', 'Oakbridge Design (Demo)'];
const roles = ['Product designer', 'Research lead', 'Community manager', 'Operations analyst', 'Creative director', 'Partnerships specialist', 'Software engineer', 'Program coordinator'];
const places = ['Community workshop', 'Innovation forum', 'City library', 'Video call', 'Studio visit', 'Co-working lounge', 'Conference hall', 'Local café'];
const noteTopics = ['discuss a collaborative workshop', 'share a project update', 'exchange an introduction', 'review a possible partnership', 'catch up on a community event'];
const categories = ['Professional', 'Personal', 'Network'];
const relationshipStatuses = ['Active', 'Inactive', 'ToContact'];

const idFor = (kind, index = '') => new mongoose.Types.ObjectId(createHash('sha256').update(`breece-demo-v1:${kind}:${index}`).digest().subarray(0, 12));

export function validateDemoConfig(env, { write = false } = {}) {
  if (env.MONGODB_URI !== demoUri) throw new Error('Refusing to run: MongoDB URI is not the dedicated demo container and database.');
  const email = String(env.DEMO_USER_EMAIL || '').trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)*example\.test$/.test(email)) throw new Error('Demo email must use the reserved example.test domain.');
  const anchor = String(env.DEMO_ANCHOR_DATE || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || Number.isNaN(new Date(`${anchor}T00:00:00.000Z`).getTime()) || new Date(`${anchor}T00:00:00.000Z`).toISOString().slice(0, 10) !== anchor) throw new Error('Demo anchor must be a valid UTC date in YYYY-MM-DD format.');
  if (write) {
    if (env.DEMO_SEED_CONFIRM !== 'breece_crm_demo') throw new Error('Refusing to write: set DEMO_SEED_CONFIRM=breece_crm_demo explicitly.');
    if (typeof env.DEMO_USER_PASSWORD !== 'string' || env.DEMO_USER_PASSWORD.length < 16 || env.DEMO_USER_PASSWORD.length > 128 || /^replace/i.test(env.DEMO_USER_PASSWORD)) throw new Error('Set a unique demo password of 16–128 characters.');
  }
  return { email, anchor };
}

export function buildDemoDataset(anchor, email) {
  const anchorDate = new Date(`${anchor}T00:00:00.000Z`);
  const userId = idFor('user');
  const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth() - 11 + index, 1)));
  const contacts = [];
  for (const [monthIndex, month] of months.entries()) {
    const count = monthIndex < 8 ? 8 : 9;
    for (let position = 0; position < count; position += 1) {
      const index = contacts.length;
      const limit = monthIndex === 11 ? Math.max(1, anchorDate.getUTCDate() - 1) : 25;
      const createdDay = 1 + ((position * 3 + monthIndex * 2) % limit);
      const createdAt = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), createdDay, 9 + (position % 7), 15));
      const category = categories[index % categories.length];
      const contact = {
        _id: idFor('contact', index), owner: userId,
        firstName: givenNames[index % givenNames.length], lastName: familyNames[Math.floor(index / givenNames.length)],
        email: `contact${String(index + 1).padStart(3, '0')}@people.example.test`,
        category, relationshipStatus: relationshipStatuses[(index + Math.floor(index / 7)) % relationshipStatuses.length],
        company: category === 'Personal' && index % 2 ? undefined : companies[index % companies.length],
        jobTitle: category === 'Personal' && index % 2 ? undefined : roles[index % roles.length],
        meetingPlace: index % 11 ? places[(index * 3) % places.length] : undefined,
        meetingDate: new Date(createdAt.getTime() - (2 + index % 18) * dayMs),
        mainSocialNetwork: category === 'Personal' ? undefined : index % 2 ? 'Mastodon' : 'LinkedIn',
        notes: `Synthetic BREECE CRM demo record: ${noteTopics[index % noteTopics.length]}. No real person or organization.`,
        reminderEmailEnabled: false, notificationStatus: 'Disabled',
        createdAt, updatedAt: createdAt
      };
      if (index % 5 === 0) {
        const reminderIndex = index / 5;
        const upcoming = reminderIndex < 10;
        const completed = reminderIndex >= 16 && reminderIndex < 18;
        const cancelled = reminderIndex >= 18;
        const dayOffset = upcoming || cancelled ? 2 + (reminderIndex % 14) : -(2 + (reminderIndex % 8));
        contact.followUpAt = new Date(anchorDate.getTime() + dayOffset * dayMs + (9 + reminderIndex % 7) * 60 * 60 * 1000 + 30 * 60 * 1000);
        contact.followUpStatus = completed ? 'Completed' : cancelled ? 'Cancelled' : 'Scheduled';
        contact.reminderNote = `Synthetic follow-up: ${noteTopics[reminderIndex % noteTopics.length]}.`;
      }
      contacts.push(contact);
    }
  }
  const targets = [10, 9, 11, 8, 12, 10];
  const goals = months.slice(-6).map((month, index) => {
    const monthKey = month.toISOString().slice(0, 7);
    const createdAt = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 8));
    return { _id: idFor('goal', monthKey), owner: userId, month: monthKey, target: targets[index], createdAt, updatedAt: createdAt };
  });
  return { user: { _id: userId, name: 'BREECE Demo Account (Synthetic)', email }, contacts, goals };
}
