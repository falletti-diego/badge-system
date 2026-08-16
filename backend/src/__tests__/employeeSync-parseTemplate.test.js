'use strict';

const ExcelJS = require('exceljs');
const { parseTemplate } = require('../services/employeeSync/parseTemplate');

async function buildWorkbook({ dipendenti = [], sedi = [] }) {
  const wb = new ExcelJS.Workbook();
  const wsDip = wb.addWorksheet('Dipendenti');
  wsDip.addRow(['nome_completo', 'email', 'telefono', 'ruolo', 'sede', 'matricola', 'stato', 'data_assunzione', 'data_uscita', 'manager_email']);
  for (const d of dipendenti) wsDip.addRow(d);
  const wsSedi = wb.addWorksheet('Sedi');
  wsSedi.addRow(['nome_sede', 'indirizzo', 'latitudine', 'longitudine', 'raggio_geofence_m']);
  for (const s of sedi) wsSedi.addRow(s);
  return wb.xlsx.writeBuffer();
}

describe('parseTemplate', () => {
  it('parses Dipendenti + Sedi with the new Stato/Data Assunzione/Data Uscita columns', async () => {
    const buffer = await buildWorkbook({
      dipendenti: [['Mario Rossi', 'mario@x.it', '333', 'dipendente', 'Torino', 'M1', 'Attivo', '2024-01-10', '']],
      sedi: [['Torino', 'Via Roma 1', '', '', '']],
    });
    const data = await parseTemplate(buffer);
    expect(data.dipendenti).toHaveLength(1);
    expect(data.dipendenti[0]).toMatchObject({
      email: 'mario@x.it', stato: 'attivo', data_assunzione: '2024-01-10',
    });
    expect(data.sedi[0].nome_sede).toBe('Torino');
  });

  it('normalizes email to lowercase and trims whitespace', async () => {
    const buffer = await buildWorkbook({
      dipendenti: [[' Mario Rossi ', ' MARIO@X.IT ', '', 'dipendente', 'Torino', '', 'Attivo', '', '']],
    });
    const data = await parseTemplate(buffer);
    expect(data.dipendenti[0].email).toBe('mario@x.it');
  });

  it('treats an empty stato/data_uscita cell as null', async () => {
    const buffer = await buildWorkbook({
      dipendenti: [['Mario Rossi', 'mario@x.it', '', 'dipendente', 'Torino', '', 'Attivo', '', '']],
    });
    const data = await parseTemplate(buffer);
    expect(data.dipendenti[0].data_uscita).toBeNull();
  });

  it('normalizes manager_email to lowercase and trims whitespace, like the employee email', async () => {
    const buffer = await buildWorkbook({
      dipendenti: [['Mario Rossi', 'mario@x.it', '', 'dipendente', 'Torino', '', 'Attivo', '', '', ' MANAGER@X.IT ']],
    });
    const data = await parseTemplate(buffer);
    expect(data.dipendenti[0].manager_email).toBe('manager@x.it');
  });

  it('treats an empty manager_email cell as null', async () => {
    const buffer = await buildWorkbook({
      dipendenti: [['Mario Rossi', 'mario@x.it', '', 'dipendente', 'Torino', '', 'Attivo', '', '', '']],
    });
    const data = await parseTemplate(buffer);
    expect(data.dipendenti[0].manager_email).toBeNull();
  });
});

describe('validateSyntax', () => {
  const { validateSyntax } = require('../services/employeeSync/validate');

  it('rejects a stato value other than attivo/inattivo', () => {
    const errors = validateSyntax({
      dipendenti: [{ _row: 2, email: 'x@x.it', nome_completo: 'X', ruolo: 'dipendente', sede: 'Torino', stato: 'boh' }],
      sedi: [{ _row: 2, nome_sede: 'Torino' }],
    });
    expect(errors.some((e) => e.toLowerCase().includes('stato'))).toBe(true);
  });

  it('accepts stato attivo/inattivo without error', () => {
    const errors = validateSyntax({
      dipendenti: [{ _row: 2, email: 'x@x.it', nome_completo: 'X', ruolo: 'dipendente', sede: 'Torino', stato: 'inattivo' }],
      sedi: [{ _row: 2, nome_sede: 'Torino' }],
    });
    expect(errors.some((e) => e.toLowerCase().includes('stato'))).toBe(false);
  });

  it('rejects a duplicate email in the file', () => {
    const errors = validateSyntax({
      dipendenti: [
        { _row: 2, email: 'dup@x.it', nome_completo: 'A', ruolo: 'dipendente', sede: 'Torino', stato: 'attivo' },
        { _row: 3, email: 'dup@x.it', nome_completo: 'B', ruolo: 'dipendente', sede: 'Torino', stato: 'attivo' },
      ],
      sedi: [{ _row: 2, nome_sede: 'Torino' }],
    });
    expect(errors.some((e) => e.includes('duplicata'))).toBe(true);
  });

  it('rejects a duplicate matricola in the file', () => {
    const errors = validateSyntax({
      dipendenti: [
        { _row: 2, email: 'a@x.it', nome_completo: 'A', ruolo: 'dipendente', sede: 'Torino', stato: 'attivo', matricola: 'M1' },
        { _row: 3, email: 'b@x.it', nome_completo: 'B', ruolo: 'dipendente', sede: 'Torino', stato: 'attivo', matricola: 'M1' },
      ],
      sedi: [{ _row: 2, nome_sede: 'Torino' }],
    });
    expect(errors.some((e) => e.includes('Matricola') && e.includes('duplicata'))).toBe(true);
  });

  it('does not flag two empty matricola cells as duplicates', () => {
    const errors = validateSyntax({
      dipendenti: [
        { _row: 2, email: 'a@x.it', nome_completo: 'A', ruolo: 'dipendente', sede: 'Torino', stato: 'attivo', matricola: null },
        { _row: 3, email: 'b@x.it', nome_completo: 'B', ruolo: 'dipendente', sede: 'Torino', stato: 'attivo', matricola: null },
      ],
      sedi: [{ _row: 2, nome_sede: 'Torino' }],
    });
    expect(errors.some((e) => e.includes('Matricola'))).toBe(false);
  });

  it('rejects a sede not present in the Sedi sheet', () => {
    const errors = validateSyntax({
      dipendenti: [{ _row: 2, email: 'x@x.it', nome_completo: 'X', ruolo: 'dipendente', sede: 'Roma', stato: 'attivo' }],
      sedi: [{ _row: 2, nome_sede: 'Torino' }],
    });
    expect(errors.some((e) => e.includes('Roma'))).toBe(true);
  });
});
