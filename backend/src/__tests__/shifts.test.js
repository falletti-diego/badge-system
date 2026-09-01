/**
 * Tests: Shifts API — GET /api/shifts/my-schedule, GET/POST /api/shifts/:siteId
 * Pool and withTransaction are mocked. Real JWT tokens generated for role-specific tests.
 */

jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough, demoStartLimiter: passThrough, onboardingInviteLimiter: passThrough, pushTokenLimiter: passThrough };
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

// Mocked wholesale (not just the underlying `expo-server-sdk` import it pulls
// in transitively) so shift-save tests can assert exactly which employees a
// save notified without also having to stage `device_push_tokens`
// SELECT/Expo-client mock queues for every changed cell — that behavior is
// already covered in pushNotifications.test.js.
jest.mock('../utils/pushNotifications', () => ({
  notifyEmployee: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { pool } = require('../db/pool');
const { notifyEmployee } = require('../utils/pushNotifications');

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID   = '550e8400-e29b-41d4-a716-446655440010';
const EMP_ID    = '550e8400-e29b-41d4-a716-446655440100';
const EMP_ID_2  = '550e8400-e29b-41d4-a716-446655440101';
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
      .mockResolvedValueOnce({ rows: [{ id: 'audit-1' }] });          // audit log
    // Notifications now go through the mocked notifyEmployee() helper
    // (see jest.mock('../utils/pushNotifications') above), not a direct
    // pool.query call — nothing to queue here for the 2 changed cells.

    const res = await request(app)
      .post(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(shiftsPayload);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('shift-uuid-1');
    expect(res.body.message).toBe('Shifts planning saved successfully');
    expect(notifyEmployee).toHaveBeenCalledTimes(2);
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
      .mockResolvedValueOnce({ rows: [{ id: 'audit-2' }] });          // audit log

    const res = await request(app)
      .post(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(shiftsPayload);

    expect(res.status).toBe(200);
    expect(res.body.data.shifts_data).toEqual(shiftsPayload.shifts_data);
    expect(notifyEmployee).toHaveBeenCalledTimes(2);
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
      .mockResolvedValueOnce({ rows: [{ id: 'audit-1' }] });          // audit log

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

  // =====================================================
  // Push-notification wiring (Task 7 — notifyEmployee())
  // =====================================================

  test('does not slow the response down when saving many changed cells (design decision 12)', async () => {
    const manyShifts = {};
    for (let day = 1; day <= 25; day += 1) {
      const dd = String(day).padStart(2, '0');
      manyShifts[`2026-06-${dd}`] = 'm';
    }
    const manyCellsPayload = { month: 6, year: 2026, shifts_data: { [EMP_ID]: manyShifts } };
    const newRecord = { id: 'shift-uuid-many', shifts_data: manyCellsPayload.shifts_data, updated_at: new Date().toISOString() };

    pool.query
      .mockResolvedValueOnce({ rows: [{ id: SITE_ID }] })             // site check
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID }] })              // employee validation
      .mockResolvedValueOnce({})                                       // BEGIN
      .mockResolvedValueOnce({ rows: [] })                            // existing shifts → none
      .mockResolvedValueOnce({ rows: [newRecord] })                   // INSERT
      .mockResolvedValueOnce({})                                       // COMMIT
      .mockResolvedValueOnce({ rows: [{ id: 'audit-many' }] });       // audit log

    const start = Date.now();
    const res = await request(app)
      .post(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(manyCellsPayload);

    expect(res.status).toBe(200);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(notifyEmployee).toHaveBeenCalledTimes(25);
  });

  test('does not call notifyEmployee for a shift cell that did not change', async () => {
    // Existing plan already has 2026-06-05 = 'm' for EMP_ID; the save below
    // repeats that same value for that date and adds a genuinely new value
    // for a different date — only the latter should trigger a notification.
    const existing = { id: 'shift-uuid-existing', shifts_data: { [EMP_ID]: { '2026-06-05': 'm' } } };
    const payload = {
      month: 6,
      year: 2026,
      shifts_data: { [EMP_ID]: { '2026-06-05': 'm', '2026-06-06': 'p' } },
    };
    const updated = { id: 'shift-uuid-existing', shifts_data: payload.shifts_data, updated_at: new Date().toISOString() };

    pool.query
      .mockResolvedValueOnce({ rows: [{ id: SITE_ID }] })             // site check
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID }] })              // employee validation
      .mockResolvedValueOnce({})                                       // BEGIN
      .mockResolvedValueOnce({ rows: [existing] })                    // existing shifts found
      .mockResolvedValueOnce({ rows: [updated] })                     // UPDATE
      .mockResolvedValueOnce({})                                       // COMMIT
      .mockResolvedValueOnce({ rows: [{ id: 'audit-unchanged' }] }); // audit log

    const res = await request(app)
      .post(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(notifyEmployee).toHaveBeenCalledTimes(1);
    expect(notifyEmployee).toHaveBeenCalledWith(expect.objectContaining({ employeeId: EMP_ID, shiftDate: '2026-06-06' }));
  });

  test('calls notifyEmployee once per employee when multiple employees change shifts in the same save', async () => {
    const payload = {
      month: 6,
      year: 2026,
      shifts_data: {
        [EMP_ID]: { '2026-06-10': 'p' },
        [EMP_ID_2]: { '2026-06-10': 's' },
      },
    };
    const newRecord = { id: 'shift-uuid-multi', shifts_data: payload.shifts_data, updated_at: new Date().toISOString() };

    pool.query
      .mockResolvedValueOnce({ rows: [{ id: SITE_ID }] })                          // site check
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID }, { id: EMP_ID_2 }] })        // employee validation
      .mockResolvedValueOnce({})                                                    // BEGIN
      .mockResolvedValueOnce({ rows: [] })                                         // existing shifts → none
      .mockResolvedValueOnce({ rows: [newRecord] })                                // INSERT
      .mockResolvedValueOnce({})                                                    // COMMIT
      .mockResolvedValueOnce({ rows: [{ id: 'audit-multi' }] });                  // audit log

    const res = await request(app)
      .post(`/api/v1/shifts/${SITE_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(notifyEmployee).toHaveBeenCalledTimes(2);
    expect(notifyEmployee).toHaveBeenCalledWith(expect.objectContaining({ employeeId: EMP_ID, shiftDate: '2026-06-10' }));
    expect(notifyEmployee).toHaveBeenCalledWith(expect.objectContaining({ employeeId: EMP_ID_2, shiftDate: '2026-06-10' }));
  });
});
