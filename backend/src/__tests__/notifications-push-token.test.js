'use strict';

/**
 * Integration test for POST /api/v1/notifications/push-token — real Postgres,
 * shares badge_system_test with 40+ other files (CLAUDE.md Pattern 5): ogni
 * riga creata/pulita è scoped a un client_id generato da QUESTO test.
 */

const { Pool } = require('pg');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const dbConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/badge_system_test',
};

let app;
let pool;
let clientId;
let employeeId;
let authToken;
let dbAvailable = true;

function tokenFor({ user_id, client_id, role, employee_id }) {
  const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  const payload = { user_id, client_id, role, name: 'Test' };
  if (employee_id) payload.employee_id = employee_id;
  return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

beforeAll(async () => {
  pool = new Pool(dbConfig);
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    dbAvailable = false;
    // eslint-disable-next-line no-console
    console.warn(`notifications-push-token.test.js: no reachable Postgres (${err.message}) — soft-skipping real-DB tests.`);
    return;
  }
  app = require('../app');
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clientResult = await pool.query(
    'INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id',
    [`Push Token Test ${suffix}`, `push-test-${suffix}@example.com`]
  );
  clientId = clientResult.rows[0].id;

  const empResult = await pool.query(
    `INSERT INTO employees (client_id, email, name, role, password_hash, active)
     VALUES ($1::uuid, $2, 'Push Test Employee', 'employee', 'x', true) RETURNING id`,
    [clientId, `push-emp-${suffix}@example.com`]
  );
  employeeId = empResult.rows[0].id;

  authToken = tokenFor({ user_id: employeeId, employee_id: employeeId, client_id: clientId, role: 'employee' });
});

afterEach(async () => {
  if (!dbAvailable) return;
  await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
});

describe('POST /api/v1/notifications/push-token', () => {
  it('inserts a new token row for the authenticated employee', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/notifications/push-token')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ token: 'ExponentPushToken[test-aaa]', platform: 'ios' });

    expect(res.status).toBe(200);

    const row = await pool.query(
      'SELECT employee_id, client_id, platform FROM device_push_tokens WHERE token = $1',
      ['ExponentPushToken[test-aaa]']
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].employee_id).toBe(employeeId);
    expect(row.rows[0].client_id).toBe(clientId);
    expect(row.rows[0].platform).toBe('ios');
  });

  it('upserts (reassigns) an existing token to a new employee', async () => {
    if (!dbAvailable) return;
    await pool.query(
      'INSERT INTO device_push_tokens (employee_id, client_id, token, platform) VALUES ($1::uuid, $2::uuid, $3, \'android\')',
      [employeeId, clientId, 'ExponentPushToken[test-bbb]']
    );

    const suffix2 = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const otherEmpResult = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, password_hash, active)
       VALUES ($1::uuid, $2, 'Other Employee', 'employee', 'x', true) RETURNING id`,
      [clientId, `push-other-${suffix2}@example.com`]
    );
    const otherEmployeeId = otherEmpResult.rows[0].id;
    const otherToken = tokenFor({
      user_id: otherEmployeeId, employee_id: otherEmployeeId, client_id: clientId, role: 'employee',
    });

    const res = await request(app)
      .post('/api/v1/notifications/push-token')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ token: 'ExponentPushToken[test-bbb]', platform: 'android' });

    expect(res.status).toBe(200);
    const row = await pool.query(
      'SELECT employee_id FROM device_push_tokens WHERE token = $1',
      ['ExponentPushToken[test-bbb]']
    );
    expect(row.rows[0].employee_id).toBe(otherEmployeeId);
  });

  it('rejects with 403 fail-closed error when the account has no employee profile', async () => {
    if (!dbAvailable) return;
    const adminToken = tokenFor({
      user_id: '00000000-0000-0000-0000-000000000001', client_id: clientId, role: 'admin',
    });

    const res = await request(app)
      .post('/api/v1/notifications/push-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ token: 'ExponentPushToken[test-ccc]', platform: 'ios' });

    expect(res.status).toBe(403);
    // Global error handler (src/app.js) puts the ApiError code on `error`, not `code`.
    expect(res.body.error).toBe('PUSH_TOKEN_NO_EMPLOYEE_PROFILE');
  });

  it('rejects an invalid platform value', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/notifications/push-token')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ token: 'ExponentPushToken[test-ddd]', platform: 'windows-phone' });

    expect(res.status).toBe(400);
  });

  it('rejects a request missing the token field', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/notifications/push-token')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ platform: 'ios' });

    expect(res.status).toBe(400);
  });

  it('rejects a token exceeding the maximum length', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/notifications/push-token')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ token: 'x'.repeat(600), platform: 'ios' });

    expect(res.status).toBe(400);
  });

  it('rejects a non-Expo-shaped token that is otherwise within the length bounds', async () => {
    // 'x'.repeat(50) passes the .min(10).max(512) length check but matches
    // neither the ExponentPushToken[...]/ExpoPushToken[...] prefix shape nor
    // the bare-UUID shape — must be rejected at intake (see isValidExpoPushToken
    // in src/utils/pushNotifications.js).
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/notifications/push-token')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ token: 'x'.repeat(50), platform: 'ios' });

    expect(res.status).toBe(400);
  });

  it('rejects a request missing the platform field', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/notifications/push-token')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ token: 'ExponentPushToken[test-eee]' });

    expect(res.status).toBe(400);
  });

  it('does not 429 across many back-to-back requests in the same Jest process (pushTokenLimiter is skipped under NODE_ENV=test, same as every other named limiter — see rateLimiter.js)', async () => {
    // pushTokenLimiter's max is 10 req/15min in real traffic. This file alone
    // already issues 8+ requests against this same route in the same process;
    // without the shared `skip: NODE_ENV === 'test'` convention, the limiter
    // would start rejecting the later tests in this suite with 429 instead of
    // the expected 200/400/403. Real limiter behavior is covered separately
    // (see demo-start-rate-limit.test.js for the pattern used to exercise a
    // real, unmocked limiter in isolation).
    if (!dbAvailable) return;
    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .post('/api/v1/notifications/push-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token: `ExponentPushToken[test-loop-${i}]`, platform: 'ios' });
      expect(res.status).toBe(200);
    }
  });

  it('ignores any client_id sent in the body — always uses the authenticated employee\'s own client_id (tenant isolation)', async () => {
    if (!dbAvailable) return;
    const suffix3 = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const otherClientResult = await pool.query(
      'INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id',
      [`Other Client ${suffix3}`, `other-client-${suffix3}@example.com`]
    );
    const otherClientId = otherClientResult.rows[0].id;

    try {
      const res = await request(app)
        .post('/api/v1/notifications/push-token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token: 'ExponentPushToken[test-fff]', platform: 'ios', client_id: otherClientId });

      expect(res.status).toBe(200);
      const row = await pool.query(
        'SELECT client_id FROM device_push_tokens WHERE token = $1',
        ['ExponentPushToken[test-fff]']
      );
      expect(row.rows[0].client_id).toBe(clientId);
    } finally {
      await pool.query('DELETE FROM clients WHERE id = $1', [otherClientId]);
    }
  });
});
