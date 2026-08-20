'use strict';

/**
 * calculateDailyHours(checkins)
 *
 * Pairs IN check-ins with the next OUT for the same employee,
 * sums all pairs per day, and returns a flat array of daily entries.
 *
 * Rules (from FASE 9 spec):
 * - Pair greedy: first IN → next OUT (regardless of day boundary)
 * - Multiple pairs on the same day are summed (lunch break scenario)
 * - OUT with no preceding IN → ignored
 * - IN with no following OUT → presenza_aperta = true, minutes = null
 * - Date attributed to the IN timestamp (UTC date)
 */

/**
 * @param {Array<{ employee_id: string, timestamp: Date|string, type: 'IN'|'OUT' }>} checkins
 *   Must be sorted by (employee_id, timestamp ASC). The caller is responsible for sorting.
 * @returns {Array<{ employee_id: string, date: string, minutes: number|null, presenza_aperta: boolean }>}
 */
function calculateDailyHours(checkins) {
  if (!checkins || checkins.length === 0) return [];

  // Group by employee_id preserving sort order
  const byEmployee = new Map();
  for (const ci of checkins) {
    const key = ci.employee_id;
    if (!byEmployee.has(key)) byEmployee.set(key, []);
    byEmployee.get(key).push(ci);
  }

  const results = [];

  for (const [employee_id, rows] of byEmployee) {
    let i = 0;

    while (i < rows.length) {
      // Skip leading OUTs (no preceding IN → ignored)
      if (rows[i].type !== 'IN') {
        i++;
        continue;
      }

      const inTs = new Date(rows[i].timestamp);
      const dateStr = toUtcDateString(inTs);

      // Find the next OUT (may skip intermediate INs)
      let j = i + 1;
      while (j < rows.length && rows[j].type !== 'OUT') {
        j++;
      }

      if (j < rows.length) {
        // Matched pair
        const outTs = new Date(rows[j].timestamp);
        const minutes = (outTs.getTime() - inTs.getTime()) / 60000;

        // Accumulate into the same-employee same-date entry if it already exists
        const existing = results.find(
          (r) => r.employee_id === employee_id && r.date === dateStr
        );
        if (existing) {
          existing.minutes = (existing.minutes || 0) + minutes;
        } else {
          results.push({ employee_id, date: dateStr, minutes, presenza_aperta: false });
        }

        i = j + 1;
      } else {
        // Unmatched IN → open presence
        const existing = results.find(
          (r) => r.employee_id === employee_id && r.date === dateStr
        );
        if (existing) {
          // Mark as open but preserve any existing minutes from paired IN/OUT earlier in the day
          existing.presenza_aperta = true;
        } else {
          results.push({ employee_id, date: dateStr, minutes: null, presenza_aperta: true });
        }
        i++;
      }
    }
  }

  return results;
}

/**
 * Returns 'YYYY-MM-DD' from a Date in UTC.
 */
function toUtcDateString(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Aggregates daily entries into a per-employee monthly summary.
 *
 * @param {Array<{ employee_id, date, minutes, presenza_aperta }>} dailyEntries
 * @param {number} mealVoucherHours  Threshold (e.g. 5.0) for earning a meal voucher
 * @param {number} dailyOrdinaryHours  Threshold for overtime (default 8.0)
 * @returns {Map<string, { ore_totali: number, ore_ordinarie: number, ore_straordinarie: number,
 *   buoni_pasto: number, giorni_presenti: number, presenze_aperte: number }>}
 */
function aggregateMonthly(dailyEntries, mealVoucherHours = 5.0, dailyOrdinaryHours = 8.0) {
  const byEmployee = new Map();

  for (const entry of dailyEntries) {
    if (!byEmployee.has(entry.employee_id)) {
      byEmployee.set(entry.employee_id, {
        ore_totali: 0,
        ore_ordinarie: 0,
        ore_straordinarie: 0,
        buoni_pasto: 0,
        giorni_presenti: 0,
        presenze_aperte: 0,
      });
    }

    const agg = byEmployee.get(entry.employee_id);

    if (entry.presenza_aperta && entry.minutes === null) {
      agg.presenze_aperte += 1;
      agg.giorni_presenti += 1;
      continue;
    }

    if (entry.minutes === null) continue;

    const hoursWorked = entry.minutes / 60;
    const ordinary = Math.min(hoursWorked, dailyOrdinaryHours);
    const overtime = Math.max(hoursWorked - dailyOrdinaryHours, 0);

    agg.ore_totali = round2(agg.ore_totali + hoursWorked);
    agg.ore_ordinarie = round2(agg.ore_ordinarie + ordinary);
    agg.ore_straordinarie = round2(agg.ore_straordinarie + overtime);
    agg.giorni_presenti += 1;

    if (hoursWorked >= mealVoucherHours) {
      agg.buoni_pasto += 1;
    }

    if (entry.presenza_aperta) {
      agg.presenze_aperte += 1;
    }
  }

  return byEmployee;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * timeStringToMinutes('08:30:00') -> 510
 */
function timeStringToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * buildEventDailyEntries(eventRows)
 *
 * Converts approved event_requests rows into the same daily-entry shape
 * calculateDailyHours() produces, so they can be concatenated and fed into
 * aggregateMonthly() together with real checkin-derived entries.
 *
 * NOT safe to concatenate blindly: routes/events.js only checks for a
 * checkin/event conflict at POST /request time. A checkin can still be
 * recorded for the same (employee_id, date) later, before the event request
 * is approved, which would otherwise double-count hours. Callers MUST dedupe
 * — checkins should win — before merging this output with
 * calculateDailyHours() output (see presences.js's /summary and
 * /my-summary handlers).
 *
 * @param {Array<{ employee_id: string, event_date: string, start_time: string, end_time: string }>} eventRows
 * @returns {Array<{ employee_id: string, date: string, minutes: number, presenza_aperta: boolean }>}
 */
function buildEventDailyEntries(eventRows) {
  if (!eventRows || eventRows.length === 0) return [];

  return eventRows.map((row) => ({
    employee_id: row.employee_id,
    date: row.event_date,
    minutes: timeStringToMinutes(row.end_time) - timeStringToMinutes(row.start_time),
    presenza_aperta: false,
  }));
}

module.exports = { calculateDailyHours, aggregateMonthly, toUtcDateString, buildEventDailyEntries };
