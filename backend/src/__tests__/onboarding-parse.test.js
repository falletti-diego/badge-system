const path = require('path');
const { parseWorkbook, ROLE_MAP, SALDO_COLUMNS, extractCellValue } = require('../../scripts/onboarding/parseWorkbook');

const EXAMPLE = path.join(__dirname, '..', '..', 'scripts', 'seed-data', 'onboarding-template-esempio.xlsx');

describe('parseWorkbook', () => {
  it('parses azienda, 3 sedi, 15 dipendenti from the example file', async () => {
    const data = await parseWorkbook(EXAMPLE);
    expect(data.azienda.ragione_sociale).toBe('Supermercati Rossi SRL');
    expect(data.azienda.email_referente).toBe('amministrazione@supermercatirossi.it');
    expect(data.sedi).toHaveLength(3);
    expect(data.dipendenti).toHaveLength(15);
  });

  it('normalizes: trims strings, lowercases emails, blanks→null/0', async () => {
    const data = await parseWorkbook(EXAMPLE);
    const e = data.dipendenti.find((d) => d.nome_completo === 'Laura Conti');
    expect(e.email).toBe(e.email.toLowerCase());
    expect(e.ruolo).toBe('responsabile');
    expect(typeof e.ferie_giorni).toBe('number');
    expect(data.dipendenti.every((d) => Number.isInteger(d.permessi_giorni))).toBe(true);
  });

  it('exposes ROLE_MAP and SALDO_COLUMNS constants', () => {
    expect(ROLE_MAP.dipendente).toBe('employee');
    expect(ROLE_MAP.responsabile).toBe('manager');
    expect(SALDO_COLUMNS.ferie_giorni).toBe('FERIE_1');
  });
});

describe('extractCellValue', () => {
  it('returns plain string/number/Date values unchanged', () => {
    expect(extractCellValue({ value: 'ciao' })).toBe('ciao');
    expect(extractCellValue({ value: 18 })).toBe(18);
    const d = new Date('2026-06-01');
    expect(extractCellValue({ value: d })).toBe(d);
    expect(extractCellValue(null)).toBeNull();
  });

  it('uses display text for hyperlink, rich-text and formula cells', () => {
    expect(extractCellValue({ value: { text: 'a@x.it', hyperlink: 'mailto:a@x.it' }, text: 'a@x.it' })).toBe('a@x.it');
    expect(extractCellValue({ value: { richText: [{ text: 'Mar' }, { text: 'io' }] }, text: 'Mario' })).toBe('Mario');
    expect(extractCellValue({ value: { formula: 'A1&B1', result: 'X SRL' }, text: 'X SRL' })).toBe('X SRL');
  });
});
