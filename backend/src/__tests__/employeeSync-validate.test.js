'use strict';

const { validateSyntax } = require('../services/employeeSync/validate');

function baseDip(overrides = {}) {
  return {
    _row: 2, nome_completo: 'Mario Rossi', email: 'mario@x.it', telefono: null,
    ruolo: 'dipendente', sede: 'Torino', matricola: null, stato: 'attivo',
    data_assunzione: null, data_uscita: null, manager_email: null,
    ...overrides,
  };
}
const sedi = [{ _row: 2, nome_sede: 'Torino' }];

describe('validateSyntax — manager_email', () => {
  it('accepts a manager_email matching an existing manager in DB', () => {
    const errors = validateSyntax(
      { dipendenti: [baseDip({ manager_email: 'capo@x.it' })], sedi },
      { existingManagerEmails: new Set(['capo@x.it']) }
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a manager_email not matching any existing manager', () => {
    const errors = validateSyntax(
      { dipendenti: [baseDip({ manager_email: 'sconosciuto@x.it' })], sedi },
      { existingManagerEmails: new Set(['capo@x.it']) }
    );
    expect(errors.some((e) => e.includes('sconosciuto@x.it'))).toBe(true);
  });

  it('allows an empty manager_email (optional field)', () => {
    const errors = validateSyntax(
      { dipendenti: [baseDip({ manager_email: null })], sedi },
      { existingManagerEmails: new Set() }
    );
    expect(errors).toHaveLength(0);
  });
});
