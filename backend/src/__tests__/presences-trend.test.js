'use strict';

const request = require('supertest');
const express = require('express');

jest.mock('../db/pool');
const { pool } = require('../db/pool');

jest.mock('../middleware/auth', () => ({
  requireAuth: (req, res, next) => next(),
}));

const presencesRouter = require('../routes/presences');

const createApp = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/v1/presences', presencesRouter);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.code, message: err.message, statusCode });
  });
  return app;
};

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID = '550e8400-e29b-41d4-a716-446655440010';

describe('GET /api/v1/presences/trend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('employee riceve 403 (stessa policy di /summary)', async () => {
    const app = createApp({ client_id: CLIENT_ID, role: 'employee', employee_id: 'emp-1' });
    const res = await request(app).get('/api/v1/presences/trend');

    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('manager senza site_id assegnato riceve 403 fail-closed', async () => {
    const app = createApp({ client_id: CLIENT_ID, role: 'manager', site_id: null });
    const res = await request(app).get('/api/v1/presences/trend');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NO_SITE_ASSIGNED');
  });

  test('admin senza filtro site_id riceve 30 giorni di dati aggregati su tutto il client', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1' }, { id: 'emp-2' }] }) // active employees
      .mockResolvedValueOnce({ rows: [] }) // checkins
      .mockResolvedValueOnce({ rows: [] }) // leave_requests
      .mockResolvedValueOnce({ rows: [] }); // illnesses

    const app = createApp({ client_id: CLIENT_ID, role: 'admin' });
    const res = await request(app).get('/api/v1/presences/trend');

    expect(res.status).toBe(200);
    expect(res.body.data.days).toHaveLength(30);
    expect(res.body.data.days[0]).toHaveProperty('presenze');
    expect(res.body.data.days[0]).toHaveProperty('ore_lavorate');
    expect(res.body.data.days[0]).toHaveProperty('ore_straordinarie');
    expect(res.body.data.days[0]).toHaveProperty('assenteismo_pct');
  });

  test('manager riceve dati scoped alla propria sede (query employees filtrata per assigned_sites)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const app = createApp({ client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID });
    const res = await request(app).get('/api/v1/presences/trend');

    expect(res.status).toBe(200);
    const [employeesQuery, employeesParams] = pool.query.mock.calls[0];
    expect(employeesQuery).toMatch(/ANY\(assigned_sites\)/);
    expect(employeesParams).toEqual([CLIENT_ID, SITE_ID]);
  });

  test('manager con query-string site_id diverso viene comunque scoped alla propria sede (no override RBAC)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const OTHER_SITE_ID = '550e8400-e29b-41d4-a716-446655440099';
    const app = createApp({ client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID });
    const res = await request(app).get('/api/v1/presences/trend').query({ site_id: OTHER_SITE_ID });

    expect(res.status).toBe(200);
    const [employeesQuery, employeesParams] = pool.query.mock.calls[0];
    expect(employeesQuery).toMatch(/ANY\(assigned_sites\)/);
    expect(employeesParams).toEqual([CLIENT_ID, SITE_ID]);

    const [checkinsQuery, checkinsParams] = pool.query.mock.calls[1];
    expect(checkinsQuery).toMatch(/site_id = \$4::uuid/);
    expect(checkinsParams).toEqual([CLIENT_ID, expect.any(String), expect.any(String), SITE_ID]);
  });

  test('admin/viewer con site_id in query filtra i checkins su quella sede specifica', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1' }] }) // active employees (scoped)
      .mockResolvedValueOnce({ rows: [] }) // checkins
      .mockResolvedValueOnce({ rows: [] }) // leave_requests
      .mockResolvedValueOnce({ rows: [] }); // illnesses

    const app = createApp({ client_id: CLIENT_ID, role: 'admin' });
    const res = await request(app).get('/api/v1/presences/trend').query({ site_id: SITE_ID });

    expect(res.status).toBe(200);
    const [employeesQuery, employeesParams] = pool.query.mock.calls[0];
    expect(employeesQuery).toMatch(/ANY\(assigned_sites\)/);
    expect(employeesParams).toEqual([CLIENT_ID, SITE_ID]);

    const [checkinsQuery, checkinsParams] = pool.query.mock.calls[1];
    expect(checkinsQuery).toMatch(/site_id = \$4::uuid/);
    expect(checkinsParams).toEqual([CLIENT_ID, expect.any(String), expect.any(String), SITE_ID]);
  });

  test('quando non ci sono dipendenti attivi, salta le query leave/illness (0 righe, nessuna query ANY su array vuoto)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // active employees: nessuno
      .mockResolvedValueOnce({ rows: [] }); // checkins

    const app = createApp({ client_id: CLIENT_ID, role: 'admin' });
    const res = await request(app).get('/api/v1/presences/trend');

    expect(res.status).toBe(200);
    expect(pool.query).toHaveBeenCalledTimes(2); // solo employees + checkins, non leave/illness
    expect(res.body.data.days[0].assenteismo_pct).toBe(0);
  });
});
