#!/usr/bin/env node
'use strict';

/**
 * Runs the Jest suite in two sequential batches instead of one, to fix a
 * class of flaky test failures documented across multiple past sessions
 * (see jest.globalSetup.js's own comment, and the "Known Bug Patterns" style
 * writeup in the PR that added this script): 42+ real-Postgres integration
 * test files share ONE database (badge_system_test), and Jest's default
 * parallel workers (each with its own connection pool) run them concurrently
 * against it. Most of those files are safe — every assertion is scoped to
 * rows the test itself created (by client_id/employee_id) — but a small
 * number assert or depend on a GLOBAL, unscoped view of shared tables. Those
 * few files silently and non-deterministically break (or, worse, silently
 * pass when they shouldn't) whenever another worker's in-flight test data
 * happens to be visible at the wrong moment.
 *
 * Root cause, concretely: the "active demo tenant cap" feature is global by
 * design (it counts is_demo=true clients across the ENTIRE tenant base, not
 * per-client) — so any test asserting on that cap needs the whole shared
 * table to itself for the duration of its run. There's no way to fix this by
 * scoping the assertion better; the feature under test IS global state.
 *
 * Fix: pull every test file that creates/reads that specific kind of global
 * state into its own batch, and run that batch with a single Jest worker
 * (--runInBand) AFTER the main parallel batch has fully exited — so within
 * the small batch, tests are fully serialized against each other (zero
 * cross-file interference), while the other ~95% of the suite keeps running
 * at full parallelism. Two sequential process exits, not two `projects`
 * inside one Jest config — Jest's `projects` feature does not support a
 * different `maxWorkers` per project, so a single invocation can't mix
 * "these files run parallel, those run serial."
 *
 * ── How to decide if a NEW test file belongs in GLOBAL_STATE_TEST_FILES ──
 * Ask: does this test assert on, or depend on the current value of, a query
 * against a shared table that is NOT filtered by a client_id/employee_id (or
 * other identifier) this test itself created? Classic tell: a bare
 * `SELECT COUNT(*) FROM <table> WHERE <condition unrelated to an id this
 * test created>`. If yes, add the filename here — do NOT try to "fix" it by
 * scoping the assertion if the feature under test is genuinely global (e.g.
 * a tenant-wide cap); scoping only works when the *test* was being sloppy,
 * not when the *feature* is inherently cross-tenant.
 */

const { spawnSync } = require('child_process');

const GLOBAL_STATE_TEST_FILES = [
  // All of these create (even transiently, mid-test, before cleanup runs) an
  // is_demo=true clients row with a future demo_expires_at — exactly the
  // shape counted by the active-demo-cap query in demo-start.test.js. Any one
  // of them running concurrently with that assertion can flip it either way.
  'demo-start.test.js',           // owns the fragile cap-boundary assertions themselves
  'admin-demo-tenants-integration.test.js',
  'auth-refresh-demo-expired.test.js',
  'demo-inflight-deletion.test.js',
  'demo-contact.test.js',
  'demo-switch-role.test.js',
  'demoSeed.test.js',
];

const globalStatePattern = GLOBAL_STATE_TEST_FILES
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

const baseArgs = ['--detectOpenHandles'];
const extraArgs = process.argv.slice(2); // e.g. --coverage, forwarded from `npm test -- --coverage`

function run(label, args) {
  console.log(`\n[run-tests] ${label}`);
  const result = spawnSync('npx', ['jest', ...args, ...baseArgs, ...extraArgs], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  });
  if (result.status !== 0) {
    console.error(`\n[run-tests] ${label} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

run(
  'Batch 1/2 — parallel (default workers): every test file except the global-state group',
  ['--testPathIgnorePatterns', `/node_modules/|(${globalStatePattern})$`, '--coverageDirectory=coverage/parallel']
);

run(
  `Batch 2/2 — serial (--runInBand): ${GLOBAL_STATE_TEST_FILES.length} files that touch the global active-demo-cap state`,
  ['--testPathPattern', `(${globalStatePattern})$`, '--runInBand', '--coverageDirectory=coverage/serial']
);

console.log('\n[run-tests] Both batches passed.');
