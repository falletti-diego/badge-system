'use strict';

jest.mock('../db/pool', () => ({ pool: { query: jest.fn() } }));

const { invalidateSignatureIfExists } = require('../utils/timesheetSignature');

describe('invalidateSignatureIfExists', () => {
  it('invalida la firma signed per il mese/anno derivati dal timestamp (UTC)', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rowCount: 1 }) };
    await invalidateSignatureIfExists(client, 'emp-1', '2026-07-31T23:30:00.000Z');

    expect(client.query).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE timesheet_signatures/i),
      ['emp-1', 7, 2026]
    );
  });

  it('è un no-op silenzioso se non esiste nessuna firma signed per quel mese (0 righe toccate)', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rowCount: 0 }) };
    await expect(invalidateSignatureIfExists(client, 'emp-1', '2026-07-15T10:00:00.000Z')).resolves.not.toThrow();
  });
});
