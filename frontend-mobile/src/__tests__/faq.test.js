const { interopDefault } = require('./helpers/rntl');
const faqModule = require('../data/faq');
const { FAQ_ITEMS, STAFF_ROLES, isVisible } = faqModule.default || faqModule;

describe('faq data (mobile) — isVisible (fail-closed allowlist)', () => {
  test('audience "all" è sempre visibile, qualunque ruolo', () => {
    const item = { audience: 'all' };
    expect(isVisible(item, 'employee')).toBe(true);
    expect(isVisible(item, 'manager')).toBe(true);
    expect(isVisible(item, null)).toBe(true);
    expect(isVisible(item, undefined)).toBe(true);
  });

  test('audience "employee" è visibile solo a role === "employee"', () => {
    const item = { audience: 'employee' };
    expect(isVisible(item, 'employee')).toBe(true);
    expect(isVisible(item, 'manager')).toBe(false);
  });

  test('audience "staff" è visibile a manager/admin/viewer, non a employee', () => {
    const item = { audience: 'staff' };
    expect(isVisible(item, 'manager')).toBe(true);
    expect(isVisible(item, 'employee')).toBe(false);
  });

  test('fail-closed: ruolo undefined/null non vede contenuti staff né employee', () => {
    expect(isVisible({ audience: 'staff' }, undefined)).toBe(false);
    expect(isVisible({ audience: 'employee' }, null)).toBe(false);
  });

  test('FAQ_ITEMS ha almeno una voce per ciascuna audience', () => {
    const audiences = new Set(FAQ_ITEMS.map((i) => i.audience));
    expect(audiences.has('all')).toBe(true);
    expect(audiences.has('employee')).toBe(true);
    expect(audiences.has('staff')).toBe(true);
  });

  test('il contenuto è identico a quello del progetto web (stesso numero di voci, stessi id, nello stesso ordine)', () => {
    const expectedIds = [
      'checkin-rifiutato', 'face-id-toggle', 'ferie-malattia', 'password-dimenticata',
      'offline-banner', 'checkout-dimenticato', 'qr-sede-sbagliata', 'multi-sede-manager',
      'funziona-offline', 'protezione-dati', 'conservazione-dati', 'privacy-colleghi',
      'aggiungere-dipendente',
    ];
    expect(FAQ_ITEMS.map((i) => i.id)).toEqual(expectedIds);
  });
});
