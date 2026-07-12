/**
 * Client-side presence aggregation for the Storico Presenze screen.
 *
 * pairCheckins() mirrors the pairing rules of backend/src/utils/hours.js
 * calculateDailyHours() (greedy IN -> next OUT, multiple pairs per day summed,
 * unmatched trailing IN = open presence) but keeps the actual clock-in/clock-out
 * times needed for display, which the backend's monthly-summary version discards.
 */

/** Local calendar-day key ('YYYY-MM-DD') from a checkin timestamp — local time matters
 *  here because a 23:50 clock-in and the following day's 00:10 clock-out both "belong"
 *  to the same local working day from the employee's point of view. */
function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** UTC calendar-day key for a pure SQL DATE value (no time-of-day component).
 *  The backend returns `date::text` (plain "YYYY-MM-DD"), which the Date constructor
 *  parses as UTC midnight per spec — so UTC getters must be used here (not local
 *  getters) to avoid an off-by-one-day shift. */
function utcDateKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Groups raw IN/OUT checkins (single employee) into per-day entries with the
 * clock-in/clock-out interval and total worked minutes for that day.
 *
 * @param {Array<{ type: 'IN'|'OUT', timestamp: string, site_name?: string }>} checkins
 *   Any order — this function sorts ascending internally.
 * @returns {Array<{ date: string, firstIn: Date, lastOut: Date|null, totalMinutes: number,
 *   openPresence: boolean, siteName: string|null }>} sorted descending by date (most recent first)
 */
function pairCheckins(checkins) {
  if (!checkins || checkins.length === 0) return [];

  const sorted = [...checkins].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const byDate = new Map();

  let i = 0;
  while (i < sorted.length) {
    if (sorted[i].type !== 'IN') {
      i++;
      continue;
    }

    const inTs = new Date(sorted[i].timestamp);
    const dateKey = localDateKey(inTs);
    const siteName = sorted[i].site_name ?? null;

    let entry = byDate.get(dateKey);
    if (!entry) {
      entry = { date: dateKey, firstIn: inTs, lastOut: null, totalMinutes: 0, openPresence: false, siteName };
      byDate.set(dateKey, entry);
    } else if (inTs < entry.firstIn) {
      entry.firstIn = inTs;
    }

    let j = i + 1;
    while (j < sorted.length && sorted[j].type !== 'OUT') j++;

    if (j < sorted.length) {
      const outTs = new Date(sorted[j].timestamp);
      entry.totalMinutes += (outTs.getTime() - inTs.getTime()) / 60000;
      if (!entry.lastOut || outTs > entry.lastOut) entry.lastOut = outTs;
      i = j + 1;
    } else {
      entry.openPresence = true;
      i++;
    }
  }

  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Merges paired checkin-day entries with self-declared Smart Working days into a
 * single chronological list for display, most recent first.
 *
 * @param {Array} dailyEntries  Output of pairCheckins()
 * @param {Array<{ date: string }>} smartWorkingDays  Raw rows from GET /smart-working/my-history
 * @returns {Array<{ date: string, kind: 'checkin'|'smart_working', ...fields }>}
 */
function mergeWithSmartWorking(dailyEntries, smartWorkingDays) {
  const checkinRows = (dailyEntries || []).map((e) => ({ kind: 'checkin', ...e }));
  const swRows = (smartWorkingDays || []).map((sw) => ({
    kind: 'smart_working',
    date: utcDateKey(new Date(sw.date)),
  }));

  return [...checkinRows, ...swRows].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Formats total minutes as "8h 28m" (or "—" for null/zero). */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

module.exports = { pairCheckins, mergeWithSmartWorking, formatDuration };
