/**
 * Centralized API endpoint configuration
 * Single source of truth for all API routes
 */

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.dataxiom.it';

export const ENDPOINTS = {
  // Auth
  AUTH_LOGIN: `${API_BASE}/api/auth/login`,
  AUTH_LOGOUT: `${API_BASE}/api/auth/logout`,

  // Check-ins
  CHECKINS_POST: `${API_BASE}/api/checkins`,
  CHECKINS_LIST: `${API_BASE}/api/checkins`,

  // Shifts
  SHIFTS_MY_SCHEDULE: `${API_BASE}/api/shifts/my-schedule`,

  // Health
  HEALTH: `${API_BASE}/health`,
};

export default ENDPOINTS;
