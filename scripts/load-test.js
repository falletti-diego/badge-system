/**
 * FASE 6.4 — Load Test
 * Goal: 50 simultaneous check-ins, identify bottlenecks
 * Target: p95 < 500ms, error rate < 5% (success criteria from CLAUDE.md)
 *
 * Scenarios:
 *  1. spike_50   — 50 VUs fire simultaneously, 1 check-in each (main test)
 *  2. sustained  — 10 VUs × 90s with realistic pacing (steady-state)
 *  3. dashboard  — 5 VUs reading presences while check-ins happen (concurrent reads)
 *
 * Run:
 *   k6 run scripts/load-test.js
 *   k6 run scripts/load-test.js --out json=load-test-results.json   (full results)
 */

import http from 'k6/http';
import { sleep, check, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.dataxiom.it';

const SITE_ID = '550e8400-e29b-41d4-a716-446655440012'; // Torino Store

// Demo accounts with employee UUIDs assigned to Torino Store (site 440012)
// Note: luca.verdi is at site 440011 (Milano), NOT included here
const ACCOUNTS = [
  {
    email: 'alice.neri@employee.it',
    password: 'Alice1975',
    employee_id: '550e8400-e29b-41d4-a716-446655440103',
  },
  {
    email: 'carlo.rossi@employee.it',
    password: 'Carlo1975',
    employee_id: '550e8400-e29b-41d4-a716-446655440104',
  },
  {
    email: 'paolo.sordo@employee.it',
    password: 'Paolo1975',
    employee_id: '550e8400-e29b-41d4-a716-446655440116',
  },
  {
    email: 'diego@badge.local',
    password: 'Diego1975',
    employee_id: '550e8400-e29b-41d4-a716-446655440200',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Custom metrics
// ─────────────────────────────────────────────────────────────────────────────

const checkinDuration = new Trend('checkin_duration_ms', true);
const dashboardDuration = new Trend('dashboard_duration_ms', true);
const rateLimited = new Counter('rate_limited_429');
const serverErrors = new Counter('server_errors_5xx');
const checkinErrors = new Rate('checkin_error_rate');

// ─────────────────────────────────────────────────────────────────────────────
// Test options
// ─────────────────────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // 1. SPIKE: 50 VUs fire simultaneously — each does 1 check-in
    spike_50: {
      executor: 'shared-iterations',
      vus: 50,
      iterations: 50,
      maxDuration: '60s',
      startTime: '5s', // small delay to let setup settle
      tags: { scenario: 'spike' },
    },

    // 2. SUSTAINED: 10 VUs looping with realistic pacing
    sustained: {
      executor: 'constant-vus',
      vus: 10,
      duration: '90s',
      startTime: '80s', // start after spike completes
      exec: 'sustainedCheckin',
      tags: { scenario: 'sustained' },
    },

    // 3. DASHBOARD: concurrent GET reads while sustained check-ins run
    dashboard_reads: {
      executor: 'constant-vus',
      vus: 5,
      duration: '90s',
      startTime: '80s',
      exec: 'dashboardRead',
      tags: { scenario: 'dashboard' },
    },
  },

  thresholds: {
    // CLAUDE.md success criteria: API response time < 500ms
    'http_req_duration{scenario:spike}': ['p(95)<500', 'p(99)<1500'],
    'http_req_duration{scenario:sustained}': ['p(95)<500'],
    'http_req_duration{scenario:dashboard}': ['p(95)<3000'], // CLAUDE.md: dashboard loads < 3s
    'checkin_duration_ms': ['p(95)<500'],
    'checkin_error_rate': ['rate<0.05'],
    // 429s are expected from rate limiter — track separately
    'http_req_failed': ['rate<0.20'], // allow up to 20% failures (includes expected 429s)
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Setup: obtain JWT tokens (runs once before all VUs)
// Auth limiter: 5 req/min per IP — login exactly 5 accounts
// ─────────────────────────────────────────────────────────────────────────────

export function setup() {
  console.log('=== BADGE SYSTEM LOAD TEST — FASE 6.4 ===');
  console.log(`Target: ${BASE_URL}`);
  console.log('Logging in 5 demo accounts...');

  const tokens = [];

  for (const account of ACCOUNTS) {
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: account.email, password: account.password }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (res.status === 200) {
      const body = JSON.parse(res.body);
      tokens.push({
        token: body.data.token,
        employee_id: account.employee_id,
        label: account.email.split('@')[0],
      });
      console.log(`  ✓ ${account.email} → token obtained`);
    } else if (res.status === 429) {
      console.warn(`  ✗ ${account.email} → rate limited (429) — reducing to ${tokens.length} tokens`);
      break;
    } else {
      console.warn(`  ✗ ${account.email} → login failed (${res.status}): ${res.body.substring(0, 100)}`);
    }

    sleep(13); // auth limiter = 5 req/min per IP → 1 every 12s minimum
  }

  if (tokens.length === 0) {
    console.error('FATAL: No tokens obtained. Aborting test.');
    return { tokens: [] };
  }

  console.log(`Setup complete: ${tokens.length} tokens, ${tokens.length * 100}/min API capacity`);

  // Warm up DB pool: fire 1 health check
  const health = http.get(`${BASE_URL}/health`);
  console.log(`Health check: ${health.status} — ${health.timings.duration.toFixed(0)}ms`);

  return { tokens };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Spike (default) — 1 check-in per VU
// ─────────────────────────────────────────────────────────────────────────────

export default function (data) {
  const { tokens } = data;
  if (!tokens || tokens.length === 0) return;

  const account = tokens[__VU % tokens.length];

  group('spike_checkin', function () {
    const checkinType = __VU % 2 === 0 ? 'IN' : 'OUT';

    const res = http.post(
      `${BASE_URL}/api/checkins`,
      JSON.stringify({
        employee_id: account.employee_id,
        site_id: SITE_ID,
        type: checkinType,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${account.token}`,
        },
        tags: { endpoint: 'POST_checkins', account: account.label },
      }
    );

    checkinDuration.add(res.timings.duration);

    const isSuccess = res.status === 201;
    const isRateLimit = res.status === 429;
    const isServerError = res.status >= 500;

    if (isRateLimit) rateLimited.add(1);
    if (isServerError) serverErrors.add(1);
    checkinErrors.add(isSuccess ? 0 : isRateLimit ? 0 : 1); // 429s excluded from error rate

    check(res, {
      'check-in created (201)': (r) => r.status === 201,
      'response < 500ms': (r) => r.timings.duration < 500,
      'has checkin id': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data?.id !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (res.status !== 201) {
      console.log(
        `VU${__VU} (${account.label}) → ${res.status} [${res.timings.duration.toFixed(0)}ms]: ${res.body.substring(0, 150)}`
      );
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Sustained check-ins with realistic pacing
// ─────────────────────────────────────────────────────────────────────────────

export function sustainedCheckin(data) {
  const { tokens } = data;
  if (!tokens || tokens.length === 0) return;

  const account = tokens[__VU % tokens.length];
  const checkinType = __ITER % 2 === 0 ? 'IN' : 'OUT';

  const res = http.post(
    `${BASE_URL}/api/checkins`,
    JSON.stringify({
      employee_id: account.employee_id,
      site_id: SITE_ID,
      type: checkinType,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${account.token}`,
      },
      tags: { endpoint: 'POST_checkins', account: account.label },
    }
  );

  checkinDuration.add(res.timings.duration);

  check(res, {
    'check-in 201 or 429': (r) => r.status === 201 || r.status === 429,
    'response < 500ms': (r) => r.timings.duration < 500,
  });

  // Realistic pacing: employees check in every 4-8s across 10 VUs
  // = ~1.5-2.5 req/s per token, well under 100/min rate limit
  sleep(4 + Math.random() * 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Dashboard reads (concurrent with check-ins)
// ─────────────────────────────────────────────────────────────────────────────

export function dashboardRead(data) {
  const { tokens } = data;
  if (!tokens || tokens.length === 0) return;

  // Use manager/admin token for dashboard reads
  const adminAccount = tokens[0];

  group('dashboard_reads', function () {
    // GET /api/checkins — presences table
    const presences = http.get(
      `${BASE_URL}/api/checkins?limit=50`,
      {
        headers: { Authorization: `Bearer ${adminAccount.token}` },
        tags: { endpoint: 'GET_checkins' },
      }
    );

    dashboardDuration.add(presences.timings.duration);

    check(presences, {
      'presences 200': (r) => r.status === 200,
      'dashboard < 3000ms': (r) => r.timings.duration < 3000,
    });

    sleep(1);

    // GET /api/checkins/stats — KPI cards
    const stats = http.get(
      `${BASE_URL}/api/checkins/stats`,
      {
        headers: { Authorization: `Bearer ${adminAccount.token}` },
        tags: { endpoint: 'GET_stats' },
      }
    );

    check(stats, {
      'stats 200': (r) => r.status === 200,
    });
  });

  sleep(3 + Math.random() * 2);
}
