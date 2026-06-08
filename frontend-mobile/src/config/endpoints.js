/**
 * Centralized app configuration
 * Single source of truth for all constants, endpoints, and UI config
 */

export const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.dataxiom.it';

export const ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/api/auth/login',
  AUTH_LOGOUT: '/api/auth/logout',

  // Check-ins
  CHECKINS_POST: '/api/checkins',
  CHECKINS_LIST: '/api/checkins',

  // Shifts
  SHIFTS_MY_SCHEDULE: '/api/shifts/my-schedule',

  // Health
  HEALTH: '/health',
};

// Shift configuration (for Planning page and schedule views)
export const SHIFTS_CONFIG = {
  LABELS: {
    m: 'Mattino',
    p: 'Pomeriggio',
    s: 'Sera',
    R: 'Riposo',
  },
  COLORS: {
    m: '#1E3A5F',
    p: '#B45309',
    s: '#7C3AED',
    R: '#6B7280',
  },
  ICONS: {
    m: '🌅',
    p: '☀️',
    s: '🌙',
    R: '❌',
  },
};

// Check-in configuration (for MyPresencesScreen)
export const CHECKINS_CONFIG = {
  TYPE_COLORS: {
    IN: '#166534',
    OUT: '#7C3AED',
  },
  TYPE_ICONS: {
    IN: '→',
    OUT: '←',
  },
  DEFAULTS: {
    LIMIT: 50, // Default checkins per fetch
  },
};

// Demo credentials for development/testing
export const DEMO_ACCOUNTS = {
  employee: { email: 'alice.neri@employee.it', password: 'Alice1975' },
  manager: { email: 'diego@badge.local', password: 'Diego1975' },
  // Legacy alias (kept for backwards compatibility in LoginScreen)
  email: 'alice.neri@employee.it',
  password: 'Alice1975',
};

// Timing configuration (in milliseconds)
export const TIMING = {
  API_TIMEOUT: 15000,           // API request timeout
  CLOCK_TICK: 1000,              // Clock update frequency
  SUCCESS_AUTO_RETURN: 5000,     // Auto-return delay on success screen
};

// Storage keys for AsyncStorage persistence
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'badge_auth_token',
  USER_DATA: 'badge_user',
};

export default { API_BASE, ENDPOINTS, SHIFTS_CONFIG, CHECKINS_CONFIG, DEMO_ACCOUNTS, TIMING, STORAGE_KEYS };
