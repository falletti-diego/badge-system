/**
 * Tests: Shifts API — GET /api/shifts/my-schedule, GET/POST /api/shifts/:siteId
 * Pool and withTransaction are mocked. Real JWT tokens generated for role-specific tests.
 */

jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough };
});

jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../db/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(null),
  closeRedis: jest.fn().mockResolvedValue(undefined),
  isRedisAvailable: jest.fn().mockReturnValue(false),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../middleware/db-transaction', () => ({
  withTransaction: jest.fn(async (cb) => {
    const { pool } = require('../db/pool');
    const mockClient = { query: pool.query, release: jest.fn() };
    await pool.query('BEGIN');
    try {
      const result = await cb(mockClient);
      await pool.query('COMMIT');
      return result;
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  }),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { pool } = require('../db/pool');

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID   = '550e8400-e29b-41d4-a716-446655440010';
const EMP_ID    = '550e8400-e29b-41d4-a716-446655440100';
const OTHER_SITE = '550e8400-e29b-41d4-a716-446655440099';

beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => {
  process.env.DISABLE_AUTH = 'true';
  jest.clearAllMocks();
});
beforeEach(() => { jest.clearAllMocks(); });

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const adminToken    = () => signToken({ user_id: 'admin-1', client_id: CLIENT_ID, role: 'admin' });
const managerToken  = () => signToken({ user_id: 'mgr-1',   client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID });
const employeeToken = () => signToken({ user_id: 'emp-1',   client_id: CLIENT_ID, role: 'employee', employee_id: EMP_ID });

// =====================================================
// GET /api/shifts/my-schedule
// =====================================================

describe('GET /api/shifts/my-schedule', () => {
  test('employee with assigned site returns their shifts', async () => {
    const shiftsData = { [EMP_ID]: { '2026-06-01': 'm', '2026-06-02': 'p' } };
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID, assigned_sites: [SITE_ID] }] }) // employee lookup
      .mockResolvedValueOnce({ rows: [{ shifts_data: shiftsData }] });               // shifts fetch

    const res = await request(app)
      .get('/api/v1/shifts/my-schedule')
      .set('Authorization', `Bearer ${employeeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.shifts_data).toEqual({ '2026-06-01': 'm', '2026-06-02': 'p' });
    expect(res.body.data.metadata.shift_count).toBe(2);
  });

  test('employee with no assigned sites returns empty shifts', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: EMP_ID, assigned_sites: [] }] });

    const res = await request(app)
      .get('/api/v1/shifts/my-schedule')
      .set('Authorization', `Bearer ${employeeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.shifts_data).toEqual({});
  });

  test('employee not found in DB → 404', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/v1/shifts/my-schedule')
      .set('Authorization', `Bearer ${employeeToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('EMPLOYEE_NOT_FOUND');
  });

  test('admin role → 403 (employee-only endpoint)', async () => {
    const res = await request(app)
      .get('/api/v1/shifts/my-schedule')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('EMPLOYEE_ONLY');
  });

  test('manager role → 403 (employee-only endpoint)', async () => {
    const res = await request(app)
      .get('/api/v1/shifts/my-schedule')
      .set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('EMPLOYEE_ONLY');
  });

  test('no token → 401', async () => {
    const res = await request(app).get('/api/v1/shifts/my-schedule');
    expect(res.status).toBe(401);
  });
});

// =====================================================
// GET /api/shifts/:siteId
// =====================================================

describe('GET /api/shifts/:siteId', () => {
  test('admin fetches shifts for any site → 200', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: SITE_ID, name: 'Torino Store', location: 'Torino' }] }) // site
      .mockResolvedValueOnce({ rows: [{ shifts_data: { [EMP_ID]: { '2026-06-01': 'm' } } }] })      // shifts
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID, name: 'Mario Rossi', email: 'mario@test.com' }] }); // employees

    const res = await request(app)
      .get(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.site.name).toBe('Torino Store');
    expect(res.body.data.employees).toHaveLength(1);
  });

  test('manager fetches shifts for their own site → 200', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: SITE_ID, name: 'Torino Store', location: 'Torino' }] })
      .mockResolvedValueOnce({ rows: [] })                                            // no shifts yet
      .mockResolvedValueOnce({ rows: [] });                                           // no employees

    const res = await request(app)
      .get(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.shifts_data).toEqual({});
  });

  test('manager fetches different site → 403', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: OTHER_SITE, name: 'Milano Store', location: 'Milano' }] });

    const res = await request(app)
      .get(`/api/v1/shifts/${OTHER_SITE}`)
      .set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_ASSIGNED_TO_SITE');
  });

  test('employee role → 403', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: SITE_ID, name: 'Torino Store', location: 'Torino' }] });

    const res = await request(app)
      .get(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${employeeToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('EMPLOYEE_NOT_ALLOWED');
  });

  test('site not found → 404', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('SITE_NOT_FOUND');
  });

  test('invalid siteId UUID → 400', async () => {
    const res = await request(app)
      .get('/api/v1/shifts/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
  });
});

// =====================================================
// GET /api/shifts/:siteId/export
// =====================================================

describe('GET /api/shifts/:siteId/export', () => {
  test('admin exports shifts → 200 with shifts_data', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: SITE_ID, name: 'Torino Store' }] })
      .mockResolvedValueOnce({ rows: [{ shifts_data: { [EMP_ID]: { '2026-06-01': 'm' } } }] })
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID, name: 'Mario Rossi' }] });

    const res = await request(app)
      .get(`/api/v1/shifts/${SITE_ID}/export?format=csv`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.site_name).toBe('Torino Store');
    expect(res.body.data.format).toBe('csv');
  });

  test('manager exports own site → 200', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: SITE_ID, name: 'Torino Store' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get(`/api/v1/shifts/${SITE_ID}/export?format=csv`)
      .set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(200);
  });

  test('manager exports different site → 403', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: OTHER_SITE, name: 'Milano Store' }] });

    const res = await request(app)
      .get(`/api/v1/shifts/${OTHER_SITE}/export?format=csv`)
      .set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_ASSIGNED_TO_SITE');
  });

  test('site not found → 404', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get(`/api/v1/shifts/${SITE_ID}/export?format=csv`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
  });
});

// =====================================================
// POST /api/shifts/:siteId
// =====================================================

describe('POST /api/shifts/:siteId', () => {
  const shiftsPayload = {
    month: 6,
    year: 2026,
    shifts_data: { [EMP_ID]: { '2026-06-01': 'm', '2026-06-02': 'p' } },
  };

  test('admin creates new shift record → 200', async () => {
    const newRecord = { id: 'shift-uuid-1', shifts_data: shiftsPayload.shifts_data, updated_at: new Date().toISOString() };
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: SITE_ID }] })             // site check
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID }] })              // employee IDs validation
      .mockResolvedValueOnce({})                                       // BEGIN
      .mockResolvedValueOnce({ rows: [] })                            // existing shifts → none
      .mockResolvedValueOnce({ rows: [newRecord] })                   // INSERT
      .mockResolvedValueOnce({})                                       // COMMIT
      .mockResolvedValueOnce({ rows: [{ id: 'audit-1' }] })           // audit log
      .mockResolvedValueOnce({})                                       // notification emp/date 1
      .mockResolvedValueOnce({});                                      // notification emp/date 2

    const res = await request(app)
      .post(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(shiftsPayload);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('shift-uuid-1');
    expect(res.body.message).toBe('Shifts planning saved successfully');
  });

  test('admin updates existing shift record → 200', async () => {
    const updated = { id: 'shift-uuid-1', shifts_data: shiftsPayload.shifts_data, updated_at: new Date().toISOString() };
    const existing = { id: 'shift-uuid-1', shifts_data: { [EMP_ID]: { '2026-06-01': 's' } } };
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: SITE_ID }] })             // site check
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID }] })              // employee validation
      .mockResolvedValueOnce({})                                       // BEGIN
      .mockResolvedValueOnce({ rows: [existing] })                    // existing shifts found
      .mockResolvedValueOnce({ rows: [updated] })                     // UPDATE
      .mockResolvedValueOnce({})                                       // COMMIT
      .mockResolvedValueOnce({ rows: [{ id: 'audit-2' }] })           // audit log
      .mockResolvedValueOnce({})                                       // notification (changed shift)
      .mockResolvedValueOnce({});                                      // notification (new date)

    const res = await request(app)
      .post(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(shiftsPayload);

    expect(res.status).toBe(200);
    expect(res.body.data.shifts_data).toEqual(shiftsPayload.shifts_data);
  });

  test('manager saves shifts for own site → 200', async () => {
    const minShifts = { [EMP_ID]: { '2026-06-01': 'm' } };
    const newRecord = { id: 'shift-uuid-2', shifts_data: minShifts, updated_at: new Date().toISOString() };
    const minPayload = { month: 6, year: 2026, shifts_data: minShifts };
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: SITE_ID }] })             // site check
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID }] })              // employee validation
      .mockResolvedValueOnce({})                                        // BEGIN
      .mockResolvedValueOnce({ rows: [] })                             // existing → none
      .mockResolvedValueOnce({ rows: [newRecord] })                    // INSERT
      .mockResolvedValueOnce({})                                        // COMMIT
      .mockResolvedValueOnce({ rows: [{ id: 'audit-1' }] })           // audit log
      .mockResolvedValueOnce({});                                       // notification (1 date)

    const res = await request(app)
      .post(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${managerToken()}`)
      .send(minPayload);

    expect(res.status).toBe(200);
  });

  test('manager saves shifts for wrong site → 403', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: OTHER_SITE }] });

    const res = await request(app)
      .post(`/api/v1/shifts/${OTHER_SITE}`)
      .set('Authorization', `Bearer ${managerToken()}`)
      .send(shiftsPayload);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_ASSIGNED_TO_SITE');
  });

  test('invalid employee IDs in shifts_data → 400', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: SITE_ID }] })             // site check
      .mockResolvedValueOnce({ rows: [] });                           // employees validation → returns 0 (invalid)

    const res = await request(app)
      .post(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(shiftsPayload);

    expect(res.status).toBe(400);
  });

  test('site not found → 404', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(shiftsPayload);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('SITE_NOT_FOUND');
  });

  test('missing required fields → 400', async () => {
    const res = await request(app)
      .post(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ month: 6 }); // missing year and shifts_data

    expect(res.status).toBe(400);
  });
});
