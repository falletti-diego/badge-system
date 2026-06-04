# Badge System — Task Tracker

**Target:** MVP Lancio Settembre 2026 · 10h/week · ~150 ore totali  
**Last Updated:** 2026-06-04 (Session: Deploy tooling + CORS fix)  
**Production:** https://dataxiom-badge.netlify.app · API: http://34.245.145.143:3000

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

### FASE 3.x — Deploy Tooling
- [x] **3.x.1** `scripts/deploy.sh`: build → push → HTTPS cert verify → CORS preflight × 7 endpoints → auth smoke test
- [x] **3.x.2** `.claude/skills/deploy/SKILL.md`: `/deploy` skill with troubleshooting guide

---

## 🔲 TODO — NEXT PRIORITY

### FASE 3.4 — Web Dashboard: Corrections Page (~3-4h)
Manager corrects a check-in (wrong time, missed punch, wrong direction).

- [ ] **3.4.1** `CorrectionsPage.jsx` — searchable list of check-ins with "Edit" button
- [ ] **3.4.2** Edit modal: change timestamp, type (IN/OUT), add correction note
- [ ] **3.4.3** 7-day edit window enforced (backend already has `PUT /api/checkins/:id`)
- [ ] **3.4.4** Audit trail visible in UI: show "Modified by X on Y" on corrected entries
- [ ] **3.4.5** Route `/corrections` in `App.jsx` (manager + admin only)
- [ ] **3.4.6** Link in Dashboard navbar

### FASE 3.5 — Web Dashboard: Notifications (~2-3h)
Employee gets notified when manager changes their shift.

- [ ] **3.5.1** `GET /api/notifications` polling endpoint (backend)
- [ ] **3.5.2** Notification record created when shift is saved (backend)
- [ ] **3.5.3** `NotificationBell.jsx` component: icon + unread count badge
- [ ] **3.5.4** Notification list dropdown (last 10, mark as read)
- [ ] **3.5.5** Poll every 30s when employee is logged in

---

## 🔲 TODO — MEDIUM PRIORITY

### FASE 4 — Mobile App: React Native (~25-35h)
The primary check-in interface for employees.

- [ ] **4.1** React Native project scaffold (Expo or bare)
- [ ] **4.2** Login screen (email + password → JWT)
- [ ] **4.3** QR code scanner (`react-native-camera` + `react-native-qrcode`)
- [ ] **4.4** Face ID authentication (`react-native-face-api` or `expo-local-authentication`)
- [ ] **4.5** Check-in flow: scan QR → Face ID → POST /api/checkins → confirmation screen
- [ ] **4.6** My Schedule screen (read-only, calls `GET /api/shifts/my-schedule`)
- [ ] **4.7** My Presences screen (list of own check-ins)
- [ ] **4.8** Offline detection + user-friendly error ("No connection — try again")
- [ ] **4.9** App icon, splash screen, push to TestFlight / Play Store internal track

### FASE 5 — QR Code Management (~3-4h)
Admin generates and manages QR codes per site.

- [ ] **5.1** `GET /api/sites` endpoint (list sites for client)
- [ ] **5.2** QR code content format: `badge://checkin?site_id=<uuid>&client_id=<uuid>`
- [ ] **5.3** QR code generator in admin dashboard (display + printable PDF)
- [ ] **5.4** Rotate QR code: generate new content, invalidate old
- [ ] **5.5** Site management page (`/admin/sites`): add / edit / delete sites

### FASE 6 — Production Hardening (~10-15h)
Before first paying customer.

- [ ] **6.1** Sentry integration: backend error tracking + frontend crash reporting
- [ ] **6.2** HTTPS on API (EC2) — Let's Encrypt via Certbot or AWS ACM + ALB
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

---

## 🎯 MVP LAUNCH CHECKLIST (Settembre 2026)

- [x] Backend API deployed + stable
- [x] Web dashboard live on Netlify with HTTPS
- [x] Auth + role-based access working
- [x] Presences tracking (check-ins) working
- [x] Shift planning (manager + employee views)
- [ ] **Corrections page** (3.4)
- [ ] **Mobile app** (4.1–4.9) — critical path
- [ ] **QR code management** (5.1–5.5) — critical path
- [ ] **Production hardening** (6.1–6.8)
- [ ] **First customer onboarded** (7.1–7.6)

---

*Update this file at the end of each session: mark completed tasks `[x]`, add the session to the log, and adjust priorities if needed.*
