# Badge System — Decision Log & Architecture

**Last Updated:** 3 Giugno 2026  
**Status:** Development in Progress 🚧  
**MVP Launch Target:** Settembre 2026

---

## 1. PROJECT OVERVIEW

**Badge System** è una soluzione SaaS multi-tenant per il tracciamento delle presenze nel retail italiano/europeo. 

### Core Value Proposition
- **Zero hardware** — dipendenti usano smartphone personale
- **QR Code statico** — scannerizzato dal dipendente alla sede
- **Face ID nativo** — autenticazione biometrica integrata via iOS/Android
- **Reporting semplice** — dashboard real-time per manager, export CSV

### Business Model
- **Revenue:** €10/dipendente/mese + €250/sede aggiuntiva (una tantum)
- **Target:** 25-200 dipendenti per cliente, multi-sede support
- **MVP Timeline:** ~150 ore totali @ 10h/week = 3-4 mesi

### MVP Scope
- ✅ Mobile app (QR scanning + Face ID)
- ✅ Web dashboard (reporting, corrections)
- ✅ CSV export
- ✅ Multi-site support
- ✅ Audit log
- ❌ Payroll API (Phase 2)
- ❌ Offline mode (Phase 2)

---

## 2. TECH STACK

### Frontend Mobile
| Componente | Technology | Versione |
|-----------|-----------|---------|
| **Framework** | React Native | Latest |
| **Auth** | React Native Face API | Native Face ID |
| **QR Scanner** | react-native-camera + react-native-qrcode | Latest |
| **HTTP** | Axios | Latest |
| **State** | Redux Toolkit | Latest |
| **Dev Time** | 25-35 hours | MVP estimate |

### Frontend Web (Dashboard)
| Componente | Technology | Versione |
|-----------|-----------|---------|
| **Framework** | React 18+ | Latest |
| **Build Tool** | Vite | Latest |
| **UI Components** | Material-UI (MUI) 5.x | Latest |
| **Charts** | Recharts | Latest |
| **Styling** | Tailwind CSS | Latest |
| **Tables** | TanStack Table (React Table) | Latest |
| **Hosting** | Netlify | Auto-deploy on push |
| **Dev Time** | 20-30 hours | MVP estimate |

### Backend API
| Componente | Technology | Versione |
|-----------|-----------|---------|
| **Runtime** | Node.js | 20+ LTS |
| **Framework** | Express.js | 4.x |
| **Database Driver** | pg (node-postgres) | Latest |
| **Auth** | Auth0 SDK | Latest (mock MVP) |
| **Validation** | Zod | Latest |
| **Logging** | Pino | Latest |
| **Config** | dotenv | Latest |
| **Error Tracking** | Sentry | Free tier MVP |
| **Dev Time** | 30-40 hours | MVP estimate |

### Database
| Componente | Choice | Rationale |
|-----------|--------|-----------|
| **Engine** | PostgreSQL 14+ | ACID, relational, multi-tenant ready |
| **Hosting** | AWS RDS (Managed) | Auto-backup, failover, zero ops |
| **Region** | eu-west-1 (Ireland) | GDPR-compliant, low latency Italy |
| **Instance** | db.t3.micro (MVP) | €30-50/mese MVP |
| **Backup** | AWS Automated (7-day) | Point-in-time recovery |
| **Multi-AZ** | No (MVP) | Cost not justified yet |

### Infrastructure
| Componente | Choice | Cost |
|-----------|--------|------|
| **API Server** | AWS EC2 t3.small | €50-80/mese |
| **Region** | eu-west-1 (Ireland) | GDPR-compliant |
| **Container** | Docker | Simplified deployment |
| **CI/CD** | GitHub Actions | Free tier |
| **Registry** | AWS ECR | €0.20/GB |
| **Frontend CDN** | Netlify | Free tier |

### Monthly Operating Costs (MVP: 1 client, 25 employees)
| Item | Cost |
|------|------|
| AWS EC2 t3.small | €40-50 |
| AWS RDS PostgreSQL | €30-50 |
| AWS Data Transfer | €5-10 |
| Auth0 (future) | €20-30 |
| Sentry (free tier) | €0 |
| CloudWatch | €5-10 |
| Domain + misc | €5-10 |
| **TOTAL** | **€105-160/mese** |

---

## 3. FASI DI SVILUPPO (ROADMAP)

### FASE 1: Foundation (Weeks 1-2) ✅ COMPLETE
**Deliverable:** Infrastructure ready, backend API skeleton
- ✅ GitHub account setup + Git basics
- ✅ AWS account setup (RDS, EC2, IAM)
- ✅ Docker setup (Dockerfile, docker-compose)
- ✅ CI/CD pipeline (GitHub Actions)
- ✅ Database schema design (multi-tenant via schema separation)
- ✅ Backend scaffolding (Express, Auth0 integration, JWT)
- ✅ Database seeding (test data: 5 employees, 3 sites, 528 check-ins)
- ✅ EC2 instance deployment & SSH security
- ✅ GitHub Actions → ECR → EC2 pipeline

### FASE 2: Backend API (Weeks 3-4) 🚧 IN PROGRESS
**Deliverable:** Core API endpoints working
- 🚧 Auth endpoints (/api/auth/login, /api/auth/refresh, /api/auth/logout)
- 🚧 Check-in endpoints (/api/checkin POST, GET, PUT)
- 🚧 Dashboard endpoints (/api/presences, /api/stats)
- 🚧 Admin endpoints (/api/admin/clients, /api/admin/sites, /api/admin/employees)
- 🚧 Audit logging (AuditLog schema, middleware)
- 🚧 CRUD operations with transaction support
- 🚧 Pagination + filtering
- 🚧 Error handling (Sentry integration)

### FASE 3: Frontend Web (Weeks 5-6) ⏳ PLANNED
**Deliverable:** Dashboard functional
- ⏳ Layout + Navigation (sidebar, header, tabs)
- ⏳ Dashboard page (presences table, KPI cards)
- ⏳ Planning page (shift management: Giorno/Settimana/Mese views)
- ⏳ Corrections page (edit check-ins)
- ⏳ CSV export
- ⏳ Auth flow (login/logout)
- ⏳ Real-time updates (WebSocket or polling)

### FASE 4: Frontend Mobile (Weeks 7-8) ⏳ PLANNED
**Deliverable:** Mobile app functional
- ⏳ QR Code scanner
- ⏳ Face ID authentication
- ⏳ Check-in flow (QR → Face → submit)
- ⏳ Check-in history
- ⏳ Offline support (local queue, sync when online)

---

## 4. DECISION POINTS APERTI

### ✅ Multitenancy Strategy
**DECIDED:** Schema-based multitenancy (per-client PostgreSQL schemas)
- ✅ Public schema: clients, sites, employees metadata
- ✅ Per-client schema: client_A, client_B, client_N (isolation)
- ✅ Pros: Data isolation, simple scaling, easy backups per client
- ✅ Cons: More DB resources initially

### ✅ Real-time Updates
**DECIDED:** Polling-based (MVP), WebSocket (Phase 2)
- ✅ MVP: Frontend polls /api/presences every 30 seconds
- ✅ Phase 2: WebSocket for true real-time dashboard
- Rationale: Simpler to implement MVP, sufficient for first customer

### ✅ Soft Delete vs Hard Delete
**DECIDED:** Soft delete for audit trail preservation
- ✅ CheckIns: never deleted, only marked as deleted_at
- ✅ Employees: soft delete (hidden from UI, kept in audit log)
- Rationale: GDPR compliance, audit trail requirements

### 🔓 Authentication Flow
**DECIDED:** Mock Auth0 for MVP (free), migrate to production Auth0 on revenue
- ✅ MVP: Mock JWT in Node.js (hardcoded users)
- ✅ Production: Auth0 managed (Face ID via mobile SDK)
- ✅ Future: Custom biometric integration if needed

### 🔓 Offline Sync Strategy
**DECIDED:** Online-only MVP, offline queue Phase 2
- ✅ MVP: Requires internet connection
- ✅ Phase 2: Local SQLite queue on mobile, batch sync on reconnect

### 🔓 Reporting & Analytics
**DECIDED:** CSV export only (MVP), BI dashboard Phase 2
- ✅ MVP: /api/export/csv endpoint
- ✅ Phase 2: Grafana/Analytics dashboard for advanced reporting

---

## 5. CLAUDE WORKFLOW STRATEGY

### Tool Usage
| Task | Tool | Reason |
|------|------|--------|
| Architecture decisions | Claude.ai | Think deeply, no time pressure |
| SQL schema design | Claude Code | Hands-on: write migrations, test locally |
| API endpoint implementation | Claude Code | Iterative: code, test, refine |
| Testing & debugging | Claude Code | Real-time feedback |
| Documentation | Claude.ai + Code | Planning in AI, writing in Code |

### Collaboration Style
- **Planning phase:** Claude.ai for strategic decisions (multitenancy, auth, schema)
- **Implementation phase:** Claude Code for coding, testing, deployment
- **Review phase:** Code review, manual testing, security audit

### Context Management
- CLAUDE.md: Source of truth (architecture decisions)
- memory/: Session-specific decisions, deployment notes
- GitHub commits: Implementation details (not architecture)

---

## 6. CLAUDE MODELS STRATEGY

### Model Selection
| Task | Model | Hours | Rationale |
|------|-------|-------|-----------|
| Architecture planning | Opus/Sonnet | 5-10h | Deep thinking, complex decisions |
| Database schema | **Haiku** | 10-15h | SQL, schema validation |
| Backend API | **Sonnet** | 30-40h | Complex logic, error handling |
| Frontend components | **Haiku** | 20-30h | UI patterns, CSS |
| Docs + comments | **Haiku** | 5-10h | Writing, explanation |
| Optimization | Sonnet | 5h | Query optimization, performance |

### Cost Breakdown (Estimated)
| Category | Hours | Model | Cost Est. |
|----------|-------|-------|-----------|
| Planning | 10h | Opus | Free (cache) |
| Database | 15h | Haiku | €1.50 |
| Backend | 40h | Sonnet | €24 |
| Frontend | 30h | Haiku | €3 |
| Docs | 10h | Haiku | €1 |
| **TOTAL** | **105h** | — | **~€30** |

### Split Strategy: 80% Haiku, 20% Sonnet
- **Haiku for:** Schema, components, documentation, simple endpoints
- **Sonnet for:** Complex business logic, transactions, query optimization
- **Result:** Low cost, fast iteration (Haiku is speedy for 90% of work)

### Cache Strategy
- **Static cache:** CLAUDE.md, PROJECT_DECISIONS.md (reuse across sessions)
- **Dynamic cache:** Memory files (updated per session)

---

## 7. PREVIOUS DISCUSSION SUMMARY

### Session 1: Brainstorming & Architecture (27-28 Maggio 2026)
**Outcome:** Architecture approved ✅
- Decided QR Code + Face ID (not hardware badges)
- Chose Node.js + React (not Python/Vue)
- Multi-tenant schema separation (not row-level)
- MVP scope locked (9 features, 3 phases for Phase 2)

### Session 2: Project Structure & Documentation (28 Maggio 2026)
**Outcome:** Documentation foundation created ✅
- Created 5 README files (backend, frontend-web, frontend-mobile, infrastructure, docs)
- Designed 4 .env.example files
- Established feature-based organization (auth, dashboard, corrections, export)

### Session 3: Database & Backend (31 Maggio - 2 Giugno 2026)
**Outcome:** Backend deployed to EC2, schema seeded ✅
- ✅ RDS PostgreSQL running (multi-tenant schema)
- ✅ EC2 t3.small instance up + GitHub Actions CI/CD
- ✅ Backend API skeleton (Express, auth, routes)
- ✅ Test data: 528 check-ins for 5 employees across 3 sites
- ✅ Audit logging working (transaction support)
- ✅ Pagination + filtering endpoints

### Session 4: API Testing & Audit Logging (2-3 Giugno 2026)
**Outcome:** API endpoints tested, critical bugs fixed ✅
- ✅ Fixed transaction handling (POST /api/checkin)
- ✅ Fixed pagination (GET /api/presences)
- ✅ Fixed audit log schema (action, entity, changes)
- ✅ Code review: 3 design findings (caching, validation, error messaging)

### Session 5: Dashboard Setup (3 Giugno 2026)
**Outcome:** Netlify deployment + HTTPS configuration ⏸️ PAUSED
- ✅ Dashboard frontend scaffolded (React + Vite)
- ✅ Netlify deployment configured
- ⏳ HTTPS/SSL setup (Let's Encrypt ready)

---

## 8. DEVELOPMENT PRIORITIES (Next Steps)

### Immediate (This Week)
1. **Complete FASE 2:** Finish backend API testing (all endpoints green)
2. **Dashboard:** Deploy HTTPS, build presence table UI
3. **Mobile mockup:** QR scanner + Face ID flow (design first)

### Short-term (Next 2 Weeks)
1. **Frontend Web:** Build all 4 pages (auth, dashboard, planning, corrections)
2. **Real-time updates:** Implement polling (30sec) or WebSocket
3. **CSV export:** Implement /api/export/csv

### Medium-term (Next 4 Weeks)
1. **Mobile app:** React Native implementation
2. **Integration testing:** E2E flows (QR → check-in → dashboard)
3. **Performance testing:** Load test 50 concurrent check-ins
4. **Security audit:** OWASP checklist, GDPR review

---

## 9. RISK REGISTER

| Rischio | Probabilità | Impact | Mitigazione |
|---------|-----------|--------|------------|
| Connettività retail instabile | Media | Alto | MVP online-only, Phase 2 offline queue |
| Bassa adozione dipendenti | Media | Alto | UX semplice, training cliente |
| Churn clienti | Bassa | Alto | Support proattivo, feature roadmap |
| Costi cloud > budget | Bassa | Medio | Monitoring mensile, auto-scaling |
| GDPR/Privacy issues | Bassa | Critico | Legal review, audit trail, DPA template |
| Auth0 pricing shock | Bassa | Medio | Mock auth MVP, evaluate alternatives |

---

## 10. SUCCESS CRITERIA (MVP)

- ✅ App funziona con Face ID nativo
- ✅ Check-in registrati correttamente (±1 secondo accuracy)
- ✅ Dashboard mostra presenze in real-time (30sec poll max)
- ✅ First customer pilota pronto entro 3 mesi
- ✅ Costi operativi < €200/mese per MVP
- ✅ Zero critical bugs in produzione
- ✅ API response time < 500ms (p95)
- ✅ Dashboard loads < 3 sec
- ✅ 95%+ uptime SLA

---

**Created By:** Claude Code Session 5  
**Status:** Active Development 🚧  
**Next Review:** End of FASE 2 (completion of backend API)
