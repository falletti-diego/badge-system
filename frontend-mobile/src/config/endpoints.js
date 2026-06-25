/**
 * Centralized app configuration
 * Single source of truth for all constants, endpoints, and UI config
 */

export const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.dataxiom.it';

export const ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/api/v1/auth/login',
  AUTH_LOGOUT: '/api/v1/auth/logout',
  AUTH_REFRESH: '/api/v1/auth/refresh',

  // Check-ins
  CHECKINS_POST: '/api/v1/checkins',
  CHECKINS_LIST: '/api/v1/checkins',

  // Consent (GDPR Art. 7)
  CONSENT_GPS_ACCEPTANCE: '/api/v1/consent/gps-acceptance',

  // Shifts
  SHIFTS_MY_SCHEDULE: '/api/v1/shifts/my-schedule',

  // Leaves (ferie) — employee
  LEAVES_LIST: '/api/v1/leave/my-requests',
  LEAVES_CREATE: '/api/v1/leave/request',
  LEAVES_BALANCE: '/api/v1/leave/balance',
  // Leaves (ferie) — manager
  LEAVES_PENDING: '/api/v1/leave/pending',

  // Illnesses (malattia)
  ILLNESS_REPORT: '/api/v1/illnesses/report',
  ILLNESS_LIST: '/api/v1/illnesses/by-date-range',

  // Health
  HEALTH: '/health',
};

// Leave types — all three shown
export const LEAVE_TYPES = [
  { value: 'FERIE_1', label: 'Ferie ordinarie' },
  { value: 'FERIE_2', label: 'Ex-festività' },
  { value: 'FERIE_3', label: 'Permessi ROL' },
];

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
    LIMIT: 50,
  },
};

// Demo account emails (post-Session-46 cleanup)
// Passwords are never stored client-side — set via DEMO_*_PASSWORD env vars on the backend
export const DEMO_ACCOUNTS = {
  employee: { email: 'maria@badge.local' },
  manager: { email: 'pino@badge.local' },
  admin: { email: 'pippo@badge.local' },
  // Legacy alias used by LoginScreen __DEV__ hint
  email: 'maria@badge.local',
};

// Timing configuration (in milliseconds)
export const TIMING = {
  API_TIMEOUT: 15000,
  CLOCK_TICK: 1000,
  SUCCESS_AUTO_RETURN: 5000,
};

// Storage keys for AsyncStorage persistence
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'badge_auth_token',
  REFRESH_TOKEN: 'badge_refresh_token',
  USER_DATA: 'badge_user',
};

export default { API_BASE, ENDPOINTS, LEAVE_TYPES, SHIFTS_CONFIG, CHECKINS_CONFIG, DEMO_ACCOUNTS, TIMING, STORAGE_KEYS };
