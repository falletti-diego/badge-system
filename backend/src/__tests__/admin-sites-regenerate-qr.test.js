'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db/pool', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../db/redis', () => ({
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
  redisClient: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough, demoStartLimiter: passThrough, onboardingInviteLimiter: passThrough };
});

const { pool } = require('../db/pool');
const app = require('../app');

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_A = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID = '550e8400-e29b-41d4-a716-446655440010';

const ADMIN_A_TOKEN = makeToken({ user_id: 'admin-a', client_id: CLIENT_A, role: 'admin' });
const EMPLOYEE_TOKEN = makeToken({ user_id: 'emp-1', client_id: CLIENT_A, role: 'employee', employee_id: 'emp-1' });
const MANAGER_TOKEN = makeToken({ user_id: 'mgr-1', client_id: CLIENT_A, role: 'manager' });

describe('POST /api/v1/admin/sites/:id/regenerate-qr', () => {
  beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
  afterAll(() => { process.env.DISABLE_AUTH = 'true'; });
  beforeEach(() => jest.clearAllMocks());

  it('employee → 403 ADMIN_REQUIRED', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/sites/${SITE_ID}/regenerate-qr`)
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ADMIN_REQUIRED');
  });

  it('manager → 403 ADMIN_REQUIRED', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/sites/${SITE_ID}/regenerate-qr`)
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ADMIN_REQUIRED');
  });

  it('tenant-scoping: un admin del Cliente A non può rigenerare il QR di una sede del Cliente B (finding cross-tenant, Session 71)', async () => {
    // La UPDATE è scoped a client_id — se la sede appartiene a un altro tenant,
    // WHERE id = $1 AND client_id = $2 non trova righe → 404, non 200.
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post(`/api/v1/admin/sites/${SITE_ID}/regenerate-qr`)
      .set('Authorization', `Bearer ${ADMIN_A_TOKEN}`);

    expect(res.status).toBe(404);
    // Verifica che la query sia stata davvero scoped al client_id dell'admin, non solo all'id sede
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/client_id/i);
    expect(params).toContain(CLIENT_A);
  });

  it('admin del proprio cliente → 200, nuovo qr_code_content diverso dal vecchio, audit log scritto', async () => {
    // 3 chiamate pool.query in sequenza: SELECT (legge client_id/qr_code_content attuali),
    // UPDATE (scrive il nuovo qr_code_content), INSERT audit_log (dentro logAudit).
    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: SITE_ID, name: 'Torino Store', client_id: CLIENT_A, qr_code_content: 'badge://checkin?site_id=X&client_id=Y&v=OLD' }],
        rowCount: 1,
      }) // SELECT
      .mockResolvedValueOnce({
        rows: [{ id: SITE_ID, name: 'Torino Store', client_id: CLIENT_A, qr_code_content: `badge://checkin?site_id=${SITE_ID}&client_id=${CLIENT_A}&v=NEW` }],
      }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // audit log

    const res = await request(app)
      .post(`/api/v1/admin/sites/${SITE_ID}/regenerate-qr`)
      .set('Authorization', `Bearer ${ADMIN_A_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.qr_code_content).not.toBe('badge://checkin?site_id=X&client_id=Y&v=OLD');
    expect(res.body.data.qr_code_content).toMatch(new RegExp(`^badge://checkin\\?site_id=${SITE_ID}&client_id=`));
    expect(pool.query).toHaveBeenCalledTimes(3); // SELECT + UPDATE + audit log
  });

  it('sede inesistente → 404', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/api/v1/admin/sites/00000000-0000-0000-0000-000000000000/regenerate-qr')
      .set('Authorization', `Bearer ${ADMIN_A_TOKEN}`);

    expect(res.status).toBe(404);
  });
});
