'use strict';

/**
 * Integration test: in-flight request against a demo tenant whose `clients`
 * row has already been deleted (Task 6 of 9 — Ambiente Demo Self-Service,
 * test matrix row 10: "Richiesta API in corso su un tenant demo proprio
 * mentre lo scheduler lo cancella").
 *
 * Simulates the race directly with SQL (delete the client row out from
 * under a still-valid demo JWT) rather than by running the cleanup script
 * — this isolates exactly what's being verified: that a request arriving
 * after the underlying tenant is gone gets a clean 4xx, never a 500 with a
 * leaked foreign-key/stack-trace error.
 *
 * requireDemoTenant (src/middleware/requireDemoTenant.js) already fails
 * closed to 403 when the client row doesn't resolve (`if (!client ||
 * client.is_demo !== true)`) — this test does not change that behavior, it
 * confirms/documents it, per the plan's explicit instruction.
 */

const { Pool } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('In-flight request during demo tenant deletion — clean 4xx, never 500', () => {
  jest.setTimeout(30000);

  let probePool;
  let dbAvailable = false;
  let request;
  let app;

  beforeAll(async () => {
    probePool = new Pool(dbConfig);
    try {
      await probePool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[demo-inflight-deletion.test] Skipping real-DB tests — could not connect to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}: ${err.message}`
      );
    }

    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    if (probePool) await probePool.end();
    if (dbAvailable) {
      const { closePool } = require('../db/pool');
      await closePool();
    }
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  it('returns a clean 4xx (not 500) when the client row is deleted between token issuance and the request', async () => {
    if (!dbAvailable) return;

    const email = uniqueEmail('inflight-deletion');
    const startRes = await request(app).post('/api/v1/demo/start').send({ email });
    expect(startRes.status).toBe(200);
    const { token } = startRes.body.data;

    const jwt = require('jsonwebtoken');
    const clientId = jwt.decode(token).client_id;

    // Simulate the scheduler deleting the tenant WHILE the request's JWT is
    // still validly signed and unexpired — directly delete the row, not by
    // running the cleanup script (isolates what's under test).
    await probePool.query('DELETE FROM clients WHERE id = $1', [clientId]);

    const res = await request(app)
      .post('/api/v1/demo/contact')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Should get a clean 4xx, never a 500.' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    // No raw Postgres error / stack trace ever leaks into the response.
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/at [A-Za-z]+\.[A-Za-z]+ \(/);
    expect(bodyStr.toLowerCase()).not.toContain('foreign key');
    expect(bodyStr.toLowerCase()).not.toContain('violates');
  });
});
