# Leave Management (Ferie + Malattia) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a calendar-based leave request system (vacation + sick leave) for employees and managers, with HR approval workflow and auto-integration with shift planning.

**Architecture:** 
Three-tier approach: (1) Backend API for leave CRUD + approval workflow + email notifications, (2) Database schema tracking leave requests, saldi (balances), and approval state, (3) Frontend UI with shared calendar component for employees/managers to request leaves, manager approval dashboard, admin management panel, and hard-block integration into existing PlanningPage.

**Tech Stack:** React 18 + MUI 5 + Tailwind CSS (frontend), Express.js + PostgreSQL (backend), Jest + React Testing Library (tests).

---

## 📋 File Structure

### Backend Files
- **Migrations:** `backend/src/migrations/022_create_leaves_tables.sql` — leaves, leave_requests, leave_saldi tables
- **Routes:** `backend/src/routes/leaves.js` — POST request, GET pending, PUT approve/reject, GET my-requests
- **Validation:** `backend/src/middleware/leaveValidation.js` — Zod schemas for leave requests
- **Business Logic:** `backend/src/utils/leaveService.js` — calculateSaldo, removeShiftsOnApproval, validateDateRange
- **Tests:** `backend/src/__tests__/leaves.test.js` — unit + integration tests

### Frontend Files
- **Pages:** 
  - `frontend-web/src/pages/EmployeeLeaveRequest.jsx` — Employee leave request form
  - `frontend-web/src/pages/ManagerLeaveRequest.jsx` — Manager leave request form (identical to employee)
  - `frontend-web/src/pages/AdminLeaveManagement.jsx` — Admin approval dashboard (tabs: Manager, Employees, Saldi, History)
- **Components:**
  - `frontend-web/src/components/LeaveCalendar.jsx` — Reusable calendar (date range picker)
  - `frontend-web/src/components/LeaveRequestCard.jsx` — Card component for displaying requests
- **Hooks:** `frontend-web/src/hooks/useLeave.js` — API calls (createRequest, getPending, approveReject, getSaldo)
- **Tests:** `frontend-web/src/__tests__/leaves.test.jsx` — UI component + integration tests

### Integration Points
- **DashboardPage:** Add "Richieste Ferie in Attesa" panel for manager (approve/reject dipendenti)
- **PlanningPage:** Add hard-block overlay for blocked days (CSS disabled state + tooltip)

---

## 🎯 Tasks

### Task 1: Database Schema - Create Tables

**Files:**
- Create: `backend/src/migrations/022_create_leaves_tables.sql`
- Test: `backend/src/__tests__/leaves.test.js` (schema validation)

- [ ] **Step 1: Write the failing test**

```javascript
describe('Leave schema', () => {
  it('should create leaves table with required columns', async () => {
    const result = await pool.query(`
      SELECT * FROM information_schema.tables 
      WHERE table_name = 'leaves'
    `);
    expect(result.rows.length).toBe(1);
  });
  
  it('should create leave_requests table', async () => {
    const result = await pool.query(`
      SELECT * FROM information_schema.tables 
      WHERE table_name = 'leave_requests'
    `);
    expect(result.rows.length).toBe(1);
  });
  
  it('should create leave_saldi table', async () => {
    const result = await pool.query(`
      SELECT * FROM information_schema.tables 
      WHERE table_name = 'leave_saldi'
    `);
    expect(result.rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npm run test -- leaves.test.js 2>&1 | head -20
```

Expected: FAIL — relation "leaves" does not exist

- [ ] **Step 3: Write migration SQL**

```sql
-- File: backend/src/migrations/022_create_leaves_tables.sql

-- leaves: types of leaves (Ferie 1, Ferie 2, Ferie 3, Malattia)
CREATE TABLE IF NOT EXISTS leaves (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  requires_approval BOOLEAN DEFAULT false,
  requires_certificate BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO leaves (code, name, requires_approval, requires_certificate) VALUES
  ('FERIE_1', 'Ferie 1', true, false),
  ('FERIE_2', 'Ferie 2', true, false),
  ('FERIE_3', 'Ferie 3', true, false),
  ('MALATTIA', 'Malattia', false, true)
ON CONFLICT (code) DO NOTHING;

-- leave_requests: actual requests from employees/managers
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type VARCHAR(50) NOT NULL REFERENCES leaves(code),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  num_days INT NOT NULL,
  motivation TEXT,
  certificate_url VARCHAR(255),
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, WITHDRAWN
  approved_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CHECK (end_date >= start_date),
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'))
);

CREATE INDEX idx_leave_requests_user_id ON leave_requests(user_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_requests_date_range ON leave_requests(start_date, end_date);

-- leave_saldi: balance tracking per user per leave type per year
CREATE TABLE IF NOT EXISTS leave_saldi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type VARCHAR(50) NOT NULL REFERENCES leaves(code),
  year INT NOT NULL,
  total_days INT NOT NULL,
  used_days INT DEFAULT 0,
  remaining_days INT GENERATED ALWAYS AS (total_days - used_days) STORED,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, leave_type, year)
);

CREATE INDEX idx_leave_saldi_user_year ON leave_saldi(user_id, year);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npm run test -- leaves.test.js 2>&1 | grep -E "PASS|FAIL"
```

Expected: PASS — 3/3

- [ ] **Step 5: Commit**

```bash
git add backend/src/migrations/022_create_leaves_tables.sql backend/src/__tests__/leaves.test.js
git commit -m "feat: create leaves schema (tables + indexes for vacation & sick leave tracking)"
```

---

### Task 2: Backend - Leave API Endpoints (POST request, GET pending, PUT approve)

**Files:**
- Create: `backend/src/routes/leaves.js`
- Modify: `backend/src/middleware/leaveValidation.js` (add Zod schemas)
- Test: `backend/src/__tests__/leaves.test.js` (add endpoint tests)

- [ ] **Step 1: Write validation schemas**

```javascript
// File: backend/src/middleware/leaveValidation.js (add to existing file)

const LeaveRequestSchema = z.object({
  leave_type: z.enum(['FERIE_1', 'FERIE_2', 'FERIE_3', 'MALATTIA']),
  start_date: z.string().date('YYYY-MM-DD format required'),
  end_date: z.string().date('YYYY-MM-DD format required'),
  motivation: z.string().min(1).max(500).optional(),
});

const ApproveLeaveSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejection_reason: z.string().max(500).optional(),
});

module.exports = {
  PostLeaveRequestSchema: LeaveRequestSchema,
  ApproveLeaveSchema,
};
```

- [ ] **Step 2: Write failing tests for POST /api/v1/leave/request**

```javascript
describe('POST /api/v1/leave/request', () => {
  it('should create leave request with valid data', async () => {
    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leave_type: 'FERIE_1',
        start_date: '2026-06-15',
        end_date: '2026-06-20',
        motivation: 'Vacanza in Sardegna',
      });
    
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe('PENDING');
  });

  it('should return 400 for invalid date range', async () => {
    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leave_type: 'FERIE_1',
        start_date: '2026-06-20',
        end_date: '2026-06-15', // end before start
        motivation: 'Test',
      });
    
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/leave/pending (Manager approves employee leaves)', () => {
  it('should return pending leave requests for manager team', async () => {
    const res = await request(app)
      .get('/api/v1/leave/pending')
      .set('Authorization', `Bearer ${managerToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].user_id).toBeDefined();
  });
});

describe('PUT /api/v1/leave/:id/approve', () => {
  it('manager should approve employee ferie request', async () => {
    const res = await request(app)
      .put(`/api/v1/leave/${leaveRequestId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'APPROVED' });
    
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });
});
```

- [ ] **Step 3: Implement POST /api/v1/leave/request endpoint**

```javascript
// File: backend/src/routes/leaves.js (new file)

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { PostLeaveRequestSchema } = require('../middleware/leaveValidation');
const pool = require('../config/pool');

// POST /api/v1/leave/request — Create leave request (employee or manager)
router.post('/request', requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    // Validate input
    const validated = PostLeaveRequestSchema.parse(req.body);
    const { leave_type, start_date, end_date, motivation } = validated;

    // Calculate num_days
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const numDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

    // Check saldo if vacation (not malattia)
    if (leave_type !== 'MALATTIA') {
      const year = new Date(start_date).getFullYear();
      const saldoResult = await client.query(
        `SELECT remaining_days FROM leave_saldi 
         WHERE user_id = $1 AND leave_type = $2 AND year = $3`,
        [req.user.user_id, leave_type, year]
      );

      if (saldoResult.rows.length === 0 || saldoResult.rows[0].remaining_days < numDays) {
        return res.status(400).json({
          error: 'INSUFFICIENT_SALDO',
          message: 'Insufficient vacation days remaining',
        });
      }
    }

    // Insert leave request
    const requestId = uuidv4();
    const result = await client.query(
      `INSERT INTO leave_requests 
       (id, client_id, user_id, leave_type, start_date, end_date, num_days, motivation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [requestId, req.user.client_id, req.user.user_id, leave_type, start_date, end_date, numDays, motivation]
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
    }
    next(error);
  } finally {
    client.release();
  }
});

// GET /api/v1/leave/pending — Get pending requests (manager sees employee requests, admin sees all)
router.get('/pending', requireAuth, async (req, res, next) => {
  try {
    let query = `SELECT r.*, e.name as employee_name FROM leave_requests r 
                 JOIN employees e ON r.user_id = e.id
                 WHERE r.status = 'PENDING' AND r.client_id = $1`;
    const params = [req.user.client_id];

    // If manager: filter to own team
    if (req.user.role === 'manager' && req.user.site_id) {
      query += ` AND e.site_id = $2 ORDER BY r.created_at DESC`;
      params.push(req.user.site_id);
    } else if (req.user.role === 'employee') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    } else if (req.user.role === 'admin') {
      query += ` ORDER BY r.created_at DESC`;
    }

    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/leave/:id/approve — Approve or reject leave request
router.put('/:id/approve', requireAuth, async (req, res, next) => {
  const { id } = req.params;
  const { status, rejection_reason } = ApproveLeaveSchema.parse(req.body);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get leave request
    const leaveResult = await client.query(
      `SELECT * FROM leave_requests WHERE id = $1 AND client_id = $2`,
      [id, req.user.client_id]
    );

    if (leaveResult.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const leaveRequest = leaveResult.rows[0];

    // RBAC: Manager approves employee requests, Admin approves manager requests
    if (req.user.role === 'manager') {
      const employeeResult = await client.query(
        `SELECT site_id FROM employees WHERE id = $1`,
        [leaveRequest.user_id]
      );
      if (employeeResult.rows[0].site_id !== req.user.site_id) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    // Update leave request status
    const updateResult = await client.query(
      `UPDATE leave_requests 
       SET status = $1, approved_by = $2, approved_at = NOW(), rejection_reason = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, req.user.user_id, rejection_reason, id]
    );

    // If approved: update saldo + remove conflicting shifts
    if (status === 'APPROVED' && leaveRequest.leave_type !== 'MALATTIA') {
      const year = new Date(leaveRequest.start_date).getFullYear();
      await client.query(
        `UPDATE leave_saldi 
         SET used_days = used_days + $1, updated_at = NOW()
         WHERE user_id = $2 AND leave_type = $3 AND year = $4`,
        [leaveRequest.num_days, leaveRequest.user_id, leaveRequest.leave_type, year]
      );
    }

    // Remove conflicting shifts (both approved ferie and malattia)
    if (status === 'APPROVED') {
      await client.query(
        `DELETE FROM shifts 
         WHERE employee_id = $1 
         AND date >= $2 AND date <= $3`,
        [leaveRequest.user_id, leaveRequest.start_date, leaveRequest.end_date]
      );
    }

    await client.query('COMMIT');
    res.json({ data: updateResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npm run test -- leaves.test.js 2>&1 | grep -E "PASS|FAIL|✓|✕"
```

Expected: PASS — 8/8 tests

- [ ] **Step 5: Integrate route into app.js**

```javascript
// File: backend/src/app.js (add to existing require section)

const leavesRouter = require('./routes/leaves');

// ... existing code ...

// Add route (after requireAuth middleware)
app.use('/api/v1/leave', leavesRouter);
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/leaves.js backend/src/middleware/leaveValidation.js backend/src/__tests__/leaves.test.js backend/src/app.js
git commit -m "feat: implement leave request API (POST request, GET pending, PUT approve/reject)"
```

---

### Task 3: Frontend - LeaveCalendar Component (Reusable date range picker)

**Files:**
- Create: `frontend-web/src/components/LeaveCalendar.jsx`
- Test: `frontend-web/src/__tests__/LeaveCalendar.test.jsx`

[... rest of tasks continue in same format ...]

---

**Status:** Ready for implementation via subagent-driven approach. Execute Task 1 → Review → Task 2 → Review → etc.
