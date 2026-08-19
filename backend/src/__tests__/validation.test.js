'use strict';

const { AdminEmployeeSchema } = require('../middleware/validation');
const { todayInTimeZone } = require('../utils/date');

function validBody(overrides = {}) {
  return {
    email: 'mario@example.it',
    name: 'Mario Rossi',
    role: 'employee',
    site_id: '550e8400-e29b-41d4-a716-446655440010',
    assigned_sites: ['550e8400-e29b-41d4-a716-446655440010'],
    // Dal 2026-08-19 un dipendente deve sempre avere un manager di riferimento —
    // vedi i test dedicati sotto. Impostato di default qui così i test che
    // esercitano altri campi non vengono rotti da questo requisito.
    manager_id: '550e8400-e29b-41d4-a716-446655440099',
    ...overrides,
  };
}

describe('AdminEmployeeSchema — new fields', () => {
  test('accepts a valid external_employee_id (alphanumeric)', () => {
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ external_employee_id: 'MAT042' }) });
    expect(result.success).toBe(true);
  });

  test('rejects external_employee_id with a hyphen', () => {
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ external_employee_id: 'MAT-042' }) });
    expect(result.success).toBe(false);
  });

  test('accepts hiring_date equal to today', () => {
    const today = todayInTimeZone();
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ hiring_date: today }) });
    expect(result.success).toBe(true);
  });

  test('rejects hiring_date in the past', () => {
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ hiring_date: '2020-01-01' }) });
    expect(result.success).toBe(false);
  });

  test('rejects an invalid/unparseable hiring_date string', () => {
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ hiring_date: 'not-a-date' }) });
    expect(result.success).toBe(false);
  });

  test('rejects hiring_date in a non-YYYY-MM-DD format', () => {
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ hiring_date: '2026/09/01' }) });
    expect(result.success).toBe(false);
  });

  test('rejects role employee with an empty assigned_sites array', () => {
    const result = AdminEmployeeSchema.safeParse({
      body: validBody({ role: 'employee', assigned_sites: [] }),
    });
    expect(result.success).toBe(false);
  });

  test('accepts a valid manager_id (uuid)', () => {
    const result = AdminEmployeeSchema.safeParse({
      body: validBody({ manager_id: '550e8400-e29b-41d4-a716-446655440099' }),
    });
    expect(result.success).toBe(true);
  });

  test('rejects role employee with manager_id as null', () => {
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ manager_id: null }) });
    expect(result.success).toBe(false);
  });

  test('rejects role employee with manager_id omitted', () => {
    const { manager_id, ...rest } = validBody();
    const result = AdminEmployeeSchema.safeParse({ body: rest });
    expect(result.success).toBe(false);
  });

  test('rejects role employee with manager_id as an empty string', () => {
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ manager_id: '' }) });
    expect(result.success).toBe(false);
  });

  test('accepts role manager without a manager_id', () => {
    const { manager_id, assigned_sites, ...rest } = validBody();
    const result = AdminEmployeeSchema.safeParse({ body: { ...rest, role: 'manager' } });
    expect(result.success).toBe(true);
  });
});
