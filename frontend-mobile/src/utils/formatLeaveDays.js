/**
 * Formats a leave-balance/duration value for display: whole numbers show
 * with no decimal, non-whole values show exactly 1 decimal with a comma
 * (Italian locale). Mirrors frontend-web/src/utils/formatLeaveDays.js —
 * duplicated intentionally, no shared package exists between the two
 * frontends and this is too small to justify creating one.
 */
export function formatLeaveDays(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
