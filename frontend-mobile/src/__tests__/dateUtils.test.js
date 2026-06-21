const { toISO, formatDateIT, today } = require('../utils/dateUtils');

describe('toISO', () => {
  test('returns YYYY-MM-DD format', () => {
    const d = new Date(2026, 5, 21, 10, 0, 0); // June 21 10:00 local
    expect(toISO(d)).toBe('2026-06-21');
  });

  test('pads single-digit months', () => {
    const d = new Date(2026, 0, 5, 10, 0, 0); // January 5
    expect(toISO(d)).toBe('2026-01-05');
  });

  test('pads single-digit days', () => {
    const d = new Date(2026, 11, 3, 10, 0, 0); // December 3
    expect(toISO(d)).toBe('2026-12-03');
  });

  test('uses LOCAL date getters, not UTC (timezone safety)', () => {
    // Mock a Date object whose UTC representation differs from local.
    // At Italy UTC+2: 00:30 local on June 21 = 22:30 UTC on June 20.
    // toISOString() on such a date returns '2026-06-20T22:30:00Z' → date '2026-06-20' (WRONG).
    // Local getters return June 21 (CORRECT).
    const mockDate = {
      getFullYear: () => 2026,
      getMonth: () => 5,  // June (0-indexed)
      getDate: () => 21,
      // toISOString returns the WRONG (UTC) date — proves the old approach was broken
      toISOString: () => '2026-06-20T22:30:00.000Z',
    };
    expect(toISO(mockDate)).toBe('2026-06-21');
  });

  test('handles year boundary', () => {
    const d = new Date(2025, 11, 31, 10, 0, 0); // Dec 31
    expect(toISO(d)).toBe('2025-12-31');
  });
});

describe('formatDateIT', () => {
  test('formats YYYY-MM-DD to DD/MM/YYYY', () => {
    expect(formatDateIT('2026-06-21')).toBe('21/06/2026');
  });

  test('returns — for null', () => {
    expect(formatDateIT(null)).toBe('—');
  });

  test('returns — for undefined', () => {
    expect(formatDateIT(undefined)).toBe('—');
  });

  test('pads single digits in output', () => {
    expect(formatDateIT('2026-01-05')).toBe('05/01/2026');
  });
});

describe('today', () => {
  test('returns a Date object', () => {
    const result = today();
    expect(result).toBeInstanceOf(Date);
  });

  test('returns a date with time set to midnight', () => {
    const result = today();
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  test('returns current local date', () => {
    const result = today();
    const now = new Date();
    expect(result.getFullYear()).toBe(now.getFullYear());
    expect(result.getMonth()).toBe(now.getMonth());
    expect(result.getDate()).toBe(now.getDate());
  });

  test('calling today() twice returns equal dates (no stale reference)', () => {
    const a = today();
    const b = today();
    // Each call creates a NEW Date object (not a cached module-level constant)
    expect(a).not.toBe(b);
    expect(toISO(a)).toBe(toISO(b));
  });
});
