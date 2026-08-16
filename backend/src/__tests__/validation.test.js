'use strict';

const { AdminEmployeeSchema } = require('../middleware/validation');

function validBody(overrides = {}) {
  return {
    email: 'mario@example.it',
    name: 'Mario Rossi',
    role: 'employee',
    site_id: '550e8400-e29b-41d4-a716-446655440010',
    assigned_sites: ['550e8400-e29b-41d4-a716-446655440010'],
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
    const today = new Date().toISOString().slice(0, 10);
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ hiring_date: today }) });
    expect(result.success).toBe(true);
  });

  test('rejects hiring_date in the past', () => {
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ hiring_date: '2020-01-01' }) });
    expect(result.success).toBe(false);
  });

  test('accepts a valid manager_id (uuid)', () => {
    const result = AdminEmployeeSchema.safeParse({
      body: validBody({ manager_id: '550e8400-e29b-41d4-a716-446655440099' }),
    });
    expect(result.success).toBe(true);
  });

  test('accepts manager_id as null', () => {
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ manager_id: null }) });
    expect(result.success).toBe(true);
  });
});
