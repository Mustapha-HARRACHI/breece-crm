import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Contact from '../src/models/Contact.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

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
  const unknown = await request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: 'missing@example.com' }) });
  const known = await request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
  assert.equal(unknown.status, 200); assert.equal(known.status, 200); assert.deepEqual(await unknown.json(), await known.json());
  const token = 'known-reset-token'; user.resetTokenHash = crypto.createHash('sha256').update(token).digest('hex'); user.resetTokenExpiresAt = new Date(Date.now() + 20 * 60 * 1000); await user.save();
  const reset = await request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password: 'new-password' }) });
  assert.equal(reset.status, 200);
  assert.equal((await request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password: 'another-password' }) })).status, 400);
  const expired = 'expired-token'; user.resetTokenHash = crypto.createHash('sha256').update(expired).digest('hex'); user.resetTokenExpiresAt = new Date(Date.now() - 1); await user.save();
  assert.equal((await request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: expired, password: 'new-password' }) })).status, 400);
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

test('privacy export is isolated and account deletion verifies identity', { skip: !enabled }, async () => {
  const email = `privacy-${Date.now()}@example.com`;
  const otherEmail = `privacy-other-${Date.now()}@example.com`;
  const user = await User.create({ name: 'Privacy User', email, passwordHash: await bcrypt.hash('correct-horse', 4) });
  const other = await User.create({ name: 'Privacy Other', email: otherEmail, passwordHash: await bcrypt.hash('correct-horse', 4) });
  users.push(email, otherEmail);
  const cookie = `session=${jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET)}; csrfToken=privacy-csrf`;
  const otherCookie = `session=${jwt.sign({ userId: other._id.toString() }, process.env.JWT_SECRET)}; csrfToken=other-csrf`;
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

if (enabled) {
  before(async () => { process.env.JWT_SECRET = 'integration-test-secret'; await mongoose.connect(process.env.MONGODB_URI); server = app.listen(0); baseUrl = `http://127.0.0.1:${server.address().port}`; });
  after(async () => { await Contact.deleteMany({}); await User.deleteMany({ email: { $in: users } }); server.close(); await mongoose.disconnect(); });
}
