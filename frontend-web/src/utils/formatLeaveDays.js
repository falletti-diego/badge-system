/**
 * Formats a leave-balance/duration value for display: whole numbers show
 * with no decimal, non-whole values show exactly 1 decimal with a comma
 * (Italian locale). Accepts a number or a numeric string defensively —
 * NUMERIC(6,2) DB columns are normalized to real numbers by the backend
 * (see leaves.js normalizeLeaveNumerics), but this stays defensive in case
 * a future caller passes a raw value through.
 */
export function formatLeaveDays(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
