'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
  demoStartLimiter: (req, res, next) => next(),
  onboardingInviteLimiter: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');
const app = require('../app');

beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SENIOR_TOKEN = makeToken({ user_id: 'senior-1', client_id: CLIENT_ID, role: 'senior_manager' });
const DIRECTOR_TOKEN = makeToken({ user_id: 'director-1', client_id: CLIENT_ID, role: 'director' });
const MANAGER_TOKEN = makeToken({ user_id: 'mgr-1', client_id: CLIENT_ID, role: 'manager', site_id: '550e8400-e29b-41d4-a716-446655440012' });

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue({ rows: [] });
});

describe.each([
  ['senior_manager', SENIOR_TOKEN],
  ['director', DIRECTOR_TOKEN],
])('%s has admin-equivalent visibility', (roleName, token) => {
  it('GET /api/v1/events/pending → 200, no site filter applied', async () => {
    const res = await request(app).get('/api/v1/events/pending').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/v1/leave/pending → 200, no site filter applied', async () => {
    const res = await request(app).get('/api/v1/leave/pending').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/v1/illnesses/admin → 200', async () => {
    const res = await request(app).get('/api/v1/illnesses/admin').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

it('a plain manager still gets 403 on GET /api/v1/illnesses/admin (unchanged)', async () => {
  const res = await request(app).get('/api/v1/illnesses/admin').set('Authorization', `Bearer ${MANAGER_TOKEN}`);
  expect(res.status).toBe(403);
});
