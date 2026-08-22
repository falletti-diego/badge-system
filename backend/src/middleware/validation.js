/**
 * Validation Schemas (Zod)
 * Centralized request validation for all API endpoints
 */

const { z } = require('zod');
const pino = require('pino');
const { todayInTimeZone } = require('../utils/date');

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
// DEMO — POST /api/v1/demo/start
// =====================================================
// .strict() rejects any body field other than `email` (e.g. client_id, role)
// so the public, unauthenticated caller cannot inject tenant/role data.
const DemoStartSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
  }).strict(),
});

// =====================================================
// DEMO — POST /api/v1/demo/switch-role
// =====================================================
// .strict() rejects any body field other than `role` — the caller is an
// already-authenticated demo session, but the role must still be one of
// exactly the 3 accepted values (never an arbitrary string).
const DemoSwitchRoleSchema = z.object({
  body: z.object({
    role: z.enum(['admin', 'manager', 'employee'], {
      errorMap: () => ({ message: 'role must be one of: admin, manager, employee' }),
    }),
  }).strict(),
});

// =====================================================
// DEMO — POST /api/v1/demo/contact
// =====================================================
// .strict() rejects any body field other than `message` — same reasoning
// as DemoSwitchRoleSchema: the caller is an already-authenticated demo
// session, but a JWT-authenticated body must still not be able to inject
// other fields (e.g. client_id) into a route that writes to the DB and
// sends an email. min(1) rejects an empty message; max(2000) is a longer
// bound than the 500-char `rejection_reason` field elsewhere in this file
// (see ApproveLeaveSchema below) since this is meant to hold a free-form
// "tell us about your use case" message rather than a short reason string.
const DemoContactSchema = z.object({
  body: z.object({
    message: z.string()
      .min(1, 'message is required')
      .max(2000, 'message must be at most 2000 characters'),
  }).strict(),
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
    // Offline mode (docs/superpowers/plans/2026-07-19-offline-mode.md): the client always
    // generates client_uuid + occurred_at. The 48h/+5min window is the anti-fraud bound;
    // +5min tolerates device clock skew.
    occurred_at: z.string().datetime({ offset: true }).optional()
      .superRefine((val, ctx) => {
        if (!val) return;
        const t = new Date(val).getTime();
        const now = Date.now();
        if (t < now - 48 * 3600 * 1000 || t > now + 5 * 60 * 1000) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'OFFLINE_TIMESTAMP_OUT_OF_WINDOW' });
        }
      }),
    client_uuid: z.string().uuid('Invalid client_uuid: must be valid UUID').optional(),
    // is_offline is intentionally NOT accepted here: the server derives it from
    // occurred_at (see routes/checkins.js) rather than trusting client input —
    // it's not a client fact, it drives an audit trail and a dashboard badge.
    // faceid_verified (finding #4, 2026-08-02): dichiarato dal client (FaceIDScreen ha
    // eseguito con successo prima del check-in). NON è un controllo di sicurezza — a
    // differenza di is_offline non è derivabile server-side — è visibilità/audit: rende
    // esplicito nel dashboard/audit log quando un check-in non ha avuto attestazione
    // biometrica, invece di nasconderlo silenziosamente.
    faceid_verified: z.boolean().optional().default(false),
    // qr_content (finding #5, Fase C 2026-08-09): stringa raw scansionata dal QR fisico.
    // Confrontata byte-per-byte contro sites.qr_code_content — permette a un admin di
    // invalidare un QR rubato/fotografato rigenerandolo. Opzionale in questa fase
    // (retrocompatibilità con app non ancora aggiornate, vedi spec "Rollout campo qr_content").
    qr_content: z.string().max(500, 'qr_content must be at most 500 characters').optional(),
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
// 5b. GET /api/presences/trend — Trend data for charts
// =====================================================

const GetPresencesTrendSchema = z.object({
  query: z.object({
    site_id: z.preprocess(val => val === '' ? undefined : val, z.string().optional()),
  }),
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
    client_id: z.string().uuid('client_id must be a valid UUID').optional(),
    name: z.string().min(2, 'name must be at least 2 characters').max(100),
    location: z.string().max(200).optional(),
  }),
});

// =====================================================
// ADMIN — POST /api/admin/employees
// =====================================================

const AdminEmployeeSchema = z.object({
  body: z.object({
    client_id: z.string().uuid('client_id must be a valid UUID').optional(),
    email: z.string().email('Invalid email format').max(100),
    name: z.string().min(2, 'name must be at least 2 characters').max(100),
    phone: z.string().max(20).optional(),
    role: z.enum(['employee', 'manager'], {
      errorMap: () => ({ message: 'role must be employee or manager' }),
    }).default('employee'),
    site_id: z.string().uuid('site_id must be a valid UUID').optional().nullable(),
    // Niente `.min(1)` qui: per role === 'manager' questo campo è legittimamente
    // vuoto (i manager non hanno assigned_sites). Il requisito "almeno una sede"
    // per i dipendenti è applicato dal `.refine()` sotto, condizionato dal ruolo —
    // un vincolo di campo qui scatterebbe PRIMA di quel refine e bloccherebbe la
    // creazione di ogni manager, indipendentemente dal ruolo (bug reale: creare
    // un manager da "Nuovo Dipendente" falliva sempre con "assigned_sites must
    // contain at least one site").
    assigned_sites: z.array(z.string().uuid('each assigned_site must be a valid UUID'))
      .default([]),
    password: z.string().min(8, 'password must be at least 8 characters').max(100).optional(),
    external_employee_id: z.string()
      .regex(/^[A-Za-z0-9]+$/, 'external_employee_id must contain only letters and numbers')
      .max(50)
      .optional(),
    hiring_date: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'hiring_date must be in YYYY-MM-DD format')
      .refine((d) => !isNaN(new Date(`${d}T00:00:00Z`).getTime()), { message: 'hiring_date must be a valid date' })
      // Confronto con "oggi" in Europe/Rome, non UTC: hiring_date è una data di
      // calendario italiana scelta dal date picker, e usare toISOString() (UTC)
      // la disallineava nella finestra mezzanotte-2am locale.
      .refine((d) => d >= todayInTimeZone(), {
        message: 'hiring_date cannot be in the past',
      })
      .optional(),
    manager_id: z.string().uuid('manager_id must be a valid UUID').optional().nullable(),
  }).refine(
    (data) => data.role === 'manager' || data.assigned_sites.length > 0,
    { message: 'employees must have at least one assigned site', path: ['assigned_sites'] }
  ).refine(
    // Un dipendente non può esistere senza un manager di riferimento — la sede a
    // cui viene assegnato deve già avere un manager attivo prima che un admin
    // possa aggiungere dipendenti (i manager restano esenti, non hanno un proprio
    // manager). Trovato testando manualmente questo branch: creare un dipendente
    // su una sede appena creata, ancora senza manager, veniva accettato senza
    // alcun avviso.
    (data) => data.role === 'manager' || !!data.manager_id,
    { message: 'employees must have a manager_id — create a manager for this site first', path: ['manager_id'] }
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

const GetMySummarySchema = z.object({
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

const PostTimesheetSignSchema = z.object({
  body: z.object({
    month: z.number().int('month must be an integer').min(1).max(12),
    year: z.number().int('year must be an integer').min(2020).max(2100),
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

// =====================================================
// EVENT REQUESTS — GET /api/v1/events/approved
// =====================================================

const GetApprovedEventsSchema = z.object({
  query: z.object({
    site_id: z.preprocess(val => val === '' ? undefined : val, z.string().uuid().optional()),
    employee_id: z.preprocess(val => val === '' ? undefined : val, z.string().uuid().optional()),
    date_from: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD').optional()),
    date_to: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD').optional()),
  }),
});

// =====================================================
// EVENT REQUESTS — GET /api/v1/events/my-requests
// =====================================================

const GetMyEventRequestsSchema = z.object({
  query: z.object({
    date_from: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD').optional()),
    date_to: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD').optional()),
  }),
});

module.exports = {
  LoginSchema,
  DemoStartSchema,
  DemoSwitchRoleSchema,
  DemoContactSchema,
  PostCheckinSchema,
  GetCheckinsSchema,
  PutCheckinSchema,
  GetExportCsvSchema,
  GetStatsSchema,
  GetPresencesTrendSchema,
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
  GetMySummarySchema,
  PostTimesheetSignSchema,
  UpdateSiteGeofenceSchema,
  PostLeaveRequestSchema,
  ApproveLeaveSchema,
  PostEventRequestSchema,
  ApproveEventRequestSchema,
  GetApprovedEventsSchema,
  GetMyEventRequestsSchema,
  createValidationMiddleware,
};
