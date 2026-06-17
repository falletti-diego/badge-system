const { parseArgs } = require('../../scripts/onboard-client');

describe('onboard-client parseArgs', () => {
  it('parses a plain file argument', () => {
    const a = parseArgs(['file.xlsx']);
    expect(a).toMatchObject({ file: 'file.xlsx', dryRun: false, clientId: null, clientIdMissing: false });
  });

  it('parses --dry-run and --client-id with a value', () => {
    const a = parseArgs(['file.xlsx', '--dry-run', '--client-id', 'abc-123']);
    expect(a).toMatchObject({ file: 'file.xlsx', dryRun: true, clientId: 'abc-123', clientIdMissing: false });
  });

  it('flags --client-id with no value (last arg) instead of swallowing the file', () => {
    const a = parseArgs(['file.xlsx', '--client-id']);
    expect(a.clientIdMissing).toBe(true);
    expect(a.clientId).toBeNull();
    expect(a.file).toBe('file.xlsx');
  });

  it('flags --client-id when the next token is another flag', () => {
    const a = parseArgs(['file.xlsx', '--client-id', '--dry-run']);
    expect(a.clientIdMissing).toBe(true);
    expect(a.dryRun).toBe(true);
  });
});
