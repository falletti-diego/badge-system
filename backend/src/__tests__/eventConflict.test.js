'use strict';

const { lockEventConflictScope, findConflictingEvent, findConflictingCheckin } = require('../utils/eventConflict');

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

    it('produces a different lock key for a different date', async () => {
      const seen = [];
      const client = makeMockClient(async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) seen.push(params[0]);
        return { rows: [] };
      });

      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });
      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-02' });

      expect(seen[0]).not.toBe(seen[1]);
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
});
