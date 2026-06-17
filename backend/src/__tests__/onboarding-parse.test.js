const path = require('path');
const { parseWorkbook, ROLE_MAP, SALDO_COLUMNS } = require('../../scripts/onboarding/parseWorkbook');

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
