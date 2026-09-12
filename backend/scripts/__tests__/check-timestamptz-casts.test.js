'use strict';

const { findViolations } = require('../check-timestamptz-casts');

const TZ_COLUMNS = new Set(['timestamp', 'created_at', 'updated_at']);

function file(filePath, content) {
  return { filePath, content };
}

describe('check-timestamptz-casts — findViolations', () => {
  it('flags a direct column cast with no AT TIME ZONE (checkins.js/eventConflict.js/migration-035 shape)', () => {
    const violations = findViolations(TZ_COLUMNS, [
      file('backend/migrations/999_example.sql', "UPDATE employees SET hiring_date = created_at::date WHERE hiring_date IS NULL;"),
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0].lineNumber).toBe(1);
  });

  it('flags a cast on the bound PARAMETER being compared against the column (queryScope.js shape — the one this check first missed)', () => {
    const violations = findViolations(TZ_COLUMNS, [
      file('backend/src/utils/queryScope.js', "whereClauses.push(`${alias}.timestamp >= $${paramCount}::date`);"),
    ]);
    expect(violations).toHaveLength(1);
  });

  it('does NOT flag a cast that already has AT TIME ZONE on the same line', () => {
    const violations = findViolations(TZ_COLUMNS, [
      file('backend/src/utils/eventConflict.js', "AND (c.timestamp AT TIME ZONE 'Europe/Rome')::date = $3::date"),
    ]);
    expect(violations).toHaveLength(0);
  });

  it('does NOT flag a ::date cast with no TIMESTAMPTZ column on the line (e.g. a genuine DATE column)', () => {
    const violations = findViolations(TZ_COLUMNS, [
      file('backend/src/routes/events.js', "query += ` AND event_date >= $${params.length}::date`;"),
    ]);
    expect(violations).toHaveLength(0);
  });

  it('does NOT flag a mention inside a comment (JSDoc `*` line, `//` line, or SQL `--` line)', () => {
    const violations = findViolations(TZ_COLUMNS, [
      file('backend/src/utils/eventConflict.js', " * `c.timestamp::date` (cast inside Postgres, in the DB session's timezone)"),
      file('backend/src/utils/foo.js', "// created_at::date was the old broken form"),
      file('backend/migrations/999_example.sql', "-- created_at::date is timezone-naive, do not reintroduce"),
    ]);
    expect(violations).toHaveLength(0);
  });

  it('respects a `tz-safe:` escape annotation on the same line', () => {
    const violations = findViolations(TZ_COLUMNS, [
      file('backend/src/utils/foo.js', "x = created_at::date; // tz-safe: reporting-only, off by one day is acceptable here"),
    ]);
    expect(violations).toHaveLength(0);
  });

  it('respects a `tz-safe:` escape annotation on the line immediately above', () => {
    const violations = findViolations(TZ_COLUMNS, [
      file('backend/src/utils/foo.js', "// tz-safe: reporting-only, off by one day is acceptable here\nx = created_at::date;"),
    ]);
    expect(violations).toHaveLength(0);
  });

  it('returns no violations when there are no TIMESTAMPTZ columns known (defensive: never crash CI on a schema query hiccup)', () => {
    const violations = findViolations(new Set(), [
      file('backend/migrations/999_example.sql', "UPDATE employees SET hiring_date = created_at::date;"),
    ]);
    expect(violations).toHaveLength(0);
  });

  it('reports the correct 1-indexed line number for a violation not on the first line', () => {
    const content = [
      'const x = 1;',
      '',
      'UPDATE employees SET hiring_date = created_at::date;',
    ].join('\n');
    const violations = findViolations(TZ_COLUMNS, [file('backend/migrations/999_example.sql', content)]);
    expect(violations).toHaveLength(1);
    expect(violations[0].lineNumber).toBe(3);
  });
});
