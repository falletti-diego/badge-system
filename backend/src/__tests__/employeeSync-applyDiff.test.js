'use strict';

jest.mock('../auth/password', () => ({ hashPassword: jest.fn().mockResolvedValue('HASH') }));
jest.mock('../middleware/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));

const { applyDiff } = require('../services/employeeSync/applyDiff');

function mockClient(routes) {
  return {
    query: jest.fn().mockImplementation((sql) => {
      for (const [needle, result] of routes) if (sql.includes(needle)) return Promise.resolve(result);
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
  };
}

describe('applyDiff', () => {
  it('inserts new employees and returns credentials for welcome email', async () => {
    const db = mockClient([['INSERT INTO employees', { rows: [{ id: 'emp-new' }] }]]);
    const diff = { nuovi: [{ email: 'nuovo@x.it', name: 'Nuovo', role: 'employee', site_id: 's1', hiring_date: '2026-07-01' }], riattivati: [], rimossi: [], modificati: [] };
    const res = await applyDiff(db, diff, { clientId: 'client-1' });
    expect(res.credentials).toHaveLength(1);
    expect(res.credentials[0].email).toBe('nuovo@x.it');
  });

  it('reactivates without touching hiring_date', async () => {
    const db = mockClient([['UPDATE employees', { rowCount: 1 }]]);
    const diff = { nuovi: [], riattivati: [{ id: 'emp-1', email: 'x@x.it', hiring_date: '2023-01-01', exit_date: null }], rimossi: [], modificati: [] };
    await applyDiff(db, diff, { clientId: 'client-1' });
    const call = db.query.mock.calls.find((c) => c[0].includes('active = true'));
    expect(call).toBeDefined();
    expect(call[0]).not.toMatch(/hiring_date\s*=/);
  });

  it('deactivates removed employees with exit_date', async () => {
    const db = mockClient([['UPDATE employees', { rowCount: 1 }]]);
    const diff = { nuovi: [], riattivati: [], rimossi: [{ id: 'emp-1', email: 'x@x.it', exit_date: '2026-07-31' }], modificati: [] };
    await applyDiff(db, diff, { clientId: 'client-1' });
    const call = db.query.mock.calls.find((c) => c[0].includes('active = false'));
    expect(call[1]).toContain('2026-07-31');
  });

  it('updates only the changed fields for a "modificato" entry', async () => {
    const db = mockClient([['UPDATE employees', { rowCount: 1 }]]);
    const diff = { nuovi: [], riattivati: [], rimossi: [], modificati: [{ id: 'emp-1', email: 'x@x.it', changes: { phone: { from: '111', to: '222' } } }] };
    await applyDiff(db, diff, { clientId: 'client-1' });
    const call = db.query.mock.calls.find((c) => c[0].includes('UPDATE employees') && c[0].includes('phone'));
    expect(call[1]).toContain('222');
  });
});
