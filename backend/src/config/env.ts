import { z } from 'zod';

/**
 * Environment Variables Schema & Validation
 * 
 * All required environment variables are validated on server startup.
 * If validation fails, the server refuses to start with a clear error message.
 * 
 * Usage in application:
 *   import { config } from './config';
 *   const port = config.PORT;
 */

const envSchema = z.object({
  // ──────────────────────────────────────────────────────────────
  // Server & Logging
  // ──────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(['development', 'staging', 'production'])
    .default('development'),
  
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(65535))
    .default('3000'),
  
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  
  APP_NAME: z
    .string()
    .default('Badge System'),

  // ──────────────────────────────────────────────────────────────
  // Database (PostgreSQL)
  // ──────────────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid URL')
    .refine(
      (url) => url.startsWith('postgresql://'),
      'DATABASE_URL must start with postgresql://'
    ),
  
  DB_POOL_MIN: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1))
    .default('5'),
  
  DB_POOL_MAX: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1))
    .default('10'),

  // ──────────────────────────────────────────────────────────────
  // Authentication (Auth0)
  // ──────────────────────────────────────────────────────────────
  AUTH0_DOMAIN: z
    .string()
    .min(1, 'AUTH0_DOMAIN is required'),
  
  AUTH0_CLIENT_ID: z
    .string()
    .min(1, 'AUTH0_CLIENT_ID is required'),
  
  AUTH0_CLIENT_SECRET: z
    .string()
    .min(1, 'AUTH0_CLIENT_SECRET is required'),
  
  AUTH0_AUDIENCE: z
    .string()
    .url('AUTH0_AUDIENCE must be a valid URL'),

  // ──────────────────────────────────────────────────────────────
  // JWT Tokens
  // ──────────────────────────────────────────────────────────────
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters (use: openssl rand -base64 32)'),
  
  JWT_EXPIRY: z
    .string()
    .regex(/^\d+[mhd]$/, 'JWT_EXPIRY format: 30m, 24h, or 7d')
    .default('30m'),
  
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  
  JWT_REFRESH_EXPIRY: z
    .string()
    .regex(/^\d+[mhd]$/, 'JWT_REFRESH_EXPIRY format: 30m, 24h, or 7d')
    .default('7d'),

  // ──────────────────────────────────────────────────────────────
  // CORS & Security
  // ──────────────────────────────────────────────────────────────
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173,http://localhost:3000'),
  
  CORS_CREDENTIALS: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .default('true'),
  
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1000))
    .default('60000'),
  
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1))
    .default('100'),

  // ──────────────────────────────────────────────────────────────
  // External Services (Optional)
  // ──────────────────────────────────────────────────────────────
  SENTRY_DSN: z
    .string()
    .url()
    .optional()
    .or(z.literal('')),
  
  SENTRY_ENVIRONMENT: z
    .enum(['development', 'staging', 'production'])
    .default('development'),

  // ──────────────────────────────────────────────────────────────
  // Feature Flags
  // ──────────────────────────────────────────────────────────────
  ENABLE_OFFLINE_MODE: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .default('false'),
  
  ENABLE_PAYROLL_API: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .default('false'),
  
  ENABLE_WEBHOOKS: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .default('false'),

  // ──────────────────────────────────────────────────────────────
  // Development-Only
  // ──────────────────────────────────────────────────────────────
  DISABLE_AUTH: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .default('false'),
  
  SEED_TEST_DATA: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .default('false'),
  
  MOCK_AUTH0: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .default('false'),

  // ──────────────────────────────────────────────────────────────
  // AWS (Optional)
  // ──────────────────────────────────────────────────────────────
  AWS_REGION: z
    .string()
    .default('eu-west-1'),
  
  AWS_ACCESS_KEY_ID: z
    .string()
    .optional()
    .or(z.literal('')),
  
  AWS_SECRET_ACCESS_KEY: z
    .string()
    .optional()
    .or(z.literal('')),
  
  AWS_S3_BUCKET: z
    .string()
    .optional()
    .or(z.literal('')),

  // ──────────────────────────────────────────────────────────────
  // Email (Optional)
  // ──────────────────────────────────────────────────────────────
  SMTP_HOST: z
    .string()
    .optional()
    .or(z.literal('')),
  
  SMTP_PORT: z
    .string()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().min(1).max(65535).optional()),
  
  SMTP_USER: z
    .string()
    .optional()
    .or(z.literal('')),
  
  SMTP_PASSWORD: z
    .string()
    .optional()
    .or(z.literal('')),
  
  SMTP_FROM: z
    .string()
    .optional()
    .or(z.literal('')),

  // ──────────────────────────────────────────────────────────────
  // Redis & Caching (Optional, Phase 2)
  // ──────────────────────────────────────────────────────────────
  REDIS_URL: z
    .string()
    .url('REDIS_URL must be a valid URL')
    .optional()
    .or(z.literal('')),

  CACHE_ENABLED: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .default('true'),

  CACHE_TTL: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(60).max(86400))
    .default('300'), // 5 minutes default
})
// ──────────────────────────────────────────────────────────────
// Cross-field validations (security & invariants)
// ──────────────────────────────────────────────────────────────
.refine(
  (data) => data.JWT_SECRET !== data.JWT_REFRESH_SECRET,
  {
    message: 'JWT_SECRET and JWT_REFRESH_SECRET must be different (security requirement)',
    path: ['JWT_REFRESH_SECRET'],
  }
)
.refine(
  (data) => !(data.NODE_ENV === 'production' && data.DISABLE_AUTH),
  {
    message: 'DISABLE_AUTH cannot be true in production (security risk)',
    path: ['DISABLE_AUTH'],
  }
)
.refine(
  (data) => data.DB_POOL_MIN <= data.DB_POOL_MAX,
  {
    message: 'DB_POOL_MIN must be less than or equal to DB_POOL_MAX',
    path: ['DB_POOL_MAX'],
  }
)
.refine(
  (data) => !(data.DISABLE_AUTH && data.MOCK_AUTH0),
  {
    message: 'Cannot have both DISABLE_AUTH and MOCK_AUTH0 enabled (conflicting)',
    path: ['MOCK_AUTH0'],
  }
)
.refine(
  (data) => {
    // Validate each CORS origin is a valid URL (normalize by removing trailing slashes)
    const origins = data.CORS_ORIGIN.split(',')
      .map((o) => o.trim())
      .map((o) => o.replace(/\/+$/, '')); // Remove all trailing slashes for consistent CORS matching
    for (const origin of origins) {
      try {
        new URL(origin);
      } catch {
        return false;
      }
    }
    return true;
  },
  {
    message: 'CORS_ORIGIN contains invalid URLs (comma-separated values must each be valid URLs)',
    path: ['CORS_ORIGIN'],
  }
)
.refine(
  (data) => {
    // In production, CORS_ORIGIN must use HTTPS
    if (data.NODE_ENV === 'production') {
      const origins = data.CORS_ORIGIN.split(',').map((o) => o.trim());
      return origins.every((origin) => origin.startsWith('https://'));
    }
    return true;
  },
  {
    message: 'Production CORS_ORIGIN must only contain https:// URLs (http:// not allowed)',
    path: ['CORS_ORIGIN'],
  }
);

export type AppConfig = z.infer<typeof envSchema>;

/**
 * Validate and load environment variables
 * Called on server startup — fails fast if configuration is invalid
 */
export function validateEnv(): AppConfig {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Configuration validation failed:');
      error.errors.forEach((err) => {
        const path = err.path.join('.');
        console.error(`   ${path}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}
