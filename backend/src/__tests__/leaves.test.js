/**
 * API Tests: Leave Request Endpoints
 * Tests for POST /api/v1/leave/request, GET /api/v1/leave/pending, PUT /api/v1/leave/:id/approve
 * Uses mocked database for deterministic testing.
 */

// Overrides the automatic mock at __mocks__/expo-server-sdk.js for this file only,
// giving inspectable spies on what notifyEmployee actually sends to Expo.
const mockChunkPushNotifications = jest.fn((messages) => [messages]);
const mockSendPushNotificationsAsync = jest.fn().mockResolvedValue([{ status: 'ok' }]);
jest.mock('expo-server-sdk', () => ({
  Expo: Object.assign(
    jest.fn().mockImplementation(() => ({
      chunkPushNotifications: (...args) => mockChunkPushNotifications(...args),
      sendPushNotificationsAsync: (...args) => mockSendPushNotificationsAsync(...args),
    })),
    { isExpoPushToken: () => true }
  ),
}));

jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough, demoStartLimiter: passThrough, onboardingInviteLimiter: passThrough, pushTokenLimiter: passThrough };
});

jest.mock('../db/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(null),
  closeRedis: jest.fn().mockResolvedValue(undefined),
  isRedisAvailable: jest.fn().mockReturnValue(false),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../middleware/db-transaction', () => ({
  withTransaction: jest.fn(async (cb) => {
    const { pool } = require('../db/pool');
    const mockClient = {
      query: pool.query,
      release: jest.fn(),
    };
    return await cb(mockClient);
  }),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { pool: mockPool } = require('../db/pool');

const TEST_CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEST_SITE_ID = '550e8400-e29b-41d4-a716-446655440010';
const TEST_EMPLOYEE_ID = '550e8400-e29b-41d4-a716-446655440100';
const TEST_MANAGER_ID = '550e8400-e29b-41d4-a716-446655440101';
const TEST_ADMIN_ID = '550e8400-e29b-41d4-a716-446655440102';
const TEST_LEAVE_ID = '550e8400-e29b-41d4-a716-446655440200';

const makeToken = (claims = {}) => jwt.sign(
  {
    user_id: TEST_ADMIN_ID,
    client_id: TEST_CLIENT_ID,
    role: 'admin',
    ...claims,
  },
  process.env.JWT_PRIVATE_KEY,
  { algorithm: 'RS256', expiresIn: '15m' }
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Leave Request API Endpoints — Validation', () => {
  describe('POST /api/v1/leave/request', () => {
    it('should return 400 for missing leave_type', async () => {
      const res = await request(app)
        .post('/api/v1/leave/request')
        .send({
          start_date: '2026-06-15',
          end_date: '2026-06-20',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for invalid date format', async () => {
      const res = await request(app)
        .post('/api/v1/leave/request')
        .send({
          leave_type: 'FERIE_1',
          start_date: '15/06/2026',
          end_date: '2026-06-20',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for end_date before start_date', async () => {
      const res = await request(app)
        .post('/api/v1/leave/request')
        .send({
          leave_type: 'FERIE_1',
          start_date: '2026-06-20',
          end_date: '2026-06-15',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for invalid leave_type', async () => {
      const res = await request(app)
        .post('/api/v1/leave/request')
        .send({
          leave_type: 'INVALID_TYPE',
          start_date: '2026-06-15',
          end_date: '2026-06-20',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });
  });

  describe('PUT /api/v1/leave/:id/approve', () => {
    it('should return 400 for invalid status', async () => {
      const res = await request(app)
        .put(`/api/v1/leave/${TEST_LEAVE_ID}/approve`)
        .send({
          status: 'WITHDRAWN',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for invalid leave ID (not UUID)', async () => {
      const res = await request(app)
        .put('/api/v1/leave/not-uuid/approve')
        .send({
          status: 'APPROVED',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });
  });
});

describe('Leave Request API Endpoints — Saldo negativo consentito', () => {
  // L'azienda permette esplicitamente ai dipendenti di andare in negativo
  // con le ferie — la richiesta non deve mai essere bloccata per saldo
  // insufficiente, solo per assenza totale di configurazione del saldo.
  const originalDisableAuth = process.env.DISABLE_AUTH;
  beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
  afterAll(() => { process.env.DISABLE_AUTH = originalDisableAuth; });

  it('creates the request even when it would push remaining_days below zero', async () => {
    const employeeToken = makeToken({ user_id: TEST_EMPLOYEE_ID, role: 'employee' });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] }) // employee lookup
      .mockResolvedValueOnce({ rows: [{ remaining_days: 1 }] }) // solo 1 giorno disponibile
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL lock_timeout (lockAbsenceConflictScope)
      .mockResolvedValueOnce({ rows: [] }) // SELECT pg_advisory_xact_lock (lockAbsenceConflictScope)
      .mockResolvedValueOnce({ rows: [] }) // findConflictingEventRange — nessun evento in conflitto
      .mockResolvedValueOnce({ rows: [] }) // findConflictingIllnessRange — nessuna malattia in conflitto
      .mockResolvedValueOnce({ rows: [{ id: TEST_LEAVE_ID, num_days: 3, status: 'PENDING' }] }); // insert

    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leave_type: 'FERIE_1',
        start_date: '2026-06-15',
        end_date: '2026-06-17', // 3 giorni richiesti, saldo disponibile 1 -> andrebbe a -2
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(TEST_LEAVE_ID);
  });

  it('still rejects when no saldo row exists at all for that leave_type/year (nothing to go negative from)', async () => {
    const employeeToken = makeToken({ user_id: TEST_EMPLOYEE_ID, role: 'employee' });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] })
      .mockResolvedValueOnce({ rows: [] }); // nessun saldo configurato per questo leave_type/anno

    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ leave_type: 'FERIE_1', start_date: '2026-06-15', end_date: '2026-06-17' });

    expect(res.status).toBe(400);
    expect(res.body.details.code).toBe('NO_SALDO_CONFIGURED');
  });
});

describe('Leave Request API Endpoints — Response Structure', () => {
  describe('GET /api/v1/leave/pending', () => {
    it('should return 200 with array for pending requests', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_LEAVE_ID,
            user_id: TEST_EMPLOYEE_ID,
            employee_name: 'John Doe',
            status: 'PENDING',
          },
        ],
      });

      const res = await request(app).get('/api/v1/leave/pending');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/leave/my-requests', () => {
    it('should return 200 with array for my requests', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_LEAVE_ID,
            user_id: TEST_EMPLOYEE_ID,
            status: 'PENDING',
          },
        ],
      });

      const res = await request(app).get('/api/v1/leave/my-requests');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});

describe('Leave Request API Endpoints — Security Regression Tests', () => {
  const originalDisableAuth = process.env.DISABLE_AUTH;

  beforeAll(() => {
    process.env.DISABLE_AUTH = 'false';
  });

  afterAll(() => {
    process.env.DISABLE_AUTH = originalDisableAuth;
  });

  describe('GET /api/v1/leave/pending', () => {
    it('should fail closed for roles that are not admin or assigned manager', async () => {
      const viewerToken = makeToken({
        user_id: '550e8400-e29b-41d4-a716-446655440300',
        role: 'viewer',
      });

      const res = await request(app)
        .get('/api/v1/leave/pending')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/v1/leave/:id/approve', () => {
    it('should not reveal processed status to callers without approval permission', async () => {
      const viewerToken = makeToken({
        user_id: '550e8400-e29b-41d4-a716-446655440300',
        role: 'viewer',
      });

      const res = await request(app)
        .put(`/api/v1/leave/${TEST_LEAVE_ID}/approve`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should reject already processed requests before mutating saldo or shifts', async () => {
      const adminToken = makeToken();
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_LEAVE_ID,
          client_id: TEST_CLIENT_ID,
          user_id: TEST_EMPLOYEE_ID,
          leave_type: 'FERIE_1',
          start_date: '2026-06-15',
          end_date: '2026-06-20',
          num_days: 6,
          status: 'APPROVED',
        }],
      });

      const res = await request(app)
        .put(`/api/v1/leave/${TEST_LEAVE_ID}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Leave request has already been processed');
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should reject stale concurrent approvals when atomic PENDING update affects no rows', async () => {
      const adminToken = makeToken();
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_LEAVE_ID,
            client_id: TEST_CLIENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            leave_type: 'FERIE_1',
            start_date: '2026-06-15',
            end_date: '2026-06-20',
            num_days: 6,
            status: 'PENDING',
          }],
        })
        // SET LOCAL lock_timeout (lockAbsenceConflictScope)
        .mockResolvedValueOnce({ rows: [] })
        // SELECT pg_advisory_xact_lock (lockAbsenceConflictScope)
        .mockResolvedValueOnce({ rows: [] })
        // findConflictingEventRange — no conflicting events
        .mockResolvedValueOnce({ rows: [] })
        // findConflictingIllnessRange — no conflicting illnesses
        .mockResolvedValueOnce({ rows: [] })
        // Atomic UPDATE ... WHERE status = 'PENDING' — affects no rows (stale)
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put(`/api/v1/leave/${TEST_LEAVE_ID}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Leave request has already been processed');
      expect(mockPool.query).toHaveBeenCalledTimes(6);
      expect(mockPool.query.mock.calls[5][0]).toContain('WHERE id = $4::uuid AND status = \'PENDING\'');
    });
  });

  describe('GET /api/v1/leave/approved', () => {
    it('should return approved leave requests for admin', async () => {
      const adminToken = makeToken({ role: 'admin', site_id: null });

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_LEAVE_ID,
            client_id: TEST_CLIENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            leave_type: 'FERIE_1',
            start_date: '2026-07-01',
            end_date: '2026-07-05',
            num_days: 5,
            motivation: 'Summer vacation',
            status: 'APPROVED',
            approved_by: TEST_ADMIN_ID,
            approved_at: '2026-06-13T10:00:00Z',
            created_at: '2026-06-13T09:00:00Z',
            updated_at: '2026-06-13T10:00:00Z',
            employee_name: 'Maria Rossi',
            employee_email: 'maria@example.com',
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/leave/approved')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('APPROVED');
      expect(res.body.data[0].leave_type).toBe('FERIE_1');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE r.status = \'APPROVED\''),
        [TEST_CLIENT_ID]
      );
    });

    it('should return manager scoped approved requests (own store employees)', async () => {
      const managerToken = makeToken({
        role: 'manager',
        site_id: TEST_SITE_ID,
        user_id: TEST_MANAGER_ID,
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_LEAVE_ID,
            client_id: TEST_CLIENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            leave_type: 'FERIE_1',
            start_date: '2026-07-01',
            end_date: '2026-07-05',
            num_days: 5,
            status: 'APPROVED',
            employee_name: 'Maria Rossi',
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/leave/approved')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('e.site_id = $2::uuid'),
        [TEST_CLIENT_ID, TEST_SITE_ID]
      );
    });

    it('should return employee scoped approved requests (own only)', async () => {
      const employeeToken = makeToken({
        role: 'employee',
        user_id: TEST_EMPLOYEE_ID,
        site_id: TEST_SITE_ID,
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_LEAVE_ID,
            client_id: TEST_CLIENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            leave_type: 'FERIE_1',
            status: 'APPROVED',
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/leave/approved')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('r.user_id = $2::uuid'),
        [TEST_CLIENT_ID, TEST_EMPLOYEE_ID]
      );
    });

    it('should return 401 for missing token', async () => {
      const res = await request(app).get('/api/v1/leave/approved');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('MISSING_TOKEN');
    });

    it('should return empty array when no approved requests', async () => {
      const adminToken = makeToken({ role: 'admin' });

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/leave/approved')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });
});

describe('Leave Request API Endpoints — Push notification on approve/reject', () => {
  const originalDisableAuth = process.env.DISABLE_AUTH;

  beforeAll(() => {
    process.env.DISABLE_AUTH = 'false';
  });

  afterAll(() => {
    process.env.DISABLE_AUTH = originalDisableAuth;
  });

  it('writes an in-app notification (type leave_approved, message contains "approvata") on approval', async () => {
    const adminToken = makeToken();

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ // SELECT leave_requests
        id: TEST_LEAVE_ID, client_id: TEST_CLIENT_ID, user_id: TEST_EMPLOYEE_ID,
        leave_type: 'FERIE_1', start_date: '2026-06-15', end_date: '2026-06-20',
        num_days: 6, status: 'PENDING',
      }] })
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL lock_timeout
      .mockResolvedValueOnce({ rows: [] }) // SELECT pg_advisory_xact_lock
      .mockResolvedValueOnce({ rows: [] }) // findConflictingEventRange
      .mockResolvedValueOnce({ rows: [] }) // findConflictingIllnessRange
      .mockResolvedValueOnce({ rows: [{ // UPDATE leave_requests ... RETURNING *
        id: TEST_LEAVE_ID, client_id: TEST_CLIENT_ID, user_id: TEST_EMPLOYEE_ID,
        leave_type: 'FERIE_1', start_date: '2026-06-15', end_date: '2026-06-20',
        num_days: 6, status: 'APPROVED', approved_by: TEST_ADMIN_ID, approved_at: '2026-06-13T10:00:00Z',
      }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE leave_saldi
      .mockResolvedValueOnce({ rows: [] }) // SAVEPOINT audit_log_sp
      .mockResolvedValueOnce({ rows: [] }) // INSERT INTO audit_log
      .mockResolvedValueOnce({ rows: [] }) // RELEASE SAVEPOINT audit_log_sp
      .mockResolvedValueOnce({ rows: [] }) // INSERT INTO notifications (notifyEmployee)
      .mockResolvedValueOnce({ rows: [] }); // SELECT token FROM device_push_tokens — none registered

    const res = await request(app)
      .put(`/api/v1/leave/${TEST_LEAVE_ID}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);

    const notifCall = mockPool.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO notifications'));
    expect(notifCall).toBeDefined();
    const [, params] = notifCall;
    expect(params[0]).toBe(TEST_EMPLOYEE_ID); // employee_id
    expect(params[1]).toBe(TEST_CLIENT_ID); // client_id
    expect(params[2]).toBe('leave_approved'); // type
    expect(params[3]).toEqual(expect.stringContaining('approvata')); // message
  });

  it('writes an in-app notification (type leave_rejected, message contains "rifiutata" AND the rejection reason) on rejection', async () => {
    const adminToken = makeToken();
    const rejectionReason = 'Copertura turno insufficiente';

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ // SELECT leave_requests
        id: TEST_LEAVE_ID, client_id: TEST_CLIENT_ID, user_id: TEST_EMPLOYEE_ID,
        leave_type: 'FERIE_1', start_date: '2026-06-15', end_date: '2026-06-20',
        num_days: 6, status: 'PENDING',
      }] })
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL lock_timeout
      .mockResolvedValueOnce({ rows: [] }) // SELECT pg_advisory_xact_lock
      .mockResolvedValueOnce({ rows: [] }) // findConflictingEventRange
      .mockResolvedValueOnce({ rows: [] }) // findConflictingIllnessRange
      .mockResolvedValueOnce({ rows: [{ // UPDATE leave_requests ... RETURNING *
        id: TEST_LEAVE_ID, client_id: TEST_CLIENT_ID, user_id: TEST_EMPLOYEE_ID,
        leave_type: 'FERIE_1', start_date: '2026-06-15', end_date: '2026-06-20',
        num_days: 6, status: 'REJECTED', approved_by: TEST_ADMIN_ID, approved_at: '2026-06-13T10:00:00Z',
        rejection_reason: rejectionReason,
      }] })
      // status !== 'APPROVED', so no UPDATE leave_saldi query
      .mockResolvedValueOnce({ rows: [] }) // SAVEPOINT audit_log_sp
      .mockResolvedValueOnce({ rows: [] }) // INSERT INTO audit_log
      .mockResolvedValueOnce({ rows: [] }) // RELEASE SAVEPOINT audit_log_sp
      .mockResolvedValueOnce({ rows: [] }) // INSERT INTO notifications (notifyEmployee)
      .mockResolvedValueOnce({ rows: [] }); // SELECT token FROM device_push_tokens — none registered

    const res = await request(app)
      .put(`/api/v1/leave/${TEST_LEAVE_ID}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED', rejection_reason: rejectionReason });

    expect(res.status).toBe(200);

    const notifCall = mockPool.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO notifications'));
    expect(notifCall).toBeDefined();
    const [, params] = notifCall;
    expect(params[2]).toBe('leave_rejected'); // type
    expect(params[3]).toEqual(expect.stringContaining('rifiutata'));
    expect(params[3]).toEqual(expect.stringContaining(rejectionReason));
  });

  it('never includes the rejection reason in the push body, even though it is present in-app (privacy)', async () => {
    const adminToken = makeToken();
    const rejectionReason = 'Motivo di salute riservato';

    mockChunkPushNotifications.mockClear();
    mockSendPushNotificationsAsync.mockClear();

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ // SELECT leave_requests
        id: TEST_LEAVE_ID, client_id: TEST_CLIENT_ID, user_id: TEST_EMPLOYEE_ID,
        leave_type: 'FERIE_1', start_date: '2026-06-15', end_date: '2026-06-20',
        num_days: 6, status: 'PENDING',
      }] })
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL lock_timeout
      .mockResolvedValueOnce({ rows: [] }) // SELECT pg_advisory_xact_lock
      .mockResolvedValueOnce({ rows: [] }) // findConflictingEventRange
      .mockResolvedValueOnce({ rows: [] }) // findConflictingIllnessRange
      .mockResolvedValueOnce({ rows: [{ // UPDATE leave_requests ... RETURNING *
        id: TEST_LEAVE_ID, client_id: TEST_CLIENT_ID, user_id: TEST_EMPLOYEE_ID,
        leave_type: 'FERIE_1', start_date: '2026-06-15', end_date: '2026-06-20',
        num_days: 6, status: 'REJECTED', approved_by: TEST_ADMIN_ID, approved_at: '2026-06-13T10:00:00Z',
        rejection_reason: rejectionReason,
      }] })
      .mockResolvedValueOnce({ rows: [] }) // SAVEPOINT audit_log_sp
      .mockResolvedValueOnce({ rows: [] }) // INSERT INTO audit_log
      .mockResolvedValueOnce({ rows: [] }) // RELEASE SAVEPOINT audit_log_sp
      .mockResolvedValueOnce({ rows: [] }) // INSERT INTO notifications (notifyEmployee)
      .mockResolvedValueOnce({ rows: [{ token: `ExponentPushToken[privacy-test-${Date.now()}]` }] }); // SELECT device_push_tokens — one registered device

    const res = await request(app)
      .put(`/api/v1/leave/${TEST_LEAVE_ID}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED', rejection_reason: rejectionReason });

    expect(res.status).toBe(200);

    // Let the fire-and-forget push send (not awaited by the route) run.
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockChunkPushNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        body: expect.not.stringContaining(rejectionReason),
      }),
    ]);
  });
});
