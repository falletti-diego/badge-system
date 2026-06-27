/**
 * Validation Schemas (Zod)
 * Centralized request validation for all API endpoints
 */

const { z } = require('zod');
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// =====================================================
// AUTH - POST /api/auth/login
// =====================================================

const LoginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
    client_id: z.string().uuid('Invalid client_id format').optional(),
  }),
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
    latitude: z.number().min(-90, 'latitude must be between -90 and 90').max(90, 'latitude must be between -90 and 90').nullable().optional(),
    longitude: z.number().min(-180, 'longitude must be between -180 and 180').max(180, 'longitude must be between -180 and 180').nullable().optional(),
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
    client_id: z.preprocess(val => val === '' ? undefined : val, z.string().optional()),
    site_id: z.preprocess(val => val === '' ? undefined : val, z.string().optional()),
    employee_id: z.preprocess(val => val === '' ? undefined : val, z.string().optional()),
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
    }).optional(),
    timestamp: z.preprocess(
      val => val === '' ? undefined : val,
      z.string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'timestamp must be ISO datetime (YYYY-MM-DDTHH:MM...)')
        .optional()
    ),
    correction_note: z.preprocess(
      val => val === '' ? undefined : val,
      z.string().max(500, 'correction_note must be at most 500 characters').optional()
    ),
  }).refine(
    data => data.type !== undefined || data.timestamp !== undefined || data.correction_note !== undefined,
    { message: 'At least one field (type, timestamp, or correction_note) is required' }
  ),
});

// =====================================================
// 4. GET /api/export/csv — Export check-ins as CSV
// =====================================================

const GetExportCsvSchema = z.object({
  query: z.object({
    client_id: z.preprocess(val => val === '' ? undefined : val, z.string().optional()),
    site_id: z.preprocess(val => val === '' ? undefined : val, z.string().optional()),
    employee_id: z.preprocess(val => val === '' ? undefined : val, z.string().optional()),
    date_from: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD').optional()),
    date_to: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD').optional()),
    format: z.preprocess(val => val === '' ? undefined : val, z.enum(['generic', 'zucchetti', 'teamsystem']).default('generic')),
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
    site_id: z.preprocess(val => val === '' ? undefined : val, z.string().optional()),
    employee_id: z.preprocess(val => val === '' ? undefined : val, z.string().optional()),
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
// 7. GET /api/shifts/:siteId — Fetch shift planning
// =====================================================

const GetShiftsSchema = z.object({
  query: z.object({
    month: z.coerce
      .number()
      .int('month must be an integer')
      .min(1, 'month must be between 1 and 12')
      .max(12, 'month must be between 1 and 12')
      .default(new Date().getMonth() + 1),
    year: z.coerce
      .number()
      .int('year must be an integer')
      .min(2020, 'year must be 2020 or later')
      .default(new Date().getFullYear()),
  }),
  params: z.object({
    siteId: z.string().uuid('Invalid siteId: must be valid UUID'),
  }),
});

// =====================================================
// 7b. GET /api/shifts/my-schedule — Employee's own shifts
// =====================================================

const GetMyScheduleSchema = z.object({
  query: z.object({
    month: z.coerce
      .number()
      .int('month must be an integer')
      .min(1, 'month must be between 1 and 12')
      .max(12, 'month must be between 1 and 12')
      .default(new Date().getMonth() + 1),
    year: z.coerce
      .number()
      .int('year must be an integer')
      .min(2020, 'year must be 2020 or later')
      .default(new Date().getFullYear()),
  }),
});

// =====================================================
// 8. POST /api/shifts/:siteId — Save shift planning
// =====================================================

const PostShiftsSchema = z.object({
  body: z.object({
    month: z.number()
      .int('month must be an integer')
      .min(1, 'month must be between 1 and 12')
      .max(12, 'month must be between 1 and 12'),
    year: z.number()
      .int('year must be an integer')
      .min(2020, 'year must be 2020 or later'),
    shifts_data: z.record(
      z.string().uuid('employee_id must be valid UUID'),
      z.record(
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
        z.enum(['m', 'p', 's', 'R'], {
          errorMap: () => ({ message: 'shift must be one of: m (mattino), p (pomeriggio), s (sera), R (riposo)' }),
        })
      )
    ).refine(
      data => Object.keys(data).length > 0,
      { message: 'shifts_data must contain at least one employee' }
    ),
  }),
  params: z.object({
    siteId: z.string().uuid('Invalid siteId: must be valid UUID'),
  }),
});

// =====================================================
// 9. GET /api/shifts/:siteId/export — Export planning
// =====================================================

const ExportShiftsSchema = z.object({
  query: z.object({
    month: z.coerce
      .number()
      .int('month must be an integer')
      .min(1, 'month must be between 1 and 12')
      .max(12, 'month must be between 1 and 12')
      .default(new Date().getMonth() + 1),
    year: z.coerce
      .number()
      .int('year must be an integer')
      .min(2020, 'year must be 2020 or later')
      .default(new Date().getFullYear()),
    format: z.enum(['pdf', 'csv'], {
      errorMap: () => ({ message: 'format must be either "pdf" or "csv"' }),
    }).default('csv'),
  }),
  params: z.object({
    siteId: z.string().uuid('Invalid siteId: must be valid UUID'),
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

// =====================================================
// ADMIN — PUT /api/admin/sites/:id (geofence settings)
// =====================================================

const UpdateSiteGeofenceSchema = z.object({
  body: z.object({
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    geofence_radius_meters: z.number().int().min(50, 'radius must be at least 50m').max(5000, 'radius cannot exceed 5000m').default(150),
    geofence_enabled: z.boolean(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid site id'),
  }),
});

// =====================================================
// ADMIN — POST /api/admin/clients
// =====================================================

const AdminClientSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'name must be at least 2 characters').max(100),
    email: z.string().email('Invalid email format').max(100),
    plan: z.enum(['starter', 'growth', 'enterprise'], {
      errorMap: () => ({ message: 'plan must be starter, growth, or enterprise' }),
    }).default('starter'),
  }),
});

// =====================================================
// ADMIN — POST /api/admin/sites
// =====================================================

const AdminSiteSchema = z.object({
  body: z.object({
    client_id: z.string().uuid('client_id must be a valid UUID'),
    name: z.string().min(2, 'name must be at least 2 characters').max(100),
    location: z.string().max(200).optional(),
  }),
});

// =====================================================
// ADMIN — POST /api/admin/employees
// =====================================================

const AdminEmployeeSchema = z.object({
  body: z.object({
    client_id: z.string().uuid('client_id must be a valid UUID'),
    email: z.string().email('Invalid email format').max(100),
    name: z.string().min(2, 'name must be at least 2 characters').max(100),
    phone: z.string().max(20).optional(),
    role: z.enum(['employee', 'manager'], {
      errorMap: () => ({ message: 'role must be employee or manager' }),
    }).default('employee'),
    site_id: z.string().uuid('site_id must be a valid UUID').optional().nullable(),
    assigned_sites: z.array(z.string().uuid('each assigned_site must be a valid UUID'))
      .min(1, 'assigned_sites must contain at least one site')
      .default([]),
    password: z.string().min(8, 'password must be at least 8 characters').max(100).optional(),
  }).refine(
    (data) => data.role === 'manager' || data.assigned_sites.length > 0,
    { message: 'employees must have at least one assigned site', path: ['assigned_sites'] }
  ),
});

// =====================================================
// ADMIN — POST /api/admin/viewers
// =====================================================

const AdminViewerSchema = z.object({
  body: z.object({
    client_id: z.string().uuid('client_id must be a valid UUID'),
    email: z.string().email('Invalid email format').max(100),
    name: z.string().min(2, 'name must be at least 2 characters').max(100),
    password: z.string().min(8, 'password must be at least 8 characters').max(100).optional(),
  }),
});

// =====================================================
// ADMIN — PUT /api/admin/settings
// =====================================================

const AdminSettingsSchema = z.object({
  body: z.object({
    meal_voucher_hours: z.number()
      .min(0, 'meal_voucher_hours must be >= 0')
      .max(24, 'meal_voucher_hours must be <= 24')
      .optional(),
    geofencing_feature_enabled: z.boolean().optional(),
  }).refine(
    (data) => data.meal_voucher_hours !== undefined || data.geofencing_feature_enabled !== undefined,
    { message: 'At least one setting must be provided' }
  ),
});

// =====================================================
// GET /api/presences/summary — Monthly summary
// =====================================================

const GetPresencesSummarySchema = z.object({
  query: z.object({
    month: z.coerce
      .number()
      .int('month must be an integer')
      .min(1, 'month must be between 1 and 12')
      .max(12, 'month must be between 1 and 12')
      .default(new Date().getMonth() + 1),
    year: z.coerce
      .number()
      .int('year must be an integer')
      .min(2020, 'year must be 2020 or later')
      .default(new Date().getFullYear()),
  }),
});

// =====================================================
// LEAVE MANAGEMENT — POST /api/v1/leave/request
// =====================================================

const PostLeaveRequestSchema = z.object({
  body: z.object({
    leave_type: z.enum(['FERIE_1', 'FERIE_2', 'FERIE_3', 'MALATTIA'], {
      errorMap: () => ({ message: 'leave_type must be one of: FERIE_1, FERIE_2, FERIE_3, MALATTIA' }),
    }),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be in YYYY-MM-DD format'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be in YYYY-MM-DD format'),
    motivation: z.string().max(500, 'motivation must be at most 500 characters').optional().nullable(),
  })
    .refine(
      (data) => new Date(data.end_date) >= new Date(data.start_date),
      { message: 'end_date must be on or after start_date', path: ['end_date'] }
    ),
});

// =====================================================
// LEAVE MANAGEMENT — PUT /api/v1/leave/:id/approve
// =====================================================

const ApproveLeaveSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid leave request ID: must be valid UUID'),
  }),
  body: z.object({
    status: z.enum(['APPROVED', 'REJECTED'], {
      errorMap: () => ({ message: 'status must be either APPROVED or REJECTED' }),
    }),
    rejection_reason: z.string().max(500, 'rejection_reason must be at most 500 characters').optional().nullable(),
  }),
});

module.exports = {
  LoginSchema,
  PostCheckinSchema,
  GetCheckinsSchema,
  PutCheckinSchema,
  GetExportCsvSchema,
  GetStatsSchema,
  GetEmployeesSchema,
  GetShiftsSchema,
  GetMyScheduleSchema,
  PostShiftsSchema,
  ExportShiftsSchema,
  AdminClientSchema,
  AdminSiteSchema,
  AdminEmployeeSchema,
  AdminViewerSchema,
  AdminSettingsSchema,
  GetPresencesSummarySchema,
  UpdateSiteGeofenceSchema,
  PostLeaveRequestSchema,
  ApproveLeaveSchema,
  createValidationMiddleware,
};
