#!/usr/bin/env node
/**
 * check-timestamptz-casts.js
 *
 * Enforces CLAUDE.md "Known Bug Pattern 6": a bare `::date` cast (or
 * unwrapped comparison) on a TIMESTAMPTZ column evaluates in the DB
 * SESSION's timezone (UTC on AWS RDS by default), not Europe/Rome — the
 * calendar every date_from/date_to/event_date/etc. in this codebase is
 * actually expressed in. This bug class has now shipped FIVE times:
 * checkins.js (615fcbf, 2026-08-18), eventConflict.js (89986b3,
 * 2026-08-22), events.js, queryScope.js, and migrations/035 (all fixed
 * 2026-09-12, the last two found by this very script during design).
 *
 * The column list is NOT hardcoded — it's derived from information_schema
 * against the already-migrated test Postgres instance CI provides. A
 * hardcoded list is exactly the anti-pattern that caused the
 * isAdminEquivalent() regression (Session 116/117): it marches silently.
 * A migration that adds a new TIMESTAMPTZ column is covered automatically,
 * with zero action required.
 *
 * Scans backend/src/**\/*.js and backend/migrations/*.sql for
 * `<tz-column>::date` (optionally through a JS template alias like
 * `${alias}.column`) with no `AT TIME ZONE` on the same line. A violation
 * can be silenced with an inline `// tz-safe: <reason>` (JS) or
 * `-- tz-safe: <reason>` (SQL) annotation on the same line or the line
 * immediately above.
 *
 * FALSIFIABLE SUCCESS CRITERION (recorded 2026-09-12, review this file if
 * any of these happens):
 *   1. A 6th occurrence of this bug class ships despite this check passing
 *      — the detection logic has a gap, fix it.
 *   2. The `tz-safe` escape is used more than 2-3 times without a solid,
 *      reviewed reason — the check is probably too aggressive/misfiring,
 *      re-tune it instead of accumulating escapes.
 *   3. Full brainstorming→spec→plan ceremony is still applied to a
 *      one-line fix despite the CLAUDE.md light/heavy workflow table —
 *      that table is the part of this effort that failed, not this script.
 *
 * Usage:
 *   node scripts/check-timestamptz-casts.js
 *
 * Env vars (same convention as other scripts/tests in this repo):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SCAN_TARGETS = [
  { dir: path.join(REPO_ROOT, 'backend', 'src'), ext: '.js' },
  { dir: path.join(REPO_ROOT, 'backend', 'migrations'), ext: '.sql' },
];

/** Fetches distinct column names (not table-qualified) whose type is
 * TIMESTAMPTZ, across the whole public schema. Table-unqualified because
 * JS code refers to columns via SQL aliases (`c.timestamp`, `${alias}.foo`),
 * not the literal table name. */
async function fetchTimestamptzColumns(pool) {
  const result = await pool.query(
    `SELECT DISTINCT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND data_type = 'timestamp with time zone'`
  );
  return new Set(result.rows.map((r) => r.column_name));
}

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, ext, out);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

function collectFiles() {
  const files = [];
  for (const { dir, ext } of SCAN_TARGETS) {
    for (const filePath of walk(dir, ext)) {
      files.push({ filePath, content: fs.readFileSync(filePath, 'utf8') });
    }
  }
  return files;
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('--');
}

function hasEscape(lines, index) {
  const escapeRe = /tz-safe\s*:/i;
  if (escapeRe.test(lines[index])) return true;
  if (index > 0 && escapeRe.test(lines[index - 1])) return true;
  return false;
}

/**
 * Pure, testable core: given the set of TIMESTAMPTZ column names and a list
 * of {filePath, content} entries, returns every line with a `::date` cast
 * that also references one of those columns, with no AT TIME ZONE and no
 * tz-safe escape on that line or the one above.
 *
 * Deliberately NOT restricted to "the column itself is cast" — during
 * design (2026-09-12) this check first missed queryScope.js's actual bug,
 * which cast the bound PARAMETER (`$1::date`) being compared against the
 * TIMESTAMPTZ column, not the column itself (`${alias}.timestamp >=
 * $1::date`). Line-level co-occurrence of "mentions a tz column" + "::date
 * appears anywhere on the line" catches both shapes; it trades a somewhat
 * higher false-positive rate for not missing the shape that actually
 * shipped as a real bug. See the falsifiable criterion in the file header.
 */
function findViolations(tzColumns, files) {
  if (tzColumns.size === 0) return [];
  const columnPattern = [...tzColumns].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const columnRe = new RegExp(`\\b(${columnPattern})\\b`, 'i');
  const castAnywhereRe = /::\s*date\b/i;
  const atTimeZoneRe = /AT\s+TIME\s+ZONE/i;

  const violations = [];
  for (const { filePath, content } of files) {
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (isCommentLine(line)) return;
      if (!castAnywhereRe.test(line)) return;
      if (!columnRe.test(line)) return;
      if (atTimeZoneRe.test(line)) return;
      if (hasEscape(lines, index)) return;
      violations.push({ filePath, lineNumber: index + 1, line: line.trim() });
    });
  }
  return violations;
}

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'badge_system_test',
  });

  try {
    const tzColumns = await fetchTimestamptzColumns(pool);
    const files = collectFiles();
    const violations = findViolations(tzColumns, files);

    if (violations.length > 0) {
      console.error(`❌ ${violations.length} cast(i) su colonna TIMESTAMPTZ senza AT TIME ZONE 'Europe/Rome' (CLAUDE.md Pattern 6):\n`);
      for (const v of violations) {
        console.error(`  ${path.relative(REPO_ROOT, v.filePath)}:${v.lineNumber}\n    ${v.line}\n`);
      }
      console.error("Aggiungi AT TIME ZONE 'Europe/Rome' (vedi backend/src/utils/eventConflict.js o queryScope.js per la forma corretta),");
      console.error('oppure annota `// tz-safe: <motivo>` (JS) / `-- tz-safe: <motivo>` (SQL) se il cast è genuinamente innocuo.');
      process.exit(1);
    }

    console.log(`✅ Nessun cast timezone-naive trovato (${tzColumns.size} colonne TIMESTAMPTZ verificate, ${files.length} file scansionati).`);
    process.exit(0);
  } finally {
    await pool.end();
  }
}

module.exports = { fetchTimestamptzColumns, findViolations, collectFiles };

if (require.main === module) {
  run().catch((err) => {
    console.error('check-timestamptz-casts failed:', err.message);
    process.exit(1);
  });
}
