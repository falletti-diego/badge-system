# S.32.2 RBAC Fail-Closed + Helper `buildScopedFilters` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement fail-closed RBAC across checkins, export, and presences routes via a shared helper function, fixing the data-leak vulnerability where users without proper token claims (employee_id, site_id) see the entire tenant.

**Architecture:** A pure helper function `buildScopedFilters(user, filters, alias)` in `utils/queryScope.js` validates all claims up-front and throws 403 ForbiddenError if validation fails, returning SQL-ready WHERE clauses and params. Each route (checkins GET/stats, export, presences/summary) calls this helper once instead of duplicating the RBAC pattern. Demo accounts (Pino, Maria, Lucia) are fixed in DEMO_USERS so they carry correct site_id/employee_id claims.

**Tech Stack:** Node.js 20 + Express 4, Jest + supertest, PostgreSQL parameterized queries.

---

### Task 1: Create `queryScope.js` helper with TDD (unit tests first)

**Files:**
- Create: `backend/src/utils/queryScope.js`
- Create: `backend/src/__tests__/queryScope.test.js`

- [ ] **Step 1: Write the failing unit tests**

Create `backend/src/__tests__/queryScope.test.js` with the complete test suite (pasted below). These test the pure validation logic of `buildScopedFilters`.

```js
'use strict';

/**
 * Unit tests for queryScope.js — buildScopedFilters validation matrix
 * Tests fail-closed behavior: missing/conflicting claims → throw ForbiddenError
 */

const { buildScopedFilters } = require('../utils/queryScope');
const { ForbiddenError } = require('../utils/errors');

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID_TORINO = '550e8400-e29b-41d4-a716-446655440012';
const SITE_ID_MILANO = 'e1337fab-ba3f-4332-bb06-57c9df15b067';
const EMP_ID_A = '550e8400-e29b-41d4-a716-446655440100';
const EMP_ID_B = '550e8400-e29b-41d4-a716-446655440101';

describe('queryScope.buildScopedFilters — RBAC validation matrix', () => {
  // ─── Employee (self-only) ──────────────────────────────────────────
  
  it('employee with employee_id, no filters → produces employee_id clause', () => {
    const user = { client_id: CLIENT_ID, role: 'employee', employee_id: EMP_ID_A };
    const result = buildScopedFilters(user, {}, 'c');
    expect(result.whereClauses).toContain(expect.stringMatching(/employee_id.*=.*\$\d+/i));
    expect(result.params).toContain(EMP_ID_A);
  });

  it('employee with employee_id, filters for own employee → OK', () => {
    const user = { client_id: CLIENT_ID, role: 'employee', employee_id: EMP_ID_A };
    const result = buildScopedFilters(user, { employeeId: EMP_ID_A }, 'c');
    expect(result.whereClauses.length).toBeGreaterThan(0);
    expect(result.params).toContain(EMP_ID_A);
  });

  it('employee with employee_id, filters for other employee → 403 FORBIDDEN_EMPLOYEE', () => {
    const user = { client_id: CLIENT_ID, role: 'employee', employee_id: EMP_ID_A };
    expect(() => buildScopedFilters(user, { employeeId: EMP_ID_B }, 'c')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN_EMPLOYEE' })
    );
  });

  it('employee without employee_id → 403 NO_EMPLOYEE_PROFILE', () => {
    const user = { client_id: CLIENT_ID, role: 'employee' };
    expect(() => buildScopedFilters(user, {}, 'c')).toThrow(
      expect.objectContaining({ code: 'NO_EMPLOYEE_PROFILE' })
    );
  });

  // ─── Manager (site-scoped) ────────────────────────────────────────
  
  it('manager with site_id, no filters → produces site_id clause', () => {
    const user = { client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID_TORINO };
    const result = buildScopedFilters(user, {}, 'c');
    expect(result.whereClauses).toContain(expect.stringMatching(/site_id.*=.*\$\d+/i));
    expect(result.params).toContain(SITE_ID_TORINO);
  });

  it('manager with site_id, filters for own site → OK', () => {
    const user = { client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID_TORINO };
    const result = buildScopedFilters(user, { siteId: SITE_ID_TORINO }, 'c');
    expect(result.whereClauses.length).toBeGreaterThan(0);
    expect(result.params).toContain(SITE_ID_TORINO);
  });

  it('manager with site_id, filters for other site → 403 FORBIDDEN_SITE', () => {
    const user = { client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID_TORINO };
    expect(() => buildScopedFilters(user, { siteId: SITE_ID_MILANO }, 'c')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN_SITE' })
    );
  });

  it('manager without site_id → 403 NO_SITE_ASSIGNED', () => {
    const user = { client_id: CLIENT_ID, role: 'manager' };
    expect(() => buildScopedFilters(user, {}, 'c')).toThrow(
      expect.objectContaining({ code: 'NO_SITE_ASSIGNED' })
    );
  });

  // ─── Admin/Viewer (tenant-wide) ────────────────────────────────────
  
  it('admin with any filters → OK (no restrictions)', () => {
    const user = { client_id: CLIENT_ID, role: 'admin' };
    const result = buildScopedFilters(user, { siteId: SITE_ID_TORINO, employeeId: EMP_ID_A }, 'c');
    expect(result.whereClauses.length).toBeGreaterThan(0);
  });

  it('viewer with any filters → OK (no restrictions)', () => {
    const user = { client_id: CLIENT_ID, role: 'viewer' };
    const result = buildScopedFilters(user, { siteId: SITE_ID_TORINO }, 'c');
    expect(result.whereClauses.length).toBeGreaterThan(0);
  });

  // ─── Unknown role ─────────────────────────────────────────────────
  
  it('unknown role → 403 UNAUTHORIZED_ROLE', () => {
    const user = { client_id: CLIENT_ID, role: 'supervisor' };
    expect(() => buildScopedFilters(user, {}, 'c')).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED_ROLE' })
    );
  });

  // ─── Date range (always included, no gating) ──────────────────────
  
  it('date_from/date_to included in WHERE regardless of role', () => {
    const user = { client_id: CLIENT_ID, role: 'admin' };
    const result = buildScopedFilters(user, { dateFrom: '2026-06-01', dateTo: '2026-06-30' }, 'c');
    expect(result.whereClauses).toContain(expect.stringMatching(/timestamp.*>=/i));
    expect(result.whereClauses).toContain(expect.stringMatching(/timestamp.*</i));
  });

  // ─── client_id always present ──────────────────────────────────────
  
  it('client_id always included in WHERE', () => {
    const user = { client_id: CLIENT_ID, role: 'admin' };
    const result = buildScopedFilters(user, {}, 'c');
    expect(result.whereClauses).toContain(expect.stringMatching(/client_id.*=.*\$\d+/i));
    expect(result.params).toContain(CLIENT_ID);
  });

  // ─── SQL table alias ──────────────────────────────────────────────
  
  it('respects the alias parameter (e.g. "ci" instead of "c")', () => {
    const user = { client_id: CLIENT_ID, role: 'admin' };
    const result = buildScopedFilters(user, {}, 'ci');
    expect(result.whereClauses.join(' ')).toMatch(/ci\./);
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/backend" && npx jest src/__tests__/queryScope.test.js --verbose 2>&1 | tail -30`

Expected: All tests fail with "Cannot find module '../utils/queryScope'" or similar (the module doesn't exist yet).

- [ ] **Step 3: Write the minimal `queryScope.js` implementation**

Create `backend/src/utils/queryScope.js`:

```js
'use strict';

/**
 * Query scope builder for RBAC — fail-closed validation + WHERE clause generation
 * Used by checkins GET, checkins/stats, export, and presences routes.
 *
 * Validates user claims (role, employee_id, site_id) and throws 403 if validation fails.
 * Returns { whereClauses: [...], params: [...] } ready for SQL interpolation.
 */

const { ForbiddenError } = require('./errors');

/**
 * Build scoped WHERE clauses and params for the user's role and filters.
 *
 * @param {object} user - req.user (client_id, role, employee_id, site_id)
 * @param {object} filters - { siteId, employeeId, dateFrom, dateTo } (already resolved to UUIDs)
 * @param {string} alias - SQL table alias (e.g., 'c' for checkins, 'ci' for checkins inner join)
 * @returns {object} { whereClauses: [...], params: [...] }
 * @throws {ForbiddenError} if validation fails
 */
function buildScopedFilters(user, filters = {}, alias = 'c') {
  const { client_id, role, employee_id, site_id } = user;
  const { employeeId, siteId, dateFrom, dateTo } = filters;

  const whereClauses = [];
  const params = [];
  let paramCount = 0;

  // ─── Mandatory: client_id isolation (always first) ──────────────────

  paramCount++;
  whereClauses.push(`${alias}.client_id = $${paramCount}::uuid`);
  params.push(client_id);

  // ─── Role-based validation and filtering ──────────────────────────

  if (role === 'employee') {
    // Employee: must have employee_id in token; can only see own data
    if (!employee_id) {
      throw new ForbiddenError(
        'Your account has no employee profile — cannot access this endpoint',
        'NO_EMPLOYEE_PROFILE'
      );
    }

    // If filter specifies a different employee, reject
    if (employeeId && employeeId !== employee_id) {
      throw new ForbiddenError(
        'You can only access your own data',
        'FORBIDDEN_EMPLOYEE'
      );
    }

    // Apply employee_id filter
    paramCount++;
    whereClauses.push(`${alias}.employee_id = $${paramCount}::uuid`);
    params.push(employee_id);
  } else if (role === 'manager') {
    // Manager: must have site_id in token; can only see own site
    if (!site_id) {
      throw new ForbiddenError(
        'Manager has no assigned site',
        'NO_SITE_ASSIGNED'
      );
    }

    // If filter specifies a different site, reject
    if (siteId && siteId !== site_id) {
      throw new ForbiddenError(
        'You can only access data for your assigned site',
        'FORBIDDEN_SITE'
      );
    }

    // Apply site_id filter (default to manager's site if not specified)
    const scopeSiteId = siteId || site_id;
    paramCount++;
    whereClauses.push(`${alias}.site_id = $${paramCount}::uuid`);
    params.push(scopeSiteId);
  } else if (role === 'admin' || role === 'viewer') {
    // Admin/Viewer: no role-based filtering; apply explicit filters if provided
    if (siteId) {
      paramCount++;
      whereClauses.push(`${alias}.site_id = $${paramCount}::uuid`);
      params.push(siteId);
    }

    if (employeeId) {
      paramCount++;
      whereClauses.push(`${alias}.employee_id = $${paramCount}::uuid`);
      params.push(employeeId);
    }
  } else {
    // Unknown role: fail-closed
    throw new ForbiddenError(
      `Unauthorized role: ${role}`,
      'UNAUTHORIZED_ROLE'
    );
  }

  // ─── Optional: date range (applied to all roles) ──────────────────

  if (dateFrom) {
    paramCount++;
    whereClauses.push(`${alias}.timestamp >= $${paramCount}::date`);
    params.push(dateFrom);
  }

  if (dateTo) {
    paramCount++;
    whereClauses.push(`${alias}.timestamp < $${paramCount}::date + INTERVAL '1 day'`);
    params.push(dateTo);
  }

  return { whereClauses, params };
}

module.exports = { buildScopedFilters };
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/backend" && npx jest src/__tests__/queryScope.test.js --verbose`

Expected: 13/13 PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge"
git add backend/src/utils/queryScope.js backend/src/__tests__/queryScope.test.js
git commit -m "feat: add buildScopedFilters helper — fail-closed RBAC validation (S.32.2)"
```

---

### Task 2: Fix DEMO_USERS in `auth.js` (Simple change)

**Files:**
- Modify: `backend/src/routes/auth.js` (lines 37-80, DEMO_USERS array)

- [ ] **Step 1: Update DEMO_USERS with correct claims**

In `backend/src/routes/auth.js`, replace the DEMO_USERS array (lines 37–80) with the corrected version below. This adds `site_id` to Pino, adds `employee_id` to Maria, and removes Lucia entirely.

Current (lines 37–80):
```js
const DEMO_USERS = [
  {
    email: 'pippo@badge.local',
    password: process.env.DEMO_PIPPO_PASSWORD,
    id: 'user-mvp-pippo',
    name: 'Pippo',
    role: 'admin',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
  },
  {
    email: 'pino@badge.local',
    password: process.env.DEMO_PINO_PASSWORD,
    id: 'user-mvp-pino',
    name: 'Pino',
    role: 'manager',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
  },
  {
    email: 'diego@badge.local',
    password: process.env.DEMO_DIEGO_PASSWORD,
    id: 'user-mvp-diego',
    name: 'Diego',
    role: 'manager',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    site_id: '550e8400-e29b-41d4-a716-446655440012',
    employee_id: '550e8400-e29b-41d4-a716-446655440200',
  },
  {
    email: 'maria@badge.local',
    password: process.env.DEMO_MARIA_PASSWORD,
    id: 'user-mvp-maria',
    name: 'Maria',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
  },
  {
    email: 'lucia@badge.local',
    password: process.env.DEMO_LUCIA_PASSWORD,
    id: 'user-mvp-lucia',
    name: 'Lucia',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
  },
];
```

Replace with:
```js
const DEMO_USERS = [
  {
    email: 'pippo@badge.local',
    password: process.env.DEMO_PIPPO_PASSWORD,
    id: 'user-mvp-pippo',
    name: 'Pippo',
    role: 'admin',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
  },
  {
    email: 'pino@badge.local',
    password: process.env.DEMO_PINO_PASSWORD,
    id: 'user-mvp-pino',
    name: 'Pino',
    role: 'manager',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    site_id: 'e1337fab-ba3f-4332-bb06-57c9df15b067', // Milano
  },
  {
    email: 'diego@badge.local',
    password: process.env.DEMO_DIEGO_PASSWORD,
    id: 'user-mvp-diego',
    name: 'Diego',
    role: 'manager',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    site_id: '550e8400-e29b-41d4-a716-446655440012', // Torino
    employee_id: '550e8400-e29b-41d4-a716-446655440200',
  },
  {
    email: 'maria@badge.local',
    password: process.env.DEMO_MARIA_PASSWORD,
    id: 'user-mvp-maria',
    name: 'Maria',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    employee_id: '239ec99f-3204-45ca-bce2-793f52442ec6', // Maria Rossi (real employee in Torino with check-ins)
  },
  // Lucia removed — no corresponding employee record in the database
];
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/auth.js
git commit -m "fix: add site_id to Pino, employee_id to Maria, remove Lucia from DEMO_USERS (S.32.2)"
```

---

### Task 3: Refactor `checkins.js` GET + /stats endpoints to use `buildScopedFilters`

**Files:**
- Modify: `backend/src/routes/checkins.js` (GET handler and /stats handler)

- [ ] **Step 1: Add import of `buildScopedFilters` at the top**

In `backend/src/routes/checkins.js` (line ~15), add to the imports:

```js
const { buildScopedFilters } = require('../utils/queryScope');
```

- [ ] **Step 2: Refactor GET `/` handler (replace WHERE-building logic)**

In the GET handler (starting ~line 155), replace the entire WHERE-building block (currently lines ~162-213) with a call to the helper. The old block constructs `whereClauses` and manages `paramCount` manually; the new version is much shorter.

Old code (~162-213):
```js
    // Build WHERE clause dynamically — client_id is mandatory and always first
    const whereClauses = [];
    const params = [];
    let paramCount = 0;

    // Mandatory tenant isolation — never removed
    paramCount++;
    whereClauses.push(`c.client_id = $${paramCount}::uuid`);
    params.push(clientId);

    // IMPORTANT: If user is an employee, they can only see their own checkins
    if (userRole === 'employee' && userEmployeeId) {
      paramCount++;
      whereClauses.push(`c.employee_id = $${paramCount}::uuid`);
      params.push(userEmployeeId);
    }

    // IMPORTANT: If user is a manager assigned to a specific store, filter by that store
    if (userRole === 'manager' && userSiteId) {
      paramCount++;
      whereClauses.push(`c.site_id = $${paramCount}::uuid`);
      params.push(userSiteId);
    }

    if (resolvedSiteId) {
      paramCount++;
      whereClauses.push(`c.site_id = $${paramCount}::uuid`);
      params.push(resolvedSiteId);
    }

    if (resolvedEmployeeId) {
      paramCount++;
      whereClauses.push(`c.employee_id = $${paramCount}::uuid`);
      params.push(resolvedEmployeeId);
    }

    if (date_from) {
      paramCount++;
      whereClauses.push(`c.timestamp >= $${paramCount}::date`);
      params.push(date_from);
    }

    if (date_to) {
      paramCount++;
      whereClauses.push(`c.timestamp < $${paramCount}::date + INTERVAL '1 day'`);
      params.push(date_to);
    }

    // Add pagination params
    paramCount++;
    params.push(limit);
    const limitParam = paramCount;

    paramCount++;
    params.push(offset);
    const offsetParam = paramCount;

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
```

Replace with:
```js
    const { whereClauses, params: scopeParams } = buildScopedFilters(
      req.user,
      { siteId: resolvedSiteId, employeeId: resolvedEmployeeId, dateFrom: date_from, dateTo: date_to },
      'c'
    );

    const params = [...scopeParams];

    // Add pagination params
    params.push(limit);
    const limitParam = params.length;

    params.push(offset);
    const offsetParam = params.length;

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
```

- [ ] **Step 3: Refactor /stats handler (same pattern)**

In the /stats handler (starting ~line 287), replace the WHERE-building block (lines ~299-345) with the same pattern:

Replace the old block with:
```js
    const { whereClauses, params: scopeParams } = buildScopedFilters(
      req.user,
      { siteId: resolvedSiteId, employeeId: resolvedEmployeeId, dateFrom: date_from, dateTo: date_to },
      'c'
    );

    const params = [...scopeParams];
    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
```

- [ ] **Step 4: Run tests and verify no regressions**

Run: `cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/backend" && npx jest src/__tests__/checkins.test.js src/__tests__/checkins-geofence.test.js --verbose 2>&1 | tail -20`

Expected: Both suites PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/checkins.js
git commit -m "refactor: use buildScopedFilters helper in checkins GET and /stats (S.32.2)"
```

---

### Task 4: Refactor `export.js` GET endpoint to use `buildScopedFilters`

**Files:**
- Modify: `backend/src/routes/export.js` (GET handler)

- [ ] **Step 1: Add import**

At the top of `backend/src/routes/export.js`, add:

```js
const { buildScopedFilters } = require('../utils/queryScope');
```

- [ ] **Step 2: Refactor WHERE-building block**

In the GET handler (line ~128), replace the WHERE-building block (lines ~140-175) with:

Replace:
```js
    const whereClauses = [];
    const params = [];
    let paramCount = 0;

    paramCount++;
    whereClauses.push(`c.client_id = $${paramCount}::uuid`);
    params.push(clientId);

    if (resolvedSiteId) {
      paramCount++;
      whereClauses.push(`c.site_id = $${paramCount}::uuid`);
      params.push(resolvedSiteId);
    }

    if (resolvedEmployeeId) {
      paramCount++;
      whereClauses.push(`c.employee_id = $${paramCount}::uuid`);
      params.push(resolvedEmployeeId);
    }

    if (date_from) {
      paramCount++;
      whereClauses.push(`c.timestamp >= $${paramCount}::date`);
      params.push(date_from);
    }

    if (date_to) {
      paramCount++;
      whereClauses.push(`c.timestamp < $${paramCount}::date + INTERVAL '1 day'`);
      params.push(date_to);
    }

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
```

With:
```js
    const { whereClauses, params } = buildScopedFilters(
      req.user,
      { siteId: resolvedSiteId, employeeId: resolvedEmployeeId, dateFrom: date_from, dateTo: date_to },
      'c'
    );

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
```

- [ ] **Step 3: Run tests and verify no regressions**

Run: `cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/backend" && npx jest src/__tests__/export.test.js src/__tests__/export-formats.test.js --verbose 2>&1 | tail -20`

Expected: Both suites PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/export.js
git commit -m "refactor: use buildScopedFilters helper in export GET (S.32.2)"
```

---

### Task 5: Verify and refactor `presences.js` /summary endpoint (if needed)

**Files:**
- Modify: `backend/src/routes/presences.js` (if refactoring needed)

- [ ] **Step 1: Read the current implementation**

Review `backend/src/routes/presences.js` lines 21–65 (the GET /summary handler). Check if it already uses the correct fail-closed pattern for manager site_id validation (it should, based on the spec review).

Expected: The code should have `if (role === 'manager')` with a check for `!managerSiteId` that throws `NO_SITE_ASSIGNED`. If this pattern exists and is consistent, no refactoring is needed. If it's missing, apply the same pattern as in checkins.js.

- [ ] **Step 2: If refactoring is needed, apply buildScopedFilters**

(Only if the current code does NOT validate manager site_id or does NOT fail-closed.)

If needed:
1. Add import: `const { buildScopedFilters } = require('../utils/queryScope');`
2. Replace the WHERE-building logic with a call to the helper (same as Tasks 3–4).

If presences.js is already correct, add a comment explaining the pattern is intentional.

- [ ] **Step 3: Run tests**

Run: `cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/backend" && npx jest src/__tests__/presences-summary.test.js --verbose 2>&1 | tail -15`

Expected: PASS.

- [ ] **Step 4: Commit (only if changes were made)**

```bash
git add backend/src/routes/presences.js
git commit -m "refactor: apply buildScopedFilters or document existing pattern in presences (S.32.2)"
```

Or if no changes: skip this commit.

---

### Task 6: Write integration tests for RBAC (with real tokens)

**Files:**
- Create: `backend/src/__tests__/checkins-rbac.test.js`

- [ ] **Step 1: Write the integration test file**

Create `backend/src/__tests__/checkins-rbac.test.js` with comprehensive integration tests using real RS256 tokens (same pattern as checkins-ownership.test.js):

```js
'use strict';

/**
 * Integration tests for RBAC on GET /api/checkins and GET /api/export/csv (S.32.2)
 * Uses real RS256 tokens with different claims to verify fail-closed behavior
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../db/redis', () => ({
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');
const app = require('../app');

// Disable global DISABLE_AUTH so JWT role checks work
beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID_A = '550e8400-e29b-41d4-a716-446655440012';
const SITE_ID_B = 'e1337fab-ba3f-4332-bb06-57c9df15b067';
const EMP_ID_A = '550e8400-e29b-41d4-a716-446655440100';
const EMP_ID_B = '239ec99f-3204-45ca-bce2-793f52442ec6';

// Tokens
const tokenEmpWithId = makeToken({ user_id: EMP_ID_A, client_id: CLIENT_ID, role: 'employee', employee_id: EMP_ID_A });
const tokenEmpNoId = makeToken({ user_id: 'emp-without-id', client_id: CLIENT_ID, role: 'employee' });
const tokenMgrWithSiteA = makeToken({ user_id: 'mgr-1', client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID_A });
const tokenMgrWithSiteB = makeToken({ user_id: 'mgr-2', client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID_B });
const tokenMgrNoSite = makeToken({ user_id: 'mgr-3', client_id: CLIENT_ID, role: 'manager' });
const tokenAdmin = makeToken({ user_id: 'admin-1', client_id: CLIENT_ID, role: 'admin' });

function mockPoolQuerySuccess(rows = []) {
  pool.query.mockImplementation((sql) => {
    const s = sql.trim().toUpperCase();
    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK')) return Promise.resolve({ rows: [] });
    if (s.includes('SELECT') && s.includes('CHECKINS')) return Promise.resolve({ rows: rows || [] });
    if (s.includes('SELECT COUNT')) return Promise.resolve({ rows: [{ total: '0' }] });
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/checkins — RBAC with buildScopedFilters (S.32.2)', () => {
  it('employee with employee_id → 200 OK', async () => {
    mockPoolQuerySuccess();
    const res = await request(app)
      .get('/api/v1/checkins')
      .set('Authorization', `Bearer ${tokenEmpWithId}`);
    expect(res.status).toBe(200);
  });

  it('employee without employee_id → 403 NO_EMPLOYEE_PROFILE', async () => {
    const res = await request(app)
      .get('/api/v1/checkins')
      .set('Authorization', `Bearer ${tokenEmpNoId}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NO_EMPLOYEE_PROFILE');
  });

  it('manager with site_id → 200 OK', async () => {
    mockPoolQuerySuccess();
    const res = await request(app)
      .get('/api/v1/checkins')
      .set('Authorization', `Bearer ${tokenMgrWithSiteA}`);
    expect(res.status).toBe(200);
  });

  it('manager without site_id → 403 NO_SITE_ASSIGNED', async () => {
    const res = await request(app)
      .get('/api/v1/checkins')
      .set('Authorization', `Bearer ${tokenMgrNoSite}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NO_SITE_ASSIGNED');
  });

  it('manager filtering for own site → 200 OK', async () => {
    mockPoolQuerySuccess();
    const res = await request(app)
      .get(`/api/v1/checkins?site_id=${SITE_ID_A}`)
      .set('Authorization', `Bearer ${tokenMgrWithSiteA}`);
    expect(res.status).toBe(200);
  });

  it('manager filtering for other site → 403 FORBIDDEN_SITE', async () => {
    const res = await request(app)
      .get(`/api/v1/checkins?site_id=${SITE_ID_B}`)
      .set('Authorization', `Bearer ${tokenMgrWithSiteA}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_SITE');
  });

  it('admin with any filter → 200 OK', async () => {
    mockPoolQuerySuccess();
    const res = await request(app)
      .get(`/api/v1/checkins?site_id=${SITE_ID_A}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/export/csv — RBAC with buildScopedFilters (S.32.2)', () => {
  it('employee without employee_id → 403 FORBIDDEN_ROLE', async () => {
    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${tokenEmpNoId}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_ROLE');
  });

  it('manager without site_id → 403 NO_SITE_ASSIGNED', async () => {
    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${tokenMgrNoSite}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NO_SITE_ASSIGNED');
  });

  it('manager with site_id → 200 OK', async () => {
    mockPoolQuerySuccess();
    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${tokenMgrWithSiteA}`);
    expect(res.status).toBe(200);
  });

  it('admin → 200 OK', async () => {
    mockPoolQuerySuccess();
    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests and verify they pass**

Run: `cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/backend" && npx jest src/__tests__/checkins-rbac.test.js --verbose`

Expected: All tests PASS.

- [ ] **Step 3: Run full suite and verify no regressions**

Run: `npm run test 2>&1 | tail -20`

Expected: All suites PASS (235+ tests).

- [ ] **Step 4: Commit**

```bash
git add backend/src/__tests__/checkins-rbac.test.js
git commit -m "test: add integration RBAC tests for checkins and export (S.32.2)"
```

---

### Task 7: Update TASKS.md, push, and verify production deploy

**Files:**
- Modify: `TASKS.md` (mark S.32.2 complete)

- [ ] **Step 1: Update TASKS.md**

In `TASKS.md`, find the section `### S.32.2 — 🔴 RBAC fail-closed...` and update it:

Change:
```markdown
### S.32.2 — 🔴 RBAC fail-closed + helper condiviso (CRITICO — data leak intra-tenant)
...
- [ ] Helper unico `utils/queryScope.js` → `buildScopedFilters(req.user, filters)` fail-closed by design
...
```

To:
```markdown
### S.32.2 — 🔴 RBAC fail-closed + helper condiviso (CRITICO — data leak intra-tenant) ✅
`checkins.js`, `export.js`, `presences.js`: fail-closed pattern deduplicato.
Demo: Pino (Milano site_id aggiunto), Maria (employee_id reale aggiunto), Lucia (rimossa).
- [x] Helper unico `utils/queryScope.js` → `buildScopedFilters(req.user, filters)` fail-closed by design
- [x] Test: queryScope.test.js matrice unit (13/13) + checkins-rbac.test.js integrazione (8/8)
- [x] Demo account fix in auth.js DEMO_USERS
- [x] Refactor checkins GET + /stats, export GET, presences /summary con helper
- ✅ Completato 2026-06-12 — 235/235 test verde | Spec: `docs/superpowers/specs/2026-06-12-rbac-fail-closed-design.md` | Commits: [list commits]
```

- [ ] **Step 2: Commit and push**

```bash
git add TASKS.md
git commit -m "docs: mark S.32.2 complete in TASKS.md

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 3: Wait for deploy and verify production health**

Wait ~3-5 minutes for GitHub Actions to complete (same workflow chain as S.32.1). Then:

```bash
curl -s --max-time 15 https://api.dataxiom.it/health | head -c 200
```

Expected: `{"status":"ok",...,"database":"connected"...}` (HTTP 200).

- [ ] **Step 4: Quick functional test in production**

Test that demo account Pino (manager without site_id in old code, with Milano site_id now) can now access `/api/checkins` without 403:

```bash
PW=$(aws ssm get-parameter --name /badge/production/DEMO_PINO_PASSWORD --with-decryption --region eu-west-1 --query Parameter.Value --output text)
TOKEN=$(curl -s -X POST https://api.dataxiom.it/api/v1/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"pino@badge.local\",\"password\":\"$PW\"}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"])')
curl -s -w "HTTP %{http_code}\n" "https://api.dataxiom.it/api/v1/checkins" -H "Authorization: Bearer $TOKEN" | head -c 100
```

Expected: HTTP 200 (no 403 `NO_SITE_ASSIGNED`).
