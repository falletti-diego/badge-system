const { validate } = require('../../scripts/onboarding/validate');
const { formatPreview } = require('../../scripts/onboarding/preview');

const base = () => ({
  azienda: { ragione_sociale: 'X SRL', email_referente: 'a@x.it', ore_min_buono_pasto: 5 },
  sedi: [{ _row: 2, nome_sede: 'Milano', indirizzo: 'Via 1', latitudine: null, longitudine: null, raggio_geofence_m: null }],
  dipendenti: [
    { _row: 2, nome_completo: 'Mario Rossi', email: 'mario@x.it', telefono: null, ruolo: 'responsabile', sede: 'Milano', matricola: 'M1', ferie_giorni: 10, permessi_giorni: 2, exfestivita_giorni: 0 },
  ],
});

describe('validate', () => {
  it('passes a well-formed workbook with no errors', () => {
    const r = validate(base());
    expect(r.errors).toEqual([]);
  });

  it('errors on missing required azienda fields', () => {
    const d = base(); d.azienda.ragione_sociale = null;
    expect(validate(d).errors.join()).toMatch(/ragione_sociale/);
  });

  it('errors on invalid email, bad role, and unknown sede reference', () => {
    const d = base();
    d.dipendenti[0].email = 'not-an-email';
    d.dipendenti[0].ruolo = 'capo';
    d.dipendenti[0].sede = 'Roma';
    const e = validate(d).errors.join('\n');
    expect(e).toMatch(/riga 2.*email/i);
    expect(e).toMatch(/ruolo/i);
    expect(e).toMatch(/sede.*Roma/i);
  });

  it('errors on duplicate employee email and negative/NaN saldo', () => {
    const d = base();
    d.dipendenti.push({ ...d.dipendenti[0], _row: 3, matricola: 'M2' });
    d.dipendenti[1].ferie_giorni = -5;
    const e = validate(d).errors.join('\n');
    expect(e).toMatch(/email.*duplicat/i);
    expect(e).toMatch(/saldo|negativ/i);
  });

  it('warns (not errors) on a sede without a responsabile and duplicate matricola', () => {
    const d = base();
    d.dipendenti[0].ruolo = 'dipendente'; // no responsabile on Milano
    d.dipendenti.push({ ...d.dipendenti[0], _row: 3, email: 'b@x.it' }); // duplicate matricola M1
    const r = validate(d);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join('\n')).toMatch(/Milano.*responsabile/i);
    expect(r.warnings.join('\n')).toMatch(/matricola.*M1/i);
  });
});

describe('formatPreview', () => {
  it('shows counts per site and surfaces warnings', () => {
    const data = {
      azienda: { ragione_sociale: 'X SRL' },
      sedi: [{ nome_sede: 'Milano' }, { nome_sede: 'Roma' }],
      dipendenti: [
        { sede: 'Milano', ruolo: 'responsabile', nome_completo: 'A' },
        { sede: 'Milano', ruolo: 'dipendente', nome_completo: 'B' },
        { sede: 'Roma', ruolo: 'dipendente', nome_completo: 'C' },
      ],
    };
    const out = formatPreview(data, ['attenzione: la sede "Roma" non ha responsabili']);
    expect(out).toMatch(/X SRL/);
    expect(out).toMatch(/Milano.*2/);
    expect(out).toMatch(/Roma.*1/);
    expect(out).toMatch(/attenzione/i);
  });
});

describe('validate — NaN numeric guards', () => {
  it('errors when a sede latitude is NaN (e.g. Italian decimal comma parsed to NaN)', () => {
    const d = base();
    d.sedi[0].latitudine = NaN;
    d.sedi[0].longitudine = NaN;
    const e = validate(d).errors.join('\n');
    expect(e).toMatch(/latitudine non è un numero valido/i);
  });

  it('errors when ore_min_buono_pasto is NaN', () => {
    const d = base();
    d.azienda.ore_min_buono_pasto = NaN;
    expect(validate(d).errors.join('\n')).toMatch(/ore_min_buono_pasto non è un numero/i);
  });

  it('accepts null numeric fields (blank cells) without error', () => {
    const d = base();
    d.sedi[0].latitudine = null;
    d.sedi[0].longitudine = null;
    d.azienda.ore_min_buono_pasto = null;
    expect(validate(d).errors).toEqual([]);
  });
});
