'use strict';

const {
  lockEventConflictScope, findConflictingEvent, findConflictingCheckin, findConflictingSmartWorking,
  lockAbsenceConflictScope, findConflictingEventRange, findConflictingLeaveRange, findConflictingIllnessRange,
} = require('../utils/eventConflict');

function makeMockClient(queryImpl) {
  return { query: jest.fn(queryImpl) };
}

describe('eventConflict utility', () => {
  describe('lockEventConflictScope', () => {
    it('sets a transaction-scoped lock_timeout then acquires the advisory lock', async () => {
      const calls = [];
      const client = makeMockClient(async (sql) => { calls.push(sql); return { rows: [] }; });

      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(calls[0]).toContain('lock_timeout');
      expect(calls[1]).toContain('pg_advisory_xact_lock');
    });

    it('produces the same lock key for the same (clientId, employeeId, date) scope', async () => {
      const seen = [];
      const client = makeMockClient(async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) seen.push(params[0]);
        return { rows: [] };
      });

      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });
      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(seen[0]).toBe(seen[1]);
    });

    it('produces the SAME lock key regardless of date (date intentionally excluded — see doc comment)', async () => {
      const seen = [];
      const client = makeMockClient(async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) seen.push(params[0]);
        return { rows: [] };
      });

      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });
      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-02' });

      expect(seen[0]).toBe(seen[1]);
    });

    it('maps a lock_not_available (55P03) error to a 409 ConflictError with EVENT_CONFLICT_LOCK_BUSY', async () => {
      const client = makeMockClient(async (sql) => {
        if (sql.includes('pg_advisory_xact_lock')) {
          const err = new Error('canceling statement due to lock timeout');
          err.code = '55P03';
          throw err;
        }
        return { rows: [] };
      });

      await expect(
        lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' })
      ).rejects.toMatchObject({ code: 'EVENT_CONFLICT_LOCK_BUSY', statusCode: 409 });
    });

    it('re-throws any other error unchanged', async () => {
      const client = makeMockClient(async (sql) => {
        if (sql.includes('pg_advisory_xact_lock')) {
          const err = new Error('connection terminated');
          err.code = '08006';
          throw err;
        }
        return { rows: [] };
      });

      await expect(
        lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' })
      ).rejects.toMatchObject({ code: '08006' });
    });
  });

  describe('lockAbsenceConflictScope', () => {
    it('sets a transaction-scoped lock_timeout then acquires the advisory lock', async () => {
      const calls = [];
      const client = makeMockClient(async (sql) => { calls.push(sql); return { rows: [] }; });

      await lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e1' });

      expect(calls[0]).toContain('lock_timeout');
      expect(calls[1]).toContain('pg_advisory_xact_lock');
    });

    it('produces the same lock key for the same (clientId, employeeId) scope', async () => {
      const seen = [];
      const client = makeMockClient(async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) seen.push(params[0]);
        return { rows: [] };
      });

      await lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e1' });
      await lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e1' });

      expect(seen[0]).toBe(seen[1]);
    });

    it('produces a different lock key for a different employee', async () => {
      const seen = [];
      const client = makeMockClient(async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) seen.push(params[0]);
        return { rows: [] };
      });

      await lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e1' });
      await lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e2' });

      expect(seen[0]).not.toBe(seen[1]);
    });

    it('produces the SAME lock key as lockEventConflictScope for the same employee (unified lock namespace, by design)', async () => {
      const seen = [];
      const client = makeMockClient(async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) seen.push(params[0]);
        return { rows: [] };
      });

      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });
      await lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e1' });

      expect(seen[0]).toBe(seen[1]);
    });

    it('maps a lock_not_available (55P03) error to a 409 ConflictError with EVENT_CONFLICT_LOCK_BUSY', async () => {
      const client = makeMockClient(async (sql) => {
        if (sql.includes('pg_advisory_xact_lock')) {
          const err = new Error('canceling statement due to lock timeout');
          err.code = '55P03';
          throw err;
        }
        return { rows: [] };
      });

      await expect(
        lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e1' })
      ).rejects.toMatchObject({ code: 'EVENT_CONFLICT_LOCK_BUSY', statusCode: 409 });
    });
  });

  describe('findConflictingEvent', () => {
    it('queries event_requests scoped by client/employee/date, filtered to PENDING/APPROVED', async () => {
      const client = makeMockClient(async () => ({ rows: [{ id: 'evt-1', description: 'Corso' }] }));

      const result = await findConflictingEvent(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(result).toEqual({ id: 'evt-1', description: 'Corso' });
      expect(client.query.mock.calls[0][0]).toContain('event_requests');
      expect(client.query.mock.calls[0][0]).toContain('IN (\'PENDING\', \'APPROVED\')');
      expect(client.query.mock.calls[0][1]).toEqual(['c1', 'e1', '2026-09-01']);
    });

    it('returns null when no conflicting row exists', async () => {
      const client = makeMockClient(async () => ({ rows: [] }));
      const result = await findConflictingEvent(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });
      expect(result).toBeNull();
    });
  });

  describe('findConflictingCheckin', () => {
    it('queries checkins joined to employees, scoped by client/employee/date', async () => {
      const client = makeMockClient(async () => ({ rows: [{ id: 'ci-1', type: 'IN' }] }));

      const result = await findConflictingCheckin(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(result).toEqual({ id: 'ci-1', type: 'IN' });
      expect(client.query.mock.calls[0][0]).toContain('FROM checkins');
      expect(client.query.mock.calls[0][1]).toEqual(['c1', 'e1', '2026-09-01']);
    });

    it('returns null when no conflicting row exists', async () => {
      const client = makeMockClient(async () => ({ rows: [] }));
      const result = await findConflictingCheckin(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });
      expect(result).toBeNull();
    });
  });

  describe('findConflictingSmartWorking', () => {
    it('returns the smart_working_days row when one exists for that client/employee/date', async () => {
      const row = { id: 'sw-1', date: '2026-09-01' };
      const client = makeMockClient(async () => ({ rows: [row] }));

      const result = await findConflictingSmartWorking(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(result).toEqual(row);
    });

    it('returns null when no smart working day exists for that date', async () => {
      const client = makeMockClient(async () => ({ rows: [] }));

      const result = await findConflictingSmartWorking(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(result).toBeNull();
    });

    it('queries smart_working_days scoped by client_id, employee_id and date', async () => {
      let capturedSql, capturedParams;
      const client = makeMockClient(async (sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [] };
      });

      await findConflictingSmartWorking(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(capturedSql).toContain('FROM smart_working_days');
      expect(capturedSql).toContain('client_id = $1');
      expect(capturedSql).toContain('employee_id = $2');
      expect(capturedSql).toContain('date = $3');
      expect(capturedParams).toEqual(['c1', 'e1', '2026-09-01']);
    });
  });

  describe('findConflictingEventRange', () => {
    it('queries event_requests scoped by client/employee, filtered to PENDING/APPROVED, over a date range', async () => {
      const client = makeMockClient(async () => ({ rows: [{ id: 'evt-1', event_date: '2026-09-02', status: 'PENDING' }] }));

      const result = await findConflictingEventRange(client, {
        clientId: 'c1', employeeId: 'e1', startDate: '2026-09-01', endDate: '2026-09-05',
      });

      expect(result).toEqual([{ id: 'evt-1', event_date: '2026-09-02', status: 'PENDING' }]);
      expect(client.query.mock.calls[0][0]).toContain('event_requests');
      expect(client.query.mock.calls[0][0]).toContain('IN (\'PENDING\', \'APPROVED\')');
      expect(client.query.mock.calls[0][1]).toEqual(['c1', 'e1', '2026-09-01', '2026-09-05']);
    });

    it('returns an empty array when no conflicting row exists', async () => {
      const client = makeMockClient(async () => ({ rows: [] }));
      const result = await findConflictingEventRange(client, {
        clientId: 'c1', employeeId: 'e1', startDate: '2026-09-01', endDate: '2026-09-05',
      });
      expect(result).toEqual([]);
    });
  });

  describe('findConflictingLeaveRange', () => {
    it('queries leave_requests scoped by client/employee, filtered to PENDING/APPROVED, with overlap logic', async () => {
      const client = makeMockClient(async () => ({
        rows: [{ id: 'lv-1', leave_type: 'FERIE_1', start_date: '2026-09-01', end_date: '2026-09-03', status: 'APPROVED', num_days: 3 }],
      }));

      const result = await findConflictingLeaveRange(client, {
        clientId: 'c1', employeeId: 'e1', startDate: '2026-09-02', endDate: '2026-09-04',
      });

      expect(result).toHaveLength(1);
      expect(client.query.mock.calls[0][0]).toContain('leave_requests');
      expect(client.query.mock.calls[0][0]).toContain('start_date <=');
      expect(client.query.mock.calls[0][0]).toContain('end_date >=');
      expect(client.query.mock.calls[0][1]).toEqual(['c1', 'e1', '2026-09-02', '2026-09-04']);
    });

    it('returns an empty array when no conflicting row exists', async () => {
      const client = makeMockClient(async () => ({ rows: [] }));
      const result = await findConflictingLeaveRange(client, {
        clientId: 'c1', employeeId: 'e1', startDate: '2026-09-01', endDate: '2026-09-05',
      });
      expect(result).toEqual([]);
    });
  });

  describe('findConflictingIllnessRange', () => {
    it('queries illnesses scoped by client/employee, filtered to cancelled_at IS NULL, with overlap logic', async () => {
      const client = makeMockClient(async () => ({
        rows: [{ id: 'ill-1', start_date: '2026-09-01', end_date: '2026-09-02' }],
      }));

      const result = await findConflictingIllnessRange(client, {
        clientId: 'c1', employeeId: 'e1', startDate: '2026-09-01', endDate: '2026-09-05',
      });

      expect(result).toHaveLength(1);
      expect(client.query.mock.calls[0][0]).toContain('illnesses');
      expect(client.query.mock.calls[0][0]).toContain('cancelled_at IS NULL');
      expect(client.query.mock.calls[0][1]).toEqual(['c1', 'e1', '2026-09-01', '2026-09-05']);
    });

    it('returns an empty array when no conflicting row exists', async () => {
      const client = makeMockClient(async () => ({ rows: [] }));
      const result = await findConflictingIllnessRange(client, {
        clientId: 'c1', employeeId: 'e1', startDate: '2026-09-01', endDate: '2026-09-05',
      });
      expect(result).toEqual([]);
    });
  });
});
