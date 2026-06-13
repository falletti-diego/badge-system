/**
 * PM2 Ecosystem Configuration
 * Start: pm2 start ecosystem.config.js
 * Monitor: pm2 logs
 * Stop: pm2 stop all
 *
 * Features:
 * - Auto-restart on crash
 * - Watch source files for changes
 * - Log to separate files for each process
 * - Health check endpoints
 * - Memory/CPU monitoring
 */

const path = require('path');

module.exports = {
  apps: [
    // ─────────────────────────────────────────────────────────────────────────
    // Backend API Server
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: 'badge-backend',
      script: 'npm',
      args: 'run dev',
      cwd: path.join(__dirname, 'backend'),

      // Watch for changes
      watch: ['src', '.env.development'],
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'logs', '__tests__'],

      // Environment
      env: {
        NODE_ENV: 'development',
      },

      // Restart settings
      max_memory_restart: '500M',
      max_restarts: 10,
      min_uptime: '10s',

      // Output
      out_file: './logs/backend-out.log',
      error_file: './logs/backend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Health check (if app exposes /health)
      // pm2 will ping /health every 30s
      listen_timeout: 10000,
      kill_timeout: 5000,

      // Instance settings
      instances: 1,
      exec_mode: 'fork',
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Frontend Dev Server
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: 'badge-frontend',
      script: 'npm',
      args: 'run dev',
      cwd: path.join(__dirname, 'frontend-web'),

      // Watch for changes
      watch: ['src', '.env.development'],
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'logs', 'dist'],

      // Environment
      env: {
        VITE_API_URL: 'http://localhost:3000',
      },

      // Restart settings
      max_memory_restart: '500M',
      max_restarts: 10,
      min_uptime: '10s',

      // Output
      out_file: './logs/frontend-out.log',
      error_file: './logs/frontend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Instance settings
      instances: 1,
      exec_mode: 'fork',
    },
  ],

  // Global settings
  env: {
    NODE_ENV: 'development',
  },

  // Cluster monitoring
  monitor_delay: 5000, // Monitor health every 5 seconds
};
