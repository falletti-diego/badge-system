'use strict';

/**
 * Jest globalSetup — runs ONCE in a single process before any test worker
 * starts (safe from the races a per-file setupFiles cleanup would create).
 *
 * Residual `revoked_tokens` / `used_tokens` rows left behind by aborted or
 * previous runs make auth-refresh-first-use fail (recurring flake since
 * Session 65, definitively attributed in Session 76: never a code bug, always
 * leftover state). Wipe both tables so every suite run starts from a clean
 * token state.
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
    const revoked = await client.query('DELETE FROM revoked_tokens');
    const used = await client.query('DELETE FROM used_tokens');
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
