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

  it('replaces assigned_sites (not just the site_id column) when a "modificato" entry includes a site transfer', async () => {
    const db = mockClient([['UPDATE employees', { rowCount: 1 }]]);
    const diff = { nuovi: [], riattivati: [], rimossi: [], modificati: [{ id: 'emp-1', email: 'x@x.it', changes: { site_id: { from: 'site-torino', to: 'site-milano' } } }] };
    await applyDiff(db, diff, { clientId: 'client-1' });
    const call = db.query.mock.calls.find((c) => c[0].includes('UPDATE employees') && c[0].includes('assigned_sites'));
    expect(call).toBeDefined();
    expect(call[0]).toMatch(/site_id\s*=/);
    expect(call[1]).toContain('site-milano');
    const arrayParam = call[1].find((p) => Array.isArray(p));
    expect(arrayParam).toEqual(['site-milano']); // exactly the new site once, no duplicate of old+new
  });

  it('clears assigned_sites when a "modificato" entry transfers the employee to no site (site_id → null)', async () => {
    const db = mockClient([['UPDATE employees', { rowCount: 1 }]]);
    const diff = { nuovi: [], riattivati: [], rimossi: [], modificati: [{ id: 'emp-1', email: 'x@x.it', changes: { site_id: { from: 'site-torino', to: null } } }] };
    await applyDiff(db, diff, { clientId: 'client-1' });
    const call = db.query.mock.calls.find((c) => c[0].includes('UPDATE employees') && c[0].includes('assigned_sites'));
    expect(call).toBeDefined();
    const arrayParam = call[1].find((p) => Array.isArray(p));
    expect(arrayParam).toEqual([]);
  });

  it('applies field changes (site transfer, phone) together with the reactivation, not just active/exit_date', async () => {
    const db = mockClient([['UPDATE employees', { rowCount: 1 }]]);
    const diff = {
      nuovi: [], rimossi: [], modificati: [],
      riattivati: [{
        id: 'emp-1', email: 'x@x.it', hiring_date: '2023-01-01', exit_date: null,
        changes: { site_id: { from: 'site-torino', to: 'site-milano' }, phone: { from: '111', to: '222' } },
      }],
    };
    await applyDiff(db, diff, { clientId: 'client-1' });
    const call = db.query.mock.calls.find((c) => c[0].includes('active = true'));
    expect(call).toBeDefined();
    expect(call[0]).toMatch(/site_id\s*=/);
    expect(call[0]).toMatch(/assigned_sites\s*=/);
    expect(call[0]).toMatch(/phone\s*=/);
    expect(call[1]).toContain('site-milano');
    expect(call[1]).toContain('222');
  });

  it('reactivation without extra field changes still resets active/exit_date/password (no other regression)', async () => {
    const db = mockClient([['UPDATE employees', { rowCount: 1 }]]);
    const diff = { nuovi: [], rimossi: [], modificati: [], riattivati: [{ id: 'emp-1', email: 'x@x.it', hiring_date: '2023-01-01', exit_date: null, changes: {} }] };
    await applyDiff(db, diff, { clientId: 'client-1' });
    const call = db.query.mock.calls.find((c) => c[0].includes('active = true'));
    expect(call).toBeDefined();
    expect(call[0]).toMatch(/password_hash\s*=/);
    expect(call[0]).toMatch(/must_change_password\s*=/);
    expect(call[1]).toEqual(['emp-1', 'HASH']);
  });

  it('resets the password on reactivation and returns credentials for a "bentornato" email', async () => {
    const db = mockClient([['UPDATE employees', { rowCount: 1 }]]);
    const diff = { nuovi: [], rimossi: [], modificati: [], riattivati: [{ id: 'emp-1', email: 'rientrato@x.it', hiring_date: '2023-01-01', exit_date: null, changes: {} }] };
    const res = await applyDiff(db, diff, { clientId: 'client-1' });
    expect(res.credentials).toHaveLength(1);
    expect(res.credentials[0]).toMatchObject({ id: 'emp-1', email: 'rientrato@x.it', reactivated: true });
    expect(typeof res.credentials[0].password).toBe('string');
    expect(res.credentials[0].password.length).toBeGreaterThan(0);
  });
});
