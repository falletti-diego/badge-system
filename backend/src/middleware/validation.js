/**
 * Validation Schemas (Zod)
 * Centralized request validation for all checkin endpoints
 */

const { z } = require('zod');
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// =====================================================
// 1. POST /api/checkin — Create check-in
// =====================================================

const PostCheckinSchema = z.object({
  body: z.object({
    employee_id: z.string().uuid('Invalid employee_id: must be valid UUID'),
    site_id: z.string().uuid('Invalid site_id: must be valid UUID'),
    type: z.enum(['IN', 'OUT'], {
      errorMap: () => ({ message: 'type must be either "IN" or "OUT"' }),
    }),
  }),
  query: z.object({
    client_id: z.string().uuid('Invalid client_id: must be valid UUID').optional(),
  }),
});

// =====================================================
// 2. GET /api/checkins — List check-ins with filters
// =====================================================

const GetCheckinsSchema = z.object({
  query: z.object({
    client_id: z.preprocess(val => val === '' ? undefined : val, z.string().uuid('client_id must be a valid UUID').optional()),
    site_id: z.preprocess(val => val === '' ? undefined : val, z.string().uuid('site_id must be a valid UUID').optional()),
    employee_id: z.preprocess(val => val === '' ? undefined : val, z.string().uuid('employee_id must be a valid UUID').optional()),
    date_from: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD').optional()),
    date_to: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD').optional()),
    limit: z.coerce
      .number()
      .int('limit must be an integer')
      .min(1, 'limit must be at least 1')
      .max(1000, 'limit cannot exceed 1000')
      .default(50),
    offset: z.coerce
      .number()
      .int('offset must be an integer')
      .min(0, 'offset cannot be negative')
      .default(0),
  })
    // Custom validation: date range <= 90 days
    .refine(
      (data) => {
        if (!data.date_from || !data.date_to) return true;
        const from = new Date(data.date_from);
        const to = new Date(data.date_to);
        const diffMs = to - from;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        return diffDays <= 90;
      },
      {
        message: 'Date range cannot exceed 90 days',
        path: ['date_to'],
      }
    )
    // Custom validation: date_from <= date_to
    .refine(
      (data) => {
        if (!data.date_from || !data.date_to) return true;
        return new Date(data.date_from) <= new Date(data.date_to);
      },
      {
        message: 'date_from must be before or equal to date_to',
        path: ['date_from'],
      }
    ),
});

// =====================================================
// 3. PUT /api/checkins/:id — Correct check-in
// =====================================================

const PutCheckinSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid checkin ID: must be valid UUID'),
  }),
  query: z.object({
    client_id: z.string().uuid('client_id must be a valid UUID').optional(),
  }),
  body: z.object({
    type: z.enum(['IN', 'OUT'], {
      errorMap: () => ({ message: 'type must be either "IN" or "OUT"' }),
    }),
  }),
});

// =====================================================
// 4. GET /api/export/csv — Export check-ins as CSV
// =====================================================

const GetExportCsvSchema = z.object({
  query: z.object({
    client_id: z.preprocess(val => val === '' ? undefined : val, z.string().uuid('client_id must be a valid UUID').optional()),
    site_id: z.preprocess(val => val === '' ? undefined : val, z.string().uuid('site_id must be a valid UUID').optional()),
    employee_id: z.preprocess(val => val === '' ? undefined : val, z.string().uuid('employee_id must be a valid UUID').optional()),
    date_from: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD').optional()),
    date_to: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD').optional()),
  })
    .refine(
      (data) => {
        if (!data.date_from || !data.date_to) return true;
        const from = new Date(data.date_from);
        const to = new Date(data.date_to);
        const diffDays = (to - from) / (1000 * 60 * 60 * 24);
        return diffDays <= 90;
      },
      {
        message: 'Date range cannot exceed 90 days',
        path: ['date_to'],
      }
    ),
});

// =====================================================
// 5. GET /api/stats — Dashboard KPI stats
// =====================================================

const GetStatsSchema = z.object({
  query: z.object({
    site_id: z.preprocess(val => val === '' ? undefined : val, z.string().uuid('site_id must be a valid UUID').optional()),
    employee_id: z.preprocess(val => val === '' ? undefined : val, z.string().uuid('employee_id must be a valid UUID').optional()),
    date_from: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD').optional()),
    date_to: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD').optional()),
  })
    .refine(
      (data) => {
        if (!data.date_from || !data.date_to) return true;
        const from = new Date(data.date_from);
        const to = new Date(data.date_to);
        const diffDays = (to - from) / (1000 * 60 * 60 * 24);
        return diffDays <= 90;
      },
      {
        message: 'Date range cannot exceed 90 days',
        path: ['date_to'],
      }
    ),
});

// =====================================================
// 6. GET /api/employees — List employees with pagination
// =====================================================

const GetEmployeesSchema = z.object({
  query: z.object({
    limit: z.coerce
      .number()
      .int('limit must be an integer')
      .min(1, 'limit must be at least 1')
      .max(1000, 'limit cannot exceed 1000')
      .default(50),
    offset: z.coerce
      .number()
      .int('offset must be an integer')
      .min(0, 'offset cannot be negative')
      .default(0),
  }),
});

// =====================================================
// Validation Middleware Factory
// =====================================================

function createValidationMiddleware(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });

      // Attach validated data to request
      req.validated = validated;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        logger.warn({
          action: 'validation_error',
          path: req.path,
          method: req.method,
          errors,
        });

        return res.status(400).json({
          error: 'Validation Error',
          details: errors,
        });
      }

      next(err);
    }
  };
}

module.exports = {
  PostCheckinSchema,
  GetCheckinsSchema,
  PutCheckinSchema,
  GetExportCsvSchema,
  GetStatsSchema,
  GetEmployeesSchema,
  createValidationMiddleware,
};
