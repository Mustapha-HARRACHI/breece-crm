import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Contact from '../src/models/Contact.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import Goal from '../src/models/Goal.js';
import { OAuth2Client } from 'google-auth-library';
import { processDueReminders } from '../src/services/reminderScheduler.js';
import { setTransportOverride } from '../src/services/mailer.js';

const enabled = Boolean(process.env.MONGODB_URI);
let server;
let baseUrl;
const users = [];

const request = (path, options = {}, cookie) => fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...options.headers } });
const register = async (name, email) => {
  const response = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password: 'correct-horse' }) });
  assert.equal(response.status, 201);
  users.push(email);
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
};

const csrfFrom = (cookie) => cookie.match(/(?:^|; )csrfToken=([^;]+)/)?.[1];
const sessionCookie = (user) => `session=${jwt.sign({ userId: user._id.toString(), sessionVersion: user.sessionVersion ?? 0 }, process.env.JWT_SECRET)}`;

test('contact CRUD, filtering, validation, and user isolation', { skip: !enabled }, async () => {
  const firstCookie = await register('First User', `first-${Date.now()}@example.com`);
  const secondCookie = await register('Second User', `second-${Date.now()}@example.com`);
  const create = await request('/api/contacts', { method: 'POST', body: JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace', company: 'Analytical Engines', category: 'Professional' }) }, firstCookie);
  assert.equal(create.status, 201);
  const contact = (await create.json()).contact;
  assert.equal((await request('/api/contacts?search=ada&category=Professional', {}, firstCookie)).status, 200);
  assert.equal((await request(`/api/contacts/${contact._id}`, {}, secondCookie)).status, 404);
  assert.equal((await request(`/api/contacts/${contact._id}`, { method: 'PATCH', body: JSON.stringify({ relationshipStatus: 'ToContact' }) }, firstCookie)).status, 200);
  assert.equal((await request(`/api/contacts/${contact._id}`, { method: 'DELETE' }, firstCookie)).status, 204);
  assert.equal((await request('/api/contacts/not-an-id', {}, firstCookie)).status, 400);
});

test('authentication cookies have secure local-development attributes', { skip: !enabled }, async () => {
  const email = `cookies-${Date.now()}@example.com`;
  const response = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Cookie User', email, password: 'correct-horse' }) });
  users.push(email);
  assert.equal(response.status, 201);
  const cookies = response.headers.getSetCookie();
  const session = cookies.find((cookie) => cookie.startsWith('session='));
  const csrf = cookies.find((cookie) => cookie.startsWith('csrfToken='));
  assert.match(session, /HttpOnly/); assert.match(session, /SameSite=Lax/); assert.match(session, /Max-Age=604800/); assert.doesNotMatch(session, /Secure/);
  assert.doesNotMatch(csrf, /HttpOnly/); assert.match(csrf, /SameSite=Lax/); assert.match(csrf, /Max-Age=604800/);
  assert.match((await request('/api/auth/logout', { method: 'POST' })).headers.getSetCookie().find((cookie) => cookie.startsWith('session=')), /Expires=Thu, 01 Jan 1970/);
});

test('statistics are authenticated, scoped, filterable, and empty-safe', { skip: !enabled }, async () => {
  const firstCookie = await register('Stats User', `stats-${Date.now()}@example.com`);
  const create = await request('/api/contacts', { method: 'POST', body: JSON.stringify({ firstName: 'Grace', category: 'Professional', meetingPlace: 'Paris', relationshipStatus: 'ToContact' }) }, firstCookie);
  assert.equal(create.status, 201);
  const stats = await request('/api/stats', {}, firstCookie);
  assert.equal(stats.status, 200);
  const data = await stats.json();
  assert.equal(data.total, 1);
  assert.equal(data.followUps, 1);
  assert.deepEqual(data.meetingPlaces, [{ _id: 'Paris', count: 1 }]);
  assert.equal((await request('/api/stats?from=bad-date', {}, firstCookie)).status, 400);
  assert.equal((await request('/api/stats')).status, 401);
});

test('password reset is generic, expires, is single-use, and changes the password', { skip: !enabled }, async () => {
  process.env.NODE_ENV = 'test';
  const email = `reset-${Date.now()}@example.com`;
  const passwordHash = await bcrypt.hash('old-password', 4);
  const user = await User.create({ name: 'Reset User', email, passwordHash });
  users.push(email);
  const oldSession = sessionCookie(user);
  const secondOldSession = sessionCookie(user);
  assert.equal((await request('/api/auth/me', {}, oldSession)).status, 200);
  assert.equal((await request('/api/auth/me', {}, secondOldSession)).status, 200);
  const unknown = await request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: 'missing@example.com' }) });
  const known = await request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
  assert.equal(unknown.status, 200); assert.equal(known.status, 200); assert.deepEqual(await unknown.json(), await known.json());
  const token = 'known-reset-token'; user.resetTokenHash = crypto.createHash('sha256').update(token).digest('hex'); user.resetTokenExpiresAt = new Date(Date.now() + 20 * 60 * 1000); await user.save();
  const reset = await request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password: 'new-password' }) });
  assert.equal(reset.status, 200);
  const resetSession = reset.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
  assert.equal((await request('/api/auth/me', {}, resetSession)).status, 200);
  assert.equal((await request('/api/auth/me', {}, oldSession)).status, 401);
  assert.equal((await request('/api/auth/me', {}, secondOldSession)).status, 401);
  assert.equal((await request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password: 'another-password' }) })).status, 400);
  const expired = 'expired-token'; user.resetTokenHash = crypto.createHash('sha256').update(expired).digest('hex'); user.resetTokenExpiresAt = new Date(Date.now() - 1); await user.save();
  assert.equal((await request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: expired, password: 'new-password' }) })).status, 400);
  assert.equal((await request('/api/auth/me', {}, resetSession)).status, 200);
  const loginOld = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'old-password' }) });
  assert.equal(loginOld.status, 401);
  const loginNew = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'new-password' }) });
  assert.equal(loginNew.status, 200);
});

test('Google configuration fails safely and sensitive endpoints rate-limit', { skip: !enabled }, async () => {
  const saved = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, callback: process.env.GOOGLE_CALLBACK_URL };
  delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; delete process.env.GOOGLE_CALLBACK_URL;
  assert.ok([503, 429].includes((await request('/api/auth/google')).status));
  Object.assign(process.env, { GOOGLE_CLIENT_ID: saved.id, GOOGLE_CLIENT_SECRET: saved.secret, GOOGLE_CALLBACK_URL: saved.callback });
  let last;
  for (let i = 0; i < 11; i += 1) last = await request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: `rate-${i}@example.com` }) });
  assert.equal(last.status, 429);
});

test('Google deletion reauthentication uses the existing callback and distinguishes cancellation', { skip: !enabled }, async () => {
  const saved = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET, callback: process.env.GOOGLE_CALLBACK_URL };
  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_CALLBACK_URL: 'http://localhost:5000/api/auth/google/callback' });
  const email = `google-delete-${Date.now()}@example.com`;
  const user = await User.create({ name: 'Google Delete', email, googleSubject: `google-${Date.now()}` }); users.push(email);
  const cookie = sessionCookie(user);
  const original = { generate: OAuth2Client.prototype.generateAuthUrl, token: OAuth2Client.prototype.getToken, verify: OAuth2Client.prototype.verifyIdToken };
  try {
    OAuth2Client.prototype.generateAuthUrl = () => 'https://accounts.google.com/mock';
    const start = await request('/api/privacy/account/google', { redirect: 'manual' }, cookie);
    assert.equal(start.status, 302);
    const stateCookie = start.headers.getSetCookie().find((value) => value.startsWith('delete_oauth_state='))?.split(';')[0];
    assert.ok(stateCookie);
    const state = stateCookie.split('=')[1].split('.')[0];
    OAuth2Client.prototype.getToken = async () => ({ tokens: { id_token: 'mock-id-token' } });
    OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({ sub: user.googleSubject, email, email_verified: true, iss: 'https://accounts.google.com' }) });
    const success = await request(`/api/auth/google/callback?state=${state}&code=mock-code`, { redirect: 'manual' }, `${cookie}; ${stateCookie}`);
    assert.equal(success.status, 302); assert.match(success.headers.get('location'), /googleDeleteVerified=1/);
    const cancelled = await request('/api/auth/google/callback?error=access_denied', { redirect: 'manual' }, `${cookie}; delete_oauth_state=${state}.verifier`);
    assert.equal(cancelled.status, 302); assert.match(cancelled.headers.get('location'), /googleDeleteError=cancelled/);
  } finally {
    OAuth2Client.prototype.generateAuthUrl = original.generate; OAuth2Client.prototype.getToken = original.token; OAuth2Client.prototype.verifyIdToken = original.verify;
    Object.assign(process.env, { GOOGLE_CLIENT_ID: saved.id || '', GOOGLE_CLIENT_SECRET: saved.secret || '', GOOGLE_CALLBACK_URL: saved.callback || '' });
  }
});

test('privacy export is isolated and account deletion verifies identity', { skip: !enabled }, async () => {
  const email = `privacy-${Date.now()}@example.com`;
  const otherEmail = `privacy-other-${Date.now()}@example.com`;
  const user = await User.create({ name: 'Privacy User', email, passwordHash: await bcrypt.hash('correct-horse', 4) });
  const other = await User.create({ name: 'Privacy Other', email: otherEmail, passwordHash: await bcrypt.hash('correct-horse', 4) });
  users.push(email, otherEmail);
  const cookie = `${sessionCookie(user)}; csrfToken=privacy-csrf`;
  const otherCookie = `${sessionCookie(other)}; csrfToken=other-csrf`;
  const created = await request('/api/contacts', { method: 'POST', body: JSON.stringify({ firstName: 'Private', notes: 'private note', category: 'Personal' }) }, cookie);
  const contact = (await created.json()).contact;
  const exported = await request('/api/privacy/export', {}, cookie);
  assert.equal(exported.status, 200); assert.equal(exported.headers.get('cache-control'), 'no-store'); assert.match(exported.headers.get('content-disposition'), /attachment/);
  const data = await exported.json(); assert.equal(data.profile.email, email); assert.equal(data.contacts[0].notes, 'private note'); assert.equal(JSON.stringify(data).includes('passwordHash'), false); assert.equal(JSON.stringify(data).includes('resetToken'), false);
  assert.equal((await request('/api/privacy/export')).status, 401);
  assert.equal((await request(`/api/contacts/${contact._id}`, {}, otherCookie)).status, 404);
  const csrf = csrfFrom(cookie);
  assert.equal((await request('/api/privacy/account', { method: 'DELETE', body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT', currentPassword: 'wrong' }), headers: { 'x-csrf-token': csrf } }, cookie)).status, 401);
  assert.equal((await request('/api/privacy/account', { method: 'DELETE', body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT', currentPassword: 'correct-horse' }), headers: { 'x-csrf-token': csrf } }, cookie)).status, 204);
  assert.equal((await request('/api/auth/me', {}, cookie)).status, 401);
});

test('goals and reminders calculate progress and enforce ownership', { skip: !enabled }, async () => {
  const email = `goals-${Date.now()}@example.com`; const otherEmail = `goals-other-${Date.now()}@example.com`;
  const user = await User.create({ name: 'Goals User', email, passwordHash: await bcrypt.hash('correct-horse', 4) });
  const other = await User.create({ name: 'Goals Other', email: otherEmail, passwordHash: await bcrypt.hash('correct-horse', 4) }); users.push(email, otherEmail);
  const cookie = sessionCookie(user); const otherCookie = sessionCookie(other);
  const month = new Date().toISOString().slice(0, 7);
  const goalResponse = await request('/api/goals', { method: 'POST', body: JSON.stringify({ month, target: 2 }) }, cookie); assert.equal(goalResponse.status, 201); const goal = (await goalResponse.json()).goal;
  const created = await request('/api/contacts', { method: 'POST', body: JSON.stringify({ firstName: 'Reminder', followUpAt: new Date(Date.now() + 86400000).toISOString(), reminderNote: 'Call back' }) }, cookie); assert.equal(created.status, 201); const contact = (await created.json()).contact;
  const goals = await request('/api/goals', {}, cookie); assert.equal((await goals.json()).goals[0].current, 1);
  assert.equal((await request(`/api/goals/${goal._id}`, { method: 'PATCH', body: JSON.stringify({ target: 3 }) }, otherCookie)).status, 404);
  const reminders = await request('/api/reminders?status=upcoming', {}, cookie); assert.equal((await reminders.json()).reminders.length, 1);
  assert.equal((await request(`/api/contacts/${contact._id}/reminder`, { method: 'PATCH', body: JSON.stringify({ followUpStatus: 'Completed' }) }, cookie)).status, 200);
  assert.equal((await request('/api/reminders', {}, cookie)).json && (await (await request('/api/reminders', {}, cookie)).json()).reminders.length, 0);
});

test('reminder scheduler claims atomically, retries safely, and recovers stale claims', { skip: !enabled }, async () => {
  const email = `scheduler-${Date.now()}@example.com`;
  const user = await User.create({ name: 'Scheduler User', email, passwordHash: await bcrypt.hash('correct-horse', 4) }); users.push(email);
  const sent = [];
  setTransportOverride(() => ({ sendMail: async (mail) => { sent.push(mail); } }));
  try {
    const due = await Contact.create({ owner: user._id, firstName: 'Due', email: 'crm-contact@example.com', followUpAt: new Date(Date.now() - 1000), reminderEmailEnabled: true, notificationStatus: 'Pending' });
    const future = await Contact.create({ owner: user._id, firstName: 'Future', followUpAt: new Date(Date.now() + 86400000), reminderEmailEnabled: true, notificationStatus: 'Pending' });
    const disabled = await Contact.create({ owner: user._id, firstName: 'Disabled', followUpAt: new Date(Date.now() - 1000), reminderEmailEnabled: false, notificationStatus: 'Disabled' });
    const completed = await Contact.create({ owner: user._id, firstName: 'Completed', followUpAt: new Date(Date.now() - 1000), reminderEmailEnabled: true, followUpStatus: 'Completed', notificationStatus: 'Disabled' });
    const cancelled = await Contact.create({ owner: user._id, firstName: 'Cancelled', followUpAt: new Date(Date.now() - 1000), reminderEmailEnabled: true, followUpStatus: 'Cancelled', notificationStatus: 'Disabled' });
    await Promise.all([processDueReminders(), processDueReminders()]);
    assert.equal(sent.length, 1); assert.equal(sent[0].to, email); assert.notEqual(sent[0].to, 'crm-contact@example.com');
    assert.equal((await Contact.findById(due._id)).notificationStatus, 'Sent');
    assert.equal((await Contact.findById(future._id)).notificationStatus, 'Pending');
    assert.equal((await Contact.findById(disabled._id)).notificationStatus, 'Disabled');
    assert.equal((await Contact.findById(completed._id)).notificationStatus, 'Disabled');
    assert.equal((await Contact.findById(cancelled._id)).notificationStatus, 'Disabled');

    const stale = await Contact.create({ owner: user._id, firstName: 'Stale', followUpAt: new Date(Date.now() - 1000), reminderEmailEnabled: true, notificationStatus: 'Sending', notificationClaimedAt: new Date(Date.now() - 11 * 60 * 1000), notificationClaimId: 'old-worker' });
    await processDueReminders(); assert.equal((await Contact.findById(stale._id)).notificationStatus, 'Sent');

    let failures = 0; setTransportOverride(() => ({ sendMail: async () => { failures += 1; throw new Error('mock SMTP failure'); } }));
    const failed = await Contact.create({ owner: user._id, firstName: 'Failed', followUpAt: new Date(Date.now() - 1000), reminderEmailEnabled: true, notificationStatus: 'Pending' });
    await processDueReminders(); let state = await Contact.findById(failed._id).select('+notificationAttempts +notificationNextAttemptAt');
    assert.equal(state.notificationAttempts, 1); assert.ok(state.notificationNextAttemptAt > new Date());
    for (let attempt = 2; attempt <= 3; attempt += 1) { await Contact.updateOne({ _id: failed._id }, { $set: { notificationNextAttemptAt: new Date(Date.now() - 1) } }); await processDueReminders(); }
    state = await Contact.findById(failed._id).select('+notificationAttempts +notificationNextAttemptAt');
    assert.equal(state.notificationAttempts, 3); assert.equal(failures, 3);
    await processDueReminders(); assert.equal(failures, 3);
  } finally { setTransportOverride(undefined); }
});

if (enabled) {
  before(async () => { process.env.JWT_SECRET = 'integration-test-secret'; await mongoose.connect(process.env.MONGODB_URI); server = app.listen(0); baseUrl = `http://127.0.0.1:${server.address().port}`; });
  after(async () => { await Contact.deleteMany({}); await Goal.deleteMany({}); await User.deleteMany({ email: { $in: users } }); server.close(); await mongoose.disconnect(); });
}
