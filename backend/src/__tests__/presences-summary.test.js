'use strict';

/**
 * Tests for GET /api/presences/summary and PUT /api/admin/settings
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../db/pool', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../db/redis', () => ({
  deleteCacheByPattern: jest.fn(),
  redisClient: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
  demoStartLimiter: (req, res, next) => next(),
  onboardingInviteLimiter: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');

// Disable global DISABLE_AUTH bypass so JWT role checks work
beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

// ─── Token helpers ────────────────────────────────────────────────────────────

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID   = '550e8400-e29b-41d4-a716-446655440010';
const EMP_ID    = '550e8400-e29b-41d4-a716-446655440100';

const ADMIN_TOKEN   = makeToken({ user_id: 'admin-uuid-1',   client_id: CLIENT_ID, role: 'admin' });
const MANAGER_TOKEN = makeToken({ user_id: 'mgr-uuid-1',     client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID });
const VIEWER_TOKEN  = makeToken({ user_id: 'viewer-uuid-1',  client_id: CLIENT_ID, role: 'viewer' });
const EMP_TOKEN     = makeToken({ user_id: 'emp-uuid-1',     client_id: CLIENT_ID, role: 'employee', employee_id: EMP_ID });
// Role-hierarchy roles: admin-equivalent for the summary (full client roster,
// no site filter) — regression guard for the pre-fix bug where they fell
// through every branch and got only checkin-active employees.
const SENIOR_MANAGER_TOKEN = makeToken({ user_id: 'sm-uuid-1',  client_id: CLIENT_ID, role: 'senior_manager' });
const DIRECTOR_TOKEN       = makeToken({ user_id: 'dir-uuid-1', client_id: CLIENT_ID, role: 'director' });

const app = require('../app');

// ─── Sample data helpers ──────────────────────────────────────────────────────

function makeCheckins() {
  return [
    { employee_id: EMP_ID, timestamp: new Date('2026-06-01T08:00:00Z'), type: 'IN',  employee_name: 'Mario Rossi', matricola: '001' },
    { employee_id: EMP_ID, timestamp: new Date('2026-06-01T16:00:00Z'), type: 'OUT', employee_name: 'Mario Rossi', matricola: '001' },
  ];
}

// ─── GET /api/presences/summary ───────────────────────────────────────────────

describe('GET /api/presences/summary', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Fallback per la query "Firmato" (timesheet_signatures) aggiunta dopo le
    // chiamate specifiche di ogni test — i test in questo describe non
    // verificano lo stato firma, quindi un default vuoto è sufficiente.
    pool.query.mockResolvedValue({ rows: [] });
  });

  it('no auth → 401', async () => {
    const res = await request(app).get('/api/v1/presences/summary?month=6&year=2026');
    expect(res.status).toBe(401);
  });

  it('employee role → 403', async () => {
    const res = await request(app)
      .get('/api/v1/presences/summary?month=6&year=2026')
      .set('Authorization', `Bearer ${EMP_TOKEN}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_ROLE');
  });

  it('invalid month → 400', async () => {
    const res = await request(app)
      .get('/api/v1/presences/summary?month=13&year=2026')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(400);
  });

  it('admin gets summary → 200 with employee data', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: makeCheckins() }) // check-ins query
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] }) // clients query
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID, name: 'Mario Rossi', matricola: '001' }] }); // all employees query

    const res = await request(app)
      .get('/api/v1/presences/summary?month=6&year=2026')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.period).toEqual({ month: 6, year: 2026 });
    expect(res.body.data.employees).toHaveLength(1);
    const emp = res.body.data.employees[0];
    expect(emp.id).toBe(EMP_ID);
    expect(emp.ore_totali).toBe(8);
    expect(emp.ore_ordinarie).toBe(8);
    expect(emp.ore_straordinarie).toBe(0);
    expect(emp.buoni_pasto).toBe(1);
    expect(emp.giorni_presenti).toBe(1);
    expect(emp.presenze_aperte).toBe(0);
  });

  it('include lo stato della firma per ogni dipendente (finding firma digitale)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: makeCheckins() }) // check-ins query
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] }) // clients query
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID, name: 'Mario Rossi', matricola: '001' }] }) // all employees query
      .mockResolvedValueOnce({ rows: [{ employee_id: EMP_ID, status: 'signed', signed_at: '2026-07-02T09:00:00Z' }] }); // firme del periodo

    const res = await request(app)
      .get('/api/v1/presences/summary?month=6&year=2026')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.employees[0].signature_status).toBe('signed');
    expect(res.body.data.employees[0].signed_at).toBe('2026-07-02T09:00:00Z');
  });

  it('signature_status è null quando il dipendente non ha mai firmato', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: makeCheckins() })
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] })
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID, name: 'Mario Rossi', matricola: '001' }] })
      .mockResolvedValueOnce({ rows: [] }); // nessuna firma

    const res = await request(app)
      .get('/api/v1/presences/summary?month=6&year=2026')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.employees[0].signature_status).toBeNull();
  });

  it('viewer gets summary → 200', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: makeCheckins() })
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] })
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID, name: 'Mario Rossi', matricola: '001' }] });

    const res = await request(app)
      .get('/api/v1/presences/summary?month=6&year=2026')
      .set('Authorization', `Bearer ${VIEWER_TOKEN}`);

    expect(res.status).toBe(200);
  });

  it('senior_manager gets summary → 200 with full client roster (no site filter)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: makeCheckins() }) // check-ins query
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] }) // clients query
      .mockResolvedValueOnce({ rows: [
        { id: EMP_ID, name: 'Mario Rossi', matricola: '001' },
        { id: '550e8400-e29b-41d4-a716-446655440102', name: 'Zero Checkin', matricola: '099' },
      ] }); // all-employees query — reached only via the admin-equivalent branch

    const res = await request(app)
      .get('/api/v1/presences/summary?month=6&year=2026')
      .set('Authorization', `Bearer ${SENIOR_MANAGER_TOKEN}`);

    expect(res.status).toBe(200);
    // No site_id in the check-ins query params (not site-scoped like a manager)
    expect(pool.query.mock.calls[0][1]).not.toContain(SITE_ID);
    // Full roster: includes an employee with zero checkins this month
    const ids = res.body.data.employees.map((e) => e.id);
    expect(ids).toContain('550e8400-e29b-41d4-a716-446655440102');
  });

  it('director gets summary → 200 with full client roster (no site filter)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: makeCheckins() })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] })
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID, name: 'Mario Rossi', matricola: '001' }] });

    const res = await request(app)
      .get('/api/v1/presences/summary?month=6&year=2026')
      .set('Authorization', `Bearer ${DIRECTOR_TOKEN}`);

    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[0][1]).not.toContain(SITE_ID);
    expect(res.body.data.employees).toHaveLength(1);
    expect(res.body.data.employees[0].id).toBe(EMP_ID);
  });

  it('manager gets summary → 200 (site-scoped)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: makeCheckins() })
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] })
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID, name: 'Mario Rossi', matricola: '001' }] }); // site roster query

    const res = await request(app)
      .get('/api/v1/presences/summary?month=6&year=2026')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);

    expect(res.status).toBe(200);
    // Check that site_id was included in query params
    const checkinsCallArgs = pool.query.mock.calls[0][1];
    expect(checkinsCallArgs).toContain(SITE_ID);
  });

  it('manager summary includes an employee with zero checkins this month, even when another employee at the site has checkins (regression: previously invisible whenever checkinsResult was non-empty)', async () => {
    const ZERO_CHECKIN_EMP_ID = '550e8400-e29b-41d4-a716-446655440101';
    pool.query
      .mockResolvedValueOnce({ rows: makeCheckins() }) // checkins — only for EMP_ID, nothing for ZERO_CHECKIN_EMP_ID
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] })
      .mockResolvedValueOnce({ rows: [
        { id: EMP_ID, name: 'Mario Rossi', matricola: '001' },
        { id: ZERO_CHECKIN_EMP_ID, name: 'Anna Verdi', matricola: '002' },
      ] }); // site roster query — includes both employees regardless of checkin activity

    const res = await request(app)
      .get('/api/v1/presences/summary?month=6&year=2026')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.employees.map((e) => e.id);
    expect(ids).toContain(EMP_ID);
    expect(ids).toContain(ZERO_CHECKIN_EMP_ID);
    const anna = res.body.data.employees.find((e) => e.id === ZERO_CHECKIN_EMP_ID);
    expect(anna.giorni_presenti).toBe(0);
    expect(anna.ore_totali).toBe(0);
  });

  it('month with no checkins → empty employees list', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // no check-ins
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] })
      .mockResolvedValueOnce({ rows: [] }); // no employees

    const res = await request(app)
      .get('/api/v1/presences/summary?month=1&year=2026')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.employees).toHaveLength(0);
    expect(res.body.data.totals.ore_totali).toBe(0);
  });

  it('meal voucher threshold — below threshold → 0 vouchers', async () => {
    const checkins = [
      { employee_id: EMP_ID, timestamp: new Date('2026-06-01T08:00:00Z'), type: 'IN',  employee_name: 'Mario', matricola: null },
      { employee_id: EMP_ID, timestamp: new Date('2026-06-01T11:00:00Z'), type: 'OUT', employee_name: 'Mario', matricola: null },
      // 3h worked < 5h threshold
    ];
    pool.query
      .mockResolvedValueOnce({ rows: checkins })
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] })
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID, name: 'Mario', matricola: null }] });

    const res = await request(app)
      .get('/api/v1/presences/summary?month=6&year=2026')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.employees[0].buoni_pasto).toBe(0);
  });

  it('overtime calculation — 9h → 1h straordinarie', async () => {
    const checkins = [
      { employee_id: EMP_ID, timestamp: new Date('2026-06-01T08:00:00Z'), type: 'IN',  employee_name: 'Mario', matricola: null },
      { employee_id: EMP_ID, timestamp: new Date('2026-06-01T17:00:00Z'), type: 'OUT', employee_name: 'Mario', matricola: null },
    ];
    pool.query
      .mockResolvedValueOnce({ rows: checkins })
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] })
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID, name: 'Mario', matricola: null }] });

    const res = await request(app)
      .get('/api/v1/presences/summary?month=6&year=2026')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    const emp = res.body.data.employees[0];
    expect(emp.ore_totali).toBe(9);
    expect(emp.ore_ordinarie).toBe(8);
    expect(emp.ore_straordinarie).toBe(1);
  });

  it('an approved event on the same date as a real checkin does not double-count hours (checkin wins)', async () => {
    const checkins = [
      { employee_id: EMP_ID, timestamp: new Date('2026-06-01T08:00:00Z'), type: 'IN',  employee_name: 'Mario', matricola: null },
      { employee_id: EMP_ID, timestamp: new Date('2026-06-01T16:00:00Z'), type: 'OUT', employee_name: 'Mario', matricola: null },
      // 8h worked via real checkins on 2026-06-01
    ];
    const events = [
      // Approved event for the SAME date — should be dropped in favor of the checkin
      { employee_id: EMP_ID, event_date: '2026-06-01', start_time: '08:00:00', end_time: '18:00:00' }, // would be 10h if counted
    ];
    pool.query
      .mockResolvedValueOnce({ rows: checkins })
      .mockResolvedValueOnce({ rows: events }) // approved events query — colliding date
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] })
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID, name: 'Mario', matricola: null }] });

    const res = await request(app)
      .get('/api/v1/presences/summary?month=6&year=2026')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    const emp = res.body.data.employees[0];
    // Only the checkin's 8h should count, not 8h + 10h
    expect(emp.ore_totali).toBe(8);
    expect(emp.giorni_presenti).toBe(1);
  });

  it('an approved event on a different date from any checkin is still counted', async () => {
    const checkins = [
      { employee_id: EMP_ID, timestamp: new Date('2026-06-01T08:00:00Z'), type: 'IN',  employee_name: 'Mario', matricola: null },
      { employee_id: EMP_ID, timestamp: new Date('2026-06-01T16:00:00Z'), type: 'OUT', employee_name: 'Mario', matricola: null },
    ];
    const events = [
      { employee_id: EMP_ID, event_date: '2026-06-02', start_time: '09:00:00', end_time: '13:00:00' }, // 4h, different date
    ];
    pool.query
      .mockResolvedValueOnce({ rows: checkins })
      .mockResolvedValueOnce({ rows: events })
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] })
      .mockResolvedValueOnce({ rows: [{ id: EMP_ID, name: 'Mario', matricola: null }] });

    const res = await request(app)
      .get('/api/v1/presences/summary?month=6&year=2026')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    const emp = res.body.data.employees[0];
    expect(emp.ore_totali).toBe(12); // 8h checkin + 4h event
    expect(emp.giorni_presenti).toBe(2);
  });

  it('defaults to current month/year when params omitted', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: '5.0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/v1/presences/summary')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.period.year).toBe(new Date().getFullYear());
  });
});

// ─── PUT /api/admin/settings ──────────────────────────────────────────────────

describe('PUT /api/admin/settings', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('admin updates meal_voucher_hours → 200', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ geofencing_feature_enabled: true }] }) // current-state lookup (Art.4 gate)
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: CLIENT_ID, meal_voucher_hours: '4.5' }] })
      .mockResolvedValueOnce({ rows: [] }); // audit log

    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ meal_voucher_hours: 4.5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.meal_voucher_hours).toBe('4.5');
  });

  it('manager → 403', async () => {
    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`)
      .send({ meal_voucher_hours: 4.5 });

    expect(res.status).toBe(403);
  });

  it('missing meal_voucher_hours → 400', async () => {
    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('meal_voucher_hours > 24 → 400', async () => {
    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ meal_voucher_hours: 25 });

    expect(res.status).toBe(400);
  });

  it('no auth → 401', async () => {
    const res = await request(app)
      .put('/api/v1/admin/settings')
      .send({ meal_voucher_hours: 5.0 });

    expect(res.status).toBe(401);
  });

  it('admin disables geofencing_feature_enabled → 200', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ geofencing_feature_enabled: true }] }) // current-state lookup (Art.4 gate)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: CLIENT_ID, meal_voucher_hours: '5', geofencing_feature_enabled: false }],
      })
      .mockResolvedValueOnce({ rows: [] }); // audit log

    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ meal_voucher_hours: 5.0, geofencing_feature_enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.data.geofencing_feature_enabled).toBe(false);
  });

  it('admin enables geofencing_feature_enabled without Art.4 confirmation → 400', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ geofencing_feature_enabled: false }] }); // current-state lookup

    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ meal_voucher_hours: 5.0, geofencing_feature_enabled: true });

    expect(res.status).toBe(400);
  });

  it('admin enables geofencing_feature_enabled with Art.4 confirmation → 200', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ geofencing_feature_enabled: false }] }) // current-state lookup (was off)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: CLIENT_ID, meal_voucher_hours: '5', geofencing_feature_enabled: true }],
      })
      .mockResolvedValueOnce({ rows: [] }) // update_settings audit log
      .mockResolvedValueOnce({ rows: [] }); // geofencing_art4_confirmed audit log

    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ meal_voucher_hours: 5.0, geofencing_feature_enabled: true, geofencing_art4_confirmed: true });

    expect(res.status).toBe(200);
    expect(res.body.data.geofencing_feature_enabled).toBe(true);
  });
});
