const fs = require('fs');
const { writeCredentials } = require('../../scripts/onboarding/writeCredentials');

describe('writeCredentials', () => {
  it('writes a CSV with header and one row per credential, into the gitignored output dir', () => {
    const creds = [{ email: 'a@x.it', nome: 'A B', ruolo: 'dipendente', password: 'pw123' }];
    const p = writeCredentials(creds, 'X SRL');
    expect(p).toMatch(/onboarding-output[/\\]/);
    const txt = fs.readFileSync(p, 'utf8');
    expect(txt.split('\n')[0]).toBe('email,nome,ruolo,password_temporanea');
    expect(txt).toMatch(/a@x\.it,A B,dipendente,pw123/);
    fs.unlinkSync(p);
  });

  it('returns null and writes nothing when there are no credentials', () => {
    expect(writeCredentials([], 'X SRL')).toBeNull();
  });
});
