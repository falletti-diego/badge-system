/**
 * S.32.7 Task 3: POST /api/auth/revoke-session Tests
 * Tests RBAC enforcement, UUID validation, site_id scope, audit logging
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { pool } = require('../db/pool');

// Mock pool for isolated testing
jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
  closePool: jest.fn(),
}));

const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');

describe('POST /api/v1/auth/revoke-session', () => {
  let adminToken;
  let managerToken;
  let employeeToken;

  const adminUser = {
    user_id: '550e8400-e29b-41d4-a716-446655440001',
    role: 'admin',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
  };

  const managerUser = {
    user_id: '550e8400-e29b-41d4-a716-446655440002',
    role: 'manager',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    site_id: 'e1337fab-ba3f-4332-bb06-57c9df15b067', // Milano
  };

  const employeeUser = {
    user_id: '550e8400-e29b-41d4-a716-446655440003',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    employee_id: '239ec99f-3204-45ca-bce2-793f52442ec6',
  };

  const targetUser = {
    user_id: '550e8400-e29b-41d4-a716-446655440099',
    role: 'employee',
  };

  beforeAll(() => {
    adminToken = jwt.sign(adminUser, JWT_PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: '15m',
    });

    managerToken = jwt.sign(managerUser, JWT_PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: '15m',
    });

    employeeToken = jwt.sign(employeeUser, JWT_PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: '15m',
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===== HAPPY PATH =====

  test('Admin: revoke any user (happy path)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT revoked_tokens
    pool.query.mockResolvedValueOnce({ rows: [] }); // DELETE used_tokens
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT audit_log
    pool.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post('/api/v1/auth/revoke-session')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: targetUser.user_id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Session revoked');
  });

  // ===== RBAC: Manager =====

  test('Manager: revoke user at SAME site (allowed)', async () => {
    const targetAtSameSite = {
      user_id: '550e8400-e29b-41d4-a716-446655440100',
      site_id: 'e1337fab-ba3f-4332-bb06-57c9df15b067', // Same site as manager
    };

    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    pool.query.mockResolvedValueOnce({ rows: [{ site_id: targetAtSameSite.site_id }] }); // SELECT target site
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT revoked_tokens
    pool.query.mockResolvedValueOnce({ rows: [] }); // DELETE used_tokens
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT audit_log
    pool.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post('/api/v1/auth/revoke-session')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ user_id: targetAtSameSite.user_id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Manager: CANNOT revoke user at DIFFERENT site (403)', async () => {
    const targetAtDifferentSite = {
      user_id: '550e8400-e29b-41d4-a716-446655440100',
      site_id: '550e8400-e29b-41d4-a716-446655440012', // Different site (Torino)
    };

    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    pool.query.mockResolvedValueOnce({ rows: [{ site_id: targetAtDifferentSite.site_id }] }); // SELECT target site
    pool.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await request(app)
      .post('/api/v1/auth/revoke-session')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ user_id: targetAtDifferentSite.user_id });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  test('Manager: CANNOT revoke unassigned employee (NULL site_id) (403)', async () => {
    const unassignedTarget = {
      user_id: '550e8400-e29b-41d4-a716-446655440100',
      site_id: null, // Unassigned
    };

    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    pool.query.mockResolvedValueOnce({ rows: [{ site_id: unassignedTarget.site_id }] }); // SELECT target
    pool.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await request(app)
      .post('/api/v1/auth/revoke-session')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ user_id: unassignedTarget.user_id });

    expect(res.status).toBe(403);
  });

  // ===== RBAC: Employee/Viewer =====

  test('Employee: CANNOT revoke any user (403)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    pool.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await request(app)
      .post('/api/v1/auth/revoke-session')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ user_id: targetUser.user_id });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  // ===== VALIDATION =====

  test('Returns 400 for missing user_id', async () => {
    const res = await request(app)
      .post('/api/v1/auth/revoke-session')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('Returns 400 for invalid UUID format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/revoke-session')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // ===== ERROR CASES =====

  test('Returns 404 if target user not found (manager lookup)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    pool.query.mockResolvedValueOnce({ rows: [] }); // SELECT target (no rows)
    pool.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await request(app)
      .post('/api/v1/auth/revoke-session')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ user_id: '550e8400-e29b-41d4-a716-446655440099' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test('Returns 401 if no token provided', async () => {
    const res = await request(app)
      .post('/api/v1/auth/revoke-session')
      .send({ user_id: targetUser.user_id });

    expect(res.status).toBe(401);
  });

  // ===== AUDIT LOGGING =====

  test('Audit log records revocation with admin user_id and reason', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT revoked_tokens
    pool.query.mockResolvedValueOnce({ rows: [] }); // DELETE used_tokens
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT audit_log
    pool.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

    await request(app)
      .post('/api/v1/auth/revoke-session')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: targetUser.user_id });

    // Find the INSERT audit_log call
    const auditLogCall = pool.query.mock.calls.find(
      (call) => call[0].includes('INSERT INTO audit_log')
    );

    expect(auditLogCall).toBeDefined();
    const auditQuery = auditLogCall[0];
    expect(auditQuery).toContain('SESSION_REVOKED');
    expect(auditLogCall[1]).toContain(targetUser.user_id); // target user in details
  });

  // ===== IDEMPOTENCY =====

  test('Revoking same user twice succeeds both times (ON CONFLICT)', async () => {
    // First revoke
    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT revoked_tokens (first time)
    pool.query.mockResolvedValueOnce({ rows: [] }); // DELETE used_tokens
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT audit_log
    pool.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

    let res = await request(app)
      .post('/api/v1/auth/revoke-session')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: targetUser.user_id });

    expect(res.status).toBe(200);

    // Second revoke
    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT revoked_tokens (ON CONFLICT UPDATE)
    pool.query.mockResolvedValueOnce({ rows: [] }); // DELETE used_tokens
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT audit_log
    pool.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

    res = await request(app)
      .post('/api/v1/auth/revoke-session')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: targetUser.user_id });

    expect(res.status).toBe(200); // Still 200, not 409
  });
});
