const { computeDiff } = require('../services/employeeSync/computeDiff');

const siteIdByName = new Map([['Torino', 'site-torino'], ['Milano', 'site-milano']]);

function dbEmp(overrides) {
  return {
    id: 'emp-1', email: 'mario@x.it', name: 'Mario Rossi', phone: null, role: 'employee',
    site_id: 'site-torino', assigned_sites: [], active: true, hiring_date: '2024-01-10', exit_date: null,
    external_employee_id: null,
    ...overrides,
  };
}
function fileRow(overrides) {
  return {
    _row: 2, nome_completo: 'Mario Rossi', email: 'mario@x.it', telefono: null, ruolo: 'dipendente',
    sede: 'Torino', matricola: null, stato: 'attivo', data_assunzione: null, data_uscita: null,
    ...overrides,
  };
}

describe('computeDiff', () => {
  it('classifies a brand new employee as "nuovo"', () => {
    const diff = computeDiff([fileRow({ email: 'nuovo@x.it', nome_completo: 'Nuovo Assunto' })], [], siteIdByName);
    expect(diff.nuovi).toHaveLength(1);
    expect(diff.nuovi[0].email).toBe('nuovo@x.it');
  });

  it('reactivates a previously deactivated employee, preserving hiring_date', () => {
    const db = [dbEmp({ active: false, exit_date: '2026-05-01', hiring_date: '2023-06-01' })];
    const diff = computeDiff([fileRow({ stato: 'attivo' })], db, siteIdByName);
    expect(diff.riattivati).toHaveLength(1);
    expect(diff.riattivati[0].hiring_date).toBe('2023-06-01');
    expect(diff.riattivati[0].exit_date).toBeNull();
  });

  it('marks an employee absent-as-inactive in the file as "rimosso"', () => {
    const db = [dbEmp({ active: true })];
    const diff = computeDiff([fileRow({ stato: 'inattivo' })], db, siteIdByName);
    expect(diff.rimossi).toHaveLength(1);
    expect(diff.rimossi[0].exit_date).not.toBeNull();
  });

  it('detects a site transfer as replacement, not merge', () => {
    const db = [dbEmp({ site_id: 'site-torino' })];
    const diff = computeDiff([fileRow({ sede: 'Milano' })], db, siteIdByName);
    expect(diff.modificati).toHaveLength(1);
    expect(diff.modificati[0].changes.site_id).toEqual({ from: 'site-torino', to: 'site-milano' });
  });

  it('detects a non-site field change as "modificato"', () => {
    const db = [dbEmp({ phone: '111' })];
    const diff = computeDiff([fileRow({ telefono: '222' })], db, siteIdByName);
    expect(diff.modificati).toHaveLength(1);
    expect(diff.modificati[0].changes.phone).toEqual({ from: '111', to: '222' });
  });

  it('flags a row present in DB (active) but absent from the file as an anomaly, taking no action', () => {
    const db = [dbEmp({ email: 'sparito@x.it' })];
    const diff = computeDiff([], db, siteIdByName);
    expect(diff.anomalie).toHaveLength(1);
    expect(diff.anomalie[0].email).toBe('sparito@x.it');
    expect(diff.rimossi).toHaveLength(0);
  });

  it('does not list an unchanged row anywhere', () => {
    const db = [dbEmp()];
    const diff = computeDiff([fileRow()], db, siteIdByName);
    expect(diff.nuovi).toHaveLength(0);
    expect(diff.riattivati).toHaveLength(0);
    expect(diff.rimossi).toHaveLength(0);
    expect(diff.modificati).toHaveLength(0);
    expect(diff.anomalie).toHaveLength(0);
  });

  it('does not take any action for an employee already inactive in both DB and file', () => {
    const db = [dbEmp({ active: false })];
    const diff = computeDiff([fileRow({ stato: 'inattivo' })], db, siteIdByName);
    expect(diff.nuovi).toHaveLength(0);
    expect(diff.riattivati).toHaveLength(0);
    expect(diff.rimossi).toHaveLength(0);
  });

  it('detects a change in external_employee_id (matricola) as "modificato"', () => {
    const db = [dbEmp({ external_employee_id: 'M1' })];
    const diff = computeDiff([fileRow({ matricola: 'M2' })], db, siteIdByName);
    expect(diff.modificati).toHaveLength(1);
    expect(diff.modificati[0].changes.external_employee_id).toEqual({ from: 'M1', to: 'M2' });
  });

  it('does not flag a false site transfer for a typical employee whose site_id column is null (only assigned_sites is set)', () => {
    const db = [dbEmp({ site_id: null, assigned_sites: ['site-torino'] })];
    const diff = computeDiff([fileRow({ sede: 'Torino' })], db, siteIdByName);
    expect(diff.modificati).toHaveLength(0);
  });

  it('detects a real site transfer for an employee whose current site comes from assigned_sites (site_id null)', () => {
    const db = [dbEmp({ site_id: null, assigned_sites: ['site-torino'] })];
    const diff = computeDiff([fileRow({ sede: 'Milano' })], db, siteIdByName);
    expect(diff.modificati).toHaveLength(1);
    expect(diff.modificati[0].changes.site_id).toEqual({ from: 'site-torino', to: 'site-milano' });
  });

  it('combines a site transfer and a phone change in the same "modificato" entry', () => {
    const db = [dbEmp({ site_id: 'site-torino', phone: '111' })];
    const diff = computeDiff([fileRow({ sede: 'Milano', telefono: '222' })], db, siteIdByName);
    expect(diff.modificati).toHaveLength(1);
    expect(diff.modificati[0].changes.site_id).toBeDefined();
    expect(diff.modificati[0].changes.phone).toBeDefined();
  });
});
