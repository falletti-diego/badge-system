const { validateAgainstDb } = require('../../scripts/onboarding/validateAgainstDb');

function mockDb(responses) {
  let i = 0;
  return { query: jest.fn().mockImplementation(() => Promise.resolve(responses[i++] || { rows: [] })) };
}

const data = {
  azienda: { email_referente: 'admin@new.it' },
  dipendenti: [
    { _row: 2, email: 'a@x.it', matricola: 'M1' },
    { _row: 3, email: 'b@x.it', matricola: 'M2' },
  ],
};

describe('validateAgainstDb', () => {
  it('new client: errors if client email already exists', async () => {
    const db = mockDb([{ rows: [{ id: 'c1' }] }]);
    const errs = await validateAgainstDb(db, data, { clientId: null });
    expect(errs.join()).toMatch(/azienda.*email.*esiste/i);
  });

  it('new client: passes when client email is free', async () => {
    const db = mockDb([{ rows: [] }]);
    const errs = await validateAgainstDb(db, data, { clientId: null });
    expect(errs).toEqual([]);
  });

  it('existing client: errors when a matricola belongs to a different employee', async () => {
    const db = mockDb([{ rows: [{ external_employee_id: 'M1', email: 'other@x.it' }] }]);
    const errs = await validateAgainstDb(db, data, { clientId: 'c1' });
    expect(errs.join()).toMatch(/matricola.*M1/i);
  });
});
