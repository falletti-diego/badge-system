import { formatLeaveDays } from '../utils/formatLeaveDays';

describe('formatLeaveDays', () => {
  it('formats a whole number with no decimal', () => {
    expect(formatLeaveDays(20)).toBe('20');
  });

  it('formats a half-day value with 1 decimal, comma separator', () => {
    expect(formatLeaveDays(19.5)).toBe('19,5');
  });

  it('accepts a numeric string (defensive) and formats it the same way', () => {
    expect(formatLeaveDays('19.50')).toBe('19,5');
  });

  it('formats zero as "0"', () => {
    expect(formatLeaveDays(0)).toBe('0');
  });

  it('returns an em dash for null/undefined/non-numeric input', () => {
    expect(formatLeaveDays(null)).toBe('—');
    expect(formatLeaveDays(undefined)).toBe('—');
    expect(formatLeaveDays('not-a-number')).toBe('—');
  });
});
