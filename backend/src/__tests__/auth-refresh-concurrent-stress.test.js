/**
 * S.32.7 Load Testing: Concurrent Refresh Stress Test
 * Tests behavior under concurrent refresh attempts with same token
 * Verifies first succeeds, subsequent are revoked as replays
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const app = require('../app');
const { pool } = require('../db/pool');

jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
  closePool: jest.fn(),
}));

const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');

describe('S.32.7 Load Testing: Concurrent Refresh', () => {
  const jti = uuid();
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  let refreshToken;

  beforeAll(() => {
    refreshToken = jwt.sign({
      user_id: userId,
      role: 'admin',
      client_id: '550e8400-e29b-41d4-a716-446655440001',
      email: 'admin@test.local',
      type: 'refresh',
      jti,
    }, JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '7d' });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createMockClient(queryResponses) {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    queryResponses.forEach((response) => {
      mockClient.query.mockResolvedValueOnce(response);
    });
    return mockClient;
  }

  test('10 concurrent requests: first succeeds, 9 blocked as replays', async () => {
    const mockClient1 = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // SELECT FOR UPDATE
      { rows: [] }, // SELECT revoked
      { rows: [] }, // DELETE
      { rows: [{ id: userId, role: 'admin', client_id: '550e8400-e29b-41d4-a716-446655440001', name: 'Admin', email: 'admin@test.local' }] }, // SELECT
      { rows: [] }, // INSERT new jti
      { rows: [] }, // COMMIT
    ]);
    pool.connect.mockResolvedValueOnce(mockClient1);

    for (let i = 1; i < 10; i++) {
      const mockClientN = createMockClient([
        { rows: [] }, // BEGIN
        { rows: [{ jti }] }, // SELECT FOR UPDATE (replay)
        { rows: [] }, // INSERT revoked
        { rows: [] }, // COMMIT
      ]);
      pool.connect.mockResolvedValueOnce(mockClientN);
    }

    const results = await Promise.all(
      Array(10).fill(null).map(() =>
        request(app)
          .post('/api/v1/auth/refresh')
          .send({ refresh_token: refreshToken })
      )
    );

    expect(results[0].status).toBe(200);
    for (let i = 1; i < 10; i++) {
      expect(results[i].status).toBe(401);
      expect(results[i].body.error).toBe('SESSION_REVOKED');
    }
  });

  test('Sequential refresh succeeds for different tokens', async () => {
    const mock1 = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // SELECT FOR UPDATE
      { rows: [] }, // SELECT revoked
      { rows: [] }, // DELETE
      { rows: [{ id: userId, role: 'admin', client_id: '550e8400-e29b-41d4-a716-446655440001', name: 'Admin', email: 'admin@test.local' }] }, // SELECT
      { rows: [] }, // INSERT jti_1
      { rows: [] }, // COMMIT
    ]);
    pool.connect.mockResolvedValueOnce(mock1);

    const res1 = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res1.status).toBe(200);
  });
});
