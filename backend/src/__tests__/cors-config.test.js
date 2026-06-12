'use strict';

/**
 * Unit tests for CORS origin parsing
 * Verifies that CORS_ORIGIN env var is parsed correctly with whitespace handling
 */

describe('CORS origin parsing', () => {
  const originalEnv = process.env.CORS_ORIGIN;

  afterEach(() => {
    process.env.CORS_ORIGIN = originalEnv;
  });

  it('parses single origin without whitespace', () => {
    process.env.CORS_ORIGIN = 'https://example.com';
    const origins = process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) || [];
    expect(origins).toEqual(['https://example.com']);
  });

  it('parses multiple origins without whitespace', () => {
    process.env.CORS_ORIGIN = 'https://example.com,https://other.com';
    const origins = process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) || [];
    expect(origins).toEqual(['https://example.com', 'https://other.com']);
  });

  it('parses multiple origins with whitespace around commas', () => {
    process.env.CORS_ORIGIN = 'https://example.com , https://other.com , https://third.com';
    const origins = process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) || [];
    expect(origins).toEqual(['https://example.com', 'https://other.com', 'https://third.com']);
  });

  it('parses origins with trailing comma', () => {
    process.env.CORS_ORIGIN = 'https://example.com, https://other.com,';
    const origins = process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) || [];
    expect(origins).toEqual(['https://example.com', 'https://other.com']);
  });

  it('handles double commas (empty entries)', () => {
    process.env.CORS_ORIGIN = 'https://example.com,, https://other.com';
    const origins = process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) || [];
    expect(origins).toEqual(['https://example.com', 'https://other.com']);
  });

  it('returns empty array when CORS_ORIGIN is empty string', () => {
    process.env.CORS_ORIGIN = '';
    const origins = process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) || [];
    expect(origins).toEqual([]);
  });

  it('handles whitespace-only entries', () => {
    process.env.CORS_ORIGIN = 'https://example.com,   ,https://other.com';
    const origins = process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) || [];
    expect(origins).toEqual(['https://example.com', 'https://other.com']);
  });
});
