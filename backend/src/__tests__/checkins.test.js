/**
 * Integration Tests: Check-ins API
 * Tests POST, GET, PUT, and CSV export endpoints
 */

const request = require('supertest');
const app = require('../app');
const { pool } = require('../db/pool');

const TEST_CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEST_EMPLOYEE_ID = '550e8400-e29b-41d4-a716-446655440100';
const TEST_SITE_ID = '550e8400-e29b-41d4-a716-446655440010';

describe('Check-ins API', () => {
  // Skip tests if DB not available
  let dbAvailable = true;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      console.warn('⚠️  Database not available, skipping integration tests');
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('POST /api/checkins — Create check-in', () => {
    test('Should create check-in with valid data', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .post('/api/checkins')
        .send({
          employee_id: TEST_EMPLOYEE_ID,
          site_id: TEST_SITE_ID,
          type: 'IN',
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.type).toBe('IN');
      expect(response.body.message).toBe('Check-in created successfully');
    });

    test('Should reject invalid employee_id', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .post('/api/checkins')
        .send({
          employee_id: 'not-uuid',
          site_id: TEST_SITE_ID,
          type: 'IN',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    test('Should reject missing type', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .post('/api/checkins')
        .send({
          employee_id: TEST_EMPLOYEE_ID,
          site_id: TEST_SITE_ID,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    test('Should reject non-existent employee', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .post('/api/checkins')
        .send({
          employee_id: '00000000-0000-0000-0000-000000000000',
          site_id: TEST_SITE_ID,
          type: 'IN',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Employee not found');
    });
  });

  describe('GET /api/checkins — List check-ins', () => {
    test('Should list checkins with required client_id', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .get('/api/checkins')
        .query({ client_id: TEST_CLIENT_ID });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('offset');
      expect(response.body.pagination).toHaveProperty('total');
    });

    test('Should reject missing client_id', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .get('/api/checkins');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    test('Should filter by site_id', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .get('/api/checkins')
        .query({
          client_id: TEST_CLIENT_ID,
          site_id: TEST_SITE_ID,
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });

    test('Should reject date range > 90 days', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .get('/api/checkins')
        .query({
          client_id: TEST_CLIENT_ID,
          date_from: '2025-01-01',
          date_to: '2025-05-01', // ~120 days
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    test('Should support pagination', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .get('/api/checkins')
        .query({
          client_id: TEST_CLIENT_ID,
          limit: 10,
          offset: 0,
        });

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(10);
      expect(response.body.pagination.offset).toBe(0);
    });
  });

  describe('PUT /api/checkins/:id — Correct check-in', () => {
    let checkinId;

    beforeAll(async () => {
      if (!dbAvailable) return;
      // Create a check-in to modify
      const result = await pool.query(
        `INSERT INTO checkins (employee_id, site_id, client_id, type, timestamp, created_by)
         VALUES ($1, $2, $3, $4, NOW(), 'test')
         RETURNING id`,
        [TEST_EMPLOYEE_ID, TEST_SITE_ID, TEST_CLIENT_ID, 'IN']
      );
      checkinId = result.rows[0].id;
    });

    test('Should correct check-in within 15 minutes', async () => {
      if (!dbAvailable || !checkinId) return;

      const response = await request(app)
        .put(`/api/checkins/${checkinId}`)
        .send({ type: 'OUT' });

      expect(response.status).toBe(200);
      expect(response.body.data.type).toBe('OUT');
      expect(response.body.data.modified_at).toBeDefined();
    });

    test('Should reject invalid checkin ID', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .put('/api/checkins/not-uuid')
        .send({ type: 'OUT' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    test('Should reject non-existent check-in', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .put('/api/checkins/00000000-0000-0000-0000-000000000000')
        .send({ type: 'OUT' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Check-in not found');
    });
  });

  describe('GET /api/export/csv — Export as CSV', () => {
    test('Should return CSV content', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .get('/api/export/csv')
        .query({ client_id: TEST_CLIENT_ID });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/csv/);
      expect(response.headers['content-disposition']).toMatch(/attachment/);
    });

    test('Should reject invalid client_id', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .get('/api/export/csv')
        .query({ client_id: 'not-uuid' });

      expect(response.status).toBe(400);
    });

    test('Should filter CSV by date range', async () => {
      if (!dbAvailable) return;

      const response = await request(app)
        .get('/api/export/csv')
        .query({
          client_id: TEST_CLIENT_ID,
          date_from: '2026-06-01',
          date_to: '2026-06-02',
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/csv/);
    });
  });
});
