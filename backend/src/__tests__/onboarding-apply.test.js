jest.mock('../auth/password', () => ({ hashPassword: jest.fn().mockResolvedValue('HASH') }));
jest.mock('../middleware/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));

const { apply } = require('../../scripts/onboarding/apply');
const { logAudit } = require('../middleware/audit');

function mockClient(routes) {
  return {
    query: jest.fn().mockImplementation((sql) => {
      for (const [needle, result] of routes) if (sql.includes(needle)) return Promise.resolve(result);
      return Promise.resolve({ rows: [] });
    }),
  };
}

const data = {
  azienda: { ragione_sociale: 'X SRL', email_referente: 'admin@x.it', ore_min_buono_pasto: 5 },
  sedi: [{ _row: 2, nome_sede: 'Milano', indirizzo: 'Via 1', latitudine: null, longitudine: null, raggio_geofence_m: null }],
  dipendenti: [
    { _row: 2, nome_completo: 'Mario Rossi', email: 'mario@x.it', telefono: null, ruolo: 'responsabile', sede: 'Milano', matricola: 'M1', ferie_giorni: 10, permessi_giorni: 0, exfestivita_giorni: 0 },
  ],
};

describe('apply', () => {
  it('creates client, site, new employee (with temp password) and saldo', async () => {
    const db = mockClient([
      ['INSERT INTO clients', { rows: [{ id: 'client-1' }] }],
      ['SELECT id FROM sites', { rows: [] }],
      ['INSERT INTO sites', { rows: [{ id: 'site-1' }] }],
      ['SELECT id FROM employees', { rows: [] }],
      ['INSERT INTO employees', { rows: [{ id: 'emp-1' }] }],
    ]);
    const res = await apply(db, data, { clientId: null, year: 2026 });
    expect(res.clientId).toBe('client-1');
    expect(res.credentials).toHaveLength(1);
    expect(res.credentials[0]).toMatchObject({ email: 'mario@x.it', nome: 'Mario Rossi', ruolo: 'responsabile' });
    expect(res.credentials[0].password).toEqual(expect.any(String));
    expect(res.summary).toMatchObject({ sedi: 1, dipendenti_creati: 1, dipendenti_aggiornati: 0, saldi: 1 });
    expect(logAudit).toHaveBeenCalled();
    const saldoCall = db.query.mock.calls.find((c) => c[0].includes('INTO leave_saldi'));
    expect(saldoCall[0]).toMatch(/used_days\s*=\s*0/);
    const clientCall = db.query.mock.calls.find((c) => c[0].includes('INSERT INTO clients'));
    expect(clientCall[0]).toMatch(/meal_voucher_hours/);
    const siteCall = db.query.mock.calls.find((c) => c[0].includes('INSERT INTO sites'));
    expect(siteCall[0]).toMatch(/latitude/);
    expect(siteCall[0]).toMatch(/longitude/);
  });

  it('updates an existing employee WITHOUT resetting password and skips credentials', async () => {
    const db = mockClient([
      ['SELECT id FROM sites', { rows: [{ id: 'site-1' }] }],
      ['SELECT id FROM employees', { rows: [{ id: 'emp-1' }] }],
      ['UPDATE employees', { rows: [{ id: 'emp-1' }] }],
    ]);
    const res = await apply(db, data, { clientId: 'client-1', year: 2026 });
    expect(res.credentials).toHaveLength(0);
    expect(res.summary).toMatchObject({ dipendenti_creati: 0, dipendenti_aggiornati: 1 });
    const touchedPassword = db.query.mock.calls.some((c) => /password_hash/.test(c[0]) && /UPDATE employees/.test(c[0]));
    expect(touchedPassword).toBe(false);
  });
});
