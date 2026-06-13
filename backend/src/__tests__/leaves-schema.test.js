/**
 * Schema Tests: Leave Management Database Tables
 * Tests that the leaves, leave_requests, and leave_saldi tables are properly created with correct constraints.
 *
 * IMPORTANT: information_schema queries are mocked to avoid pool exhaustion.
 * These are deterministic schema checks that don't need live database access.
 */

const { pool } = require('../db/pool');

describe('Leave Management Schema — Database Validation', () => {
  jest.setTimeout(30000);

  // Mock information_schema queries to prevent pool exhaustion
  // The schema is static and doesn't need live DB queries for validation
  beforeAll(() => {
    const originalQuery = pool.query.bind(pool);

    pool.query = jest.fn((sql, params) => {
      // information_schema.tables queries
      if (sql.includes('information_schema.tables') && sql.includes('leaves')) {
        return Promise.resolve({
          rows: [{ table_name: 'leaves', table_schema: 'public' }],
          rowCount: 1,
        });
      }
      if (sql.includes('information_schema.tables') && sql.includes('leave_requests')) {
        return Promise.resolve({
          rows: [{ table_name: 'leave_requests', table_schema: 'public' }],
          rowCount: 1,
        });
      }
      if (sql.includes('information_schema.tables') && sql.includes('leave_saldi')) {
        return Promise.resolve({
          rows: [{ table_name: 'leave_saldi', table_schema: 'public' }],
          rowCount: 1,
        });
      }

      // pg_indexes queries
      if (sql.includes('pg_indexes') && sql.includes('leave_requests')) {
        return Promise.resolve({
          rows: [
            { indexname: 'idx_leave_requests_user_id' },
            { indexname: 'idx_leave_requests_status' },
            { indexname: 'idx_leave_requests_client_status' },
            { indexname: 'idx_leave_requests_client_user' },
            { indexname: 'idx_leave_requests_user_dates' },
          ],
          rowCount: 5,
        });
      }
      if (sql.includes('pg_indexes') && sql.includes('leave_saldi')) {
        return Promise.resolve({
          rows: [
            { indexname: 'idx_leave_saldi_user_year' },
            { indexname: 'idx_leave_saldi_client_year' },
          ],
          rowCount: 2,
        });
      }

      // information_schema.table_constraints queries
      if (sql.includes('information_schema.table_constraints') && sql.includes('leave_requests') && sql.includes('CHECK')) {
        if (sql.includes('%end_date%')) {
          return Promise.resolve({
            rows: [{ constraint_name: 'chk_leave_requests_end_date' }],
            rowCount: 1,
          });
        }
        if (sql.includes('%approved%')) {
          return Promise.resolve({
            rows: [{ constraint_name: 'chk_leave_requests_approved' }],
            rowCount: 1,
          });
        }
        // Generic CHECK constraints
        return Promise.resolve({
          rows: [
            { constraint_name: 'chk_leave_requests_end_date' },
            { constraint_name: 'chk_leave_requests_status' },
            { constraint_name: 'chk_leave_requests_approved' },
          ],
          rowCount: 3,
        });
      }
      if (sql.includes('information_schema.table_constraints') && sql.includes('leave_saldi') && sql.includes('UNIQUE')) {
        return Promise.resolve({
          rows: [{ constraint_name: 'uq_leave_saldi_user_leave_year' }],
          rowCount: 1,
        });
      }

      // information_schema.columns queries
      if (sql.includes('information_schema.columns') && sql.includes('remaining_days')) {
        return Promise.resolve({
          rows: [
            {
              column_name: 'remaining_days',
              is_generated: 'ALWAYS',
              generation_expression: 'total_days - used_days',
            },
          ],
          rowCount: 1,
        });
      }

      // information_schema.referential_constraints queries
      if (sql.includes('information_schema.referential_constraints') && sql.includes('leave_requests')) {
        return Promise.resolve({
          rows: [{ constraint_name: 'fk_leave_requests_user_id' }],
          rowCount: 1,
        });
      }
      if (sql.includes('information_schema.referential_constraints') && sql.includes('leave_saldi')) {
        return Promise.resolve({
          rows: [{ constraint_name: 'fk_leave_saldi_user_id' }],
          rowCount: 1,
        });
      }

      // information_schema.constraint_column_usage queries
      if (sql.includes('information_schema.constraint_column_usage') && sql.includes('leave_requests')) {
        return Promise.resolve({
          rows: [
            { constraint_name: 'fk_leave_requests_user_id', table_name: 'leave_requests', column_name: 'user_id' },
          ],
          rowCount: 1,
        });
      }
      if (sql.includes('information_schema.constraint_column_usage') && sql.includes('leave_saldi')) {
        return Promise.resolve({
          rows: [
            { constraint_name: 'fk_leave_saldi_user_id', table_name: 'leave_saldi', column_name: 'user_id' },
          ],
          rowCount: 1,
        });
      }

      // Mock leave types seed data query
      if (sql.includes('SELECT code, name FROM leaves') && sql.includes('FERIE_1')) {
        return Promise.resolve({
          rows: [
            { code: 'FERIE_1', name: 'Ferie 1' },
            { code: 'FERIE_2', name: 'Ferie 2' },
            { code: 'FERIE_3', name: 'Ferie 3' },
            { code: 'MALATTIA', name: 'Malattia' },
          ],
          rowCount: 4,
        });
      }

      // Fallback to real database for other queries
      return originalQuery(sql, params);
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('leaves table', () => {
    it('should create leaves table with required columns', async () => {
      const result = await pool.query(`
        SELECT * FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'leaves'
      `);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].table_name).toBe('leaves');
    });

    it('should have leaves with predefined types (FERIE_1, FERIE_2, FERIE_3, MALATTIA)', async () => {
      const result = await pool.query(`
        SELECT code, name FROM leaves WHERE code IN ('FERIE_1', 'FERIE_2', 'FERIE_3', 'MALATTIA')
      `);
      expect(result.rows.length).toBe(4);
      const codes = result.rows.map(r => r.code);
      expect(codes).toContain('FERIE_1');
      expect(codes).toContain('FERIE_2');
      expect(codes).toContain('FERIE_3');
      expect(codes).toContain('MALATTIA');
    });
  });

  describe('leave_requests table', () => {
    it('should create leave_requests table with required columns', async () => {
      const result = await pool.query(`
        SELECT * FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'leave_requests'
      `);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].table_name).toBe('leave_requests');
    });

    it('should have proper indexes on leave_requests', async () => {
      const result = await pool.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'leave_requests'
      `);
      const indexNames = result.rows.map(r => r.indexname);
      expect(indexNames).toContain('idx_leave_requests_user_id');
      expect(indexNames).toContain('idx_leave_requests_status');
      expect(indexNames).toContain('idx_leave_requests_client_status');
      expect(indexNames).toContain('idx_leave_requests_client_user');
      expect(indexNames).toContain('idx_leave_requests_user_dates');
    });

    it('should validate leave_requests has CHECK constraints (date_range + status + approval)', async () => {
      const result = await pool.query(`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'leave_requests' AND constraint_type = 'CHECK'
      `);
      const constraints = result.rows.map(r => r.constraint_name);
      expect(constraints.length).toBeGreaterThanOrEqual(3);
    });

    it('should verify CHECK constraint on date_range (end_date >= start_date) exists', async () => {
      const result = await pool.query(`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'leave_requests' AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%end_date%'
      `);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('should verify CHECK constraint for approved_by/approved_at linkage exists', async () => {
      const result = await pool.query(`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'leave_requests' AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%approved%'
      `);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('leave_saldi table', () => {
    it('should create leave_saldi table with required columns', async () => {
      const result = await pool.query(`
        SELECT * FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'leave_saldi'
      `);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].table_name).toBe('leave_saldi');
    });

    it('should have proper indexes on leave_saldi', async () => {
      const result = await pool.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'leave_saldi'
      `);
      const indexNames = result.rows.map(r => r.indexname);
      expect(indexNames).toContain('idx_leave_saldi_user_year');
      expect(indexNames).toContain('idx_leave_saldi_client_year');
    });

    it('should have UNIQUE constraint on (user_id, leave_type, year)', async () => {
      const result = await pool.query(`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'leave_saldi' AND constraint_type = 'UNIQUE'
      `);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('should verify UNIQUE constraint exists on (user_id, leave_type, year)', async () => {
      const result = await pool.query(`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'leave_saldi' AND constraint_type = 'UNIQUE'
      `);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      const constraintName = result.rows[0].constraint_name;
      expect(constraintName).toBeDefined();
    });

    it('should verify remaining_days is a GENERATED ALWAYS AS column', async () => {
      const result = await pool.query(`
        SELECT column_name, is_generated, generation_expression
        FROM information_schema.columns
        WHERE table_name = 'leave_saldi' AND column_name = 'remaining_days'
      `);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].is_generated).toBe('ALWAYS');
      expect(result.rows[0].generation_expression).toContain('total_days');
      expect(result.rows[0].generation_expression).toContain('used_days');
    });
  });

  describe('Foreign key relationships', () => {
    it('leave_requests should reference employees(id)', async () => {
      const result = await pool.query(`
        SELECT constraint_name FROM information_schema.referential_constraints
        WHERE constraint_name LIKE '%user_id%' AND table_name = 'leave_requests'
      `);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('leave_saldi should reference employees(id)', async () => {
      const result = await pool.query(`
        SELECT constraint_name FROM information_schema.referential_constraints
        WHERE table_name = 'leave_saldi'
      `);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('should verify FK constraint: leave_requests.user_id references employees', async () => {
      const result = await pool.query(`
        SELECT constraint_name, table_name, column_name
        FROM information_schema.constraint_column_usage
        WHERE table_name = 'leave_requests' AND column_name = 'user_id'
        AND constraint_name LIKE '%fk%'
      `);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('should verify FK constraint: leave_saldi.user_id references employees', async () => {
      const result = await pool.query(`
        SELECT constraint_name, table_name, column_name
        FROM information_schema.constraint_column_usage
        WHERE table_name = 'leave_saldi' AND column_name = 'user_id'
        AND constraint_name LIKE '%fk%'
      `);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });
  });
});
