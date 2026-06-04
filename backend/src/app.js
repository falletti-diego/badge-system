/**
 * Badge System Backend API
 * Express.js application entry point
 */

const express = require('express');
const dotenv = require('dotenv');
const helmet = require('helmet');
const cors = require('cors');
const pino = require('pino');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { pool, testConnection, closePool } = require('./db/pool');
const { initializeRedis, closeRedis } = require('./db/redis');
const { ApiError, RateLimitError } = require('./utils/errors');
const { apiLimiter, authLimiter, csvLimiter } = require('./middleware/rateLimiter');
const { cacheMiddleware } = require('./middleware/cache');
const authRouter = require('./routes/auth');
const employeesRouter = require('./routes/employees');
const checkinsRouter = require('./routes/checkins');
const shiftsRouter = require('./routes/shifts');
const exportRouter = require('./routes/export');

// Load environment variables
dotenv.config();

// Initialize logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security middleware
app.use(helmet());
// CORS handled by Nginx reverse proxy (production)
// Disable Express CORS middleware to avoid header conflicts
// app.use(cors({
//   origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
//   credentials: process.env.CORS_CREDENTIALS === 'true',
// }));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting middleware
app.use('/api/', apiLimiter); // General API limiter
app.use('/api/auth/', authLimiter); // Tighter limit for auth endpoints
app.use('/api/export/csv', csvLimiter); // CSV export limiter

// Request logging
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    path: req.path,
  });
  next();
});

// Health check endpoint (for Docker HEALTHCHECK)
app.get('/health', async (req, res) => {
  const diagnostics = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    database: 'connected',
    db_host: process.env.DB_HOST,
    db_port: process.env.DB_PORT,
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
    diagnostics.error = err.message;
    diagnostics.error_code = errorCode;
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
  res.json({
    message: 'Badge System API',
    version: '1.0.0',
    status: 'operational',
  });
});

// Cache middleware for GET requests
app.use('/api/', cacheMiddleware());

// Register routes
app.use('/api/auth', authRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/checkins', checkinsRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/export/csv', exportRouter);

// Error handling middleware
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
// Deployment test - mar  2 giu 2026 11:39:48 CEST
