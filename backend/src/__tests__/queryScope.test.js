'use strict';

/**
 * Unit tests for queryScope.js — buildScopedFilters validation matrix
 * Tests fail-closed behavior: missing/conflicting claims → throw ForbiddenError
 */

const { buildScopedFilters } = require('../utils/queryScope');
const { ForbiddenError } = require('../utils/errors');

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID_TORINO = '550e8400-e29b-41d4-a716-446655440012';
const SITE_ID_MILANO = 'e1337fab-ba3f-4332-bb06-57c9df15b067';
const EMP_ID_A = '550e8400-e29b-41d4-a716-446655440100';
const EMP_ID_B = '550e8400-e29b-41d4-a716-446655440101';

describe('queryScope.buildScopedFilters — RBAC validation matrix', () => {
  // ─── Employee (self-only) ──────────────────────────────────────────

  it('employee with employee_id, no filters → produces employee_id clause', () => {
    const user = { client_id: CLIENT_ID, role: 'employee', employee_id: EMP_ID_A };
    const result = buildScopedFilters(user, {}, 'c');
    expect(result.whereClauses.some(c => /employee_id.*=.*\$\d+/i.test(c))).toBe(true);
    expect(result.params).toContain(EMP_ID_A);
  });

  it('employee with employee_id, filters for own employee → OK', () => {
    const user = { client_id: CLIENT_ID, role: 'employee', employee_id: EMP_ID_A };
    const result = buildScopedFilters(user, { employeeId: EMP_ID_A }, 'c');
    expect(result.whereClauses.length).toBeGreaterThan(0);
    expect(result.params).toContain(EMP_ID_A);
  });

  it('employee with employee_id, filters for other employee → 403 FORBIDDEN_EMPLOYEE', () => {
    const user = { client_id: CLIENT_ID, role: 'employee', employee_id: EMP_ID_A };
    expect(() => buildScopedFilters(user, { employeeId: EMP_ID_B }, 'c')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN_EMPLOYEE' })
    );
  });

  it('employee without employee_id → 403 NO_EMPLOYEE_PROFILE', () => {
    const user = { client_id: CLIENT_ID, role: 'employee' };
    expect(() => buildScopedFilters(user, {}, 'c')).toThrow(
      expect.objectContaining({ code: 'NO_EMPLOYEE_PROFILE' })
    );
  });

  // ─── Manager (site-scoped) ────────────────────────────────────────

  it('manager with site_id, no filters → produces site_id clause', () => {
    const user = { client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID_TORINO };
    const result = buildScopedFilters(user, {}, 'c');
    expect(result.whereClauses.some(c => /site_id.*=.*\$\d+/i.test(c))).toBe(true);
    expect(result.params).toContain(SITE_ID_TORINO);
  });

  it('manager with site_id, filters for own site → OK', () => {
    const user = { client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID_TORINO };
    const result = buildScopedFilters(user, { siteId: SITE_ID_TORINO }, 'c');
    expect(result.whereClauses.length).toBeGreaterThan(0);
    expect(result.params).toContain(SITE_ID_TORINO);
  });

  it('manager with site_id, filters for other site → 403 FORBIDDEN_SITE', () => {
    const user = { client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID_TORINO };
    expect(() => buildScopedFilters(user, { siteId: SITE_ID_MILANO }, 'c')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN_SITE' })
    );
  });

  it('manager without site_id → 403 NO_SITE_ASSIGNED', () => {
    const user = { client_id: CLIENT_ID, role: 'manager' };
    expect(() => buildScopedFilters(user, {}, 'c')).toThrow(
      expect.objectContaining({ code: 'NO_SITE_ASSIGNED' })
    );
  });

  // ─── Admin/Viewer (tenant-wide) ────────────────────────────────────

  it('admin with any filters → OK (no restrictions)', () => {
    const user = { client_id: CLIENT_ID, role: 'admin' };
    const result = buildScopedFilters(user, { siteId: SITE_ID_TORINO, employeeId: EMP_ID_A }, 'c');
    expect(result.whereClauses.length).toBeGreaterThan(0);
  });

  it('viewer with any filters → OK (no restrictions)', () => {
    const user = { client_id: CLIENT_ID, role: 'viewer' };
    const result = buildScopedFilters(user, { siteId: SITE_ID_TORINO }, 'c');
    expect(result.whereClauses.length).toBeGreaterThan(0);
  });

  // ─── Unknown role ─────────────────────────────────────────────────

  it('unknown role → 403 UNAUTHORIZED_ROLE', () => {
    const user = { client_id: CLIENT_ID, role: 'supervisor' };
    expect(() => buildScopedFilters(user, {}, 'c')).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED_ROLE' })
    );
  });

  // ─── Date range (always included, no gating) ──────────────────────

  it('date_from/date_to included in WHERE regardless of role', () => {
    const user = { client_id: CLIENT_ID, role: 'admin' };
    const result = buildScopedFilters(user, { dateFrom: '2026-06-01', dateTo: '2026-06-30' }, 'c');
    expect(result.whereClauses.some(c => /timestamp.*>=/i.test(c))).toBe(true);
    expect(result.whereClauses.some(c => /timestamp.*</i.test(c))).toBe(true);
  });

  // ─── client_id always present ──────────────────────────────────────

  it('client_id always included in WHERE', () => {
    const user = { client_id: CLIENT_ID, role: 'admin' };
    const result = buildScopedFilters(user, {}, 'c');
    expect(result.whereClauses.some(c => /client_id.*=.*\$\d+/i.test(c))).toBe(true);
    expect(result.params).toContain(CLIENT_ID);
  });

  // ─── SQL table alias ──────────────────────────────────────────────

  it('respects the alias parameter (e.g. "ci" instead of "c")', () => {
    const user = { client_id: CLIENT_ID, role: 'admin' };
    const result = buildScopedFilters(user, {}, 'ci');
    expect(result.whereClauses.join(' ')).toMatch(/ci\./);
  });
});
