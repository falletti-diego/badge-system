'use strict';

/**
 * Regression test: POST /api/v1/auth/refresh must succeed on the FIRST
 * refresh attempt for a real (DB-backed, non-@badge.local) employee login.
 *
 * Reproduces the bug documented in
 * docs/superpowers/plans/2026-07-14-refresh-replay-detection-hotfix.md:
 * commit 6abb03f (14 Jun 2026) re-added a best-effort `used_tokens` INSERT
 * at login time to close a concurrency hole, but POST /refresh's replay
 * check still treats *finding* that row as proof of replay — so the very
 * first refresh for any real customer login is rejected with 401
 * SESSION_REVOKED. Soft-skips without a reachable local Postgres, same
 * pattern as demoSeed.test.js / demo-start.test.js.
 */

const { Pool } = require('pg');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'badge_system_test',
});

let dbAvailable = true;
let app;

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    dbAvailable = false;
    // eslint-disable-next-line no-console
    console.warn(`auth-refresh-first-use.test.js: no reachable Postgres (${err.message}) — soft-skipping real-DB tests.`);
    return;
  }
  app = require('../app');
});

afterAll(async () => {
  await pool.end();
});

describe('POST /auth/refresh — first-use regression (real DB, real login, real employee)', () => {
  const TEST_EMAIL = 'auth-refresh-first-use-regression@example.test';
  let clientId;
  let employeeId;
  const PASSWORD = 'RegressionTest123!';

  beforeAll(async () => {
    if (!dbAvailable) return;
    // Use the app's own password helper (bcryptjs, cost 12), not a raw
    // bcrypt call — this codebase uses bcryptjs (see src/auth/password.js),
    // not the native bcrypt module, and hashPassword() enforces the same
    // MIN_LENGTH/cost invariants login verification expects.
    const { hashPassword } = require('../auth/password');
    const passwordHash = await hashPassword(PASSWORD);

    const clientResult = await pool.query(
      `INSERT INTO clients (id, name, email, plan)
       VALUES (uuid_generate_v4(), 'Auth Refresh Regression Test Client', $1, 'basic')
       RETURNING id`,
      [`client-${TEST_EMAIL}`]
    );
    clientId = clientResult.rows[0].id;

    const siteResult = await pool.query(
      `INSERT INTO sites (id, client_id, name, location, qr_code_content)
       VALUES (uuid_generate_v4(), $1, 'Test Site', 'Test Location', $2)
       RETURNING id`,
      [clientId, `qr-${TEST_EMAIL}`]
    );
    const siteId = siteResult.rows[0].id;

    const employeeResult = await pool.query(
      `INSERT INTO employees (id, client_id, email, name, role, site_id, password_hash)
       VALUES (uuid_generate_v4(), $1, $2, 'Regression Test Employee', 'employee', $3, $4)
       RETURNING id`,
      [clientId, TEST_EMAIL, siteId, passwordHash]
    );
    employeeId = employeeResult.rows[0].id;
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    // employees/sites cascade from clients (ON DELETE CASCADE) — one DELETE is enough.
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('succeeds on the very first refresh attempt immediately after login', async () => {
    if (!dbAvailable) return;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: PASSWORD, client_id: clientId });

    expect(loginRes.status).toBe(200);
    expect(typeof loginRes.body.data.refresh_token).toBe('string');

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: loginRes.body.data.refresh_token });

    // This is the exact bug: today this responds 401 SESSION_REVOKED
    // instead of 200 with a newly rotated token pair.
    expect(refreshRes.status).toBe(200);
    expect(typeof refreshRes.body.data.token).toBe('string');
    expect(typeof refreshRes.body.data.refresh_token).toBe('string');

    const decodedNewAccess = jwt.decode(refreshRes.body.data.token);
    expect(decodedNewAccess.user_id).toBe(employeeId);
    expect(decodedNewAccess.client_id).toBe(clientId);
  });

  it('rejects reuse of an already-rotated (consumed) refresh token as a replay', async () => {
    if (!dbAvailable) return;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: PASSWORD, client_id: clientId });
    expect(loginRes.status).toBe(200);
    const originalRefreshToken = loginRes.body.data.refresh_token;

    // First refresh: consumes (rotates) the original token. Must succeed.
    const firstRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: originalRefreshToken });
    expect(firstRefresh.status).toBe(200);

    // Replaying the SAME (now-consumed) original token again must be
    // rejected as a replay, not silently accepted a second time.
    const replayAttempt = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: originalRefreshToken });
    expect(replayAttempt.status).toBe(401);
    expect(replayAttempt.body.error).toBe('SESSION_REVOKED');
  });
});

/**
 * Regression: a real, DB-authenticated employee whose `id` happens to
 * collide with an entry in DEMO_USERS (this is not hypothetical — see
 * backend/migrations/022_merge_maria_badge_local_to_real_employee.sql and
 * backend/src/__fixtures__/demo-users.js, which intentionally gives the
 * real employee maria.rossi@torino.it the same id as the maria@badge.local
 * fixture entry) must NOT have replay detection silently disabled just
 * because `DEMO_USERS.find(u => u.id === user_id)` matches her id — she
 * logged in via the real DB path with a real password, not via
 * @badge.local, and her session is not exempt from used_tokens tracking.
 *
 * This test deliberately reuses a DEMO_USERS id (Pippo's) for a *newly
 * created* test employee under an isolated test client with a non-demo
 * email, to reproduce the id-collision mechanism without touching the
 * real seeded Maria/Pippo data.
 */
describe('POST /auth/refresh — id-collision-with-DEMO_USERS regression (real DB)', () => {
  const TEST_EMAIL = 'auth-refresh-id-collision-regression@example.test';
  // Pippo's employees row already exists (seeded by migrations/018), with
  // id matching the DEMO_USERS fixture entry exactly -- reusing it in place
  // (instead of inserting a new row) reproduces the real collision
  // mechanism without a duplicate-PK conflict. Original email/password_hash
  // are restored in afterAll so this doesn't permanently mutate seed data
  // shared with other test files.
  const PIPPO_DEMO_USER_ID = '550e8400-e29b-41d4-a716-446655440010';
  const PASSWORD = 'RegressionTest123!';
  let originalEmail;
  let originalPasswordHash;

  beforeAll(async () => {
    if (!dbAvailable) return;
    const { hashPassword } = require('../auth/password');
    const passwordHash = await hashPassword(PASSWORD);

    const existing = await pool.query(
      'SELECT email, password_hash FROM employees WHERE id = $1',
      [PIPPO_DEMO_USER_ID]
    );
    originalEmail = existing.rows[0].email;
    originalPasswordHash = existing.rows[0].password_hash;

    // Temporarily repurpose Pippo's existing employees row as a real,
    // password-authenticated, non-demo login -- same id as the DEMO_USERS
    // fixture entry, but a real DB login path (not @badge.local).
    await pool.query(
      'UPDATE employees SET email = $1, password_hash = $2 WHERE id = $3',
      [TEST_EMAIL, passwordHash, PIPPO_DEMO_USER_ID]
    );
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await pool.query(
      'UPDATE employees SET email = $1, password_hash = $2 WHERE id = $3',
      [originalEmail, originalPasswordHash, PIPPO_DEMO_USER_ID]
    );
  });

  it('still enforces replay detection on a second use of an already-consumed token', async () => {
    if (!dbAvailable) return;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: PASSWORD });
    expect(loginRes.status).toBe(200);
    const originalRefreshToken = loginRes.body.data.refresh_token;

    const firstRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: originalRefreshToken });
    expect(firstRefresh.status).toBe(200);

    // If replay detection were incorrectly disabled for this user (because
    // their id collides with DEMO_USERS), this second use of the same
    // already-consumed token would wrongly succeed instead of being
    // rejected.
    const replayAttempt = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: originalRefreshToken });
    expect(replayAttempt.status).toBe(401);
    expect(replayAttempt.body.error).toBe('SESSION_REVOKED');
  });
});

/**
 * Regression: after an admin permanently revokes a user's session via
 * POST /auth/revoke-session (which deletes their used_tokens rows and
 * inserts a revoked_tokens row with revoked_until=NULL, i.e. permanent),
 * that user's stale-but-not-yet-JWT-expired refresh token must be rejected
 * with SESSION_REVOKED, and the permanent revoke must NOT be silently
 * downgraded to a 5-minute temporary block. Before the fix, the flipped
 * replay check treated the (correctly) absent used_tokens row as a replay
 * attempt, and its `ON CONFLICT (user_id) DO UPDATE SET revoked_until =
 * NOW() + INTERVAL '5 minutes'` clobbered the permanent revoke -- letting
 * the revoked user regain access 5 minutes later, by accident.
 */
describe('POST /auth/refresh — permanent revoke must not be downgraded by the replay check (real DB)', () => {
  const TEST_EMAIL = 'auth-refresh-revoke-downgrade-regression@example.test';
  const PASSWORD = 'RegressionTest123!';
  let clientId;
  let employeeId;

  beforeAll(async () => {
    if (!dbAvailable) return;
    const { hashPassword } = require('../auth/password');
    const passwordHash = await hashPassword(PASSWORD);

    const clientResult = await pool.query(
      `INSERT INTO clients (id, name, email, plan)
       VALUES (uuid_generate_v4(), 'Auth Refresh Revoke Downgrade Test Client', $1, 'basic')
       RETURNING id`,
      [`client-${TEST_EMAIL}`]
    );
    clientId = clientResult.rows[0].id;

    const siteResult = await pool.query(
      `INSERT INTO sites (id, client_id, name, location, qr_code_content)
       VALUES (uuid_generate_v4(), $1, 'Test Site', 'Test Location', $2)
       RETURNING id`,
      [clientId, `qr-${TEST_EMAIL}`]
    );
    const siteId = siteResult.rows[0].id;

    const employeeResult = await pool.query(
      `INSERT INTO employees (id, client_id, email, name, role, site_id, password_hash)
       VALUES (uuid_generate_v4(), $1, $2, 'Revoke Downgrade Test Employee', 'employee', $3, $4)
       RETURNING id`,
      [clientId, TEST_EMAIL, siteId, passwordHash]
    );
    employeeId = employeeResult.rows[0].id;
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('keeps the revoke permanent instead of downgrading it to 5 minutes', async () => {
    if (!dbAvailable) return;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: PASSWORD, client_id: clientId });
    expect(loginRes.status).toBe(200);
    const staleRefreshToken = loginRes.body.data.refresh_token;

    // Simulate exactly what POST /auth/revoke-session does: a permanent
    // revoke (revoked_until=NULL) plus deleting the user's used_tokens rows.
    await pool.query(
      `INSERT INTO revoked_tokens (user_id, revoked_at, reason, revoked_until)
       VALUES ($1, NOW(), 'ADMIN_REVOKE', NULL)
       ON CONFLICT (user_id) DO UPDATE SET revoked_at = NOW(), reason = 'ADMIN_REVOKE', revoked_until = NULL`,
      [employeeId]
    );
    await pool.query('DELETE FROM used_tokens WHERE user_id = $1', [employeeId]);

    // The user's browser still holds the (now stale) refresh token and
    // tries to use it -- must be rejected as revoked, not "replay".
    const refreshAttempt = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: staleRefreshToken });
    expect(refreshAttempt.status).toBe(401);
    expect(refreshAttempt.body.error).toBe('SESSION_REVOKED');

    // The critical assertion: the revoke must still be permanent afterwards.
    const revokedRow = await pool.query(
      'SELECT revoked_until FROM revoked_tokens WHERE user_id = $1',
      [employeeId]
    );
    expect(revokedRow.rows[0].revoked_until).toBeNull();
  });
});
