# Badge System — Project Context

**Data:** 27 Maggio 2026  
**Status:** Architecture Approved → Ready for Development Planning  
**Timeline:** MVP Lancio Settembre 2026 @ 10h/week (~150 ore totali)

---

## 🎯 Project Overview

**Badge System** è una soluzione SaaS multi-tenant per il tracciamento delle presenze nel retail italiano/europeo.

### Core Value Proposition
- **Zero hardware** — dipendenti usano smartphone personale
- **QR Code statico** — scannerizzato dal dipendente alla sede  
- **Face ID nativo** — autenticazione biometrica integrata via iOS/Android
- **Reporting semplice** — dashboard real-time per manager, export CSV

### Business Model
- **Revenue:** €10/dipendente/mese + €250/sede aggiuntiva (una tantum)
- **Target:** 25-200 dipendenti per cliente, multi-sede support
- **Clienti:** Aziende retail (ipermercati, catene, centri commerciali)

### MVP Scope
- ✅ Mobile app (QR scanning + Face ID)
- ✅ Web dashboard (reporting, corrections, corrections, corrections)
- ✅ CSV export
- ✅ Multi-site support
- ✅ Audit log
- ❌ Payroll API (Phase 2)
- ❌ Offline mode (Phase 2)

---

## 🏗️ Approved Technology Stack

### Frontend Mobile
- **Framework:** React Native (latest)
- **Auth:** React Native Face API (native Face ID)
- **QR Scanner:** react-native-camera + react-native-qrcode
- **HTTP:** Axios
- **State:** Redux Toolkit
- **Dev Cost:** 25-35 hours

### Frontend Web (Dashboard)
- **Framework:** React 18+ + Vite
- **UI Components:** Material-UI (MUI) 5.x
- **Charts:** Recharts
- **Styling:** Tailwind CSS
- **Tables:** TanStack Table (React Table)
- **Hosting:** Netlify (auto-deploy on git push)
- **Dev Cost:** 20-30 hours

### Backend API
- **Runtime:** Node.js 20+ LTS
- **Framework:** Express.js 4.x
- **Database Driver:** pg (node-postgres)
- **Auth:** Auth0 SDK (€20-30/mese)
- **Validation:** Zod
- **Logging:** Pino
- **Config:** dotenv
- **Dev Cost:** 30-40 hours

### Database
- **Engine:** PostgreSQL 14+
- **Hosting:** AWS RDS Managed (eu-west-1)
- **Instance:** db.t3.micro (MVP) → db.t3.small (scale)
- **Backup:** AWS Automated (7-day retention, point-in-time recovery)
- **Schema:** Multi-tenant via schema separation (public + per-client schemas)
- **Cost:** €30-50/mese MVP

### Infrastructure
- **API Server:** AWS EC2 t3.small (€50-80/mese)
- **Region:** eu-west-1 (Ireland) — GDPR-compliant, low latency Italy
- **Container:** Docker
- **OS:** Ubuntu 22.04 LTS
- **Monitoring:** Sentry (€0 free tier) + CloudWatch (included)

### CI/CD & Deployment
- **VCS:** GitHub
- **CI/CD:** GitHub Actions (free tier)
- **Container Registry:** AWS ECR (€0.20/GB)
- **Deployment:** SSH + docker-compose (manual MVP, automated later)
- **Branches:** main (prod), develop (staging)

**Pipeline:**
```
git push main → GitHub Actions:
  ├─ Lint (ESLint, Prettier)
  ├─ Test (Jest, React Testing Library)
  ├─ Build Docker image
  ├─ Push to AWS ECR
  └─ SSH to EC2 → docker pull + restart
```

---

## 💰 Cost Breakdown

### Development (One-time)
| Item | Hours | Cost |
|------|-------|------|
| Backend API | 30-40h | €1500-2000 |
| Mobile App | 25-35h | €1250-1750 |
| Web Dashboard | 20-30h | €1000-1500 |
| Infrastructure Setup | 10-15h | €500-750 |
| Testing + Docs | 10-15h | €500-750 |
| Buffer (20%) | — | €1000 |
| **TOTAL** | **95-140h** | **€6250-7750** |

### Monthly Operating (MVP: 1 cliente, 25 dipendenti)
| Item | Cost |
|------|------|
| AWS EC2 t3.small | €40-50 |
| AWS RDS PostgreSQL | €30-50 |
| AWS Data Transfer | €5-10 |
| Auth0 | €20-30 |
| Sentry (free tier) | €0 |
| CloudWatch | €5-10 |
| Domain + misc | €5-10 |
| **TOTAL** | **€105-160/mese** |

---

## 📅 Development Timeline

### Sprint 1: Foundation (Weeks 1-2)
- [ ] GitHub account setup + learn Git basics
- [ ] AWS account setup (RDS, EC2, IAM)
- [ ] Docker setup (Dockerfile, docker-compose)
- [ ] CI/CD pipeline (GitHub Actions basic)
- [ ] Database schema design
- [ ] Backend scaffolding (Express, Auth0 integration)

**Deliverable:** Infrastructure ready, backend API skeleton

### Sprint 2: Core Features (Weeks 3-4)
- [ ] Auth0 integration complete (Face ID login)
- [ ] Check-in API endpoint (/api/checkin)
- [ ] Mobile app: QR scanning + Face ID
- [ ] Dashboard: presences table view
- [ ] CSV export functionality

**Deliverable:** MVP core features working

### Sprint 3: Polish & Testing (Weeks 5-6)
- [ ] Error handling (Sentry integration)
- [ ] Security review (OWASP checklist)
- [ ] Load testing (50 simultaneous check-ins)
- [ ] GDPR compliance review
- [ ] Documentation

**Deliverable:** Production-ready MVP

### Sprint 4: Demo Ready (Weeks 7-8)
- [ ] Deploy to AWS (EC2 + RDS production)
- [ ] Netlify deployment (frontend)
- [ ] Customer-facing documentation
- [ ] Training material for first customer
- [ ] Bug fixes + polish

**Deliverable:** Ready to launch with first customer

---

## 🔐 Security & Compliance

### Authentication
- ✅ Face ID nativo (biometric, no passwords stored)
- ✅ Auth0 managed (OWASP Top 10 protected)
- ✅ JWT tokens: 30min access + 7day refresh
- ✅ HTTPS enforced everywhere (AWS ACM certificates)

### Data Protection
- ✅ Database encryption at rest (AWS RDS)
- ✅ Role-based access control (RBAC: dipendente, manager, admin)
- ✅ Audit log: every modification tracked (who, when, what)
- ✅ Multi-tenant isolation (schema separation)

### GDPR Compliance
- ✅ Privacy policy on website
- ✅ Data retention: delete employee data after 12 months (configurable)
- ✅ Data export: customer can download all data as CSV
- ✅ Right to be forgotten: delete employee + all check-ins
- ✅ Data Processing Agreement (DPA) template for customers

---

## 📊 Database Schema (Multi-Tenant)

```sql
-- Clients
Clients (id, name, email, created_at, plan)

-- Sites
Sites (id, client_id, name, location, qr_code_content, created_at)

-- Employees
Employees (id, client_id, email, name, phone, assigned_sites[], created_at)

-- Check-ins
CheckIns (id, employee_id, site_id, timestamp, type[IN/OUT], created_by, modified_at, modified_by)

-- Audit Log
AuditLog (id, action, entity, old_value, new_value, user_id, timestamp)
```

---

## 🔌 API Endpoints (MVP)

```
Authentication:
  POST /api/auth/login          (email + password)
  POST /api/auth/refresh        (refresh token)
  POST /api/auth/logout         (logout)

Check-ins:
  POST /api/checkin             (QR code + Face ID)
  GET /api/checkins             (list for user)
  PUT /api/checkins/:id         (correct check-in, within time window)

Dashboard:
  GET /api/presences            (all check-ins for site/period)
  GET /api/export/csv           (CSV download)
  GET /api/stats                (aggregated stats)

Admin (Dataxiom):
  POST /api/admin/clients       (create client)
  POST /api/admin/sites         (create site)
  POST /api/admin/employees     (create employee)
```

---

## ✅ Success Criteria (MVP)

- ✅ App funziona offline/online con Face ID
- ✅ Check-in registrati correttamente (±1 secondo accuracy)
- ✅ Dashboard mostra presenze in real-time
- ✅ First customer pilota pronto entro 3 mesi
- ✅ Costi operativi < €200/mese per MVP
- ✅ Zero critical bugs in produzione
- ✅ API response time < 500ms
- ✅ Dashboard loads < 3 sec

---

## 🚨 Known Risks & Mitigations

| Rischio | Mitigazione |
|---------|-----------|
| Connettività retail instabile | MVP online-only, Phase 2 offline mode |
| Bassa adozione dipendenti | UX semplice, training cliente, incentivi |
| Churn clienti | Support proattivo, feature request loop veloce |
| Costi cloud > budget | Monitoring mensile, ottimizzazione istanze |
| GDPR/Privacy issues | Legal review, audit trail, data residency |

---

## 📝 Project Files

- **01_BRAINSTORMING_SISTEMA.md** — Initial brainstorming document (reference)
- **02_ARCHITETTURA_APPROVATA.md** — Full architecture details (reference)
- **CLAUDE.md** — This file (project context for development)

---

## 🚀 Next Steps

1. Development Planning (task breakdown per sprint)
2. GitHub repository setup
3. AWS infrastructure setup
4. Backend scaffolding (Sprint 1)
5. Prototipo UI/UX (Figma mockups for app + dashboard)

---

---

## 📋 Session Protocol

**TASKS.md** is the single source of truth for project progress.

- **Start of session:** Read TASKS.md to orient. Check the TODO sections for what's next.
- **During session:** No need to update TASKS.md mid-session.
- **End of session:** Update TASKS.md — mark completed tasks `[x]`, add a row to the Session Log, adjust priorities if needed. Then commit.

If asked to "resume", read TASKS.md + recent `git log --oneline -10` instead of asking for context.

---

**Last Updated:** 28 Maggio 2026  
**Approved By:** Diego Falletti  
**Status:** APPROVED ✅ — Ready for Development

---

## ⚠️ Known Bug Patterns & Prevention

**These patterns have caused critical bugs. Check these before committing.**

### Pattern 1: Mock Auth Hardcoded UUIDs (CRITICAL)
**File:** `backend/src/middleware/auth.js` (DISABLE_AUTH block)

**Risk:** Using hardcoded strings like `'client-1'` in UUID columns → PostgreSQL rejects with `invalid input syntax for type uuid`

**Example (❌ WRONG):**
```javascript
req.user = {
  user_id: 'mvp-user-1',           // ❌ String, not UUID
  client_id: 'client-1',            // ❌ String, not UUID — will fail queries
  role: 'admin',
};
```

**Example (✅ CORRECT):**
```javascript
const { DEMO_USERS } = require('../__fixtures__/demo-users');
const admin = DEMO_USERS.find(u => u.role === 'admin');
req.user = {
  user_id: admin.id,                // ✅ UUID from fixture
  client_id: admin.client_id,       // ✅ UUID from fixture
  role: admin.role,
};
```

**Prevention Checklist:**
- [ ] All mock `client_id`, `site_id`, `employee_id` are valid UUIDs (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx format)
- [ ] UUIDs sourced from `DEMO_USERS` fixture, never hardcoded strings
- [ ] Integration test exists: DISABLE_AUTH=true → presences endpoint returns data (not INTERNAL_ERROR)
- [ ] No grep matches: `grep -r "(client_id|site_id|employee_id): '[^{]'" backend/src/` (catch hardcoded strings)

**See:** [[critical_bugs_client_1_uuid_2026_06_13]] for full analysis

---

### Pattern 2: Config Environment Variable Collisions
**Files:** `.env`, `.env.development`, `.env.test`, `src/config-loader.js`

**Risk:** Wrong NODE_ENV loaded → wrong API URLs, credentials, or disabled features

**Prevention Checklist:**
- [ ] `npm run validate-env` passes before any `npm run dev` or `npm start`
- [ ] Startup logs show which `.env.{NODE_ENV}` file was loaded
- [ ] Health check verifies DATABASE_URL connectivity (not just TCP)
- [ ] `.env` is gitignored (contains personal overrides only)

---

### Pattern 3: Silent Failures in Middleware
**Files:** `middleware/auth.js`, `middleware/validation.js`, `middleware/rateLimit.js`

**Risk:** Errors caught and silently passed to next() → user sees blank response instead of error

**Prevention Checklist:**
- [ ] All middleware logs at minimum 'warn' level when handling errors
- [ ] Structured logging: `{ action, error, message, user_id, path, statusCode }`
- [ ] Never silently continue if critical data is missing
- [ ] Error tests exist for all middleware (not just happy path)

---

### Pattern 4: DRY Violation in Demo Data
**Files:** `routes/auth.js`, `middleware/auth.js`, `__tests__/**`

**Risk:** DEMO_USERS defined in multiple places → divergence → bugs

**Solution:** Single source of truth in `backend/src/__fixtures__/demo-users.js`
- All imports must reference this file
- No hardcoding user IDs, emails, or UUIDs elsewhere
- Validation script checks all DEMO_USERS at startup

---

## 🔍 Code Review Checklist (Auth & Config Changes)

Before submitting PR that modifies:
- `middleware/auth.js`
- `routes/auth.js`
- `.env*` files
- Config loading logic

**Required:**
- [ ] `npm run validate-demo-users` passes (all UUIDs valid)
- [ ] `npm run validate-env` passes (all required vars set)
- [ ] `npm run test -- auth.integration` passes (real database queries)
- [ ] Browser test: Login → Dashboard loads without INTERNAL_ERROR
- [ ] Grep check: `grep -rn "(client_id|site_id|employee_id): '[^{]'" backend/src/` returns 0 matches
- [ ] Middleware logs all error paths (not silent failures)

---

## Verification

After database schema or foreign-key changes, re-run the affected queries to confirm the constraint is actually resolved before declaring success. After backend changes, test the live API endpoints with a valid token.

---

## Deployment Notes

For dashboard/landing-page deploys, account for HTTPS/CORS upfront: use a trusted cert (Let's Encrypt) rather than self-signed to avoid ERR_CERT_AUTHORITY_INVALID and mixed-content errors.

---

## Session Handoffs

At the end of every working session, update TASKS.md, PROJECT_DECISIONS.md, and HANDOFF.md using the handoff skill, then create a commit. Claude has no memory of prior sessions—rely on these files for context.
