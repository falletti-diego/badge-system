'use strict';

const { Pool } = require('pg');
const { lockEventConflictScope, lockAbsenceConflictScope } = require('../utils/eventConflict');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('lockEventConflictScope — Postgres advisory lock serialization', () => {
  jest.setTimeout(15000);

  let pool;
  let dbAvailable = false;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[eventConflict-lock-race.test] Skipping — could not connect: ${err.message}`);
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('blocks a second transaction from acquiring the same (client, employee, date) lock until the first commits — proves the mutual exclusion feature is race-free, not just sequentially correct', async () => {
    if (!dbAvailable) return;
    const scope = { clientId: 'race-test-client', employeeId: 'race-test-employee', date: '2026-09-01' };

    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query('BEGIN');
      await lockEventConflictScope(clientA, scope); // acquires immediately, lock free

      await clientB.query('BEGIN');
      let bResolved = false;
      const bLockPromise = lockEventConflictScope(clientB, scope).then(() => { bResolved = true; });

      // Give B a real chance to finish if (incorrectly) not blocked.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(bResolved).toBe(false); // B must still be waiting — proves serialization

      await clientA.query('COMMIT'); // releases A's advisory lock
      await bLockPromise; // B's acquisition now completes
      expect(bResolved).toBe(true);

      await clientB.query('COMMIT');
    } finally {
      clientA.release();
      clientB.release();
    }
  });

  it('lockEventConflictScope and lockAbsenceConflictScope contend for the SAME lock for the same employee — proves the unified lock namespace actually serializes an event create against a concurrent leave/illness create', async () => {
    if (!dbAvailable) return;
    const clientId = 'race-test-client-cross-lock';
    const employeeId = 'race-test-employee-cross-lock';

    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query('BEGIN');
      // Transaction A: an event create/approve acquiring the per-date lock.
      await lockEventConflictScope(clientA, { clientId, employeeId, date: '2026-09-01' });

      await clientB.query('BEGIN');
      let bResolved = false;
      // Transaction B: a leave create/illness report acquiring the per-employee
      // absence lock for the SAME employee — must block on A's lock, not sail
      // through on a disjoint key (that disjointness was the bug).
      const bLockPromise = lockAbsenceConflictScope(clientB, { clientId, employeeId }).then(() => { bResolved = true; });

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(bResolved).toBe(false); // B must still be waiting — proves cross-lock serialization

      await clientA.query('COMMIT'); // releases A's advisory lock
      await bLockPromise; // B's acquisition now completes
      expect(bResolved).toBe(true);

      await clientB.query('COMMIT');
    } finally {
      clientA.release();
      clientB.release();
    }
  });

  it('different (employee, date) scopes never block each other', async () => {
    if (!dbAvailable) return;
    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query('BEGIN');
      await lockEventConflictScope(clientA, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      await clientB.query('BEGIN');
      await expect(
        lockEventConflictScope(clientB, { clientId: 'c1', employeeId: 'e2', date: '2026-09-01' })
      ).resolves.toBeUndefined(); // different employeeId → different lock key, must not block

      await clientA.query('COMMIT');
      await clientB.query('COMMIT');
    } finally {
      clientA.release();
      clientB.release();
    }
  });
});
