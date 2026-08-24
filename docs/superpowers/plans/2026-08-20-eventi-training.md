# Eventi/Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an employee request authorization to justify a day (or part of a day) spent at an external event/congress/training, route it to their manager for approval exactly like ferie/malattia, and have approved events count as worked hours in the presences summary — on mobile (primary) and web dashboard (manager approval).

**Architecture:** New `event_requests` table + `backend/src/routes/events.js`, modeled directly on the existing `leave_requests`/`routes/leaves.js` pattern (PENDING/APPROVED/REJECTED, manager-site-scoped RBAC, audit log) but with `event_date` + `start_time`/`end_time` instead of a day range, since ferie/malattia have no time-of-day concept. Approved events are **not** materialized into `checkins` — they're joined at query time into `backend/src/utils/hours.js`'s daily-entries pipeline (same "query-time join" pattern `presences.js` already uses for ferie/malattia), so they contribute to `ore_totali`/`buoni_pasto`. Mobile gets a button on the Badge screen (like Smart Working) that opens the request form, plus a new "Eventi" / "Approva Eventi" tab (mirroring the existing Ferie/Approvazioni tab) for history and manager approval. Web dashboard gets an equivalent manager approval panel embedded in `DashboardPage`, mirroring `ManagerLeaveApprovalPanel`.

**Tech Stack:** Node.js/Express/PostgreSQL/Zod (backend), React Native/Expo (mobile), React/MUI/React Router (web), Jest (backend + mobile tests), Vitest (web tests).

**Confirmed decisions (from grilling session, 2026-08-20):**
- New dedicated table `event_requests` (not a `leave_requests` extension) — single day only, `event_date` + `start_time`/`end_time`.
- Query-time join into presences (no synthetic `checkins` rows), same pattern as ferie/malattia.
- Event hours **count** as worked hours / meal-voucher eligibility (extends `aggregateMonthly`'s input).
- Server-side conflict check: block if the employee already has a checkin, approved/pending leave, non-cancelled illness, smart-working day, or another pending/approved event on that `event_date`.
- `event_date` may be retroactive up to 7 days in the past (reuses the existing `CORRECTION_WINDOW_EXPIRED` convention from `checkins.js`), no future cap.
- `description` is required (min 10, max 500 chars).
- Mobile: new dedicated "Eventi" tab mirroring the Ferie/Approvazioni tab exactly (employee → request+history screen, manager → approval screen with pending badge), reached from a new button on the Badge (CheckIn) screen.
- Web dashboard: equivalent manager approval panel, mirroring `ManagerLeaveApprovalPanel` embedded in `DashboardPage`.

---

## File Structure

**Backend (new):**
- `backend/migrations/041_create_event_requests.sql` — table + indexes
- `backend/src/routes/events.js` — POST /request, GET /pending, PUT /:id/approve, GET /my-requests
- `backend/src/__tests__/events.test.js` — route tests (mirrors `leaves.test.js`)

**Backend (modified):**
- `backend/src/middleware/validation.js` — add `PostEventRequestSchema`, `ApproveEventRequestSchema`
- `backend/src/app.js` — mount `eventsRouter` at `/events`
- `backend/src/utils/hours.js` — add `buildEventDailyEntries()`
- `backend/src/routes/presences.js` — `/summary` and `/my-summary` fetch approved events and merge them into the daily-entries pipeline
- `backend/src/__tests__/hours.test.js` — tests for `buildEventDailyEntries`

**Mobile (new):**
- `frontend-mobile/src/screens/events/EventRequestScreen.jsx` — employee form + history (mirrors `LeaveRequestScreen.jsx`)
- `frontend-mobile/src/screens/events/ManagerEventApprovalScreen.jsx` — manager approval list (mirrors `ManagerLeaveApprovalScreen.jsx`)

**Mobile (modified):**
- `frontend-mobile/src/utils/dateUtils.js` — add `toTimeHHMM()`
- `frontend-mobile/src/__tests__/dateUtils.test.js` — tests for `toTimeHHMM`
- `frontend-mobile/src/config/endpoints.js` — add `EVENTS_*` endpoints
- `frontend-mobile/src/screens/checkin/CheckInScreen.jsx` — add "Eventi/Training" button (employee only)
- `frontend-mobile/src/__tests__/CheckInScreen.test.jsx` — test for the new button
- `frontend-mobile/src/navigation/RootNavigator.jsx` — new `PendingEventContext`, new tab
- `frontend-mobile/src/__tests__/RootNavigator.test.jsx` — mock the 2 new screens

**Web (new):**
- `frontend-web/src/features/events/hooks/useEvents.js` — API wrapper (mirrors `useLeave.js`, trimmed to what's used)
- `frontend-web/src/features/events/hooks/useEvents.test.js`
- `frontend-web/src/features/events/components/ManagerEventApprovalPanel.jsx` — mirrors `ManagerLeaveApprovalPanel.jsx`
- `frontend-web/src/features/events/components/ManagerEventApprovalPanel.test.jsx`
- `frontend-web/src/features/events/pages/EmployeeEventRequest.jsx` — mirrors `EmployeeLeaveRequest.jsx` (single date + 2 time fields instead of a date-range calendar)
- `frontend-web/src/features/events/pages/EmployeeEventRequest.test.jsx`

**Web (modified):**
- `frontend-web/src/App.jsx` — add `/events/request` route
- `frontend-web/src/features/dashboard/pages/DashboardPage.jsx` — embed `ManagerEventApprovalPanel` next to `ManagerLeaveApprovalPanel`

---

## Task 1: Database migration

**Files:**
- Create: `backend/migrations/041_create_event_requests.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 041: Create event_requests table (Eventi/Training)
-- A single-day request with a time range (start_time/end_time), unlike
-- leave_requests (day-range, no time-of-day). Approved requests are joined
-- at query time into presences (see presences.js) — never materialized
-- into checkins.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS event_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  approved_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CHECK (end_time > start_time),
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_event_requests_user_id ON event_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_event_requests_status ON event_requests(status);
CREATE INDEX IF NOT EXISTS idx_event_requests_client_status ON event_requests(client_id, status);
CREATE INDEX IF NOT EXISTS idx_event_requests_user_date ON event_requests(user_id, event_date);
```

- [ ] **Step 2: Apply the migration locally**

Run: `cd backend && npm run migrations`
Expected: log line confirming `041_create_event_requests.sql` applied (no errors). If you don't have a local DB configured, this step runs in CI/staging instead — note it in the task handoff and continue.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/041_create_event_requests.sql
git commit -m "feat: add event_requests table for Eventi/Training feature"
```

---

## Task 2: Validation schemas

**Files:**
- Modify: `backend/src/middleware/validation.js`

- [ ] **Step 1: Add the two schemas**

Insert right after the `ApproveLeaveSchema` block (before `module.exports`):

```js
// =====================================================
// EVENT REQUESTS (Eventi/Training) — POST /api/v1/events/request
// =====================================================

const EVENT_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const PostEventRequestSchema = z.object({
  body: z.object({
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'event_date must be in YYYY-MM-DD format'),
    start_time: z.string().regex(EVENT_TIME_REGEX, 'start_time must be in HH:MM format'),
    end_time: z.string().regex(EVENT_TIME_REGEX, 'end_time must be in HH:MM format'),
    description: z.string()
      .min(10, 'description must be at least 10 characters')
      .max(500, 'description must be at most 500 characters'),
  })
    .refine(
      (data) => data.end_time > data.start_time,
      { message: 'end_time must be after start_time', path: ['end_time'] }
    )
    .refine(
      (data) => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
        sevenDaysAgo.setUTCHours(0, 0, 0, 0);
        return new Date(`${data.event_date}T00:00:00.000Z`) >= sevenDaysAgo;
      },
      { message: 'event_date is outside the 7-day retroactive window', path: ['event_date'] }
    ),
});

// =====================================================
// EVENT REQUESTS — PUT /api/v1/events/:id/approve
// =====================================================

const ApproveEventRequestSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid event request ID: must be valid UUID'),
  }),
  body: z.object({
    status: z.enum(['APPROVED', 'REJECTED'], {
      errorMap: () => ({ message: 'status must be either APPROVED or REJECTED' }),
    }),
    rejection_reason: z.string().max(500, 'rejection_reason must be at most 500 characters').optional().nullable(),
  }),
});
```

- [ ] **Step 2: Export the new schemas**

In the `module.exports` block, add after `ApproveLeaveSchema,`:

```js
  PostEventRequestSchema,
  ApproveEventRequestSchema,
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/middleware/validation.js
git commit -m "feat: add validation schemas for event requests"
```

---

## Task 3: Events route — POST /request (with conflict check)

**Files:**
- Create: `backend/src/routes/events.js`
- Test: `backend/src/__tests__/events.test.js`

- [ ] **Step 1: Write the failing test**

```js
/**
 * API Tests: Event Request Endpoints (Eventi/Training)
 * Uses mocked database for deterministic testing — mirrors leaves.test.js.
 */

jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough, demoStartLimiter: passThrough, onboardingInviteLimiter: passThrough };
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
    const mockClient = { query: pool.query, release: jest.fn() };
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
const TEST_ADMIN_ID = '550e8400-e29b-41d4-a716-446655440102';
const TEST_EVENT_ID = '550e8400-e29b-41d4-a716-446655440200';

const makeToken = (claims = {}) => jwt.sign(
  { user_id: TEST_ADMIN_ID, client_id: TEST_CLIENT_ID, role: 'admin', ...claims },
  process.env.JWT_PRIVATE_KEY,
  { algorithm: 'RS256', expiresIn: '15m' }
);

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Event Request API Endpoints — Validation', () => {
  describe('POST /api/v1/events/request', () => {
    it('should return 400 for missing event_date', async () => {
      const res = await request(app)
        .post('/api/v1/events/request')
        .send({ start_time: '08:00', end_time: '18:00', description: 'Conferenza di settore' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for invalid time format', async () => {
      const res = await request(app)
        .post('/api/v1/events/request')
        .send({
          event_date: todayISO(),
          start_time: '8:00',
          end_time: '18:00',
          description: 'Conferenza di settore',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 when end_time is not after start_time', async () => {
      const res = await request(app)
        .post('/api/v1/events/request')
        .send({
          event_date: todayISO(),
          start_time: '18:00',
          end_time: '08:00',
          description: 'Conferenza di settore',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for description shorter than 10 characters', async () => {
      const res = await request(app)
        .post('/api/v1/events/request')
        .send({ event_date: todayISO(), start_time: '08:00', end_time: '18:00', description: 'troppo corta' });

      // "troppo corta" is 12 chars — use a genuinely short one instead
      const res2 = await request(app)
        .post('/api/v1/events/request')
        .send({ event_date: todayISO(), start_time: '08:00', end_time: '18:00', description: 'corta' });

      expect(res2.status).toBe(400);
      expect(res2.body.error).toBe('Validation Error');
    });

    it('should return 400 for event_date more than 7 days in the past', async () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setUTCDate(tenDaysAgo.getUTCDate() - 10);
      const res = await request(app)
        .post('/api/v1/events/request')
        .send({
          event_date: tenDaysAgo.toISOString().split('T')[0],
          start_time: '08:00',
          end_time: '18:00',
          description: 'Conferenza di settore',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });
  });
});

describe('Event Request API Endpoints — Conflict Detection', () => {
  const originalDisableAuth = process.env.DISABLE_AUTH;
  beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
  afterAll(() => { process.env.DISABLE_AUTH = originalDisableAuth; });

  it('rejects the request with 409 when a conflicting record exists for that date', async () => {
    const employeeToken = makeToken({ user_id: TEST_EMPLOYEE_ID, role: 'employee' });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] }) // employee lookup
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // conflict found

    const res = await request(app)
      .post('/api/v1/events/request')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ event_date: todayISO(), start_time: '08:00', end_time: '18:00', description: 'Conferenza di settore' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('creates the request when no conflict exists', async () => {
    const employeeToken = makeToken({ user_id: TEST_EMPLOYEE_ID, role: 'employee' });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] }) // employee lookup
      .mockResolvedValueOnce({ rows: [] }) // no conflict
      .mockResolvedValueOnce({ rows: [{ id: TEST_EVENT_ID, status: 'PENDING' }] }); // insert

    const res = await request(app)
      .post('/api/v1/events/request')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ event_date: todayISO(), start_time: '08:00', end_time: '18:00', description: 'Conferenza di settore' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(TEST_EVENT_ID);
  });
});

describe('Event Request API Endpoints — Response Structure', () => {
  describe('GET /api/v1/events/pending', () => {
    it('should return 200 with array for pending requests', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: TEST_EVENT_ID, user_id: TEST_EMPLOYEE_ID, employee_name: 'John Doe', status: 'PENDING' }],
      });

      const res = await request(app).get('/api/v1/events/pending');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/events/my-requests', () => {
    it('should return 200 with array for my requests', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: TEST_EVENT_ID, user_id: TEST_EMPLOYEE_ID, status: 'PENDING' }],
      });

      const res = await request(app).get('/api/v1/events/my-requests');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});

describe('Event Request API Endpoints — Security Regression Tests', () => {
  const originalDisableAuth = process.env.DISABLE_AUTH;
  beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
  afterAll(() => { process.env.DISABLE_AUTH = originalDisableAuth; });

  describe('GET /api/v1/events/pending', () => {
    it('should fail closed for roles that are not admin or assigned manager', async () => {
      const viewerToken = makeToken({ user_id: '550e8400-e29b-41d4-a716-446655440300', role: 'viewer' });

      const res = await request(app)
        .get('/api/v1/events/pending')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/v1/events/:id/approve', () => {
    it('should not reveal processed status to callers without approval permission', async () => {
      const viewerToken = makeToken({ user_id: '550e8400-e29b-41d4-a716-446655440300', role: 'viewer' });

      const res = await request(app)
        .put(`/api/v1/events/${TEST_EVENT_ID}/approve`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should reject already processed requests before mutating anything', async () => {
      const adminToken = makeToken();
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_EVENT_ID, client_id: TEST_CLIENT_ID, user_id: TEST_EMPLOYEE_ID,
          event_date: todayISO(), start_time: '08:00:00', end_time: '18:00:00', status: 'APPROVED',
        }],
      });

      const res = await request(app)
        .put(`/api/v1/events/${TEST_EVENT_ID}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Event request has already been processed');
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest src/__tests__/events.test.js`
Expected: FAIL — `Cannot find module '../routes/events'` (route file doesn't exist yet) or 404s from the unmounted router.

- [ ] **Step 3: Write `backend/src/routes/events.js`**

```js
/**
 * Event Request Routes (Eventi/Training)
 * POST /api/v1/events/request — Create event request
 * GET /api/v1/events/pending — Get pending requests for approval
 * PUT /api/v1/events/:id/approve — Approve or reject event request
 * GET /api/v1/events/my-requests — Get employee's own requests
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/pool');
const { createValidationMiddleware, PostEventRequestSchema, ApproveEventRequestSchema } = require('../middleware/validation');
const { logAudit } = require('../middleware/audit');
const { withTransaction } = require('../middleware/db-transaction');
const { requireAuth } = require('../middleware/auth');
const { NotFoundError, ValidationError, ForbiddenError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

const router = express.Router();

// =====================================================
// POST /api/v1/events/request — Create event request
// =====================================================

router.post('/request', requireAuth, createValidationMiddleware(PostEventRequestSchema), async (req, res, next) => {
  const { event_date, start_time, end_time, description } = req.validated.body;
  const userId = req.user.user_id;
  const clientId = req.user.client_id;

  try {
    const result = await withTransaction(async (client) => {
      // 1. Verify user exists and belongs to this client
      const userResult = await client.query(
        'SELECT id, client_id FROM employees WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
        [userId, clientId]
      );

      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found or not assigned to your organization', 'USER_NOT_FOUND');
      }

      // 2. Conflict check: block if the employee already has any presence/absence
      // record for this date (checkin, pending/approved leave, active illness,
      // smart-working day, or another pending/approved event request).
      const conflictResult = await client.query(
        `SELECT 1 FROM checkins WHERE employee_id = $1::uuid AND timestamp::date = $2::date
         UNION ALL
         SELECT 1 FROM leave_requests WHERE user_id = $1::uuid AND status IN ('PENDING', 'APPROVED')
           AND $2::date BETWEEN start_date AND end_date
         UNION ALL
         SELECT 1 FROM illnesses WHERE employee_id = $1::uuid AND cancelled_at IS NULL
           AND $2::date BETWEEN start_date AND end_date
         UNION ALL
         SELECT 1 FROM smart_working_days WHERE employee_id = $1::uuid AND date = $2::date
         UNION ALL
         SELECT 1 FROM event_requests WHERE user_id = $1::uuid AND status IN ('PENDING', 'APPROVED')
           AND event_date = $2::date
         LIMIT 1`,
        [userId, event_date]
      );

      if (conflictResult.rows.length > 0) {
        throw new ConflictError('A presence or absence is already recorded for this date', 'EVENT_DATE_CONFLICT');
      }

      // 3. Create event request
      const requestId = uuidv4();
      const insertResult = await client.query(
        `INSERT INTO event_requests
         (id, client_id, user_id, event_date, start_time, end_time, description, status, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::time, $6::time, $7, 'PENDING', NOW(), NOW())
         RETURNING *`,
        [requestId, clientId, userId, event_date, start_time, end_time, description]
      );

      const eventRequest = insertResult.rows[0];

      // 4. Log audit trail
      await logAudit(client, {
        action: 'event_request_created',
        entity: 'event_request',
        entityId: eventRequest.id,
        clientId,
        oldValue: null,
        newValue: { event_date, start_time, end_time, description, status: 'PENDING' },
        userId,
      });

      return eventRequest;
    });

    logger.info({
      action: 'event_request_created',
      event_request_id: result.id,
      user_id: userId,
      event_date,
    });

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// GET /api/v1/events/pending — Get pending requests (manager approves employees, admin approves all)
// =====================================================

router.get('/pending', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;
  const role = req.user.role;
  const siteId = req.user.site_id;

  try {
    let query = `
      SELECT
        r.id, r.client_id, r.user_id, r.event_date, r.start_time, r.end_time,
        r.description, r.status, r.approved_by, r.approved_at, r.rejection_reason,
        r.created_at, r.updated_at,
        e.name as employee_name, e.email as employee_email
      FROM event_requests r
      JOIN employees e ON r.user_id = e.id AND e.active = true
      WHERE r.status = 'PENDING' AND r.client_id = $1::uuid
    `;

    const params = [clientId];

    if (role === 'admin') {
      // No additional filter.
    } else if (role === 'manager' && siteId) {
      query += ' AND e.site_id = $2::uuid';
      params.push(siteId);
    } else {
      throw new ForbiddenError('You do not have permission to view pending event requests', 'FORBIDDEN');
    }

    query += ' ORDER BY r.created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    logger.info({
      action: 'pending_events_viewed',
      user_id: userId,
      role,
      count: result.rows.length,
    });

    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// PUT /api/v1/events/:id/approve — Approve or reject event request
// =====================================================

router.put('/:id/approve', requireAuth, createValidationMiddleware(ApproveEventRequestSchema), async (req, res, next) => {
  const { id } = req.validated.params;
  const { status, rejection_reason } = req.validated.body;
  const userId = req.user.user_id;
  const clientId = req.user.client_id;
  const role = req.user.role;
  const siteId = req.user.site_id;

  try {
    if (role !== 'admin' && !(role === 'manager' && siteId)) {
      throw new ForbiddenError('You do not have permission to approve event requests', 'FORBIDDEN');
    }

    const result = await withTransaction(async (client) => {
      const eventResult = await client.query(
        'SELECT * FROM event_requests WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
        [id, clientId]
      );

      if (eventResult.rows.length === 0) {
        throw new NotFoundError('Event request not found', 'EVENT_REQUEST_NOT_FOUND');
      }

      const eventRequest = eventResult.rows[0];

      if (role === 'manager') {
        const employeeResult = await client.query(
          'SELECT site_id FROM employees WHERE id = $1::uuid LIMIT 1',
          [eventRequest.user_id]
        );

        if (employeeResult.rows.length === 0) {
          throw new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND');
        }

        if (employeeResult.rows[0].site_id !== siteId) {
          logger.warn({
            action: 'event_approval_unauthorized',
            approver_id: userId,
            approver_site: siteId,
            employee_site: employeeResult.rows[0].site_id,
          });
          throw new ForbiddenError('You can only approve requests for employees in your store', 'FORBIDDEN');
        }
      }

      if (eventRequest.status !== 'PENDING') {
        throw new ValidationError('Event request has already been processed', { code: 'ALREADY_PROCESSED' });
      }

      const updateResult = await client.query(
        `UPDATE event_requests
         SET status = $1, approved_by = $2::uuid, approved_at = NOW(), rejection_reason = $3, updated_at = NOW()
         WHERE id = $4::uuid AND status = 'PENDING'
         RETURNING *`,
        [status, userId, rejection_reason || null, id]
      );

      if (updateResult.rows.length === 0) {
        throw new ValidationError('Event request has already been processed', { code: 'ALREADY_PROCESSED' });
      }

      const updatedEvent = updateResult.rows[0];

      await logAudit(client, {
        action: 'event_request_approved',
        entity: 'event_request',
        entityId: updatedEvent.id,
        clientId,
        oldValue: { status: 'PENDING', approved_by: null, approved_at: null },
        newValue: {
          status,
          approved_by: userId,
          approved_at: updatedEvent.approved_at,
          rejection_reason: rejection_reason || null,
        },
        userId,
      });

      return updatedEvent;
    });

    logger.info({
      action: 'event_request_approved',
      event_request_id: result.id,
      approver_id: userId,
      status,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// GET /api/v1/events/my-requests — Get employee's own event requests
// =====================================================

router.get('/my-requests', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;

  try {
    const result = await pool.query(
      `SELECT *
       FROM event_requests
       WHERE user_id = $1::uuid AND client_id = $2::uuid
       ORDER BY created_at DESC LIMIT 100`,
      [userId, clientId]
    );

    logger.info({
      action: 'my_events_viewed',
      user_id: userId,
      count: result.rows.length,
    });

    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

- [ ] **Step 4: Mount the router in `backend/src/app.js`**

Add near the other route requires (after `const smartWorkingRouter = require('./routes/smartWorking');`):

```js
const eventsRouter = require('./routes/events');
```

Add near the other `v1Router.use(...)` calls (after `v1Router.use('/smart-working', smartWorkingRouter);`):

```js
v1Router.use('/events', eventsRouter);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest src/__tests__/events.test.js -v`
Expected: PASS (all cases in the file)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/events.js backend/src/app.js backend/src/__tests__/events.test.js
git commit -m "feat: add event request API endpoints with conflict detection"
```

---

## Task 4: Merge approved events into worked-hours calculation

**Files:**
- Modify: `backend/src/utils/hours.js`
- Modify: `backend/src/routes/presences.js`
- Test: `backend/src/__tests__/hours.test.js`

- [ ] **Step 1: Write the failing test**

Append to `backend/src/__tests__/hours.test.js`:

```js
describe('buildEventDailyEntries', () => {
  it('returns [] for empty input', () => {
    expect(buildEventDailyEntries([])).toEqual([]);
    expect(buildEventDailyEntries(null)).toEqual([]);
  });

  it('converts a single approved event into a daily entry with correct minutes', () => {
    const input = [{ employee_id: EMP_A, event_date: '2026-06-15', start_time: '08:00:00', end_time: '18:00:00' }];
    const result = buildEventDailyEntries(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ employee_id: EMP_A, date: '2026-06-15', minutes: 600, presenza_aperta: false });
  });

  it('handles multiple events for different employees independently', () => {
    const input = [
      { employee_id: EMP_A, event_date: '2026-06-15', start_time: '08:00:00', end_time: '12:00:00' },
      { employee_id: EMP_B, event_date: '2026-06-16', start_time: '09:30:00', end_time: '17:30:00' },
    ];
    const result = buildEventDailyEntries(input);
    expect(result).toHaveLength(2);
    expect(result[0].minutes).toBe(240);
    expect(result[1].minutes).toBe(480);
  });
});
```

Update the top import line in the same file:

```js
const { calculateDailyHours, aggregateMonthly, buildEventDailyEntries } = require('../utils/hours');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest src/__tests__/hours.test.js -v`
Expected: FAIL — `buildEventDailyEntries is not a function`

- [ ] **Step 3: Implement `buildEventDailyEntries` in `backend/src/utils/hours.js`**

Add this function before `module.exports` (after `aggregateMonthly`):

```js
/**
 * timeStringToMinutes('08:30:00') -> 510
 */
function timeStringToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * buildEventDailyEntries(eventRows)
 *
 * Converts approved event_requests rows into the same daily-entry shape
 * calculateDailyHours() produces, so they can be concatenated and fed into
 * aggregateMonthly() together with real checkin-derived entries. Safe to
 * concatenate: the conflict check in routes/events.js guarantees an
 * employee never has both a checkin and an approved event on the same date.
 *
 * @param {Array<{ employee_id: string, event_date: string, start_time: string, end_time: string }>} eventRows
 * @returns {Array<{ employee_id: string, date: string, minutes: number, presenza_aperta: boolean }>}
 */
function buildEventDailyEntries(eventRows) {
  if (!eventRows || eventRows.length === 0) return [];

  return eventRows.map((row) => ({
    employee_id: row.employee_id,
    date: row.event_date,
    minutes: timeStringToMinutes(row.end_time) - timeStringToMinutes(row.start_time),
    presenza_aperta: false,
  }));
}
```

- [ ] **Step 4: Update `module.exports` in `backend/src/utils/hours.js`**

```js
module.exports = { calculateDailyHours, aggregateMonthly, toUtcDateString, buildEventDailyEntries };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx jest src/__tests__/hours.test.js -v`
Expected: PASS

- [ ] **Step 6: Wire approved events into `GET /api/presences/summary`**

In `backend/src/routes/presences.js`, update the top import (line 13):

```js
const { calculateDailyHours, aggregateMonthly, toUtcDateString, buildEventDailyEntries } = require('../utils/hours');
```

Then, in the `/summary` handler, right after the existing check-ins query (after the block ending at line 65 `);`) and before the `meal_voucher_hours` query, insert:

```js
    // Approved events (Eventi/Training) in the period — merged into the same
    // daily-hours pipeline as checkins (query-time join, same pattern as
    // leave_requests/illnesses used in /trend below).
    let eventsQuery = `
      SELECT er.user_id AS employee_id, er.event_date::text AS event_date, er.start_time, er.end_time
      FROM event_requests er
      JOIN employees e ON e.id = er.user_id AND e.active = true
      WHERE er.client_id = $1::uuid AND er.status = 'APPROVED'
        AND er.event_date >= $2::date AND er.event_date < $3::date
    `;
    const eventsParams = [client_id, toUtcDateString(dateFrom), toUtcDateString(dateTo)];
    if (role === 'manager') {
      eventsParams.push(managerSiteId);
      eventsQuery += ` AND e.site_id = $${eventsParams.length}::uuid`;
    }
    const eventsResult = await pool.query(eventsQuery, eventsParams);
```

Then update the `calculateDailyHours` line (line 97) to merge the two sources:

```js
    // Compute daily hours (checkins + approved events)
    const dailyEntries = [
      ...calculateDailyHours(checkinsResult.rows),
      ...buildEventDailyEntries(eventsResult.rows),
    ];
    const monthlyAgg = aggregateMonthly(dailyEntries, Number(mealVoucherHours));
```

- [ ] **Step 7: Wire approved events into `GET /api/presences/my-summary`**

In the `/my-summary` handler, right after the checkins query (after the block ending around line 214), insert:

```js
    const eventsResult = await pool.query(
      `SELECT user_id AS employee_id, event_date::text AS event_date, start_time, end_time
       FROM event_requests
       WHERE client_id = $1::uuid AND user_id = $2::uuid AND status = 'APPROVED'
         AND event_date >= $3::date AND event_date < $4::date`,
      [client_id, employee_id, toUtcDateString(dateFrom), toUtcDateString(dateTo)]
    );
```

Then update the `calculateDailyHours` line (line 222) to merge the two sources:

```js
    const dailyEntries = [
      ...calculateDailyHours(checkinsResult.rows),
      ...buildEventDailyEntries(eventsResult.rows),
    ];
    const monthlyAgg = aggregateMonthly(dailyEntries, Number(mealVoucherHours));
```

- [ ] **Step 8: Run the full presences test suite to check for regressions**

Run: `cd backend && npx jest src/__tests__/presences -v`
Expected: PASS. If existing tests mock `pool.query` by call order (`mockResolvedValueOnce` chains), they will now need one additional mocked call (the new events query) inserted at the right position — fix any broken assertions by adding `.mockResolvedValueOnce({ rows: [] })` for the events query in the existing test's chain, in the position matching Step 6/7 above.

- [ ] **Step 9: Commit**

```bash
git add backend/src/utils/hours.js backend/src/routes/presences.js backend/src/__tests__/hours.test.js
git commit -m "feat: count approved event hours toward worked hours and meal vouchers"
```

---

## Task 5: Mobile date/time utility

**Files:**
- Modify: `frontend-mobile/src/utils/dateUtils.js`
- Modify: `frontend-mobile/src/__tests__/dateUtils.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend-mobile/src/__tests__/dateUtils.test.js`:

```js
describe('toTimeHHMM', () => {
  test('formats a Date to HH:MM using local time', () => {
    const d = new Date(2026, 5, 21, 8, 0, 0);
    expect(toTimeHHMM(d)).toBe('08:00');
  });

  test('pads single-digit hours and minutes', () => {
    const d = new Date(2026, 5, 21, 9, 5, 0);
    expect(toTimeHHMM(d)).toBe('09:05');
  });

  test('handles late evening times', () => {
    const d = new Date(2026, 5, 21, 23, 45, 0);
    expect(toTimeHHMM(d)).toBe('23:45');
  });
});
```

Update the top require line in the same file:

```js
const { toISO, formatDateIT, today, toTimeHHMM } = require('../utils/dateUtils');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-mobile && npx jest src/__tests__/dateUtils.test.js`
Expected: FAIL — `toTimeHHMM is not a function`

- [ ] **Step 3: Implement `toTimeHHMM` in `frontend-mobile/src/utils/dateUtils.js`**

Add before `module.exports`:

```js
/**
 * Formats a Date to 'HH:MM' using LOCAL time (for event start/end time pickers).
 * @param {Date} d
 * @returns {string}
 */
function toTimeHHMM(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
```

Update `module.exports`:

```js
module.exports = { toISO, formatDateIT, today, toTimeHHMM };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-mobile && npx jest src/__tests__/dateUtils.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/src/utils/dateUtils.js frontend-mobile/src/__tests__/dateUtils.test.js
git commit -m "feat: add toTimeHHMM date util for event time pickers"
```

---

## Task 6: Mobile endpoints config

**Files:**
- Modify: `frontend-mobile/src/config/endpoints.js`

- [ ] **Step 1: Add the EVENTS endpoints**

In `ENDPOINTS`, after the `LEAVES_PENDING` line, add:

```js
  // Events (eventi/training) — employee
  EVENTS_LIST: '/api/v1/events/my-requests',
  EVENTS_CREATE: '/api/v1/events/request',
  // Events (eventi/training) — manager
  EVENTS_PENDING: '/api/v1/events/pending',
```

- [ ] **Step 2: Commit**

```bash
git add frontend-mobile/src/config/endpoints.js
git commit -m "feat: add EVENTS endpoints config for mobile"
```

---

## Task 7: EventRequestScreen (employee form + history)

**Files:**
- Create: `frontend-mobile/src/screens/events/EventRequestScreen.jsx`

- [ ] **Step 1: Write the screen**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiClient from '../../services/apiClient';
import { ENDPOINTS } from '../../config/endpoints';
import { toISO, formatDateIT, toTimeHHMM, today } from '../../utils/dateUtils';

const STATUS_COLORS = { PENDING: '#B45309', APPROVED: '#166534', REJECTED: '#991B1B' };
const STATUS_LABELS = { PENDING: 'In attesa', APPROVED: 'Approvata', REJECTED: 'Rifiutata' };

function defaultStartTime() {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  return d;
}

function defaultEndTime() {
  const d = new Date();
  d.setHours(18, 0, 0, 0);
  return d;
}

function minEventDate() {
  const d = today();
  d.setDate(d.getDate() - 7);
  return d;
}

export default function EventRequestScreen() {
  const [eventDate, setEventDate] = useState(() => today());
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    apiClient.get(ENDPOINTS.EVENTS_LIST, { params: { limit: 5 } })
      .then(r => setRequests(r.data.data || []))
      .catch(() => setRequests([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleSubmit = async () => {
    if (toTimeHHMM(endTime) <= toTimeHHMM(startTime)) {
      Alert.alert('Errore', "L'ora di fine deve essere successiva all'ora di inizio.");
      return;
    }
    if (description.trim().length < 10) {
      Alert.alert('Errore', 'Descrivi il tipo di evento/training con almeno 10 caratteri.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(ENDPOINTS.EVENTS_CREATE, {
        event_date: toISO(eventDate),
        start_time: toTimeHHMM(startTime),
        end_time: toTimeHHMM(endTime),
        description: description.trim(),
      });
      Alert.alert('✅ Richiesta inviata', 'La tua richiesta di evento/training è stata inviata al manager per approvazione.');
      setDescription('');
      setEventDate(today());
      setStartTime(defaultStartTime());
      setEndTime(defaultEndTime());
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Errore invio richiesta';
      Alert.alert('Errore', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Evento / Training</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Data evento</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => { setShowDatePicker(true); setShowStartTimePicker(false); setShowEndTimePicker(false); }}
        >
          <Text style={styles.dateButtonText}>📅  {toISO(eventDate)}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={eventDate}
              mode="date"
              display="spinner"
              minimumDate={minEventDate()}
              locale="it-IT"
              onChange={(_, d) => { if (d) setEventDate(d); }}
              style={styles.picker}
            />
            <TouchableOpacity style={styles.doneButton} onPress={() => setShowDatePicker(false)}>
              <Text style={styles.doneButtonText}>Fine</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.timeRow}>
          <View style={styles.timeCol}>
            <Text style={styles.label}>Ora inizio</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => { setShowStartTimePicker(true); setShowDatePicker(false); setShowEndTimePicker(false); }}
            >
              <Text style={styles.dateButtonText}>🕐  {toTimeHHMM(startTime)}</Text>
            </TouchableOpacity>
            {showStartTimePicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={startTime}
                  mode="time"
                  display="spinner"
                  locale="it-IT"
                  onChange={(_, d) => { if (d) setStartTime(d); }}
                  style={styles.picker}
                />
                <TouchableOpacity style={styles.doneButton} onPress={() => setShowStartTimePicker(false)}>
                  <Text style={styles.doneButtonText}>Fine</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.timeCol}>
            <Text style={styles.label}>Ora fine</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => { setShowEndTimePicker(true); setShowDatePicker(false); setShowStartTimePicker(false); }}
            >
              <Text style={styles.dateButtonText}>🕐  {toTimeHHMM(endTime)}</Text>
            </TouchableOpacity>
            {showEndTimePicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={endTime}
                  mode="time"
                  display="spinner"
                  locale="it-IT"
                  onChange={(_, d) => { if (d) setEndTime(d); }}
                  style={styles.picker}
                />
                <TouchableOpacity style={styles.doneButton} onPress={() => setShowEndTimePicker(false)}>
                  <Text style={styles.doneButtonText}>Fine</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.label}>Descrizione evento</Text>
        <TextInput
          style={styles.textInput}
          value={description}
          onChangeText={setDescription}
          placeholder="Es. Congresso di settore a Milano, corso di formazione tecnica..."
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={3}
          maxLength={500}
        />

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.submitButtonText}>Invia Richiesta</Text>
          }
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Ultime richieste</Text>
        {historyLoading ? (
          <ActivityIndicator color="#1E3A5F" style={{ marginVertical: 16 }} />
        ) : requests.length === 0 ? (
          <Text style={styles.emptyText}>Nessuna richiesta registrata.</Text>
        ) : (
          requests.map(r => (
            <View key={r.id} style={styles.historyItem}>
              <View style={styles.historyLeft}>
                <Text style={styles.historyType}>{formatDateIT(r.event_date)}</Text>
                <Text style={styles.historyDates}>
                  {r.start_time?.slice(0, 5)} → {r.end_time?.slice(0, 5)}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[r.status] ?? '#6B7280') + '20' }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[r.status] ?? '#6B7280' }]}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2ED' },
  header: { backgroundColor: '#1E3A5F', paddingHorizontal: 20, paddingVertical: 16 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 48 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 20 },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeCol: { flex: 1 },
  dateButton: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#D1D5DB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  dateButtonText: { fontSize: 16, color: '#1E3A5F', fontWeight: '500' },
  pickerContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  picker: { height: 150 },
  doneButton: { backgroundColor: '#1E3A5F', paddingVertical: 10, alignItems: 'center' },
  doneButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  textInput: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#D1D5DB', fontSize: 15, color: '#1F2937',
    minHeight: 70, textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#1E3A5F', borderRadius: 12, padding: 18,
    alignItems: 'center', marginTop: 24,
    shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitButtonDisabled: { opacity: 0.55 },
  submitButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  historyItem: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  historyLeft: { flex: 1, marginRight: 8 },
  historyType: { fontSize: 14, fontWeight: '600', color: '#2A2520' },
  historyDates: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 4 },
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend-mobile/src/screens/events/EventRequestScreen.jsx
git commit -m "feat: add EventRequestScreen for employee event/training requests"
```

---

## Task 8: ManagerEventApprovalScreen

**Files:**
- Create: `frontend-mobile/src/screens/events/ManagerEventApprovalScreen.jsx`

- [ ] **Step 1: Write the screen**

```jsx
import React, { useState, useCallback, useContext } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import apiClient from '../../services/apiClient';
import { ENDPOINTS } from '../../config/endpoints';
import { formatDateIT } from '../../utils/dateUtils';
import { PendingEventContext } from '../../navigation/RootNavigator';

export default function ManagerEventApprovalScreen() {
  const { setPendingCount } = useContext(PendingEventContext);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await apiClient.get(ENDPOINTS.EVENTS_PENDING);
      const data = res.data.data || [];
      setRequests(data);
      setPendingCount(data.length);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setPendingCount]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAction = async (id, status, employeeName) => {
    const label = status === 'APPROVED' ? 'approvare' : 'rifiutare';
    Alert.alert(
      `Conferma`,
      `Vuoi ${label} la richiesta di ${employeeName}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: status === 'APPROVED' ? 'Approva' : 'Rifiuta',
          style: status === 'APPROVED' ? 'default' : 'destructive',
          onPress: async () => {
            setActioning(id);
            try {
              await apiClient.put(`/api/v1/events/${id}/approve`, { status });
              load();
            } catch (err) {
              const msg = err.response?.data?.message || err.message || 'Errore';
              Alert.alert('Errore', msg);
            } finally {
              setActioning(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Approvazione Eventi</Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#1E3A5F" style={{ marginTop: 48 }} size="large" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#1E3A5F" />}
        >
          {requests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={styles.emptyTitle}>Nessuna richiesta in attesa</Text>
              <Text style={styles.emptyText}>Tira giù per aggiornare</Text>
            </View>
          ) : (
            <>
              <Text style={styles.countLabel}>{requests.length} richiesta{requests.length !== 1 ? 'e' : ''} in attesa</Text>
              {requests.map(r => (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.employeeName}>{r.employee_name}</Text>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeText}>Evento</Text>
                    </View>
                  </View>

                  <Text style={styles.dates}>
                    {formatDateIT(r.event_date)}{'  ·  '}{r.start_time?.slice(0, 5)} → {r.end_time?.slice(0, 5)}
                  </Text>

                  {r.description ? (
                    <Text style={styles.motivation}>"{r.description}"</Text>
                  ) : null}

                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.rejectBtn, actioning === r.id && styles.btnDisabled]}
                      onPress={() => handleAction(r.id, 'REJECTED', r.employee_name)}
                      disabled={actioning === r.id}
                    >
                      {actioning === r.id
                        ? <ActivityIndicator color="#991B1B" size="small" />
                        : <Text style={styles.rejectText}>✕  Rifiuta</Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.approveBtn, actioning === r.id && styles.btnDisabled]}
                      onPress={() => handleAction(r.id, 'APPROVED', r.employee_name)}
                      disabled={actioning === r.id}
                    >
                      {actioning === r.id
                        ? <ActivityIndicator color="#FFFFFF" size="small" />
                        : <Text style={styles.approveText}>✓  Approva</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F2ED' },
  header: { backgroundColor: '#1E3A5F', paddingHorizontal: 20, paddingVertical: 16 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 48 },
  countLabel: {
    fontSize: 12, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  employeeName: { fontSize: 16, fontWeight: '700', color: '#1F2937', flex: 1, marginRight: 8 },
  typeBadge: {
    backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE',
  },
  typeText: { fontSize: 12, fontWeight: '600', color: '#1E3A5F' },
  dates: { fontSize: 14, color: '#374151', marginBottom: 4 },
  motivation: { fontSize: 13, color: '#6B7280', fontStyle: 'italic', marginBottom: 8, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  rejectBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#FCA5A5', alignItems: 'center',
  },
  approveBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#1E3A5F', alignItems: 'center',
  },
  rejectText: { color: '#991B1B', fontWeight: '600', fontSize: 14 },
  approveText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#9CA3AF' },
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend-mobile/src/screens/events/ManagerEventApprovalScreen.jsx
git commit -m "feat: add ManagerEventApprovalScreen for manager event approval"
```

---

## Task 9: Wire the new tab and context into RootNavigator

**Files:**
- Modify: `frontend-mobile/src/navigation/RootNavigator.jsx`
- Modify: `frontend-mobile/src/__tests__/RootNavigator.test.jsx`

- [ ] **Step 1: Update the RootNavigator test mocks first (so the suite stays green once the real imports land)**

In `frontend-mobile/src/__tests__/RootNavigator.test.jsx`, add these two lines next to the existing `jest.mock('../screens/leave/...')` lines:

```js
jest.mock('../screens/events/EventRequestScreen', () => () => null);
jest.mock('../screens/events/ManagerEventApprovalScreen', () => () => null);
```

- [ ] **Step 2: Run the RootNavigator test to confirm it still passes (baseline)**

Run: `cd frontend-mobile && npx jest src/__tests__/RootNavigator.test.jsx`
Expected: PASS (mocks for not-yet-imported modules are harmless at this point — `jest.mock` doesn't require the module to be imported anywhere yet)

- [ ] **Step 3: Add the new context and imports in `RootNavigator.jsx`**

After the existing `PendingLeaveContext` export (around line 17), add:

```js
// Single source of truth for manager pending-event badge count.
// ManagerEventApprovalScreen updates this via context after every load.
export const PendingEventContext = createContext({ setPendingCount: () => {} });
```

After `import ManagerLeaveApprovalScreen from '../screens/leave/ManagerLeaveApprovalScreen';`, add:

```js
import EventRequestScreen from '../screens/events/EventRequestScreen';
import ManagerEventApprovalScreen from '../screens/events/ManagerEventApprovalScreen';
```

- [ ] **Step 4: Add the icon entries in `TAB_ICONS`**

```js
const TAB_ICONS = {
  Badge: 'qr-code-outline',
  Ferie: 'calendar-outline',
  Approvazioni: 'checkmark-circle-outline',
  Eventi: 'briefcase-outline',
  'Approva Eventi': 'checkmark-done-outline',
  Malattia: 'medical-outline',
  Turni: 'time-outline',
  Presenze: 'people-outline',
  Profilo: 'person-outline',
};
```

- [ ] **Step 5: Add the pending-event count state and fetch effect in `MainTabs`**

After `const [pendingCount, setPendingCount] = useState(0);`, add:

```js
  const [pendingEventCount, setPendingEventCount] = useState(0);
```

After the existing `useEffect` that fetches `ENDPOINTS.LEAVES_PENDING` for managers, add:

```js
  useEffect(() => {
    if (role === 'manager') {
      apiClient.get(ENDPOINTS.EVENTS_PENDING)
        .then(res => setPendingEventCount((res.data.data || []).length))
        .catch(() => {});
    }
  }, [role]);
```

- [ ] **Step 6: Wrap the Tab.Navigator with the new provider and add the tab**

Replace:

```jsx
  return (
    <PendingLeaveContext.Provider value={{ setPendingCount }}>
    <Tab.Navigator
```

with:

```jsx
  return (
    <PendingLeaveContext.Provider value={{ setPendingCount }}>
    <PendingEventContext.Provider value={{ setPendingCount: setPendingEventCount }}>
    <Tab.Navigator
```

Replace the matching closing tags:

```jsx
    </Tab.Navigator>
    </PendingLeaveContext.Provider>
  );
```

with:

```jsx
    </Tab.Navigator>
    </PendingEventContext.Provider>
    </PendingLeaveContext.Provider>
  );
```

Then add the new tab right after the `Ferie`/`Approvazioni` block:

```jsx
      {isManager
        ? <Tab.Screen
            name="Approva Eventi"
            component={ManagerEventApprovalScreen}
            options={{ tabBarBadge: pendingEventCount > 0 ? pendingEventCount : undefined }}
          />
        : <Tab.Screen name="Eventi" component={EventRequestScreen} />
      }
```

- [ ] **Step 7: Run the RootNavigator test again to confirm nothing broke**

Run: `cd frontend-mobile && npx jest src/__tests__/RootNavigator.test.jsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend-mobile/src/navigation/RootNavigator.jsx frontend-mobile/src/__tests__/RootNavigator.test.jsx
git commit -m "feat: add Eventi/Approva Eventi tab to mobile navigation"
```

---

## Task 10: Add the "Eventi/Training" button to CheckInScreen

**Files:**
- Modify: `frontend-mobile/src/screens/checkin/CheckInScreen.jsx`
- Modify: `frontend-mobile/src/__tests__/CheckInScreen.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to `frontend-mobile/src/__tests__/CheckInScreen.test.jsx`, inside the `describe('CheckInScreen', ...)` block:

```jsx
  test('employee sees the Eventi/Training button, and tapping it navigates to the Eventi tab', async () => {
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(false);
    AsyncStorage.getItem.mockResolvedValue(null);
    authService.getUser.mockResolvedValue({ name: 'Maria Rossi', employee_id: 'emp-1', role: 'employee' });

    const { getByText, navigation } = await renderScreen();

    await waitFor(() => expect(getByText('Eventi/Training')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByText('Eventi/Training'));
    });

    expect(navigation.navigate).toHaveBeenCalledWith('Eventi');
  });

  test('manager does NOT see the Eventi/Training button (no request screen for managers)', async () => {
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(false);
    AsyncStorage.getItem.mockResolvedValue(null);
    authService.getUser.mockResolvedValue({ name: 'Pino Bianchi', employee_id: 'mgr-1', role: 'manager' });

    const { queryByText } = await renderScreen();

    await waitFor(() => expect(authService.getUser).toHaveBeenCalled());

    expect(queryByText('Eventi/Training')).toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-mobile && npx jest src/__tests__/CheckInScreen.test.jsx`
Expected: FAIL — `Unable to find an element with text: Eventi/Training`

- [ ] **Step 3: Add the button in `CheckInScreen.jsx`**

Add a `role` state variable — update the `useState` declarations at the top of the component:

```jsx
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
```

Update the first `useEffect` to also capture the role:

```jsx
  useEffect(() => {
    setLoading(true);
    authService.getUser()
      .then((u) => { setUser(u); setRole(u?.role ?? null); })
      .finally(() => setLoading(false));

    LocalAuthentication.hasHardwareAsync().then(setFaceIdAvailable);
    const tick = setInterval(() => setTime(new Date()), TIMING.CLOCK_TICK);
    return () => clearInterval(tick);
  }, []);
```

Add the button right after the Smart Working `TouchableOpacity` block (before the `{pendingCount > 0 && (...)}` block):

```jsx
        {role !== 'manager' && (
          <TouchableOpacity
            style={styles.eventButton}
            onPress={() => navigation.navigate('Eventi')}
          >
            <Text style={styles.eventButtonText}>Eventi/Training</Text>
            <Text style={styles.eventSubtext}>Richiedi autorizzazione per un evento fuori sede</Text>
          </TouchableOpacity>
        )}
```

Add the matching styles in the `StyleSheet.create` block, right after `smartWorkingSubtext`:

```js
  eventButton: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 20, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.navy200,
  },
  eventButtonText: { fontFamily: FONTS.bodySemiBold, color: COLORS.navy500, fontSize: 15 },
  eventSubtext: { fontFamily: FONTS.body, color: COLORS.stone, fontSize: 12, marginTop: 4 },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-mobile && npx jest src/__tests__/CheckInScreen.test.jsx`
Expected: PASS (all tests in the file, including the pre-existing 3)

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/src/screens/checkin/CheckInScreen.jsx frontend-mobile/src/__tests__/CheckInScreen.test.jsx
git commit -m "feat: add Eventi/Training button to CheckInScreen (employee only)"
```

---

## Task 11: Web — useEvents hook

**Files:**
- Create: `frontend-web/src/features/events/hooks/useEvents.js`
- Test: `frontend-web/src/features/events/hooks/useEvents.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEvents } from './useEvents';
import apiClient from '../../../services/apiClient';

vi.mock('../../../services/apiClient');

describe('useEvents Hook', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('createRequest', () => {
    it('should successfully create an event request', async () => {
      const mockResponse = {
        data: { data: { id: 'evt-123', status: 'PENDING', event_date: '2026-09-01' } },
      };
      apiClient.post.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useEvents());

      let created;
      await act(async () => {
        created = await result.current.createRequest('2026-09-01', '08:00', '18:00', 'Congresso di settore a Milano');
      });

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/events/request', {
        event_date: '2026-09-01',
        start_time: '08:00',
        end_time: '18:00',
        description: 'Congresso di settore a Milano',
      });
      expect(created.id).toBe('evt-123');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should surface a conflict error message', async () => {
      const mockError = {
        response: { data: { error: 'EVENT_DATE_CONFLICT', message: 'A presence or absence is already recorded for this date' } },
      };
      apiClient.post.mockRejectedValue(mockError);

      const { result } = renderHook(() => useEvents());

      await act(async () => {
        await expect(result.current.createRequest('2026-09-01', '08:00', '18:00', 'Congresso di settore')).rejects.toEqual(mockError);
      });

      expect(result.current.error).toBe('A presence or absence is already recorded for this date');
    });
  });

  describe('getMyRequests', () => {
    it('should fetch the caller\'s own event requests', async () => {
      apiClient.get.mockResolvedValue({ data: { data: [{ id: 'evt-1' }] } });

      const { result } = renderHook(() => useEvents());

      let requests;
      await act(async () => { requests = await result.current.getMyRequests(); });

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/events/my-requests');
      expect(requests).toEqual([{ id: 'evt-1' }]);
    });
  });

  describe('getPendingRequests', () => {
    it('should fetch pending event requests', async () => {
      apiClient.get.mockResolvedValue({ data: { data: [{ id: 'evt-2', status: 'PENDING' }] } });

      const { result } = renderHook(() => useEvents());

      let requests;
      await act(async () => { requests = await result.current.getPendingRequests(); });

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/events/pending');
      expect(requests).toEqual([{ id: 'evt-2', status: 'PENDING' }]);
    });
  });

  describe('approveRequest / rejectRequest', () => {
    it('should PUT status=APPROVED', async () => {
      apiClient.put.mockResolvedValue({ data: { data: { id: 'evt-3', status: 'APPROVED' } } });

      const { result } = renderHook(() => useEvents());
      await act(async () => { await result.current.approveRequest('evt-3'); });

      expect(apiClient.put).toHaveBeenCalledWith('/api/v1/events/evt-3/approve', {
        status: 'APPROVED', rejection_reason: null,
      });
    });

    it('should PUT status=REJECTED with a reason', async () => {
      apiClient.put.mockResolvedValue({ data: { data: { id: 'evt-3', status: 'REJECTED' } } });

      const { result } = renderHook(() => useEvents());
      await act(async () => { await result.current.rejectRequest('evt-3', 'Troppi assenti quel giorno'); });

      expect(apiClient.put).toHaveBeenCalledWith('/api/v1/events/evt-3/approve', {
        status: 'REJECTED', rejection_reason: 'Troppi assenti quel giorno',
      });
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-web && npx vitest run src/features/events/hooks/useEvents.test.js`
Expected: FAIL — `Cannot find module './useEvents'`

- [ ] **Step 3: Write `frontend-web/src/features/events/hooks/useEvents.js`**

```js
import { useState, useCallback } from 'react';
import apiClient from '../../../services/apiClient';

export const useEvents = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createRequest = useCallback(
    async (event_date, start_time, end_time, description) => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiClient.post('/api/v1/events/request', {
          event_date,
          start_time,
          end_time,
          description,
        });
        return response.data.data;
      } catch (err) {
        const errorMessage =
          err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          'Failed to create event request';
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getMyRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/api/v1/events/my-requests');
      return response.data.data || [];
    } catch (err) {
      const errorMessage =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to fetch event requests';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getPendingRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/api/v1/events/pending');
      return response.data.data || [];
    } catch (err) {
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to fetch pending event requests';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const approveRequest = useCallback(async (requestId, rejectionReason) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.put(`/api/v1/events/${requestId}/approve`, {
        status: 'APPROVED',
        rejection_reason: rejectionReason || null,
      });
      return response.data.data;
    } catch (err) {
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to approve event request';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const rejectRequest = useCallback(async (requestId, rejectionReason) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.put(`/api/v1/events/${requestId}/approve`, {
        status: 'REJECTED',
        rejection_reason: rejectionReason || 'Rejected by manager',
      });
      return response.data.data;
    } catch (err) {
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Failed to reject event request';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    createRequest,
    getMyRequests,
    getPendingRequests,
    approveRequest,
    rejectRequest,
    loading,
    error,
    clearError,
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-web && npx vitest run src/features/events/hooks/useEvents.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/events/hooks/useEvents.js frontend-web/src/features/events/hooks/useEvents.test.js
git commit -m "feat: add useEvents hook for web dashboard"
```

---

## Task 12: Web — ManagerEventApprovalPanel

**Files:**
- Create: `frontend-web/src/features/events/components/ManagerEventApprovalPanel.jsx`
- Test: `frontend-web/src/features/events/components/ManagerEventApprovalPanel.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ManagerEventApprovalPanel } from './ManagerEventApprovalPanel';
import * as authService from '../../../services/authService';

vi.mock('../../../services/authService', () => ({
  default: { getUser: vi.fn() },
}));

vi.mock('../hooks/useEvents', () => ({
  useEvents: () => ({
    getPendingRequests: vi.fn(async () => []),
    approveRequest: vi.fn(async () => ({})),
    rejectRequest: vi.fn(async () => ({})),
    loading: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

const renderWithRouter = (component) => render(<BrowserRouter>{component}</BrowserRouter>);

describe('ManagerEventApprovalPanel', () => {
  beforeEach(() => {
    authService.default.getUser.mockReturnValue({ id: 'mgr-456', name: 'Carlo Verdi', role: 'manager' });
    vi.clearAllMocks();
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('should render the panel title', () => {
    renderWithRouter(<ManagerEventApprovalPanel />);
    expect(screen.getByText(/Richieste Eventi\/Training in Sospeso/i)).toBeTruthy();
  });

  it('should render card component', () => {
    const { container } = renderWithRouter(<ManagerEventApprovalPanel />);
    expect(container.querySelector('.MuiCard-root')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-web && npx vitest run src/features/events/components/ManagerEventApprovalPanel.test.jsx`
Expected: FAIL — `Cannot find module './ManagerEventApprovalPanel'`

- [ ] **Step 3: Write `frontend-web/src/features/events/components/ManagerEventApprovalPanel.jsx`**

```jsx
import React, { useState, useEffect } from 'react';
import {
  Card, CardContent, CardHeader, Box, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Stack, Typography, Chip, CircularProgress, Alert,
  Paper, Divider, Badge,
} from '@mui/material';
import { useEvents } from '../hooks/useEvents';

export const ManagerEventApprovalPanel = () => {
  const { getPendingRequests, approveRequest, rejectRequest, loading, error } = useEvents();

  const [pendingRequests, setPendingRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionInProgress, setActionInProgress] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => { loadRequests(); }, []);

  const loadRequests = async () => {
    setLoadingRequests(true);
    try {
      const data = await getPendingRequests();
      setPendingRequests(data || []);
    } catch (err) {
      // Error is handled by hook
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleApprove = async (requestId) => {
    setActionInProgress(requestId);
    try {
      await approveRequest(requestId);
      setSuccessMessage('Richiesta approvata con successo');
      await loadRequests();
    } catch (err) {
      // Error is shown below
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRejectClick = (request) => {
    setSelectedRequest(request);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!selectedRequest) return;
    setActionInProgress(selectedRequest.id);
    try {
      await rejectRequest(selectedRequest.id, rejectionReason);
      setSuccessMessage('Richiesta rifiutata');
      setRejectDialogOpen(false);
      setSelectedRequest(null);
      setRejectionReason('');
      await loadRequests();
    } catch (err) {
      // Error is shown below
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCloseRejectDialog = () => {
    setRejectDialogOpen(false);
    setSelectedRequest(null);
    setRejectionReason('');
  };

  return (
    <Card sx={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)' }}>
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Richieste Eventi/Training in Sospeso
            </Typography>
            {pendingRequests.length > 0 && (
              <Badge badgeContent={pendingRequests.length} color="warning">
                <Box />
              </Badge>
            )}
          </Box>
        }
      />
      <Divider />
      <CardContent>
        {loadingRequests ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : pendingRequests.length === 0 ? (
          <Alert severity="success">Nessuna richiesta in sospeso</Alert>
        ) : (
          <Stack spacing={2}>
            {pendingRequests.map((request) => (
              <Paper
                key={request.id}
                sx={{ p: 2, backgroundColor: '#F9F7F3', border: '1px solid #E8DFD5', borderRadius: 1 }}
              >
                <Stack spacing={1.5}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {request.employee_name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6B625A' }}>
                        {new Date(request.event_date).toLocaleDateString('it-IT')}
                        {' · '}{request.start_time?.slice(0, 5)} - {request.end_time?.slice(0, 5)}
                      </Typography>
                    </Box>
                    <Chip label="PENDING" size="small" color="warning" variant="filled" />
                  </Box>

                  {request.description && (
                    <Box sx={{ backgroundColor: '#FFF', p: 1, borderRadius: 0.5 }}>
                      <Typography variant="caption" sx={{ color: '#6B625A' }}>
                        <strong>Descrizione:</strong> {request.description}
                      </Typography>
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
                    <Button
                      variant="contained"
                      size="small"
                      sx={{
                        backgroundColor: '#2D7049',
                        '&:hover': { backgroundColor: '#215a37' },
                        '&:disabled': { backgroundColor: '#ccc' },
                      }}
                      onClick={() => handleApprove(request.id)}
                      disabled={actionInProgress === request.id || loading}
                    >
                      {actionInProgress === request.id ? <CircularProgress size={16} sx={{ color: 'white' }} /> : 'Approva'}
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      onClick={() => handleRejectClick(request)}
                      disabled={actionInProgress === request.id || loading}
                    >
                      Rifiuta
                    </Button>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </CardContent>

      <Dialog open={rejectDialogOpen} onClose={handleCloseRejectDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Rifiuta Richiesta</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            autoFocus
            multiline
            rows={4}
            fullWidth
            label="Motivo del rifiuto (opzionale)"
            placeholder="Inserisci il motivo..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            helperText={`${rejectionReason.length}/500`}
            inputProps={{ maxLength: 500 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRejectDialog}>Annulla</Button>
          <Button onClick={handleRejectConfirm} variant="contained" color="error" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : 'Rifiuta'}
          </Button>
        </DialogActions>
      </Dialog>

      {successMessage && (
        <Alert severity="success" onClose={() => setSuccessMessage(null)} sx={{ mt: 2 }}>
          {successMessage}
        </Alert>
      )}
    </Card>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-web && npx vitest run src/features/events/components/ManagerEventApprovalPanel.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/events/components/ManagerEventApprovalPanel.jsx frontend-web/src/features/events/components/ManagerEventApprovalPanel.test.jsx
git commit -m "feat: add ManagerEventApprovalPanel to web dashboard"
```

---

## Task 13: Web — embed the panel in DashboardPage

**Files:**
- Modify: `frontend-web/src/features/dashboard/pages/DashboardPage.jsx`

- [ ] **Step 1: Add the import**

Add after `import { ManagerLeaveApprovalPanel } from '../../leave/components/ManagerLeaveApprovalPanel';`:

```js
import { ManagerEventApprovalPanel } from '../../events/components/ManagerEventApprovalPanel';
```

- [ ] **Step 2: Embed the panel next to the leave panel**

Immediately after the existing block:

```jsx
        {/* Manager Leave Approval Panel - Show for managers only */}
        {userRole === 'manager' && (
          <Box sx={{ marginBottom: '24px', marginTop: '24px' }}>
            <ManagerLeaveApprovalPanel />
          </Box>
        )}
```

add:

```jsx
        {/* Manager Event Approval Panel - Show for managers only */}
        {userRole === 'manager' && (
          <Box sx={{ marginBottom: '24px' }}>
            <ManagerEventApprovalPanel />
          </Box>
        )}
```

- [ ] **Step 3: Run the dashboard test suite to check for regressions**

Run: `cd frontend-web && npx vitest run src/features/dashboard/pages/DashboardPage.test.jsx`
Expected: PASS (if this test file mocks `ManagerLeaveApprovalPanel`, add the same style of mock for `ManagerEventApprovalPanel`, e.g. `vi.mock('../../events/components/ManagerEventApprovalPanel', () => ({ ManagerEventApprovalPanel: () => null }))`)

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/features/dashboard/pages/DashboardPage.jsx
git commit -m "feat: embed ManagerEventApprovalPanel in manager dashboard"
```

---

## Task 14: Web — EmployeeEventRequest page + route

**Files:**
- Create: `frontend-web/src/features/events/pages/EmployeeEventRequest.jsx`
- Test: `frontend-web/src/features/events/pages/EmployeeEventRequest.test.jsx`
- Modify: `frontend-web/src/App.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { EmployeeEventRequest } from './EmployeeEventRequest';

vi.mock('../hooks/useEvents', () => ({
  useEvents: () => ({
    createRequest: vi.fn(async () => ({ id: 'evt-1' })),
    getMyRequests: vi.fn(async () => []),
    loading: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

const renderWithRouter = (component) => render(<BrowserRouter>{component}</BrowserRouter>);

describe('EmployeeEventRequest', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('should render the page title', () => {
    renderWithRouter(<EmployeeEventRequest />);
    expect(screen.getByText(/Richiedi Evento\/Training/i)).toBeTruthy();
  });

  it('should render the description field', () => {
    renderWithRouter(<EmployeeEventRequest />);
    expect(screen.getByLabelText(/Descrizione evento/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-web && npx vitest run src/features/events/pages/EmployeeEventRequest.test.jsx`
Expected: FAIL — `Cannot find module './EmployeeEventRequest'`

- [ ] **Step 3: Write `frontend-web/src/features/events/pages/EmployeeEventRequest.jsx`**

```jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Paper, Card, CardContent, Button, TextField,
  Snackbar, Alert, Table, TableHead, TableBody, TableRow, TableCell, Chip,
  Stack, CircularProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useEvents } from '../hooks/useEvents';

const STATUS_COLORS = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'error' };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function minEventDateISO() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const EmployeeEventRequest = () => {
  const navigate = useNavigate();
  const { createRequest, getMyRequests, loading, error, clearError } = useEvents();

  const [formData, setFormData] = useState({
    event_date: todayISO(),
    start_time: '08:00',
    end_time: '18:00',
    description: '',
  });

  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => { loadRequests(); }, []);

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const data = await getMyRequests();
      setRequests(data || []);
    } catch (err) {
      // handled by hook
    } finally {
      setRequestsLoading(false);
    }
  };

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const isFormValid =
    formData.event_date &&
    formData.start_time &&
    formData.end_time &&
    formData.end_time > formData.start_time &&
    formData.description.trim().length >= 10;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;

    try {
      await createRequest(formData.event_date, formData.start_time, formData.end_time, formData.description.trim());
      setSuccessMessage('Richiesta evento/training inviata con successo!');
      setFormData({ event_date: todayISO(), start_time: '08:00', end_time: '18:00', description: '' });
      setTimeout(loadRequests, 500);
    } catch (err) {
      // Error is handled by useEvents hook
    }
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4, px: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
          <Box>
            <Typography variant="h2" sx={{ mb: 1 }}>Richiedi Evento/Training</Typography>
            <Typography variant="body1" sx={{ color: '#6B625A' }}>
              Giustifica una giornata trascorsa a un evento, congresso o attività di training
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/dashboard')}
            disabled={loading}
            sx={{ borderColor: '#374151', color: '#374151', fontWeight: 600, mt: 0.5 }}
          >
            Dashboard
          </Button>
        </Box>

        <Card sx={{ mb: 6, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)' }}>
          <CardContent sx={{ p: 3 }}>
            <form onSubmit={handleSubmit}>
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    label="Data evento"
                    type="date"
                    value={formData.event_date}
                    onChange={handleChange('event_date')}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: minEventDateISO() }}
                    sx={{ flex: 1, minWidth: 160 }}
                  />
                  <TextField
                    label="Ora inizio"
                    type="time"
                    value={formData.start_time}
                    onChange={handleChange('start_time')}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1, minWidth: 140 }}
                  />
                  <TextField
                    label="Ora fine"
                    type="time"
                    value={formData.end_time}
                    onChange={handleChange('end_time')}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1, minWidth: 140 }}
                  />
                </Box>

                <TextField
                  label="Descrizione evento"
                  multiline
                  rows={4}
                  value={formData.description}
                  onChange={handleChange('description')}
                  placeholder="Es. Congresso di settore a Milano, corso di formazione tecnica..."
                  helperText={`${formData.description.length}/500 (minimo 10 caratteri)`}
                  fullWidth
                  inputProps={{ maxLength: 500 }}
                />

                <Stack direction="row" spacing={2} justifyContent="flex-start">
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSubmit}
                    disabled={!isFormValid || loading}
                    sx={{
                      backgroundColor: '#2D7049',
                      '&:hover': { backgroundColor: '#215a37' },
                      '&:disabled': { backgroundColor: '#ccc' },
                    }}
                  >
                    {loading ? <CircularProgress size={24} /> : 'Invia Richiesta'}
                  </Button>
                </Stack>
              </Stack>
            </form>
          </CardContent>
        </Card>

        <Box sx={{ mt: 6 }}>
          <Typography variant="h3" sx={{ mb: 3, fontWeight: 600 }}>Le Tue Richieste</Typography>

          {requestsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : requests.length === 0 ? (
            <Alert severity="info">Non hai ancora inoltrato richieste di evento/training</Alert>
          ) : (
            <Paper sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#F5F2ED' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Data</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Orario</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Descrizione</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requests.map((req) => (
                    <TableRow key={req.id} hover>
                      <TableCell>{new Date(req.event_date).toLocaleDateString('it-IT')}</TableCell>
                      <TableCell>{req.start_time?.slice(0, 5)} - {req.end_time?.slice(0, 5)}</TableCell>
                      <TableCell>{req.description}</TableCell>
                      <TableCell>
                        <Chip label={req.status} size="small" color={STATUS_COLORS[req.status]} variant="filled" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Box>
      </Box>

      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessMessage(null)} severity="success" sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={clearError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={clearError} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Container>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-web && npx vitest run src/features/events/pages/EmployeeEventRequest.test.jsx`
Expected: PASS

- [ ] **Step 5: Wire the route in `frontend-web/src/App.jsx`**

Add the import after `import { EmployeeLeaveRequest } from './features/leave/pages/EmployeeLeaveRequest';`:

```js
import { EmployeeEventRequest } from './features/events/pages/EmployeeEventRequest';
```

Add the route right after the existing `/leave/request` route block:

```jsx
          {/* Event/Training Request Route */}
          <Route
            path="/events/request"
            element={
              <ProtectedRoute requiredRole="employee">
                <EmployeeEventRequest />
              </ProtectedRoute>
            }
          />
```

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/features/events/pages/EmployeeEventRequest.jsx frontend-web/src/features/events/pages/EmployeeEventRequest.test.jsx frontend-web/src/App.jsx
git commit -m "feat: add EmployeeEventRequest page and /events/request route"
```

---

## Task 15: Manual verification

- [ ] **Step 1: Start backend + apply migration**

Run: `cd backend && npm run migrations && npm run dev`
Expected: server starts, log confirms migration `041_create_event_requests.sql` applied (or already applied).

- [ ] **Step 2: Manual API smoke test**

With a valid employee JWT (`Authorization: Bearer <token>`):

```bash
curl -X POST http://localhost:3000/api/v1/events/request \
  -H "Authorization: Bearer <employee_token>" \
  -H "Content-Type: application/json" \
  -d '{"event_date":"2026-08-25","start_time":"08:00","end_time":"18:00","description":"Congresso di settore a Milano"}'
```

Expected: `201` with `{ "data": { "id": "...", "status": "PENDING", ... } }`

```bash
curl http://localhost:3000/api/v1/events/pending -H "Authorization: Bearer <manager_or_admin_token>"
```

Expected: `200` with the request just created in the `data` array.

```bash
curl -X PUT http://localhost:3000/api/v1/events/<id>/approve \
  -H "Authorization: Bearer <manager_or_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"status":"APPROVED"}'
```

Expected: `200`, `status: "APPROVED"`.

```bash
curl "http://localhost:3000/api/presences/my-summary?month=8&year=2026" -H "Authorization: Bearer <employee_token>"
```

Expected: `ore_totali` and `giorni_presenti` include the approved event's hours (10h for the example above), and `buoni_pasto` reflects it if ≥ the client's meal-voucher threshold.

- [ ] **Step 3: Mobile smoke test**

Run: `cd frontend-mobile && npm start` (or the project's existing dev-run skill/command), log in as an employee.
Expected: Badge screen shows "Eventi/Training" button below Smart Working; tapping it opens the "Eventi" tab with the request form; submitting a valid request shows the success alert and appears in "Ultime richieste". Log in as a manager: the Badge screen does NOT show the button; the "Approva Eventi" tab shows the pending request with Approva/Rifiuta actions and a badge count.

- [ ] **Step 4: Web smoke test**

Run: `cd frontend-web && npm run dev`, log in as a manager.
Expected: Dashboard shows "Richieste Eventi/Training in Sospeso" panel below the ferie panel, with the pending request and working Approva/Rifiuta buttons. Log in as an employee and navigate to `/events/request`: form submits successfully and the request appears in the history table below.

- [ ] **Step 5: Run full test suites**

Run: `cd backend && npm test`
Run: `cd frontend-mobile && npm test`
Run: `cd frontend-web && npx vitest run`
Expected: all PASS, no regressions.

---

## Self-Review Notes

- **Spec coverage:** button on Badge screen ✅ (Task 10), calendar + start/end time + description form ✅ (Task 7, Task 14), manager approval mirroring ferie ✅ (Task 3, Task 8, Task 12), presence recording on approval ✅ (Task 4), all 6 grilled decisions (dedicated table, single-day, query-time join, hours counted, 7-day retroactive window, required description, conflict check, dedicated tab, web parity) are each implemented in a specific task.
- **Placeholder scan:** none — every step has complete, runnable code.
- **Type consistency:** `event_date`/`start_time`/`end_time`/`description` field names are identical across the migration, validation schema, route, hours util, mobile screens, and web hook/page/component.
