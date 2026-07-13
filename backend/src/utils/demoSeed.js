'use strict';

/**
 * seedDemoTenant(clientId, dbClientOrPool)
 *
 * Generates a small, realistic dataset for a self-service demo tenant:
 *   - 1 site ("Sede Demo")
 *   - 3 employees, one per role (admin / manager / employee)
 *   - ~30-35 calendar days (weekdays only) of IN/OUT check-ins, with a
 *     sprinkling of overtime days, ending TODAY
 *   - a handful of APPROVED leave_requests (ferie) and illnesses records
 *
 * This is a generalized, parameterized version of scripts/seed-may-2026-demo.sql:
 * same weekday-by-weekday IN/OUT pattern, same overtime/absence sprinkling,
 * but:
 *   - dates are always relative to `new Date()` at call time (not a fixed
 *     month) — critical so the already-in-production Trend Charts
 *     (GET /api/v1/presences/trend, which always shows "last 30 days from
 *     today") show real data on the very first visit, regardless of when
 *     the demo tenant is created.
 *   - 1 site / 3 employees instead of 2 sites / 8 employees — this dataset
 *     exists to demonstrate the 3 roles, not to simulate scale.
 *   - every id is generated dynamically (uuid_generate_v4() / gen_random
 *     ids from RETURNING), since each call creates a brand-new tenant, not
 *     a one-off fixed dataset.
 *
 * Pure data-generation logic — no HTTP/Express concerns. Intended to be
 * called by the (not-yet-built) POST /demo/start route, which is
 * responsible for creating the `clients` row and deciding the transaction
 * boundary.
 *
 * @param {string} clientId - UUID of an already-created `clients` row.
 * @param {import('pg').Pool|import('pg').PoolClient} dbClientOrPool
 *   Either the shared pool, or a single client already inside a
 *   transaction (e.g. one obtained via `pool.connect()` in the caller).
 *   - If given a `pg.Pool` instance, this function opens its own client and
 *     wraps all inserts in a single transaction (BEGIN/COMMIT/ROLLBACK),
 *     releasing the client afterwards. (Detected via `instanceof Pool` —
 *     a plain Client/PoolClient also exposes `.connect()`, so duck-typing
 *     on that method alone would misdetect an in-progress transaction
 *     client as a Pool.)
 *   - If given anything else (a Client/PoolClient already participating in
 *     a transaction owned by the caller), this function just issues
 *     queries on it and lets the caller manage BEGIN/COMMIT/ROLLBACK.
 * @returns {Promise<{
 *   site: { id: string, name: string },
 *   employees: { admin: object, manager: object, employee: object },
 *   counts: { checkins: number, leaveRequests: number, illnesses: number }
 * }>}
 */

const { Pool } = require('pg');

const DAYS_BACK = 34; // covers the last ~30-35 calendar days ending today
const ORDINARY_OUT_HOUR = 18;
const OVERTIME_OUT_HOUR = 20;
const IN_HOUR = 9;
// Roughly 1 in 4 worked days gets a later (overtime) checkout, mirroring
// the sprinkling of straordinari seen in seed-may-2026-demo.sql.
const OVERTIME_EVERY_N_DAYS = 4;

/**
 * @param {Date} date
 * @returns {string} 'YYYY-MM-DD' (UTC)
 */
function toUtcDateString(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Builds the list of weekday (Mon-Fri) date strings for the last `daysBack`
 * calendar days up to and including `referenceDate`, oldest first.
 *
 * @param {number} daysBack
 * @param {Date} referenceDate
 * @returns {string[]} ascending 'YYYY-MM-DD' strings, weekends excluded
 */
function getWeekdaysInRange(daysBack, referenceDate) {
  const dates = [];
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(referenceDate);
    d.setUTCDate(d.getUTCDate() - i);
    const dow = d.getUTCDay(); // 0=Sun ... 6=Sat
    if (dow !== 0 && dow !== 6) {
      dates.push(toUtcDateString(d));
    }
  }
  return dates;
}

/**
 * Finds the first run of `length` consecutive entries in `weekdayDates`
 * (starting at or after `minIndex`) whose calendar dates are truly
 * back-to-back (diff of exactly 1 day) — i.e. a real Mon-Fri-style block
 * with no weekend gap in the middle, suitable for a leave/illness range.
 *
 * @param {string[]} weekdayDates - ascending 'YYYY-MM-DD', weekends already excluded
 * @param {number} length
 * @param {number} minIndex
 * @returns {{ startIndex: number, endIndex: number, startDate: string, endDate: string } | null}
 */
function findConsecutiveRun(weekdayDates, length, minIndex) {
  for (let start = minIndex; start + length - 1 < weekdayDates.length; start++) {
    let ok = true;
    for (let k = 0; k < length - 1; k++) {
      const d1 = new Date(`${weekdayDates[start + k]}T00:00:00.000Z`);
      const d2 = new Date(`${weekdayDates[start + k + 1]}T00:00:00.000Z`);
      const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);
      if (diffDays !== 1) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const endIndex = start + length - 1;
      return {
        startIndex: start,
        endIndex,
        startDate: weekdayDates[start],
        endDate: weekdayDates[endIndex],
      };
    }
  }
  return null;
}

/**
 * Generates IN/OUT checkin rows (not yet persisted) for one employee across
 * the given weekday dates, skipping any date in `absentDates`.
 *
 * @param {string[]} workDates - weekday dates this employee should check in on
 * @param {Set<string>} absentDates - dates to skip (leave/illness)
 * @returns {Array<{ timestamp: string, type: 'IN'|'OUT' }>}
 */
function buildCheckinPairs(workDates, absentDates) {
  const rows = [];
  let dayCounter = 0;
  for (const dateStr of workDates) {
    if (absentDates.has(dateStr)) continue;
    dayCounter++;
    const isOvertimeDay = dayCounter % OVERTIME_EVERY_N_DAYS === 0;
    const outHour = isOvertimeDay ? OVERTIME_OUT_HOUR : ORDINARY_OUT_HOUR;
    rows.push({ timestamp: `${dateStr}T${String(IN_HOUR).padStart(2, '0')}:00:00.000Z`, type: 'IN' });
    rows.push({ timestamp: `${dateStr}T${String(outHour).padStart(2, '0')}:00:00.000Z`, type: 'OUT' });
  }
  return rows;
}

/**
 * @param {string} clientId
 * @param {import('pg').Pool|import('pg').PoolClient} dbClientOrPool
 */
async function seedDemoTenant(clientId, dbClientOrPool) {
  if (!clientId) {
    throw new Error('seedDemoTenant: clientId is required');
  }
  if (!dbClientOrPool) {
    throw new Error('seedDemoTenant: dbClientOrPool is required');
  }

  // A pg Client/PoolClient also exposes a `.connect()` method (used to open
  // its own connection), so duck-typing on `.connect` is not enough to tell
  // it apart from a Pool. Only treat this as "we own the connection" when
  // it's actually an instance of Pool — everything else (a Client already
  // checked out via pool.connect(), possibly mid-transaction) is used as-is,
  // with transaction boundaries left to the caller.
  const ownsConnection = dbClientOrPool instanceof Pool;
  const client = ownsConnection ? await dbClientOrPool.connect() : dbClientOrPool;

  try {
    if (ownsConnection) {
      await client.query('BEGIN');
    }

    const result = await runSeed(client, clientId);

    if (ownsConnection) {
      await client.query('COMMIT');
    }
    return result;
  } catch (err) {
    if (ownsConnection) {
      await client.query('ROLLBACK');
    }
    throw err;
  } finally {
    if (ownsConnection) {
      client.release();
    }
  }
}

/**
 * Runs the actual inserts on an already-open client (no transaction
 * management here — that's handled by the caller in seedDemoTenant()).
 */
async function runSeed(client, clientId) {
  const referenceDate = new Date();

  // ------------------------------------------------------------------
  // 1. Site
  // ------------------------------------------------------------------
  const qrCode = `QR-DEMO-${clientId.slice(0, 8)}-${Date.now()}`;
  const siteResult = await client.query(
    `INSERT INTO sites (id, client_id, name, location, qr_code_content)
     VALUES (uuid_generate_v4(), $1, 'Sede Demo', 'Via Demo, 1 - Milano', $2)
     RETURNING id, name`,
    [clientId, qrCode]
  );
  const site = siteResult.rows[0];

  // ------------------------------------------------------------------
  // 2. Employees — one per role
  // ------------------------------------------------------------------
  const adminResult = await client.query(
    `INSERT INTO employees (id, client_id, email, name, role, site_id, assigned_sites, must_change_password)
     VALUES (uuid_generate_v4(), $1, 'admin@demo.local', 'Admin Demo', 'admin', NULL, ARRAY[]::uuid[], false)
     RETURNING id, email, name, role`,
    [clientId]
  );
  const admin = adminResult.rows[0];

  const managerResult = await client.query(
    `INSERT INTO employees (id, client_id, email, name, role, site_id, assigned_sites, must_change_password)
     VALUES (uuid_generate_v4(), $1, 'manager@demo.local', 'Manager Demo', 'manager', $2, ARRAY[$2]::uuid[], false)
     RETURNING id, email, name, role`,
    [clientId, site.id]
  );
  const manager = managerResult.rows[0];

  const employeeResult = await client.query(
    `INSERT INTO employees (id, client_id, email, name, role, site_id, assigned_sites, must_change_password)
     VALUES (uuid_generate_v4(), $1, 'employee@demo.local', 'Employee Demo', 'employee', $2, ARRAY[$2]::uuid[], false)
     RETURNING id, email, name, role`,
    [clientId, site.id]
  );
  const employee = employeeResult.rows[0];

  // ------------------------------------------------------------------
  // 3. Check-ins — weekdays only, ~last 30-35 calendar days ending today
  // ------------------------------------------------------------------
  const weekdayDates = getWeekdaysInRange(DAYS_BACK, referenceDate);

  // Absences (employee only — admin/manager have lighter/no history):
  //   - 3-day FERIE block roughly a third of the way through the range
  //   - 2-day MALATTIA block roughly two-thirds of the way through
  const ferieRun = findConsecutiveRun(weekdayDates, 3, Math.floor(weekdayDates.length / 3));
  const malattiaRun = findConsecutiveRun(
    weekdayDates,
    2,
    ferieRun ? ferieRun.endIndex + 3 : Math.floor((weekdayDates.length * 2) / 3)
  );

  const employeeAbsentDates = new Set();
  if (ferieRun) {
    for (let i = ferieRun.startIndex; i <= ferieRun.endIndex; i++) {
      employeeAbsentDates.add(weekdayDates[i]);
    }
  }
  if (malattiaRun) {
    for (let i = malattiaRun.startIndex; i <= malattiaRun.endIndex; i++) {
      employeeAbsentDates.add(weekdayDates[i]);
    }
  }

  const employeeCheckins = buildCheckinPairs(weekdayDates, employeeAbsentDates);
  const managerCheckins = buildCheckinPairs(weekdayDates, new Set());
  // Admin: no floor check-ins — realistic for an admin-only role, and the
  // Trend Charts' assenteismo/presenze denominators only look at role='employee'.

  let checkinsCount = 0;
  for (const { employeeId, rows } of [
    { employeeId: employee.id, rows: employeeCheckins },
    { employeeId: manager.id, rows: managerCheckins },
  ]) {
    for (const row of rows) {
      await client.query(
        `INSERT INTO checkins (id, client_id, employee_id, site_id, timestamp, type, created_by)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $2)`,
        [clientId, employeeId, site.id, row.timestamp, row.type]
      );
      checkinsCount++;
    }
  }

  // ------------------------------------------------------------------
  // 4. Leave requests / illnesses (drive assenteismo_pct on the Trend Charts)
  // ------------------------------------------------------------------
  let leaveRequestsCount = 0;
  let illnessesCount = 0;

  if (ferieRun) {
    await client.query(
      `INSERT INTO leave_requests
         (id, client_id, user_id, leave_type, start_date, end_date, num_days, motivation, status, approved_by, approved_at)
       VALUES (uuid_generate_v4(), $1, $2, 'FERIE_1', $3, $4, $5, 'Ferie (dato demo)', 'APPROVED', $6, NOW())`,
      [clientId, employee.id, ferieRun.startDate, ferieRun.endDate, ferieRun.endIndex - ferieRun.startIndex + 1, admin.id]
    );
    leaveRequestsCount++;
  }

  if (malattiaRun) {
    await client.query(
      `INSERT INTO illnesses (id, client_id, employee_id, start_date, end_date, num_days, reason, created_by)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, 'Malattia (dato demo)', $2)`,
      [clientId, employee.id, malattiaRun.startDate, malattiaRun.endDate, malattiaRun.endIndex - malattiaRun.startIndex + 1]
    );
    illnessesCount++;
  }

  return {
    site,
    employees: { admin, manager, employee },
    counts: {
      checkins: checkinsCount,
      leaveRequests: leaveRequestsCount,
      illnesses: illnessesCount,
    },
  };
}

module.exports = {
  seedDemoTenant,
  // exported for isolated unit testing of the pure date/pairing helpers
  _internal: {
    getWeekdaysInRange,
    findConsecutiveRun,
    buildCheckinPairs,
    toUtcDateString,
  },
};
