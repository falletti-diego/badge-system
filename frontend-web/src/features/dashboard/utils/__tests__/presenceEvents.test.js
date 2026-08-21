import { describe, it, expect } from 'vitest';
import { formatEventDuration, mapEventToPresenceRow, mergeCheckinsWithEvents } from '../presenceEvents';

describe('formatEventDuration', () => {
  it('formats a whole-hour range without minutes', () => {
    expect(formatEventDuration('08:00:00', '18:00:00')).toBe('10h');
  });

  it('formats a range with a partial hour', () => {
    expect(formatEventDuration('08:00:00', '13:30:00')).toBe('5h 30m');
  });
});

describe('mapEventToPresenceRow', () => {
  it('maps an approved event into a PresencesTable-compatible row', () => {
    const event = {
      id: 'evt-1',
      user_id: 'emp-1',
      event_date: '2026-08-21',
      start_time: '08:00:00',
      end_time: '18:00:00',
      description: 'Congresso a Torino',
      employee_name: 'Maria Rossi',
    };
    const row = mapEventToPresenceRow(event);

    expect(row.id).toBe('event-evt-1');
    expect(row.employee_name).toBe('Maria Rossi');
    expect(row.site_name).toBe('Congresso a Torino');
    expect(row.type).toBe('EVENT');
    expect(row.is_event).toBe(true);
    expect(row.ore_label).toBe('10h');
    // A real UTC ISO timestamp (with 'Z' and milliseconds), same shape as a
    // checkin's — not a naive `${date}T${time}` string — required for the
    // table's default lexicographic sort to agree with chronological order.
    expect(row.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Round-trips back to the exact local wall-clock time that was submitted,
    // regardless of the machine's timezone running this test.
    const revived = new Date(row.timestamp);
    expect(`${revived.getFullYear()}-${String(revived.getMonth() + 1).padStart(2, '0')}-${String(revived.getDate()).padStart(2, '0')}`).toBe('2026-08-21');
    expect(revived.getHours()).toBe(8);
  });
});

describe('mergeCheckinsWithEvents', () => {
  it('merges and sorts checkin + event rows newest-first by timestamp', () => {
    const checkinRows = [
      { id: 'c1', timestamp: '2026-08-19T09:00:00.000Z', type: 'IN' },
    ];
    const eventRows = [
      {
        id: 'evt-1', user_id: 'emp-1', event_date: '2026-08-21',
        start_time: '08:00:00', end_time: '18:00:00',
        description: 'Congresso a Torino', employee_name: 'Maria Rossi',
      },
    ];

    const merged = mergeCheckinsWithEvents(checkinRows, eventRows);

    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('event-evt-1'); // 21 Aug is newer than 19 Aug
    expect(merged[1].id).toBe('c1');
  });

  it('handles empty inputs gracefully', () => {
    expect(mergeCheckinsWithEvents([], [])).toEqual([]);
    expect(mergeCheckinsWithEvents(null, null)).toEqual([]);
  });
});
