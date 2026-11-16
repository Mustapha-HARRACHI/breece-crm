import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

process.env.JWT_SECRET = 'test-secret';

test('health endpoint remains public', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  } finally {
    server.close();
  }
});

test('authentication middleware rejects requests without a session', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
    assert.equal(response.status, 401);
  } finally {
    server.close();
  }
});

test('registration validates password length', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test', email: 'test@example.com', password: 'short' })
    });
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});
