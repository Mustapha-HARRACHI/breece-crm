import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Contact from '../src/models/Contact.js';

const enabled = Boolean(process.env.MONGODB_URI);
let server;
let baseUrl;
const users = [];

const request = (path, options = {}, cookie) => fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...options.headers } });
const register = async (name, email) => {
  const response = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password: 'correct-horse' }) });
  assert.equal(response.status, 201);
  users.push(email);
  return response.headers.get('set-cookie').split(';')[0];
};

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

if (enabled) {
  before(async () => { process.env.JWT_SECRET = 'integration-test-secret'; await mongoose.connect(process.env.MONGODB_URI); server = app.listen(0); baseUrl = `http://127.0.0.1:${server.address().port}`; });
  after(async () => { await Contact.deleteMany({}); await User.deleteMany({ email: { $in: users } }); server.close(); await mongoose.disconnect(); });
}
