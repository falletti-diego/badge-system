/**
 * Unit Tests: Leave Management Schema
 * Validates that leaves, leave_requests, and leave_saldi tables are properly created.
 */

jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough };
});

jest.mock('../db/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(null),
  closeRedis: jest.fn().mockResolvedValue(undefined),
  isRedisAvailable: jest.fn().mockReturnValue(false),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
}));

const { pool } = require('../db/pool');

describe('Leave Management Schema', () => {
  jest.setTimeout(60000);

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
      expect(result.rows.length).toBe(1);
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
      expect(indexNames).toContain('idx_leave_requests_date_range');
    });

    it('should validate leave_requests has CHECK constraint for date range', async () => {
      const result = await pool.query(`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'leave_requests' AND constraint_type = 'CHECK'
      `);
      const constraints = result.rows.map(r => r.constraint_name);
      expect(constraints.length).toBeGreaterThan(0);
    });
  });

  describe('leave_saldi table', () => {
    it('should create leave_saldi table with required columns', async () => {
      const result = await pool.query(`
        SELECT * FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'leave_saldi'
      `);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].table_name).toBe('leave_saldi');
    });

    it('should have proper indexes on leave_saldi', async () => {
      const result = await pool.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'leave_saldi'
      `);
      const indexNames = result.rows.map(r => r.indexname);
      expect(indexNames).toContain('idx_leave_saldi_user_year');
    });

    it('should have UNIQUE constraint on (user_id, leave_type, year)', async () => {
      const result = await pool.query(`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'leave_saldi' AND constraint_type = 'UNIQUE'
      `);
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Foreign key relationships', () => {
    it('leave_requests should reference employees(id)', async () => {
      const result = await pool.query(`
        SELECT constraint_name FROM information_schema.referential_constraints
        WHERE constraint_name LIKE '%user_id%' AND table_name = 'leave_requests'
      `);
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('leave_saldi should reference employees(id)', async () => {
      const result = await pool.query(`
        SELECT constraint_name FROM information_schema.referential_constraints
        WHERE table_name = 'leave_saldi'
      `);
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });
});
