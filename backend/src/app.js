/**
 * Badge System Backend API
 * Express.js application entry point
 */

const express = require('express');
const dotenv = require('dotenv');
const helmet = require('helmet');
const cors = require('cors');
const pino = require('pino');
const { pool, testConnection, closePool } = require('./db/pool');
const employeesRouter = require('./routes/employees');

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
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
  credentials: process.env.CORS_CREDENTIALS === 'true',
}));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    path: req.path,
  });
  next();
});

// Health check endpoint (for Docker HEALTHCHECK)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

// API routes
app.get('/api', (req, res) => {
  res.json({
    message: 'Badge System API',
    version: '1.0.0',
    status: 'operational',
  });
});

// Register routes
app.use('/api/employees', employeesRouter);

// Error handling middleware
app.use((err, req, res, _next) => {
  logger.error({
    error: err.message,
    stack: err.stack,
  });
  res.status(500).json({
    error: 'Internal Server Error',
    message: NODE_ENV === 'development' ? err.message : 'An error occurred',
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
      // Test database connection before starting
      await testConnection();

      app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT} (${NODE_ENV})`);
      });

      // Graceful shutdown
      process.on('SIGTERM', async () => {
        logger.info('SIGTERM received, closing gracefully...');
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
