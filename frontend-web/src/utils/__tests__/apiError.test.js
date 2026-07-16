import { describe, test, expect } from 'vitest';
import { extractApiErrorMessage } from '../apiError';

describe('extractApiErrorMessage (code-review Fix 4b)', () => {
  test('prefers data.message when present', () => {
    const err = { response: { status: 500, data: { message: 'Server exploded' } } };
    expect(extractApiErrorMessage(err)).toBe('Server exploded');
  });

  test('falls back to details[0].message when message is absent', () => {
    const err = {
      response: {
        status: 400,
        data: { details: [{ field: 'body.message', message: 'message is required' }] },
      },
    };
    expect(extractApiErrorMessage(err)).toBe('message is required');
  });

  test('prefers message over details when both are present', () => {
    const err = {
      response: {
        status: 400,
        data: { message: 'Top-level message wins', details: [{ message: 'nested detail' }] },
      },
    };
    expect(extractApiErrorMessage(err)).toBe('Top-level message wins');
  });

  test('returns the network-error message when there is no response but a request was dispatched', () => {
    const err = { request: {} };
    expect(extractApiErrorMessage(err)).toBe('Errore di rete — controlla la connessione e riprova.');
  });

  test('does NOT report a network error when a real response exists, even with a minimal/odd body', () => {
    // Regression guard: err.request is truthy for any dispatched axios
    // request, even one that got a real HTTP response — so this must be
    // gated on the *absence* of err.response.
    const err = { request: {}, response: { status: 404, data: { error: 'Not Found' } } };
    expect(extractApiErrorMessage(err)).toBe('Qualcosa è andato storto — riprova tra un momento.');
  });

  test('returns the default generic fallback when nothing more specific is found', () => {
    const err = {};
    expect(extractApiErrorMessage(err)).toBe('Qualcosa è andato storto — riprova tra un momento.');
  });

  test('returns a caller-supplied fallback instead of the generic default', () => {
    const err = {};
    expect(extractApiErrorMessage(err, 'Custom fallback')).toBe('Custom fallback');
  });

  test('does not throw when err is undefined/null-ish', () => {
    expect(() => extractApiErrorMessage(undefined)).not.toThrow();
    expect(extractApiErrorMessage(undefined)).toBe('Qualcosa è andato storto — riprova tra un momento.');
  });
});
