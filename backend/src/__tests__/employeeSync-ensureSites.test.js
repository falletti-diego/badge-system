'use strict';

const { resolveSiteIdByName } = require('../services/employeeSync/ensureSites');

function mockDb(routes) {
  return {
    query: jest.fn().mockImplementation((sql) => {
      for (const [needle, result] of routes) if (sql.includes(needle)) return Promise.resolve(result);
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
  };
}

describe('resolveSiteIdByName', () => {
  it('maps existing sites by name without any write', async () => {
    const db = mockDb([['SELECT id, name FROM sites', { rows: [{ id: 'site-1', name: 'Torino' }] }]]);
    const map = await resolveSiteIdByName(db, [{ nome_sede: 'Torino' }], 'client-1', { create: false });
    expect(map.get('Torino')).toBe('site-1');
    expect(db.query.mock.calls.some((c) => c[0].includes('INSERT INTO sites'))).toBe(false);
  });

  it('assigns a non-persisted placeholder for a missing site when create=false (preview)', async () => {
    const db = mockDb([['SELECT id, name FROM sites', { rows: [] }]]);
    const map = await resolveSiteIdByName(db, [{ nome_sede: 'Bologna' }], 'client-1', { create: false });
    expect(map.get('Bologna')).toBe('pending:Bologna');
    expect(db.query.mock.calls.some((c) => c[0].includes('INSERT INTO sites'))).toBe(false);
  });

  it('creates a missing site for real when create=true (apply)', async () => {
    const db = mockDb([
      ['SELECT id, name FROM sites', { rows: [] }],
      ['INSERT INTO sites', { rows: [] }],
    ]);
    const map = await resolveSiteIdByName(db, [{ nome_sede: 'Bologna', indirizzo: 'Via Test 1' }], 'client-1', { create: true });
    const id = map.get('Bologna');
    expect(id).toEqual(expect.any(String));
    expect(id).not.toMatch(/^pending:/);
    const insertCall = db.query.mock.calls.find((c) => c[0].includes('INSERT INTO sites'));
    expect(insertCall[1]).toContain('Bologna');
    expect(insertCall[1]).toContain('client-1');
  });

  it('does not recreate a site that already exists, even if declared again in the file', async () => {
    const db = mockDb([['SELECT id, name FROM sites', { rows: [{ id: 'site-1', name: 'Torino' }] }]]);
    const map = await resolveSiteIdByName(db, [{ nome_sede: 'Torino' }], 'client-1', { create: true });
    expect(map.get('Torino')).toBe('site-1');
    expect(db.query.mock.calls.some((c) => c[0].includes('INSERT INTO sites'))).toBe(false);
  });
});
