/**
 * Structured Logger Utility
 * Provides consistent logging format across the frontend
 *
 * Usage:
 *  logger.info('LoginPage', 'form submitted', { email })
 *  logger.error('LoginPage', 'login failed', error)
 *  logger.debug('API', 'request sent', { method, url })
 *
 * Environment variable: VITE_LOG_LEVEL (debug, info, warn, error)
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_NAMES = {
  0: '🔵 DEBUG',
  1: '🟢 INFO',
  2: '🟡 WARN',
  3: '🔴 ERROR',
};

// Get configured log level from environment
const configuredLevel = import.meta.env.VITE_LOG_LEVEL?.toLowerCase() || 'info';
const minLogLevel = LOG_LEVELS[configuredLevel] ?? LOG_LEVELS.info;

/**
 * Format timestamp as ISO string with milliseconds
 */
const getTimestamp = () => new Date().toISOString();

/**
 * Format log entry with context, action, and data
 */
const formatEntry = (level, context, action, data) => {
  const timestamp = getTimestamp();
  const levelLabel = LEVEL_NAMES[level];
  const contextStr = `[${context}]`.padEnd(20);
  const actionStr = action ? ` ${action}` : '';

  return { timestamp, levelLabel, contextStr, actionStr, data };
};

/**
 * Log with structure: [timestamp] [level] [context] action {data}
 */
const log = (level, context, action, data = null) => {
  // Skip if below configured log level
  if (level < minLogLevel) return;

  const { timestamp, levelLabel, contextStr, actionStr, data: logData } = formatEntry(
    level,
    context,
    action,
    data
  );

  // Build console message
  const message = `${levelLabel} ${contextStr}${actionStr}`;

  // Log based on level
  if (level === LOG_LEVELS.error) {
    console.error(`[${timestamp}] ${message}`, logData || '');
  } else if (level === LOG_LEVELS.warn) {
    console.warn(`[${timestamp}] ${message}`, logData || '');
  } else if (level === LOG_LEVELS.debug) {
    console.debug(`[${timestamp}] ${message}`, logData || '');
  } else {
    console.log(`[${timestamp}] ${message}`, logData || '');
  }
};

/**
 * Export logger API
 */
const logger = {
  /**
   * Debug level - for development debugging
   * Example: logger.debug('API', 'request sent', { method, url })
   */
  debug: (context, action, data) => log(LOG_LEVELS.debug, context, action, data),

  /**
   * Info level - for important application events
   * Example: logger.info('LoginPage', 'user logged in', { email })
   */
  info: (context, action, data) => log(LOG_LEVELS.info, context, action, data),

  /**
   * Warn level - for unexpected but recoverable conditions
   * Example: logger.warn('API', 'slow response', { duration: 5000 })
   */
  warn: (context, action, data) => log(LOG_LEVELS.warn, context, action, data),

  /**
   * Error level - for errors that need immediate attention
   * Example: logger.error('LoginPage', 'login failed', error)
   */
  error: (context, action, error) => {
    const errorData = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error;
    log(LOG_LEVELS.error, context, action, errorData);
  },

  /**
   * Get current log level name
   */
  getLogLevel: () => configuredLevel,
};

export default logger;
