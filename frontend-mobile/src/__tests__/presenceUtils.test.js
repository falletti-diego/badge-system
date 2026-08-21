const { pairCheckins, mergeWithSmartWorking, mergeWithEvents, formatDuration } = require('../utils/presenceUtils');

describe('pairCheckins', () => {
  test('pairs a simple IN/OUT day and computes duration', () => {
    const checkins = [
      { type: 'IN', timestamp: '2026-06-03T09:42:00.000Z', site_name: 'Milano Centro' },
      { type: 'OUT', timestamp: '2026-06-03T18:10:00.000Z', site_name: 'Milano Centro' },
    ];
    const result = pairCheckins(checkins);
    expect(result).toHaveLength(1);
    expect(result[0].totalMinutes).toBeCloseTo(8 * 60 + 28, 0);
    expect(result[0].openPresence).toBe(false);
    expect(result[0].siteName).toBe('Milano Centro');
  });

  test('marks an unmatched trailing IN as open presence', () => {
    const checkins = [
      { type: 'IN', timestamp: '2026-06-03T09:00:00.000Z' },
    ];
    const result = pairCheckins(checkins);
    expect(result).toHaveLength(1);
    expect(result[0].openPresence).toBe(true);
    expect(result[0].lastOut).toBeNull();
  });

  test('sums multiple IN/OUT pairs on the same day (lunch break)', () => {
    const checkins = [
      { type: 'IN', timestamp: '2026-06-03T09:00:00.000Z' },
      { type: 'OUT', timestamp: '2026-06-03T13:00:00.000Z' },
      { type: 'IN', timestamp: '2026-06-03T14:00:00.000Z' },
      { type: 'OUT', timestamp: '2026-06-03T18:00:00.000Z' },
    ];
    const result = pairCheckins(checkins);
    expect(result).toHaveLength(1);
    expect(result[0].totalMinutes).toBe(8 * 60); // 4h + 4h
  });

  test('ignores a leading OUT with no preceding IN', () => {
    const checkins = [
      { type: 'OUT', timestamp: '2026-06-03T09:00:00.000Z' },
      { type: 'IN', timestamp: '2026-06-03T10:00:00.000Z' },
      { type: 'OUT', timestamp: '2026-06-03T18:00:00.000Z' },
    ];
    const result = pairCheckins(checkins);
    expect(result).toHaveLength(1);
    expect(result[0].totalMinutes).toBe(8 * 60);
  });

  test('groups distinct days separately, sorted most-recent-first', () => {
    const checkins = [
      { type: 'IN', timestamp: '2026-06-01T09:00:00.000Z' },
      { type: 'OUT', timestamp: '2026-06-01T17:00:00.000Z' },
      { type: 'IN', timestamp: '2026-06-02T09:00:00.000Z' },
      { type: 'OUT', timestamp: '2026-06-02T17:00:00.000Z' },
    ];
    const result = pairCheckins(checkins);
    expect(result).toHaveLength(2);
    expect(result[0].date > result[1].date).toBe(true);
  });

  test('returns an empty array for no checkins', () => {
    expect(pairCheckins([])).toEqual([]);
    expect(pairCheckins(null)).toEqual([]);
  });
});

describe('mergeWithSmartWorking', () => {
  test('merges checkin days and smart working days into one chronological list', () => {
    const dailyEntries = [
      { date: '2026-06-03', firstIn: new Date(), lastOut: new Date(), totalMinutes: 480, openPresence: false, siteName: 'Milano' },
    ];
    const smartWorkingDays = [
      { id: 'sw-1', date: '2026-06-02T00:00:00.000Z', created_at: new Date().toISOString() },
    ];
    const merged = mergeWithSmartWorking(dailyEntries, smartWorkingDays);
    expect(merged).toHaveLength(2);
    expect(merged[0].date).toBe('2026-06-03');
    expect(merged[0].kind).toBe('checkin');
    expect(merged[1].date).toBe('2026-06-02');
    expect(merged[1].kind).toBe('smart_working');
  });

  test('handles empty inputs gracefully', () => {
    expect(mergeWithSmartWorking([], [])).toEqual([]);
    expect(mergeWithSmartWorking(null, null)).toEqual([]);
  });
});

describe('mergeWithEvents', () => {
  test('adds an APPROVED event as a day entry with its duration, inside the requested range', () => {
    const entries = [
      { date: '2026-08-20', kind: 'checkin', firstIn: new Date(), lastOut: new Date(), totalMinutes: 480, openPresence: false, siteName: 'Milano' },
    ];
    const eventRows = [
      {
        status: 'APPROVED',
        event_date: '2026-08-25T00:00:00.000Z',
        start_time: '08:00:00',
        end_time: '13:00:00',
        description: 'Congresso di settore',
      },
    ];
    const merged = mergeWithEvents(entries, eventRows, '2026-08-01', '2026-08-31');
    expect(merged).toHaveLength(2);
    const eventEntry = merged.find((e) => e.kind === 'event');
    expect(eventEntry.date).toBe('2026-08-25');
    expect(eventEntry.totalMinutes).toBe(5 * 60);
    expect(eventEntry.description).toBe('Congresso di settore');
    expect(eventEntry.startTime).toBe('08:00:00');
    expect(eventEntry.endTime).toBe('13:00:00');
  });

  test('excludes PENDING and REJECTED requests — only APPROVED is a real presence', () => {
    const eventRows = [
      { status: 'PENDING', event_date: '2026-08-25T00:00:00.000Z', start_time: '08:00:00', end_time: '13:00:00', description: 'x' },
      { status: 'REJECTED', event_date: '2026-08-26T00:00:00.000Z', start_time: '08:00:00', end_time: '13:00:00', description: 'x' },
    ];
    const merged = mergeWithEvents([], eventRows, '2026-08-01', '2026-08-31');
    expect(merged).toEqual([]);
  });

  test('excludes an APPROVED event outside the requested date range (endpoint has no server-side date filter)', () => {
    const eventRows = [
      { status: 'APPROVED', event_date: '2026-07-15T00:00:00.000Z', start_time: '08:00:00', end_time: '13:00:00', description: 'x' },
    ];
    const merged = mergeWithEvents([], eventRows, '2026-08-01', '2026-08-31');
    expect(merged).toEqual([]);
  });

  test('handles empty inputs gracefully', () => {
    expect(mergeWithEvents([], [], '2026-08-01', '2026-08-31')).toEqual([]);
    expect(mergeWithEvents(null, null, '2026-08-01', '2026-08-31')).toEqual([]);
  });
});

describe('formatDuration', () => {
  test('formats minutes as "Xh YYm"', () => {
    expect(formatDuration(508)).toBe('8h 28m');
    expect(formatDuration(60)).toBe('1h 00m');
  });

  test('returns em-dash for null/zero/negative', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(-5)).toBe('—');
  });
});
