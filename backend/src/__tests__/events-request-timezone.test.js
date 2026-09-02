'use strict';

/**
 * Regression test for POST /api/v1/events/request's conflict check
 * (backend/src/routes/events.js).
 *
 * Found live in production (2026-09-02): an employee's event request for a
 * date with no visible checkin was rejected with EVENT_DATE_CONFLICT. Root
 * cause: the route's conflict check was an inline UNION query that cast
 * checkins.timestamp (TIMESTAMPTZ) with a raw ::date — evaluated in the DB
 * session's timezone (UTC on AWS RDS by default), silently disagreeing with
 * the Europe/Rome calendar date near local midnight. Same bug class as
 * CLAUDE.md Pattern 6 (checkins.js, commit 615fcbf) and the approval path's
 * own findConflictingCheckin() (eventConflict.js), which the inline UNION
 * never used.
 *
 * Fix: the route now calls the same shared, already-timezone-safe helpers
 * (findConflictingCheckin, findConflictingSmartWorking, findConflictingEvent,
 * findConflictingLeaveRange, findConflictingIllnessRange) the approval path
 * uses, instead of duplicating the query inline (CLAUDE.md Pattern 7).
 *
 * This file is a route-level regression test for that refactor — it does NOT
 * re-prove the timezone edge case itself (that requires forcing the DB
 * session's own timezone to UTC on the exact connection running the query,
 * which eventConflict-timezone.test.js already does directly against
 * findConflictingCheckin; the HTTP route here runs through the app's shared
 * pool, whose per-connection session timezone this test can't control).
 * What this file guards against is a regression in the *wiring*: that the
 * route still correctly blocks a same-day checkin and still correctly
 * allows a different-day one, now that the check is a set of function calls
 * instead of one UNION query.
 */

const { Pool } = require('pg');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const dbConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/badge_system_test',
};

let app;
let pool;
let dbAvailable = true;

function uniqueEmail(label) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
}

function tokenFor({ user_id, client_id, role }) {
  const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  return jwt.sign({ user_id, client_id, role, name: 'Test' }, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

beforeAll(async () => {
  pool = new Pool(dbConfig);
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    dbAvailable = false;
    // eslint-disable-next-line no-console
    console.warn(`events-request-timezone.test.js: no reachable Postgres (${err.message}) — soft-skipping real-DB tests.`);
    return;
  }
  app = require('../app');
});

afterAll(async () => {
  await pool.end();
});

async function makeClientAndEmployee(suffix) {
  const clientResult = await pool.query(
    'INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id',
    [`Events Conflict Regression ${suffix}`, `events-conflict-${suffix}@example.com`]
  );
  const clientId = clientResult.rows[0].id;
  const empResult = await pool.query(
    `INSERT INTO employees (client_id, email, name, role, password_hash, active)
     VALUES ($1::uuid, $2, 'Events Conflict Regression Employee', 'employee', 'x', true) RETURNING id`,
    [clientId, uniqueEmail('events-conflict-emp')]
  );
  return { clientId, employeeId: empResult.rows[0].id };
}

async function makeSite(clientId) {
  const qrContent = `badge://test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = await pool.query(
    'INSERT INTO sites (client_id, name, qr_code_content) VALUES ($1::uuid, $2, $3) RETURNING id',
    [clientId, 'Events Conflict Regression Site', qrContent]
  );
  return result.rows[0].id;
}

async function makeCheckin(employeeId, siteId, clientId, timestampIso) {
  await pool.query(
    `INSERT INTO checkins (employee_id, site_id, client_id, type, timestamp, created_by, created_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'IN', $4::timestamptz, $1::uuid, NOW())`,
    [employeeId, siteId, clientId, timestampIso]
  );
}

describe('POST /api/v1/events/request — conflict check via shared helpers (post-refactor regression)', () => {
  it('blocks the request when the employee has a checkin on the exact requested date', async () => {
    if (!dbAvailable) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { clientId, employeeId } = await makeClientAndEmployee(suffix);
    try {
      const siteId = await makeSite(clientId);
      await makeCheckin(employeeId, siteId, clientId, '2026-09-05T10:00:00+02:00');

      const token = tokenFor({ user_id: employeeId, client_id: clientId, role: 'employee' });
      const res = await request(app)
        .post('/api/v1/events/request')
        .set('Authorization', `Bearer ${token}`)
        .send({ event_date: '2026-09-05', start_time: '08:00', end_time: '18:00', description: 'Regression test' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
    } finally {
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    }
  });

  it('allows the request when the checkin is on a different date entirely', async () => {
    if (!dbAvailable) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { clientId, employeeId } = await makeClientAndEmployee(suffix);
    try {
      const siteId = await makeSite(clientId);
      await makeCheckin(employeeId, siteId, clientId, '2026-09-01T10:00:00+02:00');

      const token = tokenFor({ user_id: employeeId, client_id: clientId, role: 'employee' });
      const res = await request(app)
        .post('/api/v1/events/request')
        .set('Authorization', `Bearer ${token}`)
        .send({ event_date: '2026-09-05', start_time: '08:00', end_time: '18:00', description: 'Regression test' });

      expect(res.status).toBe(201);
    } finally {
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    }
  });
});
