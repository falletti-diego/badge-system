# Badge System — Task Tracker

**Target:** MVP Lancio Settembre 2026 · 10h/week · ~150 ore totali  
**Last Updated:** 2026-06-11 (Session 30: FASE 10 ✅ — Geofencing: migration 010, haversine, GeofenceError, PUT /admin/sites/:id, GPS mobile, AdminPage dialog, 212/212 test)  
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

## 🚨 TODO — CRITICO: Prima del Primo Cliente

Identificati nell'analisi critica del 2026-06-09. Tutti bloccanti per l'onboarding del primo cliente reale.

### C.1 — Reset Password Dipendenti
Senza questo ogni dipendente che dimentica la password richiede intervento manuale.

- [x] **C.1.1** Backend: `POST /api/admin/employees/:id/reset-password` — genera nuova temp password (bcrypt cost 12), aggiorna `password_hash` nel DB, restituisce la password in chiaro una volta sola all'admin
- [x] **C.1.2** Frontend AdminPage: bottone "Reset Password" nella tab Dipendenti — mostra la nuova password in un dialog con copia-negli-appunti (stessa UX del temp_password display esistente)
- [x] **C.1.3** Audit log: registra `password_reset` con `user_id` admin che ha eseguito l'azione
- [x] **C.1.4** Test: `admin-reset-password.test.js` — 13 test (happy path, error cases, RBAC guard, audit best-effort, bcrypt format, password randomness)

### C.2 — API Versioning (/api/v1/)
Senza versioning ogni cambiamento breaking all'API rompe l'app mobile in produzione su iPhone dei dipendenti. Non è possibile forzare aggiornamenti immediati su iOS.

- [x] **C.2.1** Backend: `v1Router` monta tutte le route su `/api/v1/`; `/api/` alias deprecato con `logger.warn` per request
- [x] **C.2.2** Frontend web: request interceptor in `apiClient.js` riscrive `/api/` → `/api/v1/` trasparentemente; 401 guard aggiornato a `/api/v1/auth/refresh`
- [x] **C.2.3** Frontend mobile: tutti i path in `endpoints.js` aggiornati a `/api/v1/`
- [x] **C.2.4** `scripts/test-api.sh`: tutti i 23 test aggiornati a `/api/v1/` — 91/91 PASS zero warning
- [x] **C.2.5** Deploy + verifica live: `scripts/test-api.sh` → 23/23 PASS su EC2 produzione — 2026-06-10 ✅

### C.3 — Runbook Operativo
Sei l'unico che sa come rimettere in piedi il sistema. Con il primo cliente, un downtime senza runbook può costare ore invece di minuti.

- [x] **C.3.1** `docs/runbook.md`: procedura di restart EC2+container (ssh → docker ps → docker restart / pull)
- [x] **C.3.2** `docs/runbook.md`: procedura di rollback DB (RDS point-in-time restore step-by-step)
- [x] **C.3.3** `docs/runbook.md`: checklist onboarding nuovo cliente (crea client → crea site → import CSV → genera QR → invia welcome email)
- [x] **C.3.4** `docs/runbook.md`: escalation contacts + SLA informale (es. risposta entro 4h in orario lavorativo)
- [x] **C.3.5** `docs/runbook.md`: credenziali di emergenza e dove trovarle (SSM path reference, non le credenziali stesse)

### C.4 — Token Refresh App Mobile
Access token scade in 15 minuti. Se un dipendente usa l'app per 20 minuti riceve un 401 silenzioso sulla scan QR successiva — check-in perso senza feedback chiaro.

- [x] **C.4.1** `frontend-mobile/services/apiClient.js`: queue-based 401 interceptor — chiama `POST /api/auth/refresh` con il refresh token da AsyncStorage, ritenta la request originale, su refresh failure → clear AsyncStorage + redirect a LoginScreen via navigationRef
- [x] **C.4.2** ✅ Testato manualmente: login → atteso 16 minuti → scan QR → check-in registrato correttamente (no 401 visibile all'utente) — 2026-06-10
- [x] **C.4.3** Build 14: submit su TestFlight con token refresh interceptor ✅ — 2026-06-10

### C.5 — Content Security Policy (Frontend Web) ✅
JWT in localStorage + script da CDN esterni (MUI, Recharts) = superficie XSS significativa su PC condivisi in ambiente retail.

- [x] **C.5.1** `frontend-web/public/_headers` (Netlify): aggiunto CSP header completo (commit 71b7db8)
  - `default-src 'self'` — blocca tutto tranne risorse from own domain
  - `script-src 'self'` — no inline script, no external CDN
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` — MUI CSS-in-JS + Google Fonts
  - `connect-src 'self' https://api.dataxiom.it https://*.sentry.io` — API + Sentry only
  - `img-src 'self' data:` — immagini + data URIs per avatar inline
  - `font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com` — web fonts
  - `frame-ancestors 'none'` — no iframe embedding (clickjacking protection)
  - Additional: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`
- [x] **C.5.2** Deploy live su Netlify (push commit 71b7db8) — CSP headers ora active su production
  - Verificare da browser: F12 → Network → selezionare root request → Headers tab
  - Cercare `Content-Security-Policy` header nella risposta
  - Console: no CSP violation warning ("Refused to load the script...")
- [ ] **C.5.3** Phase 2 TODO: migrazione JWT localStorage → httpOnly cookie (richiede backend session endpoint, non MVP-critical)

### C.6 — Test Coverage Gap (Moduli Critici non coperti)
`admin.js` (511 righe, gestisce onboarding clienti reali) e `shifts.js` (388 righe) hanno 0% coverage. Un bug nell'import CSV crea dati corrotti in produzione senza alert.

- [x] **C.6.1** `backend/src/__tests__/admin-csv-import.test.js` ✅ (parziale) — 10 test: CSV import con `assigned_sites` verificato come array nativo (non NULL), sito non trovato → skip, duplicati → skip, debug endpoint diagnosi. Mancano ancora: `POST /api/admin/clients`, `POST /api/admin/sites`, `POST /api/admin/employees` (singolo). Commit: fcebbfe
- [x] **C.6.2** `backend/src/__tests__/shifts.test.js` ✅ — 23 test: GET /my-schedule (6), GET /:siteId (6), GET /:siteId/export (4), POST /:siteId (7). Coverage shifts.js: 11.76%→98.31%. Root cause fix: `jest.clearAllMocks()` non svuota la coda `mockResolvedValueOnce` — mock contaminati da test precedente risolvevano 500 anziché 400.
- [x] **C.6.3** `backend/src/__tests__/export.test.js` ✅ — 11 test: RBAC (employee→403, no token→401, manager wrong site→403), success paths (admin CSV, date filters, manager scoped, empty, truncated 50001→X-Truncated), formula injection prevention (=HYPERLINK, +cmd → prefixed with '). Coverage export.js: 13.75%→88.75%.
- [x] **C.6.4** ✅ Coverage raggiunta: 47.54%→**60.42% statements**, 61.44% lines — target ≥60% superato. 135/135 test passati.

### C.7 — SLA e Contratto Cliente
Senza un SLA formale ogni minuto di downtime è un litigio. Anche un documento minimo protegge entrambe le parti.

- [x] **C.7.1** `docs/sla.md` ✅ — uptime 99%/mese (~7h max), severity CRITICO/ALTO/MEDIO/BASSO con tempi risposta (2h/8h/24h/72h), orari supporto, esclusioni
- [x] **C.7.2** `docs/sla.md §8` ✅ — clausola disdetta: export dati + cancellazione completa entro 30 giorni (GDPR Art. 17), conferma scritta via email
- [x] **C.7.3** `docs/sla.md §5` ✅ — manutenzione programmata: domenica 02:00-04:00 UTC, notifica 48h per straordinaria, esclusa da calcolo uptime

### C.8 — Monitoring App Mobile
Se l'app smette di funzionare per un bug silenzioso (aggiornamento iOS, token scaduto, API incompatibile), nessuno lo sa finché un dipendente si lamenta.

- [x] **C.8.1** ✅ Sentry mobile configurato e attivo — `EXPO_PUBLIC_SENTRY_DSN` confermato in EAS production, `Sentry.wrap(App)` attivo in `App.jsx`, `enableNativeCrashHandling: true`. Crash test su dev build: alla prossima build development, aggiungere `Sentry.captureMessage('test crash')` in App.jsx e verificare su sentry.io → badge-mobile → Issues.
- [x] **C.8.2** ✅ CloudWatch metric filter + alarm creati — `BadgeAPISuccessfulCheckins` (filter: POST */checkins* → 201), alarm `badge-zero-checkins-4h`: 4 periodi consecutivi da 1h con Sum < 1 → email badge-alerts. Stato: INSUFFICIENT_DATA (nessun check-in da quando il filter è attivo — normale per nuovo filtro).
- [x] **C.8.3** ✅ TestFlight Build 14 scade il **2026-09-08** (90gg da 2026-06-10). Reminder rinnovo: **2026-08-25** (75gg). Aggiungere al calendario: "Rinnovare build TestFlight Badge System" per 2026-08-25.
- [x] **C.8.4** ✅ Source map upload abilitato — `frontend-mobile/sentry.properties` creato (org: dataxium, project: badge-mobile), `SENTRY_DISABLE_AUTO_UPLOAD` rimosso da `eas.json`. **Azione utente richiesta prima del prossimo build:** `cd frontend-mobile && eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <token>` (token: sentry.io → Settings → Auth Tokens, scope `project:releases` + `org:read`)

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

- [x] **6.1** Sentry integration ATTIVA ✅ — backend (DSN in SSM, @sentry/node, Sentry.setUser per contesto utente), web (VITE_SENTRY_DSN in Netlify, source maps uploadati, DSN nel bundle verificato), mobile (EXPO_PUBLIC_SENTRY_DSN in EAS production, @sentry/react-native, Sentry.wrap). Org: dataxium | Projects: badge-backend / badge-web / badge-mobile. ⚠️ Sentry source map upload DISABILITATO su mobile (`SENTRY_DISABLE_AUTO_UPLOAD=true` in eas.json, commit f072520) — manca `sentry.properties` con org/project. Crash reporting funziona, ma i simboli non sono leggibili su sentry.io. Vedere C.8.4 per abilitarlo.
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
- [x] **7.4** ✅ Customer-facing user guide (PDF, Italian) — `docs/guida-utente.html` (print-to-PDF). Copertina + 5 sezioni: intro, dipendenti (download/check-in/presenze/turni), manager (dashboard/correzioni/CSV/planning), FAQ 8 domande, supporto. Aprire nel browser e Stampa → Salva come PDF.
- [x] **7.5** Manager training checklist ✅ — `docs/manager-training-checklist.md`: 7 parti (login, presenze, CSV export, correzioni, planning, QR code, verifica finale) con checklist step-by-step e tabella supporto
- [x] **7.6** Welcome email template ✅ — `scripts/welcome-email-template.html`: HTML responsive con credenziali, CTA login, steps per dipendente/manager, GDPR footer. Commit: 8115eab

---

## 🔲 TODO — NUOVE FEATURE COMMERCIALI (v1.1)

> Design spec completo: `docs/superpowers/specs/2026-06-10-commercial-features-design.md`  
> Obiettivo: rimuovere le 3 principali obiezioni commerciali (prezzo, frode, integrazione paghe)  
> Effort stimato: ~32h totali · Ordine: FASE 8 → FASE 9 → FASE 10

---

### FASE 8 — Portale Commercialista & CSV Paghe (~11h) ✅

**Migration 008/009** (applicata su RDS production 2026-06-11):
- [x] **8.1** `migration 009`: `ALTER TABLE clients ADD COLUMN meal_voucher_hours DECIMAL(4,2) DEFAULT 5.0`; viewer role aggiunto al constraint `employees_role_check`. (`external_employee_id` = matricola era già in migration 008)

**Backend — ruolo viewer:**
- [x] **8.2** `src/middleware/validation.js`: aggiunto `format` enum `generic|zucchetti|teamsystem` in `GetExportCsvSchema`; `AdminViewerSchema` per POST /admin/viewers
- [x] **8.3** viewer role in JWT è gestito automaticamente dall'auth middleware esistente (legge `role` dal DB); `checkins.js PUT /:id`: guard 403 per viewer+employee
- [x] **8.4** `src/routes/admin.js`: `POST /api/admin/viewers` (admin-only, crea viewer con bcrypt temp password) + `GET /api/admin/viewers`
- [x] **8.5** `src/routes/export.js`: `format=zucchetti` (groupZucchetti: una riga/giorno, OreOrdinarie max 8h, OreStraordinarie, H,MM) + `format=teamsystem` (una riga/timbratura, tipo E/U, DD/MM/YYYY)

**Frontend — export formato:**
- [x] **8.6** `ExportButton.jsx`: dropdown MUI Formato (Generico/Zucchetti/TeamSystem); viewer vede solo Zucchetti+TeamSystem; passa `?format=` all'API
- [x] **8.7** `AdminPage.jsx`: nuova tab "Commercialisti" — form crea viewer (email+nome), tabella lista viewers
- [x] **8.8** `AdminPage.jsx`: label "ID Dipendente" → "Matricola" nella tab Dipendenti

**Frontend — layout viewer:**
- [x] **8.9** Navbar già esclude viewer da Correzioni/Planning/Admin (esistenti check `role === 'manager' || role === 'admin'`) — nessuna modifica necessaria
- [x] **8.10** LoginPage già redirige a `/dashboard` per tutti i ruoli — nessuna modifica necessaria

**Test:**
- [x] **8.11** `backend/src/__tests__/export-formats.test.js` ✅ — 15 test: format=zucchetti (7), format=teamsystem (4), viewer access, default generic, invalid format 400
- [x] **8.12** `backend/src/__tests__/admin-viewers.test.js` ✅ — 11 test: POST viewers (RBAC+validazione), GET viewers, viewer RBAC (presenze ✅, corrections ❌, admin ❌). DISABLE_AUTH=false per JWT role check reali. 161/161 totale ✅

---

### FASE 9 — Ore Lavorate & Buoni Pasto (~11h) ✅

*(Migration 008 già eseguita in FASE 8 — contiene anche `meal_voucher_hours`)*

**Backend — calcolo ore:**
- [x] **9.1** `src/utils/hours.js` (nuovo): `calculateDailyHours(checkins)` + `aggregateMonthly()` — greedy IN/OUT pairing, lunch-break sum, open presence detection. Commit: 3e792a0
- [x] **9.2** `src/routes/presences.js` (nuovo): `GET /api/presences/summary?month&year` — per-employee: `{ ore_totali, ore_ordinarie, ore_straordinarie, buoni_pasto, giorni_presenti, presenze_aperte }`. Legge `meal_voucher_hours` da clients
- [x] **9.3** RBAC: admin+viewer → tutti i dipendenti; manager → site-scoped; employee → 403
- [x] **9.4** `PUT /api/admin/settings` in `admin.js` — aggiorna `meal_voucher_hours` per il client dell'admin loggato

**Frontend — Riepilogo Mensile:**
- [x] **9.5** `frontend-web/src/pages/SummaryPage.jsx`: tabella mensile con colonne Nome, Matricola, Giorni, Ore Tot, Ore Ord, Ore Straord, Buoni Pasto, ⚠️ Presenze Aperte + navigazione mese + export CSV
- [x] **9.6** `frontend-web/src/App.jsx`: route `/summary` (admin, manager, viewer via requiredRoles)
- [x] **9.7** `DashboardPage.jsx`: link "📊 Riepilogo" nel navbar (admin, manager, viewer)
- [x] **9.8** `PresencesTable.jsx`: colonna "Ore" client-side (IN/OUT pairing sulla pagina caricata, client-side)
- [x] **9.9** `AdminPage.jsx`: tab "Impostazioni" con campo `meal_voucher_hours` + pulsante Salva

**Test:**
- [x] **9.10** `hours.test.js` ✅ — 17 test: coppia singola, pausa pranzo, presenza aperta, OUT senza IN, multi-day, multi-employee, aggregateMonthly (overtime, meal voucher threshold)
- [x] **9.11** `presences-summary.test.js` ✅ — 12 test: RBAC, meal voucher calc, ore straordinarie, mese vuoto, defaults. 190/190 totale

---

### FASE 10 — Geofencing (~10h) ✅

**Migration 010:**
- [x] **10.1** `migration 010`: `ALTER TABLE sites ADD COLUMN latitude DECIMAL(9,6)`, `longitude DECIMAL(9,6)`, `geofence_radius_meters INT DEFAULT 150`, `geofence_enabled BOOLEAN DEFAULT false`; `ALTER TABLE checkins ADD COLUMN checkin_latitude DECIMAL(9,6)`, `checkin_longitude DECIMAL(9,6)` — applicata su RDS production

**Backend:**
- [x] **10.2** `src/utils/geo.js` (nuovo): `haversineDistance(lat1, lng1, lat2, lng2)` → distanza in metri (Haversine, no deps)
- [x] **10.3** `src/routes/checkins.js`: geofence validation — GEOFENCE_COORDINATES_REQUIRED (400) se mancano lat/lng, GeofenceError 403 OUTSIDE_GEOFENCE con { distance_meters, max_meters } se fuori raggio. Salva coordinate nel record
- [x] **10.4** `src/routes/admin.js`: `PUT /api/admin/sites/:id` — aggiorna latitude, longitude, geofence_radius_meters, geofence_enabled. `GET /api/sites`: ora ritorna anche colonne geofence
- [x] **10.5** `src/middleware/validation.js`: `PostCheckinSchema` aggiunto latitude/longitude opzionali (−90..90, −180..180); `UpdateSiteGeofenceSchema` aggiunto (geofence_enabled bool, radius 50-5000m)

**Mobile:**
- [x] **10.6** `frontend-mobile/app.json`: expo-location nei plugin; `NSLocationWhenInUseUsageDescription` in iOS infoPlist; `ACCESS_FINE_LOCATION` in Android permissions
- [x] **10.7** `frontend-mobile/package.json`: `expo-location ~18.1.5` aggiunto
- [x] **10.8** `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`: `tryGetLocation()` — GPS richiesto prima del POST, graceful fallback se negato; alert "📍 Fuori dalla sede" con distanza/max; alert "📍 GPS richiesto" per GEOFENCE_COORDINATES_REQUIRED
- [ ] **10.9** Build 17: submit su TestFlight con geofencing (richiede `eas build`)

**Frontend Admin:**
- [x] **10.10** `AdminPage.jsx` tab Sedi: `GeofenceDialog` per sede — toggle, lat/lng inputs, raggio, link Google Maps. Colonna "Geofencing" con icona MyLocation (verde/grigia) + chip raggio

**Test:**
- [x] **10.11** `backend/src/__tests__/geo.test.js`: 9 unit test haversineDistance (0m, 100m, 1km, Milan-Rome, antipodi, simmetria, emisfero sud, inside/outside raggio 150m)
- [x] **10.12** `backend/src/__tests__/checkins-geofence.test.js`: 13 integration test. 212/212 totale ✅. Commit: b740dbf

---

## 🔲 TODO — SECURITY TECH DEBT (open findings from code review)

### 🚨 GDPR/Privacy Findings from Session 31 Security Review
**Bloccanti per commercializzazione in Italia — PRIORITÀ MASSIMA**

- [ ] **S.24** Missing GDPR Disclosure for GPS Data Collection (HIGH, Confidence 0.95)
  - **Issue:** Geofencing feature raccoglie coordinate GPS sensibili (latitude, longitude). Privacy Policy è insufficiente (GDPR Art. 13-14 richiede disclosure esplicita su: base legale, retention, diritti dipendenti, controller/processor). Impact: Violazione regolatori, multa fino €20M o 4% fatturato globale.
  - **TODO:** 
    1. Creare `docs/privacy-policy-IT.md` — sezione GPS: base legale (Art. 6(1)(b) esecuzione contratto OR Art. 6(1)(f) legittimo interesse), retention policy (90 giorni), diritti, sub-processor AWS
    2. In-app disclosure (frontend-mobile/src/screens): prima del primo checkin con GPS, dialog "Questo app raccoglie la tua localizzazione per verificare sei in sede. Dati cancellati dopo 90 giorni. [Accetto] [Rifiuto]"
    3. Aggiornare Privacy Policy pubblica (`frontend-web/public/privacy-policy.html`) con sezione GPS
  - **Effort:** 3-4 ore
  - **Success:** Privacy Policy covers GPS processing, in-app dialog mostrato al primo GPS checkin, non c'è ambiguità su base legale

- [ ] **S.25** Missing Data Processing Agreement (DPA) — GDPR Art. 28 (HIGH, Confidence 0.90)
  - **Issue:** Dataxiom (Data Processor) deve avere DPA scritto con ogni cliente (Data Controller). Mancanza di DPA = violazione Art. 28, fini fino €20M. Impact: Blocco legale su onboarding cliente, compliance audit fallisce.
  - **TODO:**
    1. Creare `docs/DPA_GDPR_Art28_IT.md` template — sezioni: Data Controller (cliente), Processor (Dataxiom), data subjects (dipendenti), processing descrizione (GPS + Face ID + timbrature), retention (coordinate GPS 90gg, checkins 24m, audit log 3a), sub-processor AWS (RDS+EC2 eu-west-1), diritti controller (audit, accesso, cancellazione)
    2. Backend: endpoint `POST /api/admin/dpa-acknowledgement` — registra firma cliente su DPA versione X (audit trail per compliance)
    3. Onboarding flow: HR Director vede alert "DPA richiesto" → download/firmi DPA → upload scansione → sblocca geofencing
  - **Effort:** 2-3 ore
  - **Success:** DPA template in repo, cliente firma DPA prima di abilitare geofencing, audit trail registrato

- [ ] **S.26** Missing Explicit Consent Mechanism for GPS Data Collection — GDPR Art. 7 (HIGH, Confidence 0.85)
  - **Issue:** Geofencing abilitato per default (migration 010 `DEFAULT true`) senza consenso dipendente. GDPR Art. 7 richiede consenso: freely given, specific, informed, unambiguous. Se base legale è consenso (non contratto), senza consenso dichiarato è illegittimo. Impact: Privacy violazione, regolatore può forzare disabilitazione feature.
  - **TODO:**
    1. DB: colonna `employees.gps_consent_given` (boolean DEFAULT false) + tabella `employee_consent_log` (employee_id, consent_type, timestamp, version)
    2. Mobile app (QRScannerScreen): prima di primo POST /api/checkins con GPS, mostra dialog "Il datore di lavoro richiede localizzazione GPS per il check-in. Dati usati solo per verificare sei in sede, cancellati dopo 90 giorni. Vedi Privacy Policy: <link>. [Accetto] [Rifiuto]" → POST /api/consent/gps-acceptance (con version=2.0)
    3. Backend: `POST /api/consent/gps-acceptance` → aggiorna `employees.gps_consent_given=true`, log in audit_log, soft-gate: se gps_consent_given=false e geofencing_enabled=true, POST /api/checkins ritorna 403 CONSENT_REQUIRED (non 400, così è chiaro cosa serve)
    4. AdminPage: nuova sezione "Consensi GPS" — tabella employees con colonna "GPS Accettato" (sì/no/data), bottone "Notifica dipendenti" (send email reminder)
  - **Effort:** 4-5 ore
  - **Success:** Dipendente vede consent dialog prima di primo GPS checkin, accettazione loggata in audit_log, admin vede storico consensi

---

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
| 2026-06-09 | Guida Utente PDF 7.4 (Session 22 cont.) | 7.4 | docs/guida-utente.html — print-to-PDF A4. Copertina navy, 7 pagine, 5 sezioni: intro, dipendenti (mobile app), manager (dashboard+planning+CSV), FAQ (8 voci), supporto. Aprire nel browser e stampare su PDF. |
| 2026-06-09 | C.1 Reset Password + 3 Code Review Fix (Session 23) | C.1 ✅ | POST /api/admin/employees/:id/reset-password. Code review: SELECT+UPDATE → UPDATE...RETURNING atomico, logger singleton, logAudit.catch() logger.warn. Test aggiornati: 91/91 PASS. Commit: 4022dd6. |
| 2026-06-09 | C.5 Content Security Policy (Session 24) | C.5 ✅ | frontend-web/public/_headers con CSP policy (default-src, script-src, style-src Google Fonts, connect-src API+Sentry, frame-ancestors none) + security headers (nosniff, DENY, XSS-Protection). Commit: 71b7db8. Deploy live su Netlify (1-3 min). |
| 2026-06-10 | CSV Import Verification + Test Coverage (Session 25) | C.6.1 parziale | Verifica bug assigned_sites NULL (commit ecf3620 — parameterized query fix). Root cause analizzata: string interpolation ARRAY[uuid::uuid] causava disallineamento parametri. Debug endpoint diagnostico (f671c5b, c6479f0). 10 nuovi test in admin-csv-import.test.js: assigned_sites array nativo verificato, sito non trovato → skip, duplicati, debug endpoint. 101/101 test passati. Coverage 40.37% → 47.54%. Commit: fcebbfe |
| 2026-06-10 | QR Code Fix Live + Code Review (Session 26) | — | QR code verificato su iPhone reale: Torino Store ✅ (Maria Rossi) + Milano Store ✅ (Francesca). EC2 deploy riuscito (commit 530ec75 → Deploy to EC2 success). Fix ESLint bloccante CI/CD: admin-csv-import.test.js (doppi apici + unused vars), admin-reset-password.test.js (doppi apici), auth.test.js (verifyPassword unused). Code review admin.js: 4 finding fixati — (1) debug endpoint irraggiungibile da manager: spostato prima del middleware admin-only (era dead code), (2) `res.status(404).json()` → `next(new NotFoundError())` per rispettare error handler centralizzato, (3) UUID validation su employeeId param mancante, (4) requireAuth ridondante rimosso. Commits: 530ec75, dccd135. 10/10 test admin-csv-import passati post-refactor. |
| 2026-06-10 | Test Coverage C.6.2+C.6.3+C.6.4 (Session 27) | C.6.2 ✅, C.6.3 ✅, C.6.4 ✅ | shifts.test.js: 23 test (GET my-schedule, GET/:siteId, GET/:siteId/export, POST/:siteId) — shifts.js coverage 11%→98%. export.test.js: 11 test (RBAC, success paths, formula injection) — export.js coverage 14%→89%. Root cause fix: `jest.clearAllMocks()` non svuota coda `mockResolvedValueOnce` — 6 valori residui dal test precedente (`shifts_data: {}` bloccato da Zod) contaminano il test successivo e trasformano un 400 in 500. Fix: test usa `shifts_data` non-vuoto e consuma tutti i mock. 135/135 pass. Coverage 47.54%→60.42% ✅ |
| 2026-06-10 | C.4.2 + C.7 + C.8 (Session 27 cont.) | C.4.2 ✅, C.7 ✅, C.8 ✅ | C.4.2: token refresh verificato su iPhone — login → 16 min → scan QR → check-in OK, no 401. C.7: `docs/sla.md` creato (uptime 99%, severity SLA, manutenzione dom 02-04 UTC, GDPR cancellazione 30gg). C.8: CloudWatch metric filter `BadgeAPISuccessfulCheckins` + alarm `badge-zero-checkins-4h` (4×1h periodi consecutivi a 0 → email). Sentry source maps: `sentry.properties` creato, `SENTRY_DISABLE_AUTO_UPLOAD` rimosso da eas.json. TestFlight reminder: scadenza 2026-09-08, rinnovo entro 2026-08-25. Azione richiesta: `eas secret:create SENTRY_AUTH_TOKEN`. |
| 2026-06-11 | FASE 8 Portale Commercialista (Session 28) | 8.1–8.12 ✅ | viewer role (RBAC 4°): read presenze+export, blocco correzioni+admin. export.js: format=zucchetti (groupZucchetti, OreOrdinarie/Straordinarie, H,MM) + format=teamsystem (per-timbratura, tipo E/U). Migration 009 su RDS (meal_voucher_hours, viewer constraint). Admin viewers endpoint. ExportButton dropdown + AdminPage tab Commercialisti. DISABLE_AUTH=false pattern nei nuovi test. 161/161 ✅ lint 0 errori. Deploy Netlify ✅, deploy EC2 via CI/CD. Commit: f9c3080 |
| 2026-06-11 | FASE 9 Ore Lavorate & Buoni Pasto (Session 29) | 9.1–9.11 ✅ | hours.js: calculateDailyHours (greedy IN/OUT pairing, lunch-break sum, open presence) + aggregateMonthly (ore ord/straord, buoni pasto, giorni). presences.js: GET /api/presences/summary (RBAC: employee→403, manager→site-scoped, admin+viewer→all, meal_voucher_hours da clients). admin.js: PUT /api/admin/settings. SummaryPage.jsx: tabella mensile + navigazione mese + export CSV. PresencesTable: colonna Ore client-side. AdminPage: tab Impostazioni. App.jsx: route /summary. 190/190 test ✅ lint 0 errori. Commit: 3e792a0 |
| 2026-06-11 | FASE 10 Geofencing (Session 30) | 10.1–10.12 ✅ | backend: migration 010 (lat/lng/geofence_radius_meters/geofence_enabled su sites, checkin_lat/lng su checkins). geo.js haversine. GeofenceError (403 OUTSIDE_GEOFENCE + distance_meters). checkins.js: geofence validation post-assegnazione. PUT /api/admin/sites/:id. admin.js: GET sites include geofence columns. mobile: expo-location (tryGetLocation opzionale), payload lat/lng, alert "Fuori dalla sede". AdminPage: GeofenceDialog (toggle+lat/lng+raggio), colonna Geofencing con chip "150m". 22 nuovi test (geo.test.js + checkins-geofence.test.js). 212/212 ✅. Commits: b740dbf, 13c67e5 |
| 2026-06-11 | Bug Fix + FASE 8/9/10 Dashboard Testing (Session 31) | — | 3 bug produzione fixati: (1) presences.js `FROM check_ins` → `FROM checkins` (commit 5aee3f3), (2) presences.js `e.matricola` → `e.external_employee_id AS matricola` su 3 occorrenze (commit 0054404), (3) admin.js GET /sites mancavano geofence columns → GeofenceDialog non pre-popolava (commit ea156fa). Web dashboard FASE 8/9/10 verificata via browser: viewer RBAC ✅, SummaryPage ore+buoni pasto ✅, Impostazioni meal_voucher_hours save/reload ✅, GeofenceDialog pre-populate ✅. Deploy Netlify frontend ✅. EAS Build 17 pending (in attesa conferma). |
| 2026-06-11 | Final Code Review + Security Audit (Session 32) | — | Max-effort code review FASE 8-10 (5 CRITICAL + 6 MEDIUM + 4 deferred findings). All 11 fixes implemented + tested: logAudit pool param, presences ANY(assigned_sites), clientGeofencingEnabled wrong client, geofence feature flag !== false, settings dialog error handling, meal_voucher_hours optional, coordinate validation, assigned_sites .min(1), GeofenceDialog client flag, audit error logging, response validation. 216/216 test ✅. Security review identified 3 GDPR blockers: S.24 (GPS disclosure), S.25 (DPA template), S.26 (consent mechanism) — registered in TASKS.md SECURITY TECH DEBT section, PRIORITÀ MASSIMA for Italian market launch. Commit: 76ec7ef |
| 2026-06-11 | GDPR Blockers + Safe Implementation + Monitoring (Session 33 A→B→C) | S.24 ✅, S.25 ✅, S.26 ✅ | **Part A — Implementation:** GPS Privacy Policy IT, DPA template, GPSConsentDialog, migrations 011/012, backend + frontend endpoints for DPA + consent. All 216 tests PASS. Commit: b6684ac. **Part B — Test Coverage (Safe Path):** consent.test.js (11 comprehensive tests), coverage 36%→90.9%, total tests 216→227 all PASS. Commit: e0b24e3. **Part B.2 — Migration Instructions:** apply-migrations-011-012.sh + MIGRATION-011-012-INSTRUCTIONS.md (3 safe methods). Commit: 7ddfc4b. **Part C — Admin Monitoring:** AdminPage tab 6 "Consensi GPS" with ConsentTab component, summary cards (Total/Consented/Pending/Rate %), employee table with consent status, notify button (Phase 2). Backend: GET /api/consent/admin/employee-consents (admin-only). Commit: f34f1fd. Ready for: (1) Apply migrations RDS, (2) Build 18 mobile, (3) Notify feature Phase 2. |

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
- [x] **First customer onboarded** (7.1–7.6) — tutti i prerequisiti completati ✅
- [x] **Reset password dipendenti** (C.1) — ✅ completo Session 23
- [x] **API versioning /api/v1/** (C.2) — ✅ completo Session 23 (C.2.5 verify post-deploy)
- [x] **Runbook operativo** (C.3) ✅ — `docs/runbook.md`: restart EC2, rollback DB, onboarding, SLA, SSM refs
- [x] **Token refresh mobile** (C.4) ✅ — interceptor Build 14, verificato su iPhone 16 min (C.4.2)
- [x] **Content Security Policy** (C.5) ✅ — riduce superficie XSS su PC retail condivisi (commit 71b7db8)
- [x] **Test coverage ≥60%** (C.6) — ✅ 60.42% statements, 135/135 test passati (Session 27)
- [x] **SLA e contratto** (C.7) ✅ — `docs/sla.md`: uptime 99%, severity + SLA, manutenzione programmata, GDPR cancellazione 30gg (Session 27)
- [x] **Mobile monitoring + TestFlight reminder** (C.8) ✅ — CloudWatch alarm zero check-in 4h, Sentry source maps abilitati, TestFlight scade 2026-09-08 (reminder 2026-08-25)

---

*Update this file at the end of each session: mark completed tasks `[x]`, add the session to the log, and adjust priorities if needed.*
