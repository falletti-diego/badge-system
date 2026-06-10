/**
 * Tests: CSV Employee Import — assigned_sites fix verification
 *
 * Verifies fix for critical bug where assigned_sites was NULL despite valid site_name in CSV.
 * Root cause: string interpolation of ARRAY['uuid'::uuid]::uuid[] caused parameter misalignment.
 * Fix: pass assignedSitesArray as native JavaScript array parameter ($6).
 */

jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough };
});

jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../db/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(null),
  closeRedis: jest.fn().mockResolvedValue(undefined),
  isRedisAvailable: jest.fn().mockReturnValue(false),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../app');
const { pool } = require('../db/pool');

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID_TORINO = '550e8400-e29b-41d4-a716-446655440010';
const SITE_ID_MILANO = '550e8400-e29b-41d4-a716-446655440011';

beforeAll(() => {
  process.env.DISABLE_AUTH = 'true';
});
afterAll(() => {
  process.env.DISABLE_AUTH = 'true';
  jest.clearAllMocks();
});
beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// Helpers
// =====================================================

/**
 * Setup pool mocks for CSV import route.
 *
 * The route makes these pool.query calls (in order, all on pool directly):
 *   1. SELECT id FROM clients WHERE id = $1        → client validation
 *   2. SELECT id, name FROM sites WHERE client_id  → prefetch all sites
 *
 * Then pool.connect() → returns a pgClient for the transaction:
 *   3. BEGIN
 *   4. INSERT INTO employees … per row
 *   5. INSERT INTO audit_log … per row (best-effort)
 *   6. COMMIT
 */
function setupImportMocks({ sitesRows, insertRows, auditShouldFail = false }) {
  // pool.query calls (no transaction)
  pool.query
    .mockResolvedValueOnce({ rows: [{ id: CLIENT_ID }], rowCount: 1 })    // 1. client check
    .mockResolvedValueOnce({ rows: sitesRows, rowCount: sitesRows.length }); // 2. sites prefetch

  // Insert audit log mock after each INSERT (if insert succeeded)
  const pgQueryWithAudit = [];
  pgQueryWithAudit.push({ rows: [], rowCount: 0 }); // BEGIN
  for (const ins of insertRows) {
    pgQueryWithAudit.push(ins); // INSERT
    if (ins.rowCount > 0) {
      if (auditShouldFail) {
        pgQueryWithAudit.push(Promise.reject(new Error('audit error'))); // audit fail (best-effort)
      } else {
        pgQueryWithAudit.push({ rows: [{ id: 'audit-id' }], rowCount: 1 }); // audit log
      }
    }
  }
  pgQueryWithAudit.push({ rows: [], rowCount: 0 }); // COMMIT

  const pgClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  pgQueryWithAudit.forEach((val) => {
    if (val instanceof Promise) {
      pgClient.query.mockRejectedValueOnce(new Error('audit error'));
    } else {
      pgClient.query.mockResolvedValueOnce(val);
    }
  });
  pool.connect.mockResolvedValueOnce(pgClient);

  return pgClient;
}

// =====================================================
// POST /api/v1/admin/employees/import — CSV import
// =====================================================

describe('POST /api/v1/admin/employees/import — assigned_sites population', () => {

  test('inserts assigned_sites as parameterized array (not string interpolation)', async () => {
    const pgClient = setupImportMocks({
      sitesRows: [{ id: SITE_ID_TORINO, name: 'Torino' }],
      insertRows: [{
        rows: [{ id: 'emp-uuid-1', client_id: CLIENT_ID, email: 'emp1@test.com', name: 'Emp One', role: 'employee' }],
        rowCount: 1,
      }],
    });

    const csvContent = 'email,name,phone,role,site_name\nemp1@test.com,Emp One,3391234567,employee,Torino\n';

    const res = await request(app)
      .post('/api/v1/admin/employees/import')
      .field('client_id', CLIENT_ID)
      .attach('file', Buffer.from(csvContent), 'employees.csv');

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);

    // Find the INSERT call on the transaction client
    const insertCall = pgClient.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO employees')
    );
    expect(insertCall).toBeDefined();

    const [insertSql, insertParams] = insertCall;

    // SQL must use $6 placeholder (not string interpolation for assigned_sites)
    expect(insertSql).toMatch(/VALUES\s*\(\$1,\s*\$2,\s*\$3,\s*\$4,\s*\$5,\s*\$6,\s*\$7,\s*\$8\)/);
    expect(insertSql).not.toContain('ARRAY['); // No string-interpolated array syntax

    // $6 (index 5) must be a JavaScript array containing the site UUID
    const assignedSitesParam = insertParams[5];
    expect(Array.isArray(assignedSitesParam)).toBe(true);
    expect(assignedSitesParam).toEqual([SITE_ID_TORINO]);

    // $7 (index 6) must be the bcrypt hash
    const passwordHashParam = insertParams[6];
    expect(typeof passwordHashParam).toBe('string');
    expect(passwordHashParam).toMatch(/^\$2b\$/);
  });

  test('assigned_sites is empty array when site_name not found in CSV row', async () => {
    // Site "NonExistentSite" is not in the client's sites list
    // Route skips the row with an error and counts it as skipped
    setupImportMocks({
      sitesRows: [{ id: SITE_ID_TORINO, name: 'Torino' }], // only Torino exists
      insertRows: [], // no inserts because row is skipped
    });

    const csvContent = 'email,name,phone,role,site_name\nemp2@test.com,Emp Two,3391234568,employee,NonExistentSite\n';

    const res = await request(app)
      .post('/api/v1/admin/employees/import')
      .field('client_id', CLIENT_ID)
      .attach('file', Buffer.from(csvContent), 'employees.csv');

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(0);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.errors[0].error).toContain('NonExistentSite');
  });

  test('imports employee without site_name — assigned_sites is empty array', async () => {
    const pgClient = setupImportMocks({
      sitesRows: [{ id: SITE_ID_TORINO, name: 'Torino' }],
      insertRows: [{
        rows: [{ id: 'emp-uuid-3', client_id: CLIENT_ID, email: 'emp3@test.com', name: 'Emp Three', role: 'employee' }],
        rowCount: 1,
      }],
    });

    const csvContent = 'email,name,phone,role,site_name\nemp3@test.com,Emp Three,3391234569,employee,\n';

    const res = await request(app)
      .post('/api/v1/admin/employees/import')
      .field('client_id', CLIENT_ID)
      .attach('file', Buffer.from(csvContent), 'employees.csv');

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);

    const insertCall = pgClient.query.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO employees')
    );
    expect(insertCall).toBeDefined();

    const assignedSitesParam = insertCall[1][5]; // $6
    expect(Array.isArray(assignedSitesParam)).toBe(true);
    expect(assignedSitesParam.length).toBe(0); // empty, not NULL
  });

  test('duplicate employee (conflict) is counted as skipped', async () => {
    setupImportMocks({
      sitesRows: [{ id: SITE_ID_TORINO, name: 'Torino' }],
      insertRows: [{ rows: [], rowCount: 0 }], // ON CONFLICT DO NOTHING → rowCount 0
    });

    const csvContent = 'email,name,phone,role,site_name\nexisting@test.com,Existing,123,employee,Torino\n';

    const res = await request(app)
      .post('/api/v1/admin/employees/import')
      .field('client_id', CLIENT_ID)
      .attach('file', Buffer.from(csvContent), 'employees.csv');

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(0);
    expect(res.body.data.skipped).toBe(1);
  });

  test('rejects request without client_id', async () => {
    const csvContent = 'email,name,phone,role,site_name\nemp@test.com,Emp,123,employee,Torino\n';

    const res = await request(app)
      .post('/api/v1/admin/employees/import')
      .attach('file', Buffer.from(csvContent), 'employees.csv');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('rejects request without file', async () => {
    const res = await request(app)
      .post('/api/v1/admin/employees/import')
      .field('client_id', CLIENT_ID);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('rejects import for non-existent client', async () => {
    // Client check returns empty
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const csvContent = 'email,name,phone,role,site_name\nemp@test.com,Emp,123,employee,Torino\n';

    const res = await request(app)
      .post('/api/v1/admin/employees/import')
      .field('client_id', CLIENT_ID)
      .attach('file', Buffer.from(csvContent), 'employees.csv');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Client not found/);
  });
});

// =====================================================
// GET /api/v1/admin/debug/employee-assignment/:employeeId
// =====================================================

describe('GET /api/v1/admin/debug/employee-assignment/:employeeId', () => {

  test('returns employee assigned_sites and diagnosis — 1/2 sites match', async () => {
    const employeeId = '550e8400-e29b-41d4-a716-000000000001';

    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: employeeId, client_id: CLIENT_ID, email: 'emp@test.com',
          name: 'Test Emp', role: 'employee', assigned_sites: [SITE_ID_TORINO],
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: SITE_ID_TORINO, name: 'Torino' }, { id: SITE_ID_MILANO, name: 'Milano' }],
        rowCount: 2,
      })
      .mockResolvedValueOnce({ // ANY test Torino → true
        rows: [{ site_id: SITE_ID_TORINO, is_assigned: true, raw_assigned_sites: [SITE_ID_TORINO], any_result: [SITE_ID_TORINO] }],
      })
      .mockResolvedValueOnce({ // ANY test Milano → false
        rows: [{ site_id: SITE_ID_MILANO, is_assigned: false, raw_assigned_sites: [SITE_ID_TORINO], any_result: [SITE_ID_TORINO] }],
      })
      .mockResolvedValueOnce({ // raw DB check
        rows: [{ assigned_sites: [SITE_ID_TORINO], is_null: false, array_length: 1, assigned_sites_text: `{${SITE_ID_TORINO}}` }],
      });

    const res = await request(app)
      .get(`/api/v1/admin/debug/employee-assignment/${employeeId}`);

    expect(res.status).toBe(200);
    expect(res.body.employee.assigned_sites).toEqual([SITE_ID_TORINO]);
    expect(res.body.employee.assigned_sites_is_array).toBe(true);
    expect(res.body.employee.assigned_sites_length).toBe(1);
    expect(res.body.diagnosis.assignment_tests_passed).toBe('1/2');
    expect(res.body.diagnosis.issues[0]).toMatch(/✅/);
  });

  test('diagnosis detects empty assigned_sites — 🟠 warning', async () => {
    const employeeId = '550e8400-e29b-41d4-a716-000000000002';

    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: employeeId, client_id: CLIENT_ID, email: 'e@t.com', name: 'E', role: 'employee', assigned_sites: [] }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: SITE_ID_TORINO, name: 'Torino' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ site_id: SITE_ID_TORINO, is_assigned: false, raw_assigned_sites: [], any_result: [] }] })
      .mockResolvedValueOnce({ rows: [{ assigned_sites: [], is_null: false, array_length: 0, assigned_sites_text: '{}' }] });

    const res = await request(app)
      .get(`/api/v1/admin/debug/employee-assignment/${employeeId}`);

    expect(res.status).toBe(200);
    expect(res.body.diagnosis.summary).toMatch(/🟠.*EMPTY/);
  });

  test('returns 404 for unknown employee', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/admin/debug/employee-assignment/550e8400-e29b-41d4-a716-000000000099');

    expect(res.status).toBe(404);
  });
});
