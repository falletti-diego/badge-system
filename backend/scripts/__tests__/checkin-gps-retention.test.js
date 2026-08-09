'use strict';

const { runRetention } = require('../checkin-gps-retention');

describe('checkin-gps-retention — runRetention', () => {
  function makePool(countRows, updateRowCount) {
    return {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ count: String(countRows) }] })
        .mockResolvedValueOnce({ rowCount: updateRowCount }),
    };
  }

  it('nullifica checkin_latitude/checkin_longitude per check-in oltre retentionDays, riga preservata', async () => {
    const pool = makePool(3, 3);
    const result = await runRetention({ pool, retentionDays: 90, dryRun: false });

    expect(result.updated).toBe(3);
    const updateCall = pool.query.mock.calls[1];
    expect(updateCall[0]).toMatch(/UPDATE checkins/i);
    expect(updateCall[0]).toMatch(/checkin_latitude = NULL/i);
    expect(updateCall[0]).toMatch(/checkin_longitude = NULL/i);
    expect(updateCall[0]).not.toMatch(/DELETE/i); // la riga NON viene mai cancellata
  });

  it('--dry-run non esegue la UPDATE', async () => {
    const pool = { query: jest.fn().mockResolvedValueOnce({ rows: [{ count: '5' }] }) };
    const result = await runRetention({ pool, retentionDays: 90, dryRun: true });

    expect(result.wouldUpdate).toBe(5);
    expect(pool.query).toHaveBeenCalledTimes(1); // solo il COUNT, nessuna UPDATE
  });

  it('nessun check-in da aggiornare → nessuna UPDATE eseguita', async () => {
    const pool = { query: jest.fn().mockResolvedValueOnce({ rows: [{ count: '0' }] }) };
    const result = await runRetention({ pool, retentionDays: 90, dryRun: false });

    expect(result.updated).toBe(0);
    expect(pool.query).toHaveBeenCalledTimes(1); // solo il COUNT
  });
});
