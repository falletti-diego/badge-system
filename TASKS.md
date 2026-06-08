# Badge System — Task Tracker

**Target:** MVP Lancio Settembre 2026 · 10h/week · ~150 ore totali  
**Last Updated:** 2026-06-08 (Session 13: Manager mobile Build 9 ✅ + FASE 6.2 HTTPS EC2 ✅ nginx cleanup)  
**Production:** https://dataxiom-badge.netlify.app · API: https://api.dataxiom.it

---

## ✅ COMPLETED

### FASE 1 — Infrastructure
- [x] **1.1** GitHub repo setup + SSH key + git workflow
- [x] **1.2** AWS account: RDS (PostgreSQL), EC2 (t3.small), ECR, IAM roles
- [x] **1.3** Docker: Dockerfile, docker-compose, dumb-init, non-root user
- [x] **1.4** CI/CD: GitHub Actions pipeline (lint → ECR push → EC2 SSH deploy)
- [x] **1.5** Database schema: clients, sites, employees, check_ins, audit_log, shifts tables
- [x] **1.6** Seed data: 528 check-ins, 5 employees, 3 sites (June 2026)

### FASE 2 — Backend API
- [x] **2.1** `POST /api/auth/login` + `POST /api/auth/logout` (mock auth, JWT)
- [x] **2.2** `GET /api/checkins` + `POST /api/checkins` + `PUT /api/checkins/:id`
- [x] **2.3** `GET /api/checkins/stats` (KPI aggregates)
- [x] **2.4** `GET /api/employees` (list with filtering)
- [x] **2.5** `GET /api/export/csv` (CSV download)
- [x] **2.6** `GET /api/shifts/:siteId` + `POST /api/shifts/:siteId` (shift planning)
- [x] **2.7** `GET /api/shifts/my-schedule` (employee personal schedule)
- [x] **2.8** `GET /api/shifts/:siteId/export` (shift CSV export)
- [x] **2.9** Auth middleware: JWT validation, role extraction (employee_id, site_id)
- [x] **2.10** Role-based data filtering: employees see own data, managers see store data
- [x] **2.11** Rate limiting (api, auth, csv endpoints)
- [x] **2.12** Audit logging on check-in corrections + shift changes
- [x] **2.13** CORS enabled for `https://dataxiom-badge.netlify.app`

### FASE 3.1 — Web Dashboard: Auth
- [x] **3.1.1** Login page UI (email + password form, design system)
- [x] **3.1.2** JWT token flow: login → localStorage → auth headers
- [x] **3.1.3** Auto-redirect: logged-in → /dashboard, logged-out → /login
- [x] **3.1.4** 9 demo accounts (admin, managers, employees with real DB IDs)
- [x] **3.1.5** Logout clears all role context from localStorage

### FASE 3.2 — Web Dashboard: Presences
- [x] **3.2.1** KPI cards: Check-ins IN/OUT, unique employees, avg time
- [x] **3.2.2** Presences table: paginated, sortable, with employee + site info
- [x] **3.2.3** Filters: date range, site, employee name, check-in type
- [x] **3.2.4** CSV export from dashboard (filtered)
- [x] **3.2.5** Role-based auto-filter: employees see own, managers see store
- [x] **3.2.6** HTTPS on Netlify (Let's Encrypt, valid 288 days until 2027-03-19)
- [x] **3.2.7** Real-time data (no polling, fetch on mount + filter change)

### FASE 3.3 — Web Dashboard: Planning (Shift Management)
- [x] **3.3.1** `PlanningPage.jsx`: manager matrix view (employees × days of month)
- [x] **3.3.2** Shift dropdown per cell: m/p/s/R with color coding
- [x] **3.3.3** Auto-save on change + explicit Save/Reset buttons
- [x] **3.3.4** Change detection: red badges on modified cells, count in Save button
- [x] **3.3.5** KPI cards: Dipendenti, Turni Assegnati (X/Y), Giorni del Mese
- [x] **3.3.6** Month/year navigation
- [x] **3.3.7** CSV export with dynamic filename (planning_giugno_2026.csv)
- [x] **3.3.8** `EmployeeShiftsPage.jsx`: read-only personal schedule view
- [x] **3.3.9** Backend API integrated (real DB persistence, not local state)

### FASE 3.x — Deploy Tooling & Security
- [x] **3.x.1** `scripts/deploy.sh`: build → push → HTTPS cert verify → CORS preflight × 7 endpoints → auth smoke test
- [x] **3.x.2** `.claude/skills/deploy/SKILL.md`: `/deploy` skill with troubleshooting guide
- [x] **3.x.3** RBAC fix: `GET /employees` → 403 for employee role
- [x] **3.x.4** RBAC fix: `GET /export/csv` → 403 for employee role (hard block, no silent data leak)
- [x] **3.x.5** `scripts/test-api.sh`: 23-test automated API suite (auth, RBAC, CORS, all endpoints)
- [x] **3.x.6** `.claude/skills/api-test/SKILL.md`: `/api-test` skill (eliminates 150+ manual curl commands)
- [x] **3.x.7** CI fix: `port already allocated` in `deploy-to-ec2.yml` (targeted port kill, no daemon restart)
- [x] **3.x.8** `scripts/wait-healthy.sh`: smart Docker health poller (exponential backoff, crash detection)
- [x] **3.x.9** `deploy-to-ec2.yml`: integrated `wait-healthy.sh` via `scp-action` (replaces 35-line sleep loops)
- [x] **3.x.10** `backend/Dockerfile`: SSM bootstrap — fetch secrets at container startup from AWS SSM
- [x] **3.x.11** `scripts/entrypoint.sh`: bootstrap script (fetch SSM → validate critical vars → drop to nodejs → exec)
- [x] **3.x.12** `infrastructure/iam-ssm-policy.json`: IAM inline policy attached to EC2 role
- [x] **3.x.13** 14 SSM parameters populated under `/badge/production/*` (DB, JWT, CORS, config)
- [x] **3.x.14** `deploy-to-ec2.yml`: removed hardcoded `-e` secret flags — secrets come from SSM at runtime

### FASE 3.x — Code Review & Quality (Session 10)
- [x] **3.x.15** `routes/auth.js`: removed JWT_SECRET fallback `'test-secret-mvp'` — server now fails fast at startup if env var missing (CRITICAL: forgeable tokens)
- [x] **3.x.16** `routes/export.js`: added RBAC filter for manager role — managers can only export CSV for their assigned site (CRITICAL: data breach)
- [x] **3.x.17** `middleware/auth.js`: replaced `res.status(500).json()` with `next(err)` in catch — unexpected errors now reach global error handler and Sentry
- [x] **3.x.18** `hooks/usePresences.js`: `fetchStats` now calls `setError` on failure — KPI card errors are visible to the user instead of silently swallowed
- [x] **3.x.19** `CorrectionsPage.jsx`: added `disabled={loading}` to Cerca/Reset buttons — eliminates race condition from parallel filter fetches
- [x] **3.x.20** `PlanningPage.jsx`: added `disabled={isSaving}` to all shift Select cells and Export CSV button — prevents silent shift loss on concurrent edits; fixed hardcoded title 'Giugno 2026' → dynamic
- [x] **3.x.21** `apiClient.js`: removed stale `auth_token` fallback from request interceptor — only `badge_auth_token` is read
- [x] **3.x.22** `backend/jest.setup.js`: added Jest setup file with test-only env vars — fixes test suite crash introduced by JWT_SECRET fail-fast guard

### FASE 3.x — MASVS L1 Security Baseline (Session 11)
- [x] **3.x.23** `routes/auth.js`: JWT HS256 → RS256 — private key signs, public key verifies; access token 15min, refresh token 7d; `POST /api/auth/refresh` endpoint added (CRITICAL: token forgery eliminated)
- [x] **3.x.24** `middleware/auth.js`: updated to verify RS256 with JWT_PUBLIC_KEY — `{ algorithms: ['RS256'] }` enforced; PEM newline handling via `.replace(/\\n/g, '\n')`
- [x] **3.x.25** `scripts/entrypoint.sh`: CRITICAL_VARS updated — `JWT_SECRET`/`JWT_REFRESH_SECRET` → `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`; container refuses start if missing
- [x] **3.x.26** `backend/jest.setup.js`: replaced hardcoded test secrets with runtime RSA key generation (`generateKeyPairSync`) — no keys ever stored in repo
- [x] **3.x.27** AWS SSM: RSA keypair (2048-bit) generated locally → stored as SecureString/String under `/badge/production/JWT_PRIVATE_KEY` + `JWT_PUBLIC_KEY`; local files deleted immediately after
- [x] **3.x.28** `src/auth/password.js` (NEW): bcryptjs module — `hashPassword()` + `verifyPassword()` with cost 12; ready for Auth0 migration (OWASP minimum: cost 10)
- [x] **3.x.29** `src/app.js`: CORS hardening — removed `localhost` from production fallback; only `https://dataxiom-badge.netlify.app` allowed when CORS_ORIGIN env var not set
- [x] **3.x.30** `.github/workflows/ci.yml`: replaced fake security step with real `npm audit --audit-level=high` + `detect-secrets scan` (KeywordDetector disabled for demo passwords)
- [x] **3.x.31** `scripts/audit-log-retention.js` (NEW): GDPR 7-year retention cleanup — deletes `audit_log` records older than 2555 days; `--dry-run` flag; to be scheduled via AWS EventBridge Scheduler
- [x] **3.x.32** `frontend-web/src/services/authService.js`: login stores `refresh_token`; logout clears it; `getRefreshToken()` + `refreshAccessToken()` methods added
- [x] **3.x.33** `frontend-web/src/services/apiClient.js`: auto-refresh interceptor on 401 — queue-based retry for concurrent requests; single refresh call in flight; redirects to /login on refresh failure

### FASE 5 + Mobile — End-to-End Testing & Fixes (Session 12)
- [x] **3.x.34** `QRScannerScreen.jsx`: fixed `user?.id` → `user?.employee_id` — mock user IDs are non-UUID, Zod validation was rejecting all check-ins with 400
- [x] **3.x.35** RDS migration: `004_add_client_id_to_checkins` applied manually — `client_id` column was missing from `checkins` table (migration existed in repo but never run on current RDS instance)
- [x] **3.x.36** `routes/checkins.js`: `created_by` now uses `employee_id` instead of `req.user.user_id` — mock user IDs are non-UUID strings, DB column is UUID type
- [x] **3.x.37** `QRScannerScreen.jsx`: added IN/OUT toggle UI — green=Entrata, red=Uscita; resets scan state on toggle
- [x] **3.x.38** ✅ VERIFIED END-TO-END on real iPhone via TestFlight: Login → QR scan → IN check-in ✅ → OUT check-in ✅

---

## 🔲 TODO — NEXT PRIORITY

### FASE 3.4 — Web Dashboard: Corrections Page ✅
Manager corrects a check-in (wrong time, missed punch, wrong direction).

- [x] **3.4.1** `CorrectionsPage.jsx` — searchable list of check-ins with "Edit" button
- [x] **3.4.2** Edit modal: change timestamp, type (IN/OUT), add correction note
- [x] **3.4.3** 7-day edit window enforced (backend + frontend; `CORRECTION_WINDOW_EXPIRED` error)
- [x] **3.4.4** Audit trail visible in UI: show "Corretto da X il Y" on corrected entries
- [x] **3.4.5** Route `/corrections` in `App.jsx` (manager + admin only)
- [x] **3.4.6** Link "✏️ Correzioni" in Dashboard navbar
- [x] **3.4.7** Backend: `correction_note TEXT` + `modified_by_name TEXT` columns on checkins
- [x] **3.4.8** Backend: `PUT /api/checkins/:id` — 7-day window, dynamic SET, ownership via JOIN
- [x] **3.4.9** Backend: `audit.js` fixed (no client_id, UUID-safe user_id, non-fatal)

### FASE 3.5 — Web Dashboard: Notifications ✅
Employee gets notified when manager changes their shift.

- [x] **3.5.1** `GET /api/notifications` polling endpoint (backend)
- [x] **3.5.2** Notification record created when shift is saved (backend, best-effort outside transaction)
- [x] **3.5.3** `NotificationBell.jsx` component: icon + unread count badge (MUI Badge + Popover)
- [x] **3.5.4** Notification list dropdown (last 10, mark all read)
- [x] **3.5.5** `useNotifications.js` poll every 30s when employee is logged in
- [x] **3.5.6** Migration 003: notifications table on RDS
- [x] **3.5.7** fix: redis reconnectStrategy — cap at 3 retries to unblock server startup

---

## 🔲 TODO — MEDIUM PRIORITY

### FASE 4 — Mobile App: React Native (~25-35h)
The primary check-in interface for employees.

- [x] **4.1** React Native project scaffold (Expo SDK 54)
- [x] **4.2** Login screen (email + password → JWT → AsyncStorage)
- [x] **4.3** QR code scanner (CameraView + expo-camera barcode scanning)
- [x] **4.4** Face ID authentication (`expo-local-authentication`)
- [x] **4.5** Check-in flow: scan QR → Face ID → POST /api/checkins → confirmation screen
- [x] **4.6** My Schedule screen (read-only, calls `GET /api/shifts/my-schedule`)
- [x] **4.7** My Presences screen (list of own check-ins)
- [x] **4.8** Offline detection + user-friendly error (NetInfo)
- [x] **4.9** App icon, splash screen, push to TestFlight / Play Store internal track
- [x] **4.10** `StorePresencesScreen`: manager view of all store check-ins — date filters (Oggi/7gg/Mese), stats bar (dipendenti/entrate/uscite), employee avatar con iniziali
- [x] **4.11** Manager QR check-in: migration 005 (Diego employee record su RDS), employee_id nel JWT, `CheckInScreen` role-aware (QR + Presenze Store per manager)
- [x] **4.12** Build 6: StorePresencesScreen ✅ testata su iPhone — manager vede presenze store
- [x] **4.13** Build 7: fix duplicate check-in IN (stale closure useState → useRef guard sincrono)
- [x] **4.14** Build 8: fix crash QR scanner (useRef mancante dall'import React)
- [x] **4.15** Build 9: 5 fix da code review (AbortController signal corretto, truncation banner 200 records, initials '?' per nome vuoto, role guard redirect, dead code rimosso) ✅ testata su iPhone

### FASE 5 — QR Code Management ✅
Admin generates and manages QR codes per site.

- [x] **5.1** `GET /api/sites` endpoint (admin: all sites, manager: own site only, employee: 403)
- [x] **5.2** QR code content format: `badge://checkin?site_id=<uuid>&client_id=<uuid>&v=1`
- [x] **5.3** QR code displayed in `/admin/sites` page + PNG download button
- [x] **5.4** Migration 004: updated placeholder QR content to proper format on RDS
- [ ] **5.5** Rotate QR code — Phase 2 (not needed for MVP)

### FASE 6 — Production Hardening (~10-15h)
Before first paying customer.

- [x] **6.1** Sentry integration ATTIVA ✅ — backend (DSN in SSM, @sentry/node, Sentry.setUser per contesto utente), web (VITE_SENTRY_DSN in Netlify, source maps uploadati, DSN nel bundle verificato), mobile (EXPO_PUBLIC_SENTRY_DSN in EAS production, @sentry/react-native, Sentry.wrap). Org: dataxium | Projects: badge-backend / badge-web / badge-mobile. Build 10 richiesta per attivare mobile.
- [x] **6.2** HTTPS on API (EC2) — Let's Encrypt ✅ (già attivo da Jun 3, scade Sep 1 2026, auto-renewal certbot.timer). Pulizia nginx: rimosso badge-api (server_name _ con self-signed), rimosso /etc/nginx/ssl/. Solo api-dataxiom attivo in sites-enabled.
- [ ] **6.3** Custom domain (e.g., `app.badge.dataxiom.it` → Netlify, `api.badge.dataxiom.it` → EC2)
- [ ] **6.4** Load test: 50 simultaneous check-ins (k6 or Artillery)
- [ ] **6.5** OWASP security review (input sanitization, SQL injection, XSS, CSRF)
- [ ] **6.6** GDPR: data retention policy enforcement (delete records > 12 months)
- [ ] **6.7** CloudWatch alarms: API response time > 1s, error rate > 1%, disk > 80%
- [ ] **6.8** Database backups verified (RDS automated, test point-in-time restore)

### FASE 7 — First Customer Onboarding (~5-10h)
Go-live with first paying customer (pilota).

- [ ] **7.1** Admin panel: create client, add sites, add employees
- [ ] **7.2** `POST /api/admin/clients` + `POST /api/admin/sites` + `POST /api/admin/employees` endpoints
- [ ] **7.3** Employee bulk import via CSV upload
- [ ] **7.4** Customer-facing user guide (PDF, Italian)
- [ ] **7.5** Manager training checklist (how to use dashboard + planning)
- [ ] **7.6** Welcome email template with login credentials

---

## 🔲 TODO — LOW PRIORITY / PHASE 2

### Auth0 Migration (~5h)
*Trigger: when Badge System generates first revenue*

- [ ] **A.1** Auth0 tenant setup (eu region, badge-system app)
- [ ] **A.2** Replace mock DEMO_USERS in `backend/src/routes/auth.js`
- [ ] **A.3** Auth0 SDK integration in backend (token validation)
- [ ] **A.4** Auth0 Rules for role assignment (manager, employee, admin)
- [ ] **A.5** Face ID via Auth0 Biometric (or native device biometric + Auth0 MFA)
- [ ] **A.6** User management UI (Auth0 dashboard or custom)

### Advanced Planning Features (~5h)
- [ ] **P.1** "Copia Settimana" button — copy week's shifts to next week
- [ ] **P.2** PDF export of monthly planning (printable format)
- [ ] **P.3** Double-shift warning (same employee assigned twice in one day)
- [ ] **P.4** Weekly view (7 days instead of full month)

### Offline Mode (~10h)
- [ ] **O.1** Service Worker for mobile app offline caching
- [ ] **O.2** Queue check-ins when offline, sync when reconnected
- [ ] **O.3** Offline shift viewing (read-only cached schedule)

---

## 📋 SESSION LOG

| Date | Session | Completed | Notes |
|------|---------|-----------|-------|
| 2026-05-28 | Infrastructure Setup | 1.1–1.4 | GitHub, AWS, Docker, CI/CD |
| 2026-06-01 | Backend Deployment | 1.5, 1.6, 2.1–2.5 | DB schema, seed data, core API |
| 2026-06-02 | Backend Fixes + Testing | 2.6–2.12 | Transactions, pagination, audit log |
| 2026-06-03 | Auth + Dashboard | 3.1.1–3.1.5, 3.2.1–3.2.7 | Login, dashboard, CSV, HTTPS |
| 2026-06-04 | Role Filtering + Planning | 3.2.5, 3.3.1–3.3.9 | RBAC, shift matrix, employee view |
| 2026-06-04 | Deploy Tooling + CORS | 2.13, 3.x.1, 3.x.2 | deploy.sh, /deploy skill, CORS fix |
| 2026-06-05 | Corrections Page | 3.4.1–3.4.9 | CorrectionsPage, PUT checkins, audit fix |
| 2026-06-05 | Notifications | 3.5.1–3.5.7 | NotificationBell, polling, redis startup fix |
| 2026-06-05 | QR Code Management | 5.1–5.4 | GET /api/sites, SitesPage, PNG download, migration 004 |
| 2026-06-05 | Mobile App (Part 1) | 4.1–4.8 | Expo SDK 54, login flow, QR scanner (CameraView), Face ID, flow fixes |
| 2026-06-06 | FASE 4.1 Config Review | — | 7 config sources consolidated → 1, 3 critical bugs fixed, 97% production ready |
| 2026-06-06 | FASE 4.2 Device Testing Plan | — | Comprehensive testing plan (50+ scenarios), build instructions, readiness verification |
| 2026-06-07 | DevOps + Security (Session 9) | 3.x.3–3.x.14 | RBAC fixes, `/api-test` skill (23 tests), CI port-conflict fix, `wait-healthy.sh`, SSM Parameter Store bootstrap (14 params, IAM policy, entrypoint.sh — 23/23 ✅) |
| 2026-06-07 | Code Review + Fixes (Session 10) | 3.x.15–3.x.22 | Multi-angle code review (7 findings: 2 critical, 3 medium, 2 low) — JWT_SECRET fail-fast, RBAC export, next(err), fetchStats errors, race conditions, PlanningPage UX, apiClient cleanup. Jest setup fix. 17/17 ✅ deploy verified 12/12 ✅ |
| 2026-06-08 | MASVS L1 Security Baseline (Session 11) | 3.x.23–3.x.33 | JWT HS256→RS256 (15min access + 7d refresh, SSM keypair), bcryptjs module (cost 12), CORS localhost rimosso, CI npm audit + detect-secrets, GDPR audit-log retention script, frontend auto-refresh interceptor. Commits: f1837b6 + 184da25. 17/17 ✅ produzione RS256 verificata. |
| 2026-06-08 | FASE 4.9 + E2E Testing (Session 12) | 4.9, 3.x.34–3.x.38 | TestFlight ✅ (build 5). 3 bug critici fixati: employee_id UUID, client_id migration RDS, created_by UUID. IN/OUT toggle aggiunto. Flusso core verificato su iPhone reale. Commits: e2ee6f5→76aa4ba |
| 2026-06-08 | Manager Mobile Features + Build 9 (Session 13) | 4.10–4.15 | StorePresencesScreen (manager vede presenze store). Manager QR check-in (migration 005, employee_id JWT). Build 6→7→8→9: fix duplicate IN (useRef), fix crash import, 5 code review fixes (AbortController, truncation, initials, role guard, dead code). Build 9 ✅ testata su iPhone. Commit: 82e93fc |

---

## 🎯 MVP LAUNCH CHECKLIST (Settembre 2026)

- [x] Backend API deployed + stable
- [x] Web dashboard live on Netlify with HTTPS
- [x] Auth + role-based access working
- [x] Presences tracking (check-ins) working
- [x] Shift planning (manager + employee views)
- [x] **Corrections page** (3.4)
- [x] **Mobile app** (4.1–4.15) ✅ Build 9 testata su iPhone
- [x] **QR code management** (5.1–5.5) — critical path
- [ ] **Production hardening** (6.1–6.8)
- [ ] **First customer onboarded** (7.1–7.6)

---

*Update this file at the end of each session: mark completed tasks `[x]`, add the session to the log, and adjust priorities if needed.*
