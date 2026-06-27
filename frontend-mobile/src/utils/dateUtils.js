/**
 * Date utilities for mobile app.
 * Uses local getters (getFullYear/Month/Date) — NOT toISOString() — to avoid
 * timezone bugs where Italian users (UTC+2) would see the previous day after midnight.
 */

/**
 * Formats a Date to 'YYYY-MM-DD' using LOCAL time.
 * @param {Date|{getFullYear:()=>number,getMonth:()=>number,getDate:()=>number}} d
 * @returns {string}
 */
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Formats 'YYYY-MM-DD' or ISO datetime string to Italian 'DD/MM/YYYY'.
 * Strips the time component (T...) before parsing to handle API responses
 * that return full ISO datetimes (e.g. '2026-07-28T00:00:00.000Z').
 * @param {string|null|undefined} dateStr
 * @returns {string}
 */
function formatDateIT(dateStr) {
  if (!dateStr) return '—';
  const datePart = dateStr.split('T')[0];
  const [y, m, d] = datePart.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Returns today's date at midnight local time.
 * Call this inside components — never cache at module level.
 * @returns {Date}
 */
function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

module.exports = { toISO, formatDateIT, today };
