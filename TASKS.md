# Badge System — Task Tracker

**Target:** MVP Lancio Settembre 2026 · 10h/week · ~150 ore totali  
**Last Updated:** 2026-06-09 (Session 20: S.10–S.19 fixati, CSV limit 100→500, ESLint 0 warnings)  
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
- [x] **6.3** Custom domain ✅ — `badge.dataxiom.it` → Netlify (custom_domain set, TLS provision post-CNAME), `api.dataxiom.it` → EC2 (già attivo da 6.2). CORS_ORIGIN SSM aggiornato: `badge.dataxiom.it,dataxiom-badge.netlify.app,localhost:5173`. **Azione utente richiesta:** aggiungere CNAME `badge → dataxiom-badge.netlify.app` su register.it.
- [x] **6.4** Load test ✅ — k6, 3 scenari (spike 50 VUs, sustained 10 VUs, dashboard 5 VUs). Risultati: spike 50/50 OK 0 errori 5xx, p95=621ms (target<500ms); sustained p95=179ms ✅; dashboard p95=136ms ✅. Bottleneck: db.t3.micro 1 CPU satura a 50 scritture concorrenti. Fix per <500ms su spike: upgrade a db.t3.small. Per MVP con traffico realistico: ok. Script: scripts/load-test.js. DB_POOL_MAX=20 (optimal per t3.micro, pool=30 era peggiore per CPU contention).
- [x] **6.5** OWASP security review ✅ — 8 findings, 7 fixed (1 open Phase 2). CRITICAL: DISABLE_AUTH production guard (NODE_ENV check), export.js+checkins.js+stats mandatory c.client_id=$1 tenant isolation, resolve*() scoped to client. HIGH: /health db_host/db_port removed, shifts.js notification employee_id validated against client_id. MEDIUM: resolve helpers now pass clientId param. OPEN: localStorage JWT → httpOnly cookie (Phase 2). Commit: eec052a
- [x] **6.6** GDPR retention ✅ — `scripts/audit-log-retention.js`: delete checkins >12m + audit_log >7y, --dry-run flag. `scripts/run-retention.sh`: SSM param fetch wrapper per docker exec. EC2 crontab: `0 2 * * *` UTC → /var/log/badge-retention.log. Tested dry-run: 0 records (seed data giugno 2026). Commit: 1cd1477
- [x] **6.7** CloudWatch alarms ✅ — 8 alarms attivi: EC2 StatusCheck, EC2 CPU>80%, disk>80% (CW agent), RDS CPU>80%, RDS storage<2GB, RDS connections>50, API 5xx>5/5min, API slow>10/5min. SNS badge-alerts → email. pino-http per structured logs + Docker awslogs driver → /badge/api CW Log Group. Metric filters: $.res.statusCode>=500, $.responseTime>1000. Commit: a8dff12
- [x] **6.8** Database backups verified ✅ — RDS `badge-system-db`: backup retention era 0 → abilitato a 1 giorno (free tier max). Snapshot manuale `badge-backup-test-20260608` creato. Restore su `badge-restore-test` completato: 7 tabelle ✅, 338 checkins ✅, 21 employees ✅, 3 clients ✅. Istanza test eliminata post-verifica. Backup window: 02:00-02:30 UTC.

### FASE 7 — First Customer Onboarding (~5-10h)
Go-live with first paying customer (pilota).

- [x] **7.1** Admin panel ✅ — `AdminPage.jsx` `/admin` route (admin-only), tabs Clienti/Sedi/Dipendenti, CSV upload, temp password display + copy button. Navbar link "⚙️ Admin" visibile solo ad admin.
- [x] **7.2** API admin endpoints ✅ — `POST /api/admin/clients`, `POST /api/admin/sites` (QR auto-generato UUID-based), `POST /api/admin/employees` (bcrypt temp password), `GET /api/admin/clients`, `GET /api/admin/sites`. Auth.js extended: DB fallback login con bcrypt verify. Migration 006: `password_hash`, `role`, `site_id` su employees. Commit: 8115eab
- [x] **7.3** CSV bulk import ✅ — `POST /api/admin/employees/import` (multer memory, csv-parse, max 100 righe, parallel bcrypt batches, BEGIN/COMMIT transaction, audit log per ogni riga, ON CONFLICT DO NOTHING). Commit: 9963f4b
- [ ] **7.4** Customer-facing user guide (PDF, Italian)
- [ ] **7.5** Manager training checklist (how to use dashboard + planning)
- [x] **7.6** Welcome email template ✅ — `scripts/welcome-email-template.html`: HTML responsive con credenziali, CTA login, steps per dipendente/manager, GDPR footer. Commit: 8115eab

---

## 🔲 TODO — SECURITY TECH DEBT (open findings from code review)

### Trovati nella sessione 17 — non critici per MVP, da chiudere prima del lancio

- [x] **S.1** `auth.js:34` ✅ — DEMO_USERS limitati a `@badge.local`, tutti gli altri email usano DB bcrypt. Migration 007: password_hash per 4 seeded employees. Commit: d06e41e: se un admin crea un employee reale con la stessa email di un account demo (es. `pippo@badge.local`), il check demo vince sempre. **Fix:** eliminare o isolare DEMO_USERS su `NODE_ENV !== 'production'` oppure invertire l'ordine (DB check prima, DEMO fallback per i soli domini `@badge.local`). Da completare prima del lancio con il primo cliente.
- [x] **S.2** `AdminPage.jsx:476` ✅ — Rimosso dead code: guard `user?.role !== 'admin'` e dichiarazione `user` non più necessaria. `ProtectedRoute` è il gate autoritativo.

### Trovati nella sessione 19 — analisi senior-fullstack + senior-qa + senior-security (22 findings)

**4 CRITICAL — tutti fixati in commit bd338ef:**
- [x] **S.3** `admin.js:13` — `AuthorizationError` non esiste in `utils/errors.js` → TypeError crash per tutti i non-admin su `/api/admin/*`. Fix: → `ForbiddenError`.
- [x] **S.4** `pool.js:26` — `rejectUnauthorized: false` hardcoded in prod → MITM possibile su EC2→RDS. Fix: env var `DB_SSL_REJECT_UNAUTHORIZED` (default `true`). SSM: impostato `false` temporaneamente (CA non nel trust store container Alpine).
- [x] **S.5** `auth.js:37-80` — 5 password DEMO_USERS hardcoded in source code committato su GitHub. Fix: → `process.env.DEMO_*_PASSWORD`. Aggiunte su SSM `/badge/production/DEMO_*_PASSWORD`.
- [x] **S.6** `rateLimiter.js` — MemoryStore (default) resettato ad ogni riavvio container → brute-force su `/api/auth/login` possibile dopo crash. Fix: store ibrido Redis+memory. `Retry-After` ora prima di `res.json()`.

**3 ridondanze frontend fixate (commit bd338ef):**
- [x] **S.7** `LoginPage.jsx` — password prefillate in `useState` + hint box con tutte le credenziali visibile in produzione. Fix: `useState('')` + `{import.meta.env.DEV && ...}`.
- [x] **S.8** `frontend-mobile/endpoints.js` — `DEMO_ACCOUNTS.password: 'Diego1975'` nel bundle iOS. Fix: campo `password` rimosso.
- [x] **S.9** `frontend-mobile/LoginScreen.jsx` — `{DEMO_ACCOUNTS.password}` a schermo in tutti i build. Fix: `{__DEV__ && ...}` + solo email mostrata.

**6 HIGH — ✅ tutti fixati (Session 20):**
- [x] **S.10** `export.js:137` — `LIMIT 50000` + header `X-Total-Count` + `X-Truncated: true` se raggiunto.
- [x] **S.11** `shifts.js` — validazione `employee_id` spostata PRIMA del `withTransaction` → fail fast, no rollback costoso.
- [x] **S.12** `validation.js:379` — password min 6 → **8** char (NIST SP 800-63B).
- [x] **S.13** `admin.js` — `LIMIT 500` su GET /clients, GET /sites, GET /employees + `total` nel response body.
- [x] **S.14** `pool.js` — `statement_timeout` 120000 → **30000** ms.

**5 MEDIUM — ✅ tutti fixati (Session 20):**
- [x] **S.15** `app.js` — Sentry `beforeSend` scrubba `authorization`, `password`, `token`, `cookie`, `x-api-key`.
- [x] **S.16** Creato `src/utils/logger.js` singleton — export.js, checkins.js, audit.js, shifts.js ora condividono un'unica istanza Pino.
- [x] **S.17** Creato `src/utils/resolvers.js` — `resolveEmployeeId`/`resolveSiteId` estratti, rimossi da export.js e checkins.js.
- [x] **S.18** `shifts.js` — `logAudit(pool, ...)` aggiunto dopo `withTransaction`: registra `shift_created`/`shift_updated` con old/new value.
- [x] **S.19** `app.js` — `app.set('trust proxy', 1)` prima di tutto il middleware → `req.ip` ora riflette il client reale.

**4 LOW — backlog:**
- [x] **S.20** `app.js` ✅ — `dotenv.config()` spostato prima di tutti i `require()` (salvo Sentry che deve restare primo per instrumentazione).
- [x] **S.21** `app.js` ✅ — Rimosso commento stale `// Deployment test - mar 2 giu 2026`.
- [x] **S.22** ✅ — `uuid` package rimosso, sostituito con `crypto.randomUUID()` (Node 20+ builtin). `npm uninstall uuid` eseguito.
- [x] **S.23** ✅ Test coverage 9% → 40.37% statements / 41.34% lines. 78 test passati (0 falliti). 5 nuovi file di test con mock pool/Redis/rateLimiter.

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
| 2026-06-08 | FASE 6.1 Sentry + 6.2 HTTPS + 6.4 Load Test (Session 14) | 6.1, 6.2, 6.4 | Sentry attivo su 3 componenti (backend SSM, web Netlify, mobile EAS). HTTPS EC2 cleanup nginx. Load test k6: spike 50 VUs (100% OK, p95=621ms), sustained p95=179ms ✅, dashboard p95=136ms ✅. 0 crash/5xx. Bottleneck: db.t3.micro CPU a 50 write concorrenti. DB_POOL_MAX=20 ottimale. Script: scripts/load-test.js |
| 2026-06-08 | FASE 6.5 OWASP Security Review (Session 14 cont.) | 6.5 | 8 findings: 3 critical (DISABLE_AUTH prod guard, tenant isolation GET/CSV/stats), 2 high (/health info leak, shifts notification validation), 2 medium (resolve helpers scoped), 1 open (localStorage→httpOnly Phase 2). 17/17 tests ✅. Deploy verified: /health clean, auth enforced. Commit: eec052a |
| 2026-06-08 | FASE 6.7 + 6.6 (Session 15) | 6.6, 6.7 | CloudWatch: 8 alarms (EC2 status/CPU/disk, RDS CPU/storage/connections, API 5xx/slow), SNS email, CW agent, awslogs Docker driver, pino-http. GDPR: retention script (checkins >12m + audit_log >7y), cron 02:00 UTC. Commits: a8dff12, 1cd1477 |
| 2026-06-08 | FASE 6.8 (Session 16) | 6.8 | RDS backup retention 0→1 (free tier max). Snapshot `badge-backup-test-20260608`. Restore `badge-restore-test` verificato: 7 tabelle + dati intatti. Istanza test eliminata. |
| 2026-06-08 | FASE 7.1-7.3 + 7.6 (Session 16) | 7.1, 7.2, 7.3, 7.6 | Migration 006 (password_hash+role+site_id). /api/admin routes (clients/sites/employees/CSV import). Auth.js DB fallback. AdminPage (3 tab). Welcome email template. Commit: 8115eab |
| 2026-06-08 | Deep Code Review FASE 6+7 (Session 17) | S.1 parziale | 8 findings (2 critical, 2 high, 2 medium, 2 low). Fixati 6: /refresh DB lookup, cross-tenant login client_id, assigned_sites ownership check (entrambe route), audit_log per admin writes, UUID regex strict, useFetch AbortController. Aperti 2: DEMO_USERS bypass (S.1), dead role guard (S.2). Commit: 6bd7651 |
| 2026-06-08 | Code Review FASE 7 + 8 Fix (Session 18) | S.1 chiuso | Deep review FASE 7 admin panel: 8 findings ALL CONFIRMED, ALL FIXED. F1: CSV bcrypt parallel batches (event loop protection). F2: audit log CSV import (GDPR). F3: UUID guard /refresh (legacy token crash). F4: multi-tenant email guard + mobile clientId param. F5: assigned_sites $8::UUID[] (fragile $N fix). F6: CSV BEGIN/COMMIT transaction. F7: temp_password fuori da Alert string + Sentry scrubber. F8: createValidationMiddleware per admin POST routes. ESLint 0 warnings, build OK. Commit: 9963f4b |
| 2026-06-08 | 3-Skill Security Audit (Session 19) | S.3–S.9 | senior-fullstack + senior-qa + senior-security: 22 findings. 4 CRITICAL + 3 ridondanze frontend fixate (commit bd338ef). 6 HIGH aperti. EC2 SSM aggiornato: 6 nuovi parametri (DEMO_*_PASSWORD + DB_SSL_REJECT_UNAUTHORIZED). Login demo verificato su produzione. |
| 2026-06-09 | Security Fixes HIGH+MEDIUM (Session 20) | S.10–S.19 | 6 HIGH fixati: LIMIT 50000 export, employee_id pre-transaction, password min 8, LIMIT 500 admin lists, statement_timeout 30s. 5 MEDIUM fixati: Sentry scrubber, logger singleton, resolvers.js utility, shifts audit_log, trust proxy. CSV import limit 100→500. ESLint 0 warnings (argsIgnorePattern ^_). |
| 2026-06-09 | FASE 6.3 Custom Domain (Session 21) | 6.3 | `badge.dataxiom.it` → Netlify (custom_domain set). `api.dataxiom.it` → EC2 già attivo. CORS_ORIGIN SSM aggiornato. CNAME aggiunto su register.it. Let's Encrypt provisioned. E2E verificato. |
| 2026-06-09 | Tech Debt LOW (Session 21 cont.) | S.2, S.20, S.21, S.22 | S.2: rimosso dead role guard AdminPage. S.20: dotenv.config() spostato prima dei require. S.21: stale comment rimosso. S.22: uuid→crypto.randomUUID(), pacchetto rimosso. |
| 2026-06-09 | Test Coverage S.23 (Session 22) | S.23 | 5 nuovi file di test con mock pool/Redis/rateLimiter: auth.test.js (22), checkins.test.js (16), middleware.test.js (15), errors.test.js (16), employees.test.js (9). Coverage: 19% → 40.37% statements, 41.34% lines. 78/78 test passati. |

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
- [x] **Production hardening** (6.1–6.8) ✅ custom domain badge.dataxiom.it live
- [ ] **First customer onboarded** (7.1–7.6)

---

*Update this file at the end of each session: mark completed tasks `[x]`, add the session to the log, and adjust priorities if needed.*
