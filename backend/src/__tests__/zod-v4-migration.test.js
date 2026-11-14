/**
 * Characterization / regression guard for the zod v3 -> v4 migration
 * (Session 123, follow-up to the CI Security Check allowlist of
 * GHSA-mrhx-c7xc-m3w5). zod v4 changes two things this codebase relies on:
 *
 *  1. Per-schema custom error messages: v3 used `{ errorMap: () => ({ message }) }`,
 *     v4 uses `{ error: () => message }`. If the migration drops the custom
 *     message, validation still rejects but with zod's generic message — a
 *     silent UX regression that NO existing test covered. These tests lock the
 *     exact user-facing messages.
 *  2. `ZodError.errors` was removed in v4 in favour of `.issues`. The shared
 *     validation middleware formats the 400 response from it; this test drives
 *     that path directly and asserts the `{ error, details: [{field,message}] }`
 *     shape, independent of which accessor the middleware uses internally.
 *
 * Mirrors behaviour, not implementation — assertions read `.issues`, which
 * exists in both v3 and v4, so the tests themselves survive the bump.
 */

const {
  DemoSwitchRoleSchema,
  ExportShiftsSchema,
  PostShiftsSchema,
  LoginSchema,
  createValidationMiddleware,
} = require('../middleware/validation');

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('zod v4 migration — custom validation messages preserved', () => {
  it('DemoSwitchRoleSchema keeps the custom "role must be one of" message', () => {
    const result = DemoSwitchRoleSchema.safeParse({ body: { role: 'superadmin' } });
    expect(result.success).toBe(false);
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain('role must be one of: admin, manager, employee');
  });

  it('PostShiftsSchema keeps the custom "shift must be one of" message for a bad shift code', () => {
    const result = PostShiftsSchema.safeParse({
      body: { month: 6, year: 2026, shifts_data: { [UUID]: { '2026-06-01': 'x' } } },
      params: { siteId: UUID },
    });
    expect(result.success).toBe(false);
    const messages = result.error.issues.map((i) => i.message);
    expect(messages.some((m) => m.startsWith('shift must be one of'))).toBe(true);
  });

  it('ExportShiftsSchema keeps the custom "format must be either" message', () => {
    const result = ExportShiftsSchema.safeParse({
      query: { format: 'xml' },
      params: { siteId: UUID },
    });
    expect(result.success).toBe(false);
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain('format must be either "pdf" or "csv"');
  });
});

describe('zod v4 migration — validation middleware 400 response shape', () => {
  function runMiddleware(schema, req) {
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    let nextErr = 'NOT_CALLED';
    const mw = createValidationMiddleware(schema);
    mw(req, res, (err) => { nextErr = err; });
    return { res, nextErr };
  }

  it('returns 400 with { error, details: [{field, message}] } for an invalid body', () => {
    const { res, nextErr } = runMiddleware(LoginSchema, {
      body: { email: 'not-an-email', password: '' },
      params: {},
      query: {},
    });
    expect(nextErr).toBe('NOT_CALLED'); // handled, not passed to next()
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Validation Error');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(0);
    for (const d of res.body.details) {
      expect(typeof d.field).toBe('string');
      expect(typeof d.message).toBe('string');
    }
    // the email field must be among the reported errors
    expect(res.body.details.some((d) => d.field.includes('email'))).toBe(true);
  });

  it('passes a valid body through (next called with no error)', () => {
    const { res, nextErr } = runMiddleware(LoginSchema, {
      body: { email: 'real@store.it', password: 'secret' },
      params: {},
      query: {},
    });
    expect(res.statusCode).toBeNull();
    expect(nextErr).toBeUndefined(); // next() called with no args
  });
});
