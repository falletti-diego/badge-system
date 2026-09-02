/**
 * Absence badge configuration + resolution logic for MyScheduleScreen.jsx.
 * See docs/superpowers/specs/2026-09-02-my-schedule-absence-badges-design.md
 * (Decisions 2 and 5) for the full design rationale.
 *
 * Priority when multiple absences cover the same date: Malattia > Ferie >
 * Evento (CLAUDE.md Pattern 7 — "malattia vince sempre").
 */

export const ABSENCE_BADGES = {
  illness: { label: 'Malattia', icon: '🤒', color: '#EA580C' },
  leaveApproved: { label: 'Ferie', icon: '🏖️', color: '#059669' },
  leavePending: { label: 'Ferie (in attesa)', icon: '🏖️', color: '#059669' },
  eventApproved: { label: 'Evento', icon: '📅', color: '#7C3AED' },
  eventPending: { label: 'Evento (in attesa)', icon: '📅', color: '#7C3AED' },
};

// Backend DATE columns without an explicit ::text cast (illnesses.start_date/
// end_date, leave_requests.start_date/end_date) arrive over JSON as full ISO
// datetime strings (e.g. "2026-08-31T00:00:00.000Z") because node-postgres's
// default DATE parser produces a JS Date object, which res.json() then
// serializes via toISOString(). Columns the backend explicitly casts with
// ::text (events.js's event_date) arrive as a plain "YYYY-MM-DD" already.
// This normalizes both shapes to a plain YYYY-MM-DD string for comparison.
function toDateOnly(value) {
  return String(value).slice(0, 10);
}

// Checks if a date falls within a date range (inclusive on both ends).
function coversDate(date, startRaw, endRaw) {
  return date >= toDateOnly(startRaw) && date <= toDateOnly(endRaw);
}

// Checks if a leave/event status is active (approved or pending).
function isActiveStatus(status) {
  return status === 'PENDING' || status === 'APPROVED';
}

/**
 * Returns the badge to show for `date` (a 'YYYY-MM-DD' string), or null if
 * none applies.
 *
 * `shiftValue` is the raw value from shiftsData[date] (e.g. 'm'/'p'/'s'/'R'/
 * undefined) — if truthy, the shift always wins and this returns null
 * without inspecting any absence (spec Decision 3).
 *
 * `illnesses`, `leaves`, `events` are the raw arrays returned by
 * GET /illnesses/by-date-range, GET /leave/my-requests, GET /events/my-requests
 * respectively — unfiltered by status; this function does that filtering.
 */
export function resolveAbsenceBadge(date, shiftValue, illnesses, leaves, events) {
  if (shiftValue) return null;

  const hasIllness = illnesses.some((i) => coversDate(date, i.start_date, i.end_date));
  if (hasIllness) return ABSENCE_BADGES.illness;

  const leave = leaves.find((l) => {
    if (!isActiveStatus(l.status)) return false;
    return coversDate(date, l.start_date, l.end_date);
  });
  if (leave) return leave.status === 'APPROVED' ? ABSENCE_BADGES.leaveApproved : ABSENCE_BADGES.leavePending;

  const event = events.find((e) => {
    if (!isActiveStatus(e.status)) return false;
    return toDateOnly(e.event_date) === date;
  });
  if (event) return event.status === 'APPROVED' ? ABSENCE_BADGES.eventApproved : ABSENCE_BADGES.eventPending;

  return null;
}
