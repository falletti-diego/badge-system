/**
 * Badge System Backend API
 * Express.js application entry point
 */

// dotenv must load before any module reads process.env (local dev; prod uses SSM via entrypoint.sh)
const dotenv = require('dotenv');
dotenv.config();

// Sentry must be initialized before any other require() to instrument modules correctly
const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.2,
    beforeSend(event) {
      const SENSITIVE = ['authorization', 'password', 'token', 'cookie', 'x-api-key'];
      if (event.request?.headers) {
        for (const key of SENSITIVE) {
          if (event.request.headers[key]) event.request.headers[key] = '[Filtered]';
        }
      }
      if (event.request?.data) {
        for (const key of SENSITIVE) {
          if (event.request.data[key]) event.request.data[key] = '[Filtered]';
        }
      }
      return event;
    },
  });
}

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const pinoHttp = require('pino-http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { pool, closePool } = require('./db/pool');
const { initializeRedis, closeRedis } = require('./db/redis');
const { ApiError, RateLimitError } = require('./utils/errors');
const { apiLimiter, authLimiter, csvLimiter } = require('./middleware/rateLimiter');
const { cacheMiddleware } = require('./middleware/cache');
const authRouter = require('./routes/auth');
const employeesRouter = require('./routes/employees');
const checkinsRouter = require('./routes/checkins');
const shiftsRouter = require('./routes/shifts');
const exportRouter = require('./routes/export');
const notificationsRouter = require('./routes/notifications');
const sitesRouter = require('./routes/sites');
const adminRouter = require('./routes/admin');

// Initialize logger (singleton shared across all modules)
const logger = require('./utils/logger');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Trust the first hop (AWS ALB / Nginx) so req.ip reflects the real client IP
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
// CORS — explicit whitelist, no wildcards (MASVS-NETWORK)
// Dev: set CORS_ORIGIN=http://localhost:5173 in .env
// Prod: SSM /badge/production/CORS_ORIGIN = https://badge.dataxiom.it,https://dataxiom-badge.netlify.app
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['https://badge.dataxiom.it', 'https://dataxiom-badge.netlify.app'],
  credentials: true,
}));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting middleware — applies to both /api/v1/ and deprecated /api/
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/v1/auth/', authLimiter);
app.use('/api/export/csv', csvLimiter);
app.use('/api/v1/export/csv', csvLimiter);

// Structured request/response logging (method, path, statusCode, responseTime)
// Used by CloudWatch metric filters for 5xx rate and slow request alarms
app.use(pinoHttp({
  logger,
  customLogLevel: (req, res) => res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}));

// Health check endpoint (for Docker HEALTHCHECK)
app.get('/health', async (req, res) => {
  const diagnostics = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    database: 'connected',
  };

  try {
    // Test DB connectivity with 10s timeout
    const startTime = Date.now();
    const queryPromise = pool.query('SELECT NOW()');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB query timeout (10s)')), 10000)
    );

    await Promise.race([queryPromise, timeoutPromise]);
    const queryTime = Date.now() - startTime;

    diagnostics.db_query_time_ms = queryTime;
    res.status(200).json(diagnostics);
  } catch (err) {
    const errorCode = err.code || 'UNKNOWN';
    const isTimeout = err.message.includes('timeout');
    const isConnection = errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND' || errorCode === 'ETIMEDOUT';

    diagnostics.database = 'disconnected';
    // Error details logged internally — not exposed to callers
    diagnostics.error_type = isTimeout ? 'TIMEOUT' : isConnection ? 'CONNECTION' : 'UNKNOWN';

    logger.error({
      action: 'health_check_failed',
      error: err.message,
      error_code: errorCode,
      error_type: diagnostics.error_type,
      db_host: process.env.DB_HOST,
      db_port: process.env.DB_PORT,
      stack: err.stack,
    });

    res.status(503).json(diagnostics);
  }
});

// API routes
app.get('/api', (req, res) => {
  res.json({ message: 'Badge System API', version: '1.0.0', status: 'operational' });
});
app.get('/api/v1', (req, res) => {
  res.json({ message: 'Badge System API', version: '1.0.0', status: 'operational' });
});

// Cache middleware for GET requests (covers /api/ and /api/v1/ via prefix match)
app.use('/api/', cacheMiddleware());

// v1 router — canonical API prefix
const v1Router = express.Router();
v1Router.use('/auth', authRouter);
v1Router.use('/employees', employeesRouter);
v1Router.use('/checkins', checkinsRouter);
v1Router.use('/shifts', shiftsRouter);
v1Router.use('/export/csv', exportRouter);
v1Router.use('/notifications', notificationsRouter);
v1Router.use('/sites', sitesRouter);
v1Router.use('/admin', adminRouter);
app.use('/api/v1', v1Router);

// Deprecated /api/ aliases — kept for backwards compatibility with mobile clients
// that cannot be force-updated. Logs a warning per request.
app.use('/api', (req, res, next) => {
  logger.warn({ action: 'deprecated_api_path', path: req.originalUrl, method: req.method });
  next();
}, v1Router);

// Sentry error handler — must come BEFORE custom error handler to capture exceptions
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // Handle custom API errors
  if (err instanceof ApiError) {
    const statusCode = err.statusCode || 500;
    const logLevel = statusCode >= 500 ? 'error' : 'info';

    const logData = {
      action: 'api_error',
      error: err.code,
      message: err.message,
      statusCode,
      method: req.method,
      path: req.path,
      user_id: req.user?.user_id,
    };

    if (logLevel === 'error') {
      logData.stack = err.stack;
    }

    logger[logLevel](logData);

    const response = {
      error: err.code,
      message: err.message,
      statusCode,
    };

    // Include details for rate limit errors
    if (err instanceof RateLimitError) {
      response.retryAfter = err.retryAfter;
      res.set('Retry-After', err.retryAfter);
    }

    // Include validation details if present
    if (err.details) {
      response.details = err.details;
    }

    return res.status(statusCode).json(response);
  }

  // Handle generic errors
  logger.error({
    action: 'unhandled_error',
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    user_id: req.user?.user_id,
  });

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: NODE_ENV === 'development' ? err.message : 'An error occurred',
    statusCode: 500,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
  });
});

// Start server
if (require.main === module) {
  (async () => {
    try {
      logger.info({
        message: 'Badge System API starting',
        environment: NODE_ENV,
        port: PORT,
        db_host: process.env.DB_HOST,
        db_port: process.env.DB_PORT,
      });

      // Initialize Redis (optional, gracefully continues if not available)
      await initializeRedis();

      // Skip testConnection() on startup - health endpoint will test DB on demand
      // This prevents startup timeout if RDS is slow
      logger.info('Skipping database connection test on startup (health endpoint will test on demand)');

      // Check if HTTPS certificates exist
      const certPath = path.join(__dirname, '..', 'cert.pem');
      const keyPath = path.join(__dirname, '..', 'key.pem');
      const certExists = fs.existsSync(certPath);
      const keyExists = fs.existsSync(keyPath);
      const useHttps = process.env.USE_HTTPS === 'true' && certExists && keyExists;

      logger.info({
        message: 'Certificate check',
        certPath,
        keyPath,
        certExists,
        keyExists,
        useHttps,
      });

      let server;
      if (useHttps) {
        const options = {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
        };
        server = https.createServer(options, app);
        server.listen(PORT, () => {
          logger.info(`Server running on HTTPS port ${PORT} (${NODE_ENV})`);
        });
      } else {
        server = app.listen(PORT, () => {
          logger.info(`Server running on HTTP port ${PORT} (${NODE_ENV})`);
        });
      }

      // Graceful shutdown
      process.on('SIGTERM', async () => {
        logger.info('SIGTERM received, closing gracefully...');
        await closeRedis();
        await closePool();
        process.exit(0);
      });
    } catch (err) {
      logger.error({
        message: 'Failed to start server',
        error: err.message,
      });
      process.exit(1);
    }
  })();
}

module.exports = app;
