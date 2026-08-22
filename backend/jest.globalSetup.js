'use strict';

/**
 * Jest globalSetup — runs ONCE in a single process before any test worker
 * starts (safe from the races a per-file setupFiles cleanup would create).
 *
 * Residual `revoked_tokens` / `used_tokens` rows left behind by aborted or
 * previous runs make auth-refresh-first-use fail (recurring flake since
 * Session 65, definitively attributed in Session 76: never a code bug, always
 * leftover state). Wipe STALE rows (older than 2 minutes) so every suite run
 * starts from a clean token state.
 *
 * Age-scoped, not an unconditional wipe: this globalSetup runs once at the
 * START of every `jest`/`npm test` CLI invocation. An unconditional DELETE
 * would clobber the in-progress session state of a genuinely concurrent
 * SECOND `npm test` invocation against the same local dev database (e.g. two
 * terminals running tests at once) — reproduced while investigating sporadic
 * test flakiness: auth-refresh-first-use.test.js's real login+refresh flow
 * inserts a used_tokens row, and a second concurrently-starting invocation's
 * globalSetup would delete it mid-flight, turning a legitimate first-use
 * refresh into a false SESSION_REVOKED. A whole suite run normally completes
 * in well under 6 minutes, so this window never touches a real in-progress
 * run's own rows while still cleaning up genuinely stale residue from a
 * crashed/aborted PREVIOUS run (the original bug this cleanup exists for).
 * 6 minutes specifically (not a rounder, shorter number): the replay-
 * detection path sets a temporary revoked_tokens block with a 5-minute TTL
 * (`revoked_until = NOW() + INTERVAL '5 minutes'`, routes/auth.js:389-390) —
 * a shorter wipe window would leave that block outliving the wipe, exactly
 * as reproduced while writing this fix: a poisoned revoked_tokens row from
 * one failed run kept blocking every subsequent run against the same shared
 * user_id (auth-refresh-first-use.test.js's DEMO_USERS-id-collision fixture)
 * for whatever remained of the original 5 minutes. Not a concern in CI: each
 * GitHub Actions job gets its own fresh, ephemeral Postgres service
 * container, so two CI runs never share a database.
 *
 * Same connection convention as the real-Postgres integration tests
 * (admin-saldi-names.test.js et al.): env vars with localhost/postgres
 * defaults. If the database is unreachable those suites soft-skip themselves,
 * so this cleanup just warns and steps aside instead of failing the run.
 */

require('dotenv').config();
const { Client } = require('pg');

module.exports = async () => {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'badge_system_test',
    connectionTimeoutMillis: 3000,
  });

  try {
    await client.connect();
    const revoked = await client.query(
      'DELETE FROM revoked_tokens WHERE revoked_at < NOW() - INTERVAL \'6 minutes\''
    );
    const used = await client.query(
      'DELETE FROM used_tokens WHERE created_at < NOW() - INTERVAL \'6 minutes\''
    );
    if (revoked.rowCount || used.rowCount) {
      // eslint-disable-next-line no-console
      console.log(
        `[jest.globalSetup] wiped residual token state: ${revoked.rowCount} revoked_tokens, ${used.rowCount} used_tokens`
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[jest.globalSetup] token cleanup skipped: ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }
};
