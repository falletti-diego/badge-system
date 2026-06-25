/**
 * Tests for GET /api/v1/leave/balance
 * Returns current employee's leave saldi for current year.
 */
const request = require('supertest');
const app = require('../app');

const EMPLOYEE_TOKEN = process.env.TEST_EMPLOYEE_TOKEN || '';
const ADMIN_TOKEN = process.env.TEST_ADMIN_TOKEN || '';

describe('GET /api/v1/leave/balance', () => {
  // jest.setup.js sets DISABLE_AUTH=true globally; temporarily disable to test auth guard
  beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
  afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .get('/api/v1/leave/balance')
      .expect(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 with array of saldi for authenticated employee', async () => {
    if (!EMPLOYEE_TOKEN) {
      console.warn('TEST_EMPLOYEE_TOKEN not set — skipping live test');
      return;
    }
    const res = await request(app)
      .get('/api/v1/leave/balance')
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
      .expect(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      expect(res.body.data[0]).toHaveProperty('leave_type');
      expect(res.body.data[0]).toHaveProperty('remaining_days');
    }
  });

  it('returns 200 with saldi for admin user', async () => {
    if (!ADMIN_TOKEN) {
      console.warn('TEST_ADMIN_TOKEN not set — skipping live test');
      return;
    }
    const res = await request(app)
      .get('/api/v1/leave/balance')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .expect(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
