import { describe, test, expect } from 'vitest';
import { FAQ_ITEMS, STAFF_ROLES, isVisible } from '../faq';

describe('faq data — isVisible (fail-closed allowlist)', () => {
  test('audience "all" è sempre visibile, qualunque ruolo', () => {
    const item = { audience: 'all' };
    expect(isVisible(item, 'employee')).toBe(true);
    expect(isVisible(item, 'admin')).toBe(true);
    expect(isVisible(item, null)).toBe(true);
    expect(isVisible(item, undefined)).toBe(true);
  });

  test('audience "employee" è visibile solo a role === "employee"', () => {
    const item = { audience: 'employee' };
    expect(isVisible(item, 'employee')).toBe(true);
    expect(isVisible(item, 'manager')).toBe(false);
    expect(isVisible(item, 'admin')).toBe(false);
    expect(isVisible(item, 'viewer')).toBe(false);
  });

  test('audience "staff" è visibile a manager/admin/viewer, non a employee', () => {
    const item = { audience: 'staff' };
    expect(isVisible(item, 'manager')).toBe(true);
    expect(isVisible(item, 'admin')).toBe(true);
    expect(isVisible(item, 'viewer')).toBe(true);
    expect(isVisible(item, 'employee')).toBe(false);
  });

  test('fail-closed: ruolo undefined/null non vede contenuti staff né employee', () => {
    const staffItem = { audience: 'staff' };
    const employeeItem = { audience: 'employee' };
    expect(isVisible(staffItem, undefined)).toBe(false);
    expect(isVisible(staffItem, null)).toBe(false);
    expect(isVisible(employeeItem, undefined)).toBe(false);
    expect(isVisible(employeeItem, null)).toBe(false);
  });

  test('audience sconosciuto/malformato è nascosto per default', () => {
    const item = { audience: 'qualcosa-di-strano' };
    expect(isVisible(item, 'admin')).toBe(false);
  });

  test('FAQ_ITEMS ha almeno una voce per ciascuna audience e ogni voce ha id/question/answer non vuoti', () => {
    const audiences = new Set(FAQ_ITEMS.map((i) => i.audience));
    expect(audiences.has('all')).toBe(true);
    expect(audiences.has('employee')).toBe(true);
    expect(audiences.has('staff')).toBe(true);

    for (const item of FAQ_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.question).toBeTruthy();
      expect(item.answer).toBeTruthy();
      expect(STAFF_ROLES.includes('manager')).toBe(true); // sanity sul fixture di ruoli
    }
  });
});
