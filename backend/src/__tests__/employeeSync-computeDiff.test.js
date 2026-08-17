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
    expect(diff.modificati[0].changes.site_id).toEqual({ from: 'site-torino', to: 'site-milano', fromName: 'Torino', toName: 'Milano' });
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
    expect(diff.modificati[0].changes.site_id).toEqual({ from: 'site-torino', to: 'site-milano', fromName: 'Torino', toName: 'Milano' });
  });

  it('combines a site transfer and a phone change in the same "modificato" entry', () => {
    const db = [dbEmp({ site_id: 'site-torino', phone: '111' })];
    const diff = computeDiff([fileRow({ sede: 'Milano', telefono: '222' })], db, siteIdByName);
    expect(diff.modificati).toHaveLength(1);
    expect(diff.modificati[0].changes.site_id).toBeDefined();
    expect(diff.modificati[0].changes.phone).toBeDefined();
  });

  it('carries field changes (site transfer, phone) alongside a reactivation, instead of silently discarding them', () => {
    const db = [dbEmp({ active: false, site_id: 'site-torino', phone: '111', hiring_date: '2023-06-01', exit_date: '2026-05-01' })];
    const diff = computeDiff([fileRow({ stato: 'attivo', sede: 'Milano', telefono: '222' })], db, siteIdByName);
    expect(diff.riattivati).toHaveLength(1);
    expect(diff.riattivati[0].hiring_date).toBe('2023-06-01');
    expect(diff.riattivati[0].exit_date).toBeNull();
    expect(diff.riattivati[0].changes.site_id).toEqual({ from: 'site-torino', to: 'site-milano', fromName: 'Torino', toName: 'Milano' });
    expect(diff.riattivati[0].changes.phone).toEqual({ from: '111', to: '222' });
    expect(diff.modificati).toHaveLength(0); // non deve comparire ANCHE come "modificato" separato
  });

  it('reactivation with no other field changes has an empty changes object, not undefined', () => {
    const db = [dbEmp({ active: false })];
    const diff = computeDiff([fileRow({ stato: 'attivo' })], db, siteIdByName);
    expect(diff.riattivati[0].changes).toEqual({});
  });

  it('matches an existing DB employee whose email is mixed-case against the always-lowercased file email (dbByEmail keys are lowercased)', () => {
    // Regression test — Task 15 checkpoint finding: employees created via the
    // admin form have no lowercase guarantee on email. Before the fix,
    // dbByEmail used the raw (possibly mixed-case) DB email as its key, so
    // this row would fail to match: the employee would be duplicated (pushed
    // into "nuovi") while the real DB row, never marked "seen", would be
    // flagged as having left ("anomalie") — both wrong for the same person.
    const db = [dbEmp({ email: 'Mario.Rossi@Azienda.IT' })];
    const diff = computeDiff([fileRow({ email: 'mario.rossi@azienda.it' })], db, siteIdByName);
    expect(diff.nuovi).toHaveLength(0);
    expect(diff.anomalie).toHaveLength(0);
    expect(diff.modificati).toHaveLength(0);
    expect(diff.riattivati).toHaveLength(0);
  });

  it('matches a mixed-case DB email and still surfaces a real field change as "modificato" (not duplicated/anomalia)', () => {
    const db = [dbEmp({ email: 'Mario.Rossi@Azienda.IT', phone: '111' })];
    const diff = computeDiff([fileRow({ email: 'mario.rossi@azienda.it', telefono: '222' })], db, siteIdByName);
    expect(diff.nuovi).toHaveLength(0);
    expect(diff.anomalie).toHaveLength(0);
    expect(diff.modificati).toHaveLength(1);
    expect(diff.modificati[0].changes.phone).toEqual({ from: '111', to: '222' });
  });
});

describe('computeDiff — manager_email active/site-match enforcement (Task 15 checkpoint finding)', () => {
  it('does not resolve manager_id to a DEACTIVATED manager (treated as if the manager did not exist)', () => {
    const db = [
      { id: 'mgr-inactive', email: 'capo@x.it', name: 'Capo', phone: null, role: 'manager', site_id: 'site-torino', assigned_sites: [], active: false, hiring_date: null, exit_date: null, external_employee_id: null, manager_id: null },
    ];
    const diff = computeDiff(
      [fileRow({ email: 'nuovo@x.it', nome_completo: 'Nuovo', manager_email: 'capo@x.it' })],
      db,
      siteIdByName
    );
    expect(diff.nuovi[0].manager_id).toBeNull();
  });

  it('rejects manager_email pointing to a manager on a different site, with a validation error and no manager_id assigned', () => {
    const db = [
      { id: 'mgr-milano', email: 'capo@x.it', name: 'Capo', phone: null, role: 'manager', site_id: 'site-milano', assigned_sites: [], active: true, hiring_date: null, exit_date: null, external_employee_id: null, manager_id: null },
    ];
    const diff = computeDiff(
      [fileRow({ email: 'nuovo@x.it', nome_completo: 'Nuovo', sede: 'Torino', manager_email: 'capo@x.it' })],
      db,
      siteIdByName
    );
    expect(diff.errors.length).toBeGreaterThan(0);
    expect(diff.errors[0]).toContain('capo@x.it');
    expect(diff.nuovi[0].manager_id).toBeNull();
  });

  it('resolves manager_id normally for an active manager on the same site', () => {
    const db = [
      { id: 'mgr-torino', email: 'capo@x.it', name: 'Capo', phone: null, role: 'manager', site_id: 'site-torino', assigned_sites: [], active: true, hiring_date: null, exit_date: null, external_employee_id: null, manager_id: null },
    ];
    const diff = computeDiff(
      [fileRow({ email: 'nuovo@x.it', nome_completo: 'Nuovo', sede: 'Torino', manager_email: 'capo@x.it' })],
      db,
      siteIdByName
    );
    expect(diff.errors).toEqual([]);
    expect(diff.nuovi[0].manager_id).toBe('mgr-torino');
  });
});

describe('computeDiff — manager_email resolution', () => {
  const dbWithManager = [
    { id: 'mgr-1', email: 'capo@x.it', name: 'Capo', phone: null, role: 'manager', site_id: 'site-torino', assigned_sites: [], active: true, hiring_date: null, exit_date: null, external_employee_id: null, manager_id: null },
  ];

  it('resolves manager_email to manager_id for a new employee', () => {
    const diff = computeDiff(
      [fileRow({ email: 'nuovo@x.it', nome_completo: 'Nuovo', manager_email: 'capo@x.it' })],
      dbWithManager,
      siteIdByName
    );
    expect(diff.nuovi[0].manager_id).toBe('mgr-1');
  });

  it('leaves manager_id null when manager_email is empty', () => {
    const diff = computeDiff(
      [fileRow({ email: 'nuovo@x.it', nome_completo: 'Nuovo', manager_email: null })],
      dbWithManager,
      siteIdByName
    );
    expect(diff.nuovi[0].manager_id).toBeNull();
  });

  it('detects a manager change as "modificato"', () => {
    const db = [dbEmp({ manager_id: null }), ...dbWithManager];
    const diff = computeDiff([fileRow({ manager_email: 'capo@x.it' })], db, siteIdByName);
    expect(diff.modificati).toHaveLength(1);
    expect(diff.modificati[0].changes.manager_id).toEqual({ from: null, to: 'mgr-1' });
  });

  it('resolves manager_id even when the DB-stored manager email is mixed-case (managerIdByEmail keys are lowercased)', () => {
    const dbWithMixedCaseManager = [
      { id: 'mgr-2', email: 'Capo@X.IT', name: 'Capo', phone: null, role: 'manager', site_id: 'site-torino', assigned_sites: [], active: true, hiring_date: null, exit_date: null, external_employee_id: null, manager_id: null },
    ];
    const diff = computeDiff(
      [fileRow({ email: 'nuovo@x.it', nome_completo: 'Nuovo', manager_email: 'capo@x.it' })],
      dbWithMixedCaseManager,
      siteIdByName
    );
    expect(diff.nuovi[0].manager_id).toBe('mgr-2');
  });
});
