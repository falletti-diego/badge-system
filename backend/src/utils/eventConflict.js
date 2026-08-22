/**
 * Shared conflict-detection + serialization for the event↔checkin mutual
 * exclusion feature (docs/superpowers/specs/2026-08-21-event-checkin-mutual-exclusion-design.md).
 * Used by checkins.js (POST, PUT) and events.js (POST /request, PUT /:id/approve).
 */

const crypto = require('crypto');
const { ConflictError } = require('./errors');

/**
 * Serializes any conflict-check-then-write for a given (client, employee, date)
 * scope across the whole request lifetime of the transaction, so a checkin
 * creation and an event approval racing for the same slot can't both pass
 * their own conflict check before either commits. Released automatically at
 * transaction end (COMMIT/ROLLBACK) — no explicit unlock needed. Must be
 * called inside an already-BEGUN transaction (SET LOCAL requires it).
 */
async function lockEventConflictScope(client, { clientId, employeeId, date }) {
  const key = `${clientId}:${employeeId}:${date}`;
  const hash = crypto.createHash('sha256').update(key).digest();
  // Full 64-bit signed int (pg_advisory_xact_lock(bigint)'s native width) from a
  // stable hash, avoiding both Postgres's undocumented hashtext() and the much
  // higher collision rate a 32-bit truncation would have under concurrent load.
  const lockKey = hash.readBigInt64BE(0).toString();
  // lock_timeout scoped to this transaction only (reset automatically at
  // COMMIT/ROLLBACK) — without it, a stuck peer transaction would block this
  // one indefinitely.
  await client.query('SET LOCAL lock_timeout = \'3s\'');
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
  } catch (err) {
    if (err.code === '55P03') { // lock_not_available
      throw new ConflictError(
        'Un\'altra operazione è in corso per questo dipendente e questa data, riprova tra qualche secondo',
        'EVENT_CONFLICT_LOCK_BUSY'
      );
    }
    throw err;
  }
}

/** Returns the conflicting event_requests row (PENDING/APPROVED) for a checkin's date, or null. */
async function findConflictingEvent(client, { clientId, employeeId, date }) {
  const result = await client.query(
    `SELECT id, event_date::text AS event_date, start_time, end_time, description, status
     FROM event_requests
     WHERE client_id = $1::uuid AND user_id = $2::uuid AND event_date = $3::date
       AND status IN ('PENDING', 'APPROVED')
     LIMIT 1`,
    [clientId, employeeId, date]
  );
  return result.rows[0] || null;
}

/**
 * Returns the conflicting checkins row for an event's date, or null.
 *
 * c.timestamp is TIMESTAMPTZ; casting it to ::date directly would evaluate in
 * the DB session's timezone (UTC on AWS RDS by default, never set explicitly
 * anywhere in this codebase), while `date` is always a JS-computed Europe/Rome
 * calendar date (dateInTimeZone/todayInTimeZone). A raw ::date cast silently
 * misses conflicts during the ~00:00-02:00 Europe/Rome window, the same bug
 * class already fixed once for hiring_date (commit 615fcbf, 2026-08-18, see
 * checkins.js:66-70) — `AT TIME ZONE 'Europe/Rome'` makes the cast agree with
 * the JS-side calendar date regardless of the session's own timezone.
 */
async function findConflictingCheckin(client, { clientId, employeeId, date }) {
  const result = await client.query(
    `SELECT c.id, c.timestamp, c.type
     FROM checkins c
     JOIN employees e ON e.id = c.employee_id
     WHERE e.client_id = $1::uuid AND c.employee_id = $2::uuid
       AND (c.timestamp AT TIME ZONE 'Europe/Rome')::date = $3::date
     LIMIT 1`,
    [clientId, employeeId, date]
  );
  return result.rows[0] || null;
}

module.exports = { lockEventConflictScope, findConflictingEvent, findConflictingCheckin };
