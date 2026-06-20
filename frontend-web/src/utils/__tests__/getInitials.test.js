import { describe, it, expect } from 'vitest';
import { getInitials } from '../getInitials';

describe('getInitials', () => {
  it('returns first + last initial for full name', () => {
    expect(getInitials('Maria Rossi')).toBe('MR');
  });

  it('returns single initial for first-name-only', () => {
    expect(getInitials('Diego')).toBe('D');
  });

  it('uses first and last word for multi-word names', () => {
    expect(getInitials('Maria Lucia Rossi')).toBe('MR');
  });

  it('returns ? for empty string', () => {
    expect(getInitials('')).toBe('?');
  });

  it('returns ? for null', () => {
    expect(getInitials(null)).toBe('?');
  });

  it('returns ? for undefined', () => {
    expect(getInitials(undefined)).toBe('?');
  });

  it('uppercases initials', () => {
    expect(getInitials('alice bianchi')).toBe('AB');
  });

  it('trims leading/trailing whitespace', () => {
    expect(getInitials('  Maria Rossi  ')).toBe('MR');
  });
});
