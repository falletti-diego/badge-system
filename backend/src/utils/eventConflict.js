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

/**
 * Same mechanism as lockEventConflictScope, but scoped per-employee (no
 * date component) — used for a multi-day range operation (leave create/
 * approve, illness report) so l'intera operazione multi-giorno è serializzata
 * in un colpo solo, invece di un lock per singolo giorno del range (che
 * rischierebbe un falso EVENT_CONFLICT_LOCK_BUSY quando due richieste che si
 * sovrappongono parzialmente acquisiscono i lock sui singoli giorni in ordine
 * diverso — vedi design spec 2026-08-25, sezione "Performance e falso lock
 * occupato"). La chiave include un suffisso ':absence' così non collide mai
 * con lockEventConflictScope per lo stesso employee.
 */
async function lockAbsenceConflictScope(client, { clientId, employeeId }) {
  const key = `${clientId}:${employeeId}:absence`;
  const hash = crypto.createHash('sha256').update(key).digest();
  const lockKey = hash.readBigInt64BE(0).toString();
  await client.query('SET LOCAL lock_timeout = \'3s\'');
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
  } catch (err) {
    if (err.code === '55P03') { // lock_not_available
      throw new ConflictError(
        'Un\'altra operazione è in corso per questo dipendente, riprova tra qualche secondo',
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

/** Returns the conflicting smart_working_days row for a date, or null. */
async function findConflictingSmartWorking(client, { clientId, employeeId, date }) {
  const result = await client.query(
    `SELECT id, date::text AS date
     FROM smart_working_days
     WHERE client_id = $1::uuid AND employee_id = $2::uuid AND date = $3::date
     LIMIT 1`,
    [clientId, employeeId, date]
  );
  return result.rows[0] || null;
}

/**
 * Returns ALL event_requests rows (PENDING/APPROVED) overlapping [startDate,
 * endDate] for this employee — un array, non una singola riga come
 * findConflictingEvent, perché il chiamante di illnesses.js deve enumerare e
 * rifiutare OGNUNO dei conflitti trovati (una malattia multi-giorno può
 * sovrapporsi a più eventi), non solo verificarne l'esistenza. I chiamanti
 * che vogliono solo un controllo booleano (leaves.js, events.js) usano
 * `.length > 0`.
 */
async function findConflictingEventRange(client, { clientId, employeeId, startDate, endDate }) {
  const result = await client.query(
    `SELECT id, event_date::text AS event_date, status
     FROM event_requests
     WHERE client_id = $1::uuid AND user_id = $2::uuid AND status IN ('PENDING', 'APPROVED')
       AND event_date BETWEEN $3::date AND $4::date`,
    [clientId, employeeId, startDate, endDate]
  );
  return result.rows;
}

/** Same contract as findConflictingEventRange, for leave_requests. */
async function findConflictingLeaveRange(client, { clientId, employeeId, startDate, endDate }) {
  const result = await client.query(
    `SELECT id, leave_type, start_date::text AS start_date, end_date::text AS end_date, status, num_days
     FROM leave_requests
     WHERE client_id = $1::uuid AND user_id = $2::uuid AND status IN ('PENDING', 'APPROVED')
       AND start_date <= $4::date AND end_date >= $3::date`,
    [clientId, employeeId, startDate, endDate]
  );
  return result.rows;
}

/** Same contract as findConflictingEventRange, for illnesses (active = cancelled_at IS NULL). */
async function findConflictingIllnessRange(client, { clientId, employeeId, startDate, endDate }) {
  const result = await client.query(
    `SELECT id, start_date::text AS start_date, end_date::text AS end_date
     FROM illnesses
     WHERE client_id = $1::uuid AND employee_id = $2::uuid AND cancelled_at IS NULL
       AND start_date <= $4::date AND end_date >= $3::date`,
    [clientId, employeeId, startDate, endDate]
  );
  return result.rows;
}

module.exports = {
  lockEventConflictScope, findConflictingEvent, findConflictingCheckin, findConflictingSmartWorking,
  lockAbsenceConflictScope, findConflictingEventRange, findConflictingLeaveRange, findConflictingIllnessRange,
};
