# Admin RBAC Cross-Tenant Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the HIGH-severity cross-tenant disclosure on `/api/admin/*` (any `role==='admin'` of any real tenant can today see/modify every other tenant's clients, sites, and employees) by introducing a `superadmin` role for Dataxiom staff and scoping every `admin`-facing route to the caller's own `client_id`, rolled out in two independent deploys to eliminate sequencing risk.

**Architecture:** Additive migration adds `'superadmin'` to the existing `employees.role` CHECK constraint. Phase 1 (this plan's Tasks 1-3) ships the role recognition with zero behavior change for existing `admin` accounts, then a manual production step promotes the real Dataxiom back-office account(s) to `superadmin`. Phase 2 (Tasks 4-7) then restricts `admin` to `client_id`-scoped behavior on every route that today has none, while `superadmin` keeps the exact behavior `admin` has today. Full design rationale: `docs/superpowers/specs/2026-07-16-admin-rbac-tenant-scoping-design.md`.

**Tech Stack:** Node.js/Express, PostgreSQL (raw `pg` queries, no ORM), Zod validation, Jest + Supertest for integration tests against a real local Postgres (`badge_system_test`), following the exact test conventions already used in `backend/src/__tests__/admin-demo-tenants-integration.test.js`.

---

## Before starting: create the isolated worktree

This is independent work from any other in-flight branch. Create a fresh worktree via `superpowers:using-git-worktrees` before Task 1:

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge"
git checkout main && git pull --ff-only
git worktree add .claude/worktrees/admin-rbac-tenant-scoping -b worktree-admin-rbac-tenant-scoping main
cd .claude/worktrees/admin-rbac-tenant-scoping
```

All file paths below are relative to this worktree root.

---

### Task 1: Migration 031 — add `superadmin` to the `employees.role` CHECK constraint

**Files:**
- Create: `backend/migrations/031_add_superadmin_role.sql`
- Modify: `backend/__tests__/migrations.test.js`
- Create: `backend/src/__tests__/employee-role-superadmin-constraint.test.js`

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 031: Add 'superadmin' role for Dataxiom staff cross-tenant onboarding
--
-- Part of the RBAC cross-tenant scoping fix (see
-- docs/superpowers/specs/2026-07-16-admin-rbac-tenant-scoping-design.md).
-- Additive only — existing 'employee'/'manager'/'admin'/'viewer' rows and
-- behavior are entirely unaffected by this migration alone.
--
-- Phase 1 of a deliberate 2-phase rollout: this migration and the code that
-- recognizes 'superadmin' (Task 2) ship together with ZERO change to
-- existing 'admin' behavior on any route. Restricting 'admin' to its own
-- client_id happens in a later, separate deploy (Task 4-7), only after the
-- real Dataxiom back-office account(s) have been promoted to 'superadmin'
-- in production (manual step, Task 3) — promoting an account to
-- 'superadmin' BEFORE this migration + Task 2 are deployed would lock that
-- account out of all of /api/admin/* (the current gate only recognizes
-- 'admin'), so migration ordering matters.

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('employee', 'manager', 'admin', 'viewer', 'superadmin'));
```

- [ ] **Step 2: Add file-content test (matches existing convention for migrations 028/029)**

Add to the end of `backend/__tests__/migrations.test.js`:

```javascript
describe('Migration 031: superadmin role', () => {
  const migrationPath = path.join(__dirname, '..', 'migrations', '031_add_superadmin_role.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('drops and re-adds employees_role_check idempotently', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS employees_role_check');
    expect(sql).toContain('ADD CONSTRAINT employees_role_check');
  });

  it('preserves all 4 existing roles and adds superadmin', () => {
    expect(sql).toContain("'employee'");
    expect(sql).toContain("'manager'");
    expect(sql).toContain("'admin'");
    expect(sql).toContain("'viewer'");
    expect(sql).toContain("'superadmin'");
  });
});
```

- [ ] **Step 3: Apply the migration locally and verify idempotency**

```bash
cd backend
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=badge_system node scripts/run-migrations.js
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=badge_system_test node scripts/run-migrations.js
```

Expected: both runs report migration `031_add_superadmin_role.sql` applied (exit code 0). Re-run the same two commands a second time — expected: both report "up to date" / no pending migrations, no error (idempotency check required by every migration in this project).

- [ ] **Step 4: Write a real-DB constraint test**

Create `backend/src/__tests__/employee-role-superadmin-constraint.test.js`:

```javascript
'use strict';

const { Pool } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('employees.role CHECK constraint (migration 031)', () => {
  let pool;
  let dbAvailable = false;
  let clientId;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[employee-role-superadmin-constraint.test] Skipping — could not connect: ${err.message}`);
      return;
    }
    const clientResult = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Role Constraint Test Co', $1, 'starter', false)
       RETURNING id`,
      [`role-constraint-${Date.now()}@example.invalid`]
    );
    clientId = clientResult.rows[0].id;
  });

  afterAll(async () => {
    if (dbAvailable) {
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
      await pool.end();
    }
  });

  it('accepts role = superadmin', async () => {
    if (!dbAvailable) return;
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites)
       VALUES ($1, $2, 'Superadmin Test', 'superadmin', '{}')
       RETURNING id, role`,
      [clientId, `superadmin-test-${Date.now()}@example.invalid`]
    );
    expect(result.rows[0].role).toBe('superadmin');
    await pool.query('DELETE FROM employees WHERE id = $1', [result.rows[0].id]);
  });

  it('still rejects an arbitrary invalid role string', async () => {
    if (!dbAvailable) return;
    await expect(
      pool.query(
        `INSERT INTO employees (client_id, email, name, role, assigned_sites)
         VALUES ($1, $2, 'Invalid Role Test', 'not_a_real_role', '{}')`,
        [clientId, `invalid-role-test-${Date.now()}@example.invalid`]
      )
    ).rejects.toThrow(/violates check constraint/);
  });
});
```

- [ ] **Step 5: Run the new tests**

```bash
cd backend
NODE_ENV=test npx jest employee-role-superadmin-constraint migrations.test.js --runInBand
```

Expected: all tests PASS (0 failures).

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/031_add_superadmin_role.sql backend/__tests__/migrations.test.js backend/src/__tests__/employee-role-superadmin-constraint.test.js
git commit -m "feat(rbac): add superadmin role to employees.role constraint (migration 031)"
```

---

### Task 2: `requireSuperadmin` middleware + shared gate recognizes `superadmin` (Phase 1, additive — no behavior change for `admin`)

**Files:**
- Create: `backend/src/middleware/requireSuperadmin.js`
- Modify: `backend/src/routes/admin.js:127-132` (the shared blanket gate)
- Create: `backend/src/__tests__/require-superadmin.test.js`

- [ ] **Step 1: Write the failing unit test**

Create `backend/src/__tests__/require-superadmin.test.js`:

```javascript
'use strict';

const { requireSuperadmin } = require('../middleware/requireSuperadmin');

describe('requireSuperadmin middleware', () => {
  function makeReqRes(role) {
    const req = { user: { role } };
    const res = {};
    const next = jest.fn();
    return { req, res, next };
  }

  it('calls next() with no error when role is superadmin', () => {
    const { req, res, next } = makeReqRes('superadmin');
    requireSuperadmin(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(err) with a 403 ForbiddenError when role is admin', () => {
    const { req, res, next } = makeReqRes('admin');
    requireSuperadmin(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('SUPERADMIN_REQUIRED');
  });

  it('calls next(err) with a 403 ForbiddenError when role is manager', () => {
    const { req, res, next } = makeReqRes('manager');
    requireSuperadmin(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend
NODE_ENV=test npx jest require-superadmin.test.js
```

Expected: FAIL with "Cannot find module '../middleware/requireSuperadmin'".

- [ ] **Step 3: Write the middleware**

Create `backend/src/middleware/requireSuperadmin.js`:

```javascript
'use strict';

/**
 * Middleware: requireSuperadmin
 *
 * Fail-closed guard for the /api/admin/* sub-routes that must remain
 * exclusive to Dataxiom staff: cross-tenant onboarding (create/list/delete
 * any client, create sites/employees for an arbitrary client_id) and
 * viewing the demo-tenants list. Must run after requireAuth AND after
 * routes/admin.js's shared blanket gate (which accepts both 'admin' and
 * 'superadmin' so both roles enter the /api/admin namespace) — this
 * middleware narrows further to 'superadmin' only, mounted explicitly on
 * the specific routes that need it.
 *
 * See docs/superpowers/specs/2026-07-16-admin-rbac-tenant-scoping-design.md.
 */

const { ForbiddenError } = require('../utils/errors');

function requireSuperadmin(req, res, next) {
  if (req.user.role !== 'superadmin') {
    return next(new ForbiddenError('This operation requires Dataxiom staff access', 'SUPERADMIN_REQUIRED'));
  }
  next();
}

module.exports = { requireSuperadmin };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend
NODE_ENV=test npx jest require-superadmin.test.js
```

Expected: PASS (3/3).

- [ ] **Step 5: Update the shared gate in `routes/admin.js` to also accept `superadmin`**

In `backend/src/routes/admin.js`, find:

```javascript
// All routes below are admin-only
router.use((req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new ForbiddenError('Admin access required', 'ADMIN_REQUIRED'));
  }
  next();
});
```

Replace with:

```javascript
// All routes below are admin-only (admin OR superadmin — individual routes
// below narrow further to requireSuperadmin where cross-tenant access is
// needed; see requireSuperadmin.js).
router.use((req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return next(new ForbiddenError('Admin access required', 'ADMIN_REQUIRED'));
  }
  next();
});
```

- [ ] **Step 6: Run the full backend suite to confirm zero regressions**

```bash
cd backend
PGPASSWORD=postgres psql -h localhost -U postgres -d badge_system_test -c "DELETE FROM revoked_tokens WHERE user_id = '550e8400-e29b-41d4-a716-446655440010'; DELETE FROM used_tokens WHERE user_id = '550e8400-e29b-41d4-a716-446655440010';"
NODE_ENV=test npx jest --runInBand --forceExit
```

Expected: same pass count as the pre-Task-2 baseline (no new failures) — this step changes the gate condition but every existing test still authenticates as `role==='admin'`, so nothing should differ yet.

- [ ] **Step 7: Commit**

```bash
git add backend/src/middleware/requireSuperadmin.js backend/src/routes/admin.js backend/src/__tests__/require-superadmin.test.js
git commit -m "feat(rbac): recognize superadmin role in shared /api/admin gate (Phase 1, no behavior change for admin)"
```

---

### Task 3: Phase 1 deploy + production promotion checklist (manual — not executed by the implementer subagent)

This task has no code changes. It is a checklist for the human operator (Diego) to execute after Tasks 1-2 are deployed to production, before Task 4 begins. **The implementer subagent must stop here and report this checklist back rather than executing any of these steps itself** — they touch production data and a real deploy, both outside the scope of an autonomous coding task.

- [ ] **Step 1: Deploy Tasks 1-2 to production** via the project's existing `/deploy` skill or documented deploy procedure (see `CLAUDE.md` deployment notes / `feedback_deployment_procedure` memory). This deploy applies migration 031 and the gate change — by design, zero observable behavior change for any existing account.

- [ ] **Step 2: Run the production audit query** (read-only, safe):

```sql
SELECT id, client_id, email, name, created_at
FROM employees
WHERE role = 'admin'
ORDER BY client_id, created_at;
```

- [ ] **Step 3: For each row returned, decide with the user**: is this a Dataxiom staff account (operates the `AdminPage` back-office across tenants) or a real customer's own admin (should stay scoped to their own tenant after Task 4-7)? Record the decision.

- [ ] **Step 4: Promote the identified Dataxiom accounts** (reversible):

```sql
UPDATE employees SET role = 'superadmin' WHERE id = '<uuid identified in Step 3>';
```

- [ ] **Step 5: Verify in production** — log in with the promoted account, click every tab of the `AdminPage` (Clients / Sites / Employees / Viewers / Settings). Expected: identical behavior to before Step 1 (this is still Phase 1 — no route has been restricted yet). If anything differs, the bug is in the Task 2 gate change, not in scoping (which doesn't exist yet) — stop and investigate before proceeding to Task 4.

- [ ] **Step 6: Confirm and record** which account(s) are now `superadmin` before continuing to Task 4 — Task 8's final verification will need to log in as one of them.

---

### Task 4: Scope `routes/admin/clients.js` (Phase 2 — the security fix, part 1 of 4)

**Files:**
- Modify: `backend/src/routes/admin/clients.js`
- Test: `backend/src/__tests__/admin-clients-scoping.test.js` (new)

- [ ] **Step 1: Write the failing integration tests**

Create `backend/src/__tests__/admin-clients-scoping.test.js`:

```javascript
'use strict';

/**
 * Integration tests: RBAC cross-tenant scoping on /api/v1/admin/clients
 * (Task 4 of the admin-rbac-tenant-scoping plan).
 *
 * Real-Postgres tests, same pattern as admin-demo-tenants-integration.test.js:
 * dbAvailable soft-skip, real JWT signing, real rows via SQL — no mocks.
 */

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('RBAC scoping: /api/v1/admin/clients', () => {
  jest.setTimeout(30000);

  let pool;
  let dbAvailable = false;
  let request;
  let app;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[admin-clients-scoping.test] Skipping — could not connect: ${err.message}`);
    }
    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      const { closePool } = require('../db/pool');
      await closePool();
    }
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function makeClient(email) {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Scoping Test Co', $1, 'starter', false)
       RETURNING id`,
      [email]
    );
    return result.rows[0].id;
  }

  function tokenFor({ client_id, role }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-user', client_id, role, name: 'Test' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  let clientA, clientB, emailA, emailB;

  beforeEach(async () => {
    if (!dbAvailable) return;
    emailA = uniqueEmail('clients-scoping-a');
    emailB = uniqueEmail('clients-scoping-b');
    clientA = await makeClient(emailA);
    clientB = await makeClient(emailB);
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = ANY($1::uuid[])', [[clientA, clientB]]);
  });

  it('GET /admin/clients: admin sees ONLY their own client, not others', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app).get('/api/v1/admin/clients').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(clientA);
  });

  it('GET /admin/clients: superadmin sees all clients, including both test clients', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const res = await request(app).get('/api/v1/admin/clients').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([clientA, clientB]));
  });

  it('POST /admin/clients: admin gets 403 SUPERADMIN_REQUIRED', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Co', email: uniqueEmail('new-co'), plan: 'starter' });
    expect(res.status).toBe(403);
    expect(res.body.error?.code || res.body.code).toBe('SUPERADMIN_REQUIRED');
  });

  it('POST /admin/clients: superadmin can create a new client', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const newEmail = uniqueEmail('new-co-superadmin');
    const res = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Co', email: newEmail, plan: 'starter' });
    expect(res.status).toBe(201);
    await pool.query('DELETE FROM clients WHERE email = $1', [newEmail]);
  });

  it('DELETE /admin/clients/:id: admin gets 403 SUPERADMIN_REQUIRED, even for their own client', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .delete(`/api/v1/admin/clients/${clientA}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('DELETE /admin/clients/:id: superadmin can delete any client', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const res = await request(app)
      .delete(`/api/v1/admin/clients/${clientB}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    clientB = null; // already deleted, skip in afterEach cleanup
    const check = await pool.query('SELECT id FROM clients WHERE id = $1', [clientA]); // keep afterEach's ANY() array valid
    void check;
  });
});
```

Adjust the last test's cleanup: since `clientB` is deleted by the test itself, guard `afterEach` against a already-deleted id (the `DELETE ... WHERE id = ANY(...)` is a no-op for a missing id, so no change needed there — no further action required).

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
NODE_ENV=test npx jest admin-clients-scoping.test.js --runInBand
```

Expected: FAIL — `GET /admin/clients: admin sees ONLY their own client` fails because today it returns both clients; `POST`/`DELETE` "admin gets 403" tests fail because today they succeed instead.

- [ ] **Step 3: Modify `backend/src/routes/admin/clients.js`**

Add the import at the top (after existing requires):

```javascript
const { requireSuperadmin } = require('../../middleware/requireSuperadmin');
```

Change the `POST /` handler's signature to add the guard:

```javascript
router.post('/', requireSuperadmin, createValidationMiddleware(AdminClientSchema), async (req, res, next) => {
```

Change the `GET /` handler:

```javascript
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.user.role !== 'superadmin') {
      params.push(req.user.client_id);
      where = 'WHERE c.id = $1';
    }
    const result = await pool.query(
      `SELECT c.id, c.name, c.email, c.plan, c.created_at,
              c.meal_voucher_hours, c.geofencing_feature_enabled,
              COUNT(DISTINCT s.id) AS site_count,
              COUNT(DISTINCT e.id) AS employee_count
       FROM clients c
       LEFT JOIN sites s ON s.client_id = c.id
       LEFT JOIN employees e ON e.client_id = c.id
       ${where}
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT 500`,
      params
    );
    res.json({ success: true, data: result.rows, returned: result.rows.length });
  } catch (err) {
    next(err);
  }
});
```

Change the `DELETE /:id` handler's signature:

```javascript
router.delete('/:id', requireSuperadmin, async (req, res, next) => {
```

(The body of `DELETE /:id` is otherwise unchanged — `requireSuperadmin` already rejects any non-superadmin before the handler body runs, so no `client_id` scoping is needed inside it.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
NODE_ENV=test npx jest admin-clients-scoping.test.js --runInBand
```

Expected: PASS (6/6).

- [ ] **Step 5: Run the full backend suite for regressions**

```bash
cd backend
PGPASSWORD=postgres psql -h localhost -U postgres -d badge_system_test -c "DELETE FROM revoked_tokens WHERE user_id = '550e8400-e29b-41d4-a716-446655440010'; DELETE FROM used_tokens WHERE user_id = '550e8400-e29b-41d4-a716-446655440010';"
NODE_ENV=test npx jest --runInBand --forceExit
```

Expected: no new failures beyond the known pre-existing skip count.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin/clients.js backend/src/__tests__/admin-clients-scoping.test.js
git commit -m "fix(rbac): scope GET/POST/DELETE /admin/clients to caller's own tenant (Phase 2, part 1/4)"
```

---

### Task 5: Scope `routes/admin/sites.js` (Phase 2, part 2 of 4)

**Files:**
- Modify: `backend/src/routes/admin/sites.js`
- Test: `backend/src/__tests__/admin-sites-scoping.test.js` (new)

- [ ] **Step 1: Write the failing integration tests**

Create `backend/src/__tests__/admin-sites-scoping.test.js`:

```javascript
'use strict';

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('RBAC scoping: /api/v1/admin/sites', () => {
  jest.setTimeout(30000);

  let pool;
  let dbAvailable = false;
  let request;
  let app;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[admin-sites-scoping.test] Skipping — could not connect: ${err.message}`);
    }
    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      const { closePool } = require('../db/pool');
      await closePool();
    }
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function makeClient(email) {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Sites Scoping Co', $1, 'starter', false)
       RETURNING id`,
      [email]
    );
    return result.rows[0].id;
  }

  async function makeSite(clientId, name) {
    const result = await pool.query(
      `INSERT INTO sites (id, client_id, name, qr_code_content)
       VALUES (uuid_generate_v4(), $1, $2, 'badge://test')
       RETURNING id`,
      [clientId, name]
    );
    return result.rows[0].id;
  }

  function tokenFor({ client_id, role }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-user', client_id, role, name: 'Test' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  let clientA, clientB, siteA, siteB;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientA = await makeClient(uniqueEmail('sites-scoping-a'));
    clientB = await makeClient(uniqueEmail('sites-scoping-b'));
    siteA = await makeSite(clientA, 'Site A');
    siteB = await makeSite(clientB, 'Site B');
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = ANY($1::uuid[])', [[clientA, clientB]]);
  });

  it('GET /admin/sites: admin sees ONLY their own sites, query client_id param is ignored', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/admin/sites?client_id=${clientB}`) // attempt to request another tenant's sites
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((s) => s.id)).toEqual([siteA]);
  });

  it('GET /admin/sites: superadmin sees all sites when no filter given', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const res = await request(app).get('/api/v1/admin/sites').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([siteA, siteB]));
  });

  it('POST /admin/sites: admin creating a site with a foreign client_id is silently forced to their own tenant', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientB, name: 'Injected Site' }); // attempt to create a site for clientB
    expect(res.status).toBe(201);
    expect(res.body.data.client_id).toBe(clientA); // forced to caller's own tenant, not clientB
    await pool.query('DELETE FROM sites WHERE id = $1', [res.body.data.id]);
  });

  it('POST /admin/sites: superadmin can create a site for an arbitrary client_id', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const res = await request(app)
      .post('/api/v1/admin/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientB, name: 'Superadmin Site' });
    expect(res.status).toBe(201);
    expect(res.body.data.client_id).toBe(clientB);
    await pool.query('DELETE FROM sites WHERE id = $1', [res.body.data.id]);
  });

  it('DELETE /admin/sites/:id: admin cannot delete another tenant\'s site (404)', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .delete(`/api/v1/admin/sites/${siteB}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400); // matches existing ValidationError('Site not found') behavior, unchanged
    const check = await pool.query('SELECT id FROM sites WHERE id = $1', [siteB]);
    expect(check.rowCount).toBe(1); // still exists
  });

  it('DELETE /admin/sites/:id: admin CAN delete their own site', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .delete(`/api/v1/admin/sites/${siteA}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/sites/:id: superadmin can delete any site', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const res = await request(app)
      .delete(`/api/v1/admin/sites/${siteB}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
NODE_ENV=test npx jest admin-sites-scoping.test.js --runInBand
```

Expected: FAIL on the scoping-dependent assertions (today's code ignores tenant boundaries entirely).

- [ ] **Step 3: Modify `backend/src/routes/admin/sites.js`**

Replace the `POST /` handler body:

```javascript
router.post('/', createValidationMiddleware(AdminSiteSchema), async (req, res, next) => {
  try {
    const data = req.validated.body;
    const targetClientId = req.user.role === 'superadmin' ? data.client_id : req.user.client_id;

    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [targetClientId]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    const siteId = randomUUID();
    const qrContent = `badge://checkin?site_id=${siteId}&client_id=${targetClientId}&v=1`;

    const result = await pool.query(
      `INSERT INTO sites (id, client_id, name, location, qr_code_content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, client_id, name, location, qr_code_content, created_at`,
      [siteId, targetClientId, data.name, data.location || null, qrContent]
    );

    const site = result.rows[0];
    logger.info({ action: 'admin_create_site', site_id: site.id, client_id: targetClientId });
    await logAudit(pool, {
      action: 'admin_create_site',
      entity: 'site',
      entityId: site.id,
      clientId: site.client_id,
      oldValue: null,
      newValue: { name: site.name, location: site.location, client_id: site.client_id },
      userId: req.user.user_id,
    });

    res.status(201).json({ success: true, data: site });
  } catch (err) {
    next(err);
  }
});
```

Replace the `GET /` handler body:

```javascript
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.user.role === 'superadmin') {
      const { client_id } = req.query;
      if (client_id) {
        const uuidCheck = z.string().uuid().safeParse(client_id);
        if (!uuidCheck.success) return next(new ValidationError('Invalid client_id format'));
        params.push(client_id);
        where = 'WHERE s.client_id = $1';
      }
    } else {
      params.push(req.user.client_id);
      where = 'WHERE s.client_id = $1';
    }
    const result = await pool.query(
      `SELECT s.id, s.client_id, s.name, s.location, s.qr_code_content, s.created_at,
              s.latitude, s.longitude, s.geofence_radius_meters, s.geofence_enabled,
              c.name AS client_name, c.geofencing_feature_enabled
       FROM sites s
       JOIN clients c ON c.id = s.client_id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT 500`,
      params
    );
    res.json({ success: true, data: result.rows, returned: result.rows.length });
  } catch (err) {
    next(err);
  }
});
```

Replace the `DELETE /:id` handler body:

```javascript
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uuidCheck = z.string().uuid().safeParse(id);
    if (!uuidCheck.success) return next(new ValidationError('Invalid site id'));

    const isSuperadmin = req.user.role === 'superadmin';
    const params = isSuperadmin ? [id] : [id, req.user.client_id];
    const scopeClause = isSuperadmin ? '' : 'AND client_id = $2::uuid';

    const result = await pool.query(
      `DELETE FROM sites WHERE id = $1 ${scopeClause} RETURNING id, name, client_id`,
      params
    );
    if (result.rowCount === 0) return next(new ValidationError('Site not found'));

    const site = result.rows[0];
    await logAudit(pool, {
      action: 'admin_delete_site',
      entity: 'site',
      entityId: site.id,
      clientId: site.client_id,
      oldValue: { name: site.name },
      newValue: null,
      userId: req.user.user_id,
    }).catch((err) => logger.warn({ action: 'audit_log_failed', error: err.message }));

    logger.info({ action: 'admin_delete_site', site_id: site.id, name: site.name });
    res.json({ success: true, message: `Sede "${site.name}" eliminata.` });
  } catch (err) {
    next(err);
  }
});
```

(`PUT /:id` for geofence is already scoped by `client_id` — no change.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
NODE_ENV=test npx jest admin-sites-scoping.test.js --runInBand
```

Expected: PASS (7/7).

- [ ] **Step 5: Run the full backend suite for regressions**

```bash
cd backend
NODE_ENV=test npx jest --runInBand --forceExit
```

Expected: no new failures.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin/sites.js backend/src/__tests__/admin-sites-scoping.test.js
git commit -m "fix(rbac): scope POST/GET/DELETE /admin/sites to caller's own tenant (Phase 2, part 2/4)"
```

---

### Task 6: Scope `routes/admin/employees.js` (Phase 2, part 3 of 4)

**Files:**
- Modify: `backend/src/routes/admin/employees.js`
- Test: `backend/src/__tests__/admin-employees-scoping.test.js` (new)

- [ ] **Step 1: Write the failing integration tests**

Create `backend/src/__tests__/admin-employees-scoping.test.js`:

```javascript
'use strict';

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('RBAC scoping: /api/v1/admin/employees', () => {
  jest.setTimeout(30000);

  let pool;
  let dbAvailable = false;
  let request;
  let app;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[admin-employees-scoping.test] Skipping — could not connect: ${err.message}`);
    }
    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      const { closePool } = require('../db/pool');
      await closePool();
    }
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function makeClient(email) {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Employees Scoping Co', $1, 'starter', false)
       RETURNING id`,
      [email]
    );
    return result.rows[0].id;
  }

  async function makeSite(clientId) {
    const result = await pool.query(
      `INSERT INTO sites (id, client_id, name, qr_code_content)
       VALUES (uuid_generate_v4(), $1, 'Site', 'badge://test')
       RETURNING id`,
      [clientId]
    );
    return result.rows[0].id;
  }

  function tokenFor({ client_id, role }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-user', client_id, role, name: 'Test' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  let clientA, clientB, siteA;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientA = await makeClient(uniqueEmail('employees-scoping-a'));
    clientB = await makeClient(uniqueEmail('employees-scoping-b'));
    siteA = await makeSite(clientA);
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = ANY($1::uuid[])', [[clientA, clientB]]);
  });

  it('POST /admin/employees: admin creating with a foreign client_id is silently forced to their own tenant', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientB, // attempt to inject a foreign tenant
        email: uniqueEmail('injected-employee'),
        name: 'Injected Employee',
        role: 'employee',
        assigned_sites: [siteA],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.client_id).toBe(clientA);
    await pool.query('DELETE FROM employees WHERE id = $1', [res.body.data.id]);
  });

  it('GET /admin/employees: admin sees ONLY their own employees, query client_id param is ignored', async () => {
    if (!dbAvailable) return;
    const empEmail = uniqueEmail('employees-scoping-own');
    const empResult = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites)
       VALUES ($1, $2, 'Own Employee', 'employee', $3::uuid[])
       RETURNING id`,
      [clientA, empEmail, [siteA]]
    );
    const otherEmail = uniqueEmail('employees-scoping-other');
    await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites)
       VALUES ($1, $2, 'Other Employee', 'employee', '{}')`,
      [clientB, otherEmail]
    );

    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/admin/employees?client_id=${clientB}`) // attempt to request another tenant's employees
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((e) => e.id)).toEqual([empResult.rows[0].id]);
  });

  it('GET /admin/employees: superadmin can filter by an arbitrary client_id', async () => {
    if (!dbAvailable) return;
    const otherEmail = uniqueEmail('employees-scoping-superadmin');
    await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites)
       VALUES ($1, $2, 'Superadmin View Employee', 'employee', '{}')`,
      [clientB, otherEmail]
    );

    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const res = await request(app)
      .get(`/api/v1/admin/employees?client_id=${clientB}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((e) => e.client_id === clientB)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
NODE_ENV=test npx jest admin-employees-scoping.test.js --runInBand
```

Expected: FAIL (today, `client_id` in the body/query is trusted as-is).

- [ ] **Step 3: Modify `backend/src/routes/admin/employees.js`**

Replace the start of the `POST /` handler (everything up to and including the `clientCheck`/`siteCheck`/`ownedSites` block, keep the rest — password hashing, INSERT, audit log, response — unchanged except substituting `data.client_id` with `targetClientId` in the INSERT params array):

```javascript
router.post('/', createValidationMiddleware(AdminEmployeeSchema), async (req, res, next) => {
  try {
    const data = req.validated.body;
    const targetClientId = req.user.role === 'superadmin' ? data.client_id : req.user.client_id;

    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [targetClientId]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    if (data.site_id) {
      const siteCheck = await pool.query(
        'SELECT id FROM sites WHERE id = $1 AND client_id = $2',
        [data.site_id, targetClientId]
      );
      if (siteCheck.rowCount === 0) return next(new ValidationError('Site not found for this client'));
    }

    if (data.assigned_sites.length > 0) {
      const ownedSites = await pool.query(
        'SELECT id FROM sites WHERE id = ANY($1::UUID[]) AND client_id = $2',
        [data.assigned_sites, targetClientId]
      );
      if (ownedSites.rowCount !== data.assigned_sites.length) {
        return next(new ValidationError('One or more assigned_sites do not belong to this client'));
      }
    }

    const tempPassword = data.password || generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::UUID[])
       RETURNING id, client_id, email, name, phone, role, site_id, assigned_sites, created_at`,
      [targetClientId, data.email, data.name, data.phone || null,
        data.role, data.site_id || null, passwordHash, data.assigned_sites]
    );

    const employee = result.rows[0];
    logger.info({ action: 'admin_create_employee', employee_id: employee.id, client_id: targetClientId });
    await logAudit(pool, {
      action: 'admin_create_employee',
      entity: 'employee',
      entityId: employee.id,
      clientId: employee.client_id,
      oldValue: null,
      newValue: { name: employee.name, email: employee.email, role: employee.role, client_id: employee.client_id },
      userId: req.user.user_id,
    });

    res.status(201).json({
      success: true,
      data: employee,
      temp_password: data.password ? undefined : tempPassword,
    });
  } catch (err) {
    if (err.code === '23505') return next(new ValidationError('Email already exists for this client'));
    next(err);
  }
});
```

Replace the start of the `POST /import` handler (the `client_id` resolution block only — the rest of the CSV parsing/insertion logic is unchanged):

```javascript
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return next(new ValidationError('CSV file is required'));

    let clientId;
    if (req.user.role === 'superadmin') {
      if (!req.body.client_id) return next(new ValidationError('client_id is required'));
      const uuidCheck = z.string().uuid().safeParse(req.body.client_id);
      if (!uuidCheck.success) return next(new ValidationError('Invalid client_id'));
      clientId = req.body.client_id;
    } else {
      clientId = req.user.client_id;
    }

    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [clientId]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    const csvText = req.file.buffer.toString('utf-8');
    const rows = await parseCsv(csvText);
    // ... rest of the function is unchanged from here (row parsing, hashing, transaction, response)
```

Replace the `GET /` handler:

```javascript
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.user.role === 'superadmin') {
      const { client_id } = req.query;
      if (client_id) {
        const uuidCheck = z.string().uuid().safeParse(client_id);
        if (!uuidCheck.success) return next(new ValidationError('Invalid client_id format'));
        params.push(client_id);
        where = 'WHERE e.client_id = $1';
      }
    } else {
      params.push(req.user.client_id);
      where = 'WHERE e.client_id = $1';
    }
    const result = await pool.query(
      `SELECT e.id, e.client_id, e.email, e.name, e.role, e.phone,
              e.site_id, e.external_employee_id, e.created_at, c.name AS client_name,
              s.name AS site_name
       FROM employees e
       JOIN clients c ON c.id = e.client_id
       LEFT JOIN sites s ON s.id = e.site_id
       ${where}
       ORDER BY e.created_at DESC
       LIMIT 200`,
      params
    );
    res.json({ success: true, data: result.rows, returned: result.rows.length });
  } catch (err) {
    next(err);
  }
});
```

(`DELETE /:id` and `POST /:id/reset-password` already scope by `req.user.client_id` — no change.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
NODE_ENV=test npx jest admin-employees-scoping.test.js --runInBand
```

Expected: PASS (3/3).

- [ ] **Step 5: Run the full backend suite for regressions**, paying particular attention to the existing `admin-csv-import.test.js` (Task's `POST /import` change must not break it — check whether that test authenticates as `superadmin` implicitly via `DISABLE_AUTH` or an explicit admin token; if it uses a plain `admin` token without `client_id` in the form body, it should now succeed via the new `else` branch using `req.user.client_id`, so it must still pass unmodified)

```bash
cd backend
NODE_ENV=test npx jest --runInBand --forceExit
```

Expected: no new failures. If `admin-csv-import.test.js` fails, inspect whether it currently sends an explicit `client_id` in the form body that differs from the test token's `client_id` — if so, update that pre-existing test to match the new scoping rule (send matching `client_id`, or switch its token to `superadmin` if the test's actual intent is to import for an arbitrary client) rather than reverting the scoping fix.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin/employees.js backend/src/__tests__/admin-employees-scoping.test.js
git commit -m "fix(rbac): scope POST/import/GET /admin/employees to caller's own tenant (Phase 2, part 3/4)"
```

---

### Task 7: Restrict `routes/admin/demo-tenants.js` to `superadmin` only (Phase 2, part 4 of 4)

**Files:**
- Modify: `backend/src/routes/admin/demo-tenants.js`
- Modify: `backend/src/__tests__/admin-demo-tenants-integration.test.js` (update the existing "real admin sees the list" test to use `superadmin`, add a new test for "real tenant's plain admin now also gets 403")

- [ ] **Step 1: Update `backend/src/routes/admin/demo-tenants.js`**

Replace the entire file with:

```javascript
'use strict';

/**
 * GET /api/admin/demo-tenants (Task 9 of 9 — Ambiente Demo Self-Service)
 *
 * Read-only operational visibility for Dataxiom staff: lists active/expiring
 * demo tenants so they don't need SSH + psql to check demo status. No
 * "extend"/"cancel now" action here — plan explicitly defers that to a
 * future evolution.
 *
 * RBAC: restricted to role === 'superadmin' only (admin-rbac-tenant-scoping
 * plan, Task 7) — no real customer, whether or not they hold role='admin'
 * on their own tenant, has any legitimate reason to see the list of demo
 * prospects. This replaces the original is_demo-based inline self-check
 * (Task 9 of Ambiente Demo Self-Service), which only closed the narrower
 * case of a demo tenant's own seeded admin — requireSuperadmin subsumes
 * that case entirely (a demo tenant's admin has role='admin', never
 * 'superadmin') while also closing the broader gap for any real tenant's
 * admin.
 */

const express = require('express');
const { pool } = require('../../db/pool');
const { requireSuperadmin } = require('../../middleware/requireSuperadmin');

const router = express.Router();

router.get('/', requireSuperadmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, demo_contact_email, created_at, demo_expires_at
       FROM clients
       WHERE is_demo = true
       ORDER BY demo_expires_at ASC`
    );

    res.json({ success: true, data: result.rows, returned: result.rows.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 2: Update the existing integration test**

In `backend/src/__tests__/admin-demo-tenants-integration.test.js`, change the first test's token role from `'admin'` to `'superadmin'`:

Find:
```javascript
      const token = tokenFor({ user_id: 'real-admin-user', client_id: realClientId, role: 'admin' });
```

Replace with:
```javascript
      const token = tokenFor({ user_id: 'real-admin-user', client_id: realClientId, role: 'superadmin' });
```

Add a new test at the end of the `describe` block, before the closing `});`:

```javascript

  it('a REAL (non-demo) tenant\'s plain admin (role=admin) also gets 403 — only superadmin may view this list', async () => {
    if (!dbAvailable) return;

    const realEmail = uniqueEmail('demo-tenants-real-plain-admin');
    try {
      const realClientId = await makeRealAdminClient(realEmail);
      const token = tokenFor({ user_id: 'real-plain-admin-user', client_id: realClientId, role: 'admin' });

      const res = await request(app)
        .get('/api/v1/admin/demo-tenants')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    } finally {
      await cleanupByEmail(realEmail);
    }
  });
```

- [ ] **Step 3: Run the updated test file**

```bash
cd backend
NODE_ENV=test npx jest admin-demo-tenants-integration.test.js --runInBand
```

Expected: PASS (3/3) — the original "demo tenant's own admin gets 403" test still passes unmodified (a demo tenant's admin has `role==='admin'`, which `requireSuperadmin` rejects just as the old inline check did), the updated "real admin sees the list" test now passes using a `superadmin` token, and the new "plain real admin gets 403" test passes.

- [ ] **Step 4: Run the full backend suite for regressions**

```bash
cd backend
NODE_ENV=test npx jest --runInBand --forceExit
```

Expected: no new failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin/demo-tenants.js backend/src/__tests__/admin-demo-tenants-integration.test.js
git commit -m "fix(rbac): restrict GET /admin/demo-tenants to superadmin only (Phase 2, part 4/4)"
```

---

### Task 8: Full Phase 2 regression pass + production verification checklist

**Files:** none (verification only)

- [ ] **Step 1: Run the complete backend suite one final time**

```bash
cd backend
PGPASSWORD=postgres psql -h localhost -U postgres -d badge_system_test -c "DELETE FROM revoked_tokens WHERE user_id = '550e8400-e29b-41d4-a716-446655440010'; DELETE FROM used_tokens WHERE user_id = '550e8400-e29b-41d4-a716-446655440010';"
NODE_ENV=test npx jest --runInBand --forceExit
```

Expected: 0 failures, same or higher pass count than the pre-Task-1 baseline (563/577 + this plan's ~19 new tests).

- [ ] **Step 2: Explicit non-regression check for the routes that were already scoped before this plan** (must remain byte-for-byte unchanged in behavior):

```bash
cd backend
NODE_ENV=test npx jest admin-viewers admin-dpa --runInBand
```

Expected: PASS, identical results to the pre-Task-1 baseline (these files were never touched by this plan).

- [ ] **Step 3: Run the frontend suite** (no frontend code changed by this plan, but confirms nothing in `AdminPage` broke due to a backend response-shape change):

```bash
cd frontend-web
npm test -- --run
```

Expected: same pass count as baseline.

- [ ] **Step 4: Deploy Phase 2 to production** via the project's existing `/deploy` skill or documented deploy procedure — **manual, not executed by the implementer subagent**.

- [ ] **Step 5: Live production smoke test** (manual, curl-based, same pattern as Session 69's Task 9 verification) — **not executed by the implementer subagent**:
   - Log in as the `superadmin` account promoted in Task 3. Confirm `GET /api/v1/admin/clients` still returns all clients, `AdminPage` still shows every tab correctly.
   - Log in as a real customer's `admin` account (if one exists in production). Confirm `GET /api/v1/admin/clients` now returns only their own client, `GET /api/v1/admin/sites`/`GET /api/v1/admin/employees` only their own rows, `POST /api/v1/admin/clients` and `GET /api/v1/admin/demo-tenants` both return 403.

- [ ] **Step 6: Update `TASKS.md`** — mark the "Namespace `/api/admin/*` non scoped per tenant chiamante" finding (SECURITY TECH DEBT section) as fixed, referencing this plan and the final commit SHA.

- [ ] **Step 7: Final commit** (docs only)

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge"
git add TASKS.md
git commit -m "docs: mark admin RBAC cross-tenant scoping finding as fixed"
```

---

## Self-review notes (from the plan author, before handoff)

- **Spec coverage**: every route listed in the design spec's table (`POST/GET/DELETE /admin/clients`, `POST/GET/DELETE /admin/sites`, `POST/POST-import/GET /admin/employees`, `GET /admin/demo-tenants`) has a corresponding task. The 2-phase rollout (Task 1-3 additive, Task 4-8 restrictive) matches the design spec exactly.
- **Already-scoped routes** (`PUT /admin/sites/:id`, `DELETE /admin/employees/:id`, `reset-password`, DPA, settings, viewers) are explicitly left untouched in every task and get an explicit regression check in Task 8, Step 2 — consistent with the design's "fuori scope" section.
- **No auto-elevation risk**: confirmed `AdminEmployeeSchema`'s `role` field stays `z.enum(['employee', 'manager'])` — this plan does not touch validation.js, so an `admin` still cannot create another `admin` or a `superadmin` via any route.
- **Sequencing risk eliminated by construction**: Task 2 (code recognizes `superadmin`) always ships before Task 3 (production promotion) in commit order and deploy order — the plan cannot be executed out of this order without skipping a task.
