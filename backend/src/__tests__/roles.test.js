'use strict';

const { ROLE_LEVELS, getRoleLevel, isAdminEquivalent, resolveIsApprover } = require('../utils/roles');

describe('ROLE_LEVELS', () => {
  it('orders roles employee < manager < senior_manager < director < admin', () => {
    expect(ROLE_LEVELS.employee).toBeLessThan(ROLE_LEVELS.manager);
    expect(ROLE_LEVELS.manager).toBeLessThan(ROLE_LEVELS.senior_manager);
    expect(ROLE_LEVELS.senior_manager).toBeLessThan(ROLE_LEVELS.director);
    expect(ROLE_LEVELS.director).toBeLessThan(ROLE_LEVELS.admin);
  });

  it('gives admin and superadmin the same level', () => {
    expect(ROLE_LEVELS.admin).toBe(ROLE_LEVELS.superadmin);
  });
});

describe('getRoleLevel', () => {
  it('returns the numeric level for a known role', () => {
    expect(getRoleLevel('manager')).toBe(1);
  });

  it('returns -1 for an unknown role instead of undefined', () => {
    expect(getRoleLevel('bogus-role')).toBe(-1);
  });
});

describe('isAdminEquivalent', () => {
  it.each(['admin', 'superadmin', 'senior_manager', 'director'])('is true for %s', (role) => {
    expect(isAdminEquivalent(role)).toBe(true);
  });

  it.each(['employee', 'manager', 'viewer', 'bogus-role'])('is false for %s', (role) => {
    expect(isAdminEquivalent(role)).toBe(false);
  });
});

describe('resolveIsApprover', () => {
  it('is true when candidate is admin, regardless of reports_to_id', () => {
    expect(resolveIsApprover({
      candidateEmployeeId: 'admin-1', candidateRole: 'admin',
      targetEmployeeId: 'mgr-1', targetReportsToId: 'senior-1',
    })).toBe(true);
  });

  it('is true when candidate is superadmin', () => {
    expect(resolveIsApprover({
      candidateEmployeeId: 'super-1', candidateRole: 'superadmin',
      targetEmployeeId: 'mgr-1', targetReportsToId: null,
    })).toBe(true);
  });

  it('is true when candidate is the exact reports_to_id target', () => {
    expect(resolveIsApprover({
      candidateEmployeeId: 'senior-1', candidateRole: 'senior_manager',
      targetEmployeeId: 'mgr-1', targetReportsToId: 'senior-1',
    })).toBe(true);
  });

  it('is false when candidate is a different senior_manager', () => {
    expect(resolveIsApprover({
      candidateEmployeeId: 'senior-2', candidateRole: 'senior_manager',
      targetEmployeeId: 'mgr-1', targetReportsToId: 'senior-1',
    })).toBe(false);
  });

  it('is false for a plain manager who is not admin and not the reports_to_id target', () => {
    expect(resolveIsApprover({
      candidateEmployeeId: 'mgr-2', candidateRole: 'manager',
      targetEmployeeId: 'mgr-1', targetReportsToId: null,
    })).toBe(false);
  });
});
