import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import Contact from '../src/models/Contact.js';
import Goal from '../src/models/Goal.js';
import { buildDemoDataset, validateDemoConfig } from '../src/scripts/demoData.js';

const config = { MONGODB_URI: 'mongodb://demo-mongodb:27017/breece_crm_demo', DEMO_USER_EMAIL: 'demo@breece.example.test', DEMO_ANCHOR_DATE: '2026-11-18', DEMO_USER_PASSWORD: randomBytes(24).toString('hex'), DEMO_SEED_CONFIRM: 'breece_crm_demo' };

test('demo seed refuses the main database, real email addresses and unconfirmed writes', () => {
  assert.throws(() => validateDemoConfig({ ...config, MONGODB_URI: 'mongodb://mongodb:27017/breece_crm' }, { write: true }), /Refusing/);
  assert.throws(() => validateDemoConfig({ ...config, DEMO_USER_EMAIL: 'someone@real.invalid' }, { write: true }), /example.test/);
  assert.throws(() => validateDemoConfig({ ...config, DEMO_SEED_CONFIRM: '' }, { write: true }), /Refusing/);
  assert.throws(() => validateDemoConfig({ ...config, DEMO_USER_PASSWORD: 'short' }, { write: true }), /password/);
  assert.throws(() => validateDemoConfig({ ...config, DEMO_ANCHOR_DATE: '2026-02-30' }, { write: true }), /valid UTC date/);
  assert.deepEqual(validateDemoConfig({ ...config, DEMO_USER_PASSWORD: '', DEMO_SEED_CONFIRM: '' }), { email: config.DEMO_USER_EMAIL, anchor: config.DEMO_ANCHOR_DATE });
});

test('demo records are deterministic, valid and internally consistent', () => {
  const first = buildDemoDataset(config.DEMO_ANCHOR_DATE, config.DEMO_USER_EMAIL);
  const again = buildDemoDataset(config.DEMO_ANCHOR_DATE, config.DEMO_USER_EMAIL);
  assert.equal(JSON.stringify(first), JSON.stringify(again));
  assert.equal(first.contacts.length, 100);
  assert.equal(first.goals.length, 6);
  assert.equal(new Set(first.contacts.map((contact) => contact._id.toString())).size, 100);
  assert.equal(new Set(first.contacts.map((contact) => contact.createdAt.toISOString().slice(0, 7))).size, 12);
  assert.deepEqual(new Set(first.contacts.map((contact) => contact.category)), new Set(['Professional', 'Personal', 'Network']));
  assert.deepEqual(new Set(first.contacts.map((contact) => contact.relationshipStatus)), new Set(['Active', 'Inactive', 'ToContact']));
  assert.ok(first.contacts.every((contact) => contact.owner.equals(first.user._id) && contact.email.endsWith('.example.test') && !contact.reminderEmailEnabled && contact.notificationStatus === 'Disabled' && !new Contact(contact).validateSync()));
  assert.ok(first.goals.every((goal) => goal.owner.equals(first.user._id) && !new Goal(goal).validateSync()));
  for (const goal of first.goals) assert.ok(first.contacts.filter((contact) => contact.createdAt.toISOString().slice(0, 7) === goal.month).length > 0);
  const reminders = first.contacts.filter((contact) => contact.followUpAt);
  assert.equal(reminders.length, 20);
  assert.equal(reminders.filter((contact) => contact.followUpStatus === 'Scheduled' && contact.followUpAt > new Date('2026-11-18T00:00:00Z')).length, 10);
  assert.equal(reminders.filter((contact) => contact.followUpStatus === 'Scheduled' && contact.followUpAt < new Date('2026-11-18T00:00:00Z')).length, 6);
  assert.equal(reminders.filter((contact) => contact.followUpStatus === 'Completed').length, 2);
  assert.equal(reminders.filter((contact) => contact.followUpStatus === 'Cancelled').length, 2);
});
