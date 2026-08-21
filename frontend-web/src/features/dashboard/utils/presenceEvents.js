/**
 * Maps approved Eventi/Training requests (GET /api/v1/events/approved) into
 * the same row shape PresencesTable already renders for checkins, so an
 * approved event shows up as a synthetic row in the dashboard's presences
 * table — a "Type" badge instead of IN/OUT, the description instead of the
 * site, and a precomputed duration instead of one derived from an IN/OUT pair.
 */

/** 'HH:MM:SS' -> minutes since midnight. */
function timeStringToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Formats a start/end 'HH:MM:SS' pair as "10h" or "5h 30m", matching
 *  PresencesTable's own computeOreMap() format for checkin durations. */
export function formatEventDuration(startTime, endTime) {
  const minutes = timeStringToMinutes(endTime) - timeStringToMinutes(startTime);
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Combines a 'YYYY-MM-DD' date and 'HH:MM:SS' local wall-clock time into a
 * real UTC ISO timestamp string (with 'Z' and milliseconds), matching the
 * exact shape checkin rows already carry — required for both the
 * lexicographic (PresencesTable's default column sort) and chronological
 * (mergeCheckinsWithEvents) timestamp comparisons to agree with each other.
 * A naive `${date}T${time}` string (no offset) would sort inconsistently
 * against UTC checkin timestamps whenever the two land on the same calendar
 * day under a non-UTC local timezone.
 */
function toLocalIsoTimestamp(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds || 0).toISOString();
}

/**
 * @param {{ id: string, user_id: string, event_date: string, start_time: string,
 *   end_time: string, description: string, employee_name: string }} event
 * @returns {object} a PresencesTable-compatible row
 */
export function mapEventToPresenceRow(event) {
  return {
    id: `event-${event.id}`,
    employee_id: event.user_id,
    employee_name: event.employee_name,
    employee_email: null,
    site_name: event.description,
    timestamp: toLocalIsoTimestamp(event.event_date, event.start_time),
    type: 'EVENT',
    is_event: true,
    modified_at: null,
    ore_label: formatEventDuration(event.start_time, event.end_time),
  };
}

/**
 * Merges checkin rows with mapped event rows, sorted by timestamp descending
 * (newest first) — matches PresencesTable's default sort.
 *
 * @param {Array} checkinRows
 * @param {Array} eventRows  Raw rows from GET /events/approved
 * @returns {Array}
 */
export function mergeCheckinsWithEvents(checkinRows, eventRows) {
  const mapped = (eventRows || []).map(mapEventToPresenceRow);
  return [...(checkinRows || []), ...mapped].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
}
