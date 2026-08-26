'use strict';

const { Pool, Client } = require('pg');
const { findConflictingEventRange } = require('../utils/eventConflict');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

/**
 * Defense-in-depth verification for the PENDING/APPROVED-guarded UPDATE added
 * to illnesses.js's "malattia vince sempre" cascade (see illnesses.js's
 * POST /report handler, event_requests branch). Before the fix, the cascade's
 * UPDATE had no WHERE-status guard at all, so if another transaction resolved
 * (e.g. rejected/denied) the same event_requests row between the cascade's
 * SELECT (findConflictingEventRange) and its own UPDATE, the cascade would
 * blindly overwrite that just-committed status — a lost update with a false
 * "auto_rejected_by_illness" audit trail entry on a row it didn't actually
 * touch.
 *
 * This test drives that exact interleaving by hand with two raw pg.Client
 * connections, bypassing the HTTP route and the (now unified, Part 1) lock
 * entirely — it exists to prove the WHERE guard itself has teeth, not to
 * prove the interleaving is reachable through the real API (with the unified
 * lock in place, it mostly isn't any more).
 */
describe('illnesses.js cascade — PENDING/APPROVED status guard prevents lost updates', () => {
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
      console.warn(`[illness-cascade-lost-update-guard.test] Skipping — could not connect: ${err.message}`);
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function makeClientRow() {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Lost Update Guard Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('lost-update-guard-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'Lost Update Guard Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('lost-update-guard')]
    );
    return result.rows[0].id;
  }

  async function makePendingEvent(clientId, employeeId, eventDate) {
    const result = await pool.query(
      `INSERT INTO event_requests (id, client_id, user_id, event_date, start_time, end_time, description, status)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, '08:00', '18:00', 'Corso di formazione', 'PENDING')
       RETURNING id, status`,
      [clientId, employeeId, eventDate]
    );
    return result.rows[0];
  }

  let clientId;

  afterEach(async () => {
    if (!dbAvailable || !clientId) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    clientId = undefined;
  });

  it('skips the cascade UPDATE (rowCount 0) and does not clobber a status another transaction already committed', async () => {
    if (!dbAvailable) return;

    clientId = await makeClientRow();
    const employeeId = await makeEmployee(clientId);
    const eventDate = '2026-09-10';
    const event = await makePendingEvent(clientId, employeeId, eventDate);

    const clientA = new Client(dbConfig);
    const clientB = new Client(dbConfig);
    await clientA.connect();
    await clientB.connect();

    try {
      // Transaction A: the illness cascade's own SELECT, run exactly as
      // illnesses.js runs it, identifying this PENDING event as a candidate.
      await clientA.query('BEGIN');
      const candidates = await findConflictingEventRange(clientA, {
        clientId, employeeId, startDate: eventDate, endDate: eventDate,
      });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].id).toBe(event.id);

      // Transaction B: a manager denies the event for an unrelated reason,
      // and commits, BEFORE A's cascade gets to its own UPDATE.
      await clientB.query('BEGIN');
      const managerRejectionReason = 'Rifiutato dal manager: turno già coperto';
      const bUpdateResult = await clientB.query(
        `UPDATE event_requests SET status = 'REJECTED', rejection_reason = $1, updated_at = NOW()
         WHERE id = $2::uuid AND status = 'PENDING'`,
        [managerRejectionReason, event.id]
      );
      expect(bUpdateResult.rowCount).toBe(1);
      await clientB.query('COMMIT');

      // Transaction A: now runs the (guarded) cascade UPDATE exactly as
      // illnesses.js does — this is the fix under test.
      const illnessRejectionReason = 'Rifiutato automaticamente: malattia comunicata per questa data';
      const aUpdateResult = await clientA.query(
        `UPDATE event_requests SET status = 'REJECTED', rejection_reason = $1, updated_at = NOW()
         WHERE id = $2::uuid AND status IN ('PENDING', 'APPROVED')`,
        [illnessRejectionReason, event.id]
      );

      // The row is no longer PENDING or APPROVED (B already moved it to
      // REJECTED) — the guard must report 0 rows touched, so illnesses.js
      // knows to skip the audit-log entry and any saldo reversal for it.
      expect(aUpdateResult.rowCount).toBe(0);

      await clientA.query('COMMIT');

      // The row must still carry B's rejection, untouched by A's blind write.
      const finalRow = await pool.query(
        'SELECT status, rejection_reason FROM event_requests WHERE id = $1',
        [event.id]
      );
      expect(finalRow.rows[0].status).toBe('REJECTED');
      expect(finalRow.rows[0].rejection_reason).toBe(managerRejectionReason);
    } finally {
      await clientA.end();
      await clientB.end();
    }
  });
});
