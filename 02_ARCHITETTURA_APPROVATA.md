# Badge System — Architettura Approvata ✅

**Data Approvazione:** 27 Maggio 2026  
**Decision Made By:** Diego Falletti + Claude  
**Status:** APPROVED - Ready for Development  
**Timeline:** MVP Lancio Settembre 2026 (10 ore/settimana)

---

## 🎯 Executive Summary

**Badge System** è una soluzione SaaS multi-tenant per il tracciamento delle presenze nel retail italiano/europeo.

- **Modello:** QR Code statico + Face ID nativo
- **Hardware:** Zero (dipendenti usano smartphone personale)
- **MVP Timeline:** 2-3 mesi @ 10h/settimana = ~150 ore totali
- **Pricing:** €10/dipendente/mese + €250/sede aggiuntiva
- **Target:** 25-200 dipendenti per cliente, multi-sede support

---

## 🏗️ Technology Stack (APPROVATO)

### Frontend Mobile
| Componente | Scelta | Versione | Rationale |
|-----------|--------|---------|-----------|
| **Framework** | React Native | Latest | Cross-platform (iOS/Android), code sharing con web |
| **Auth** | React Native Face API | Latest | Face ID nativo integrato |
| **QR Scanning** | react-native-camera + react-native-qrcode | Latest | Proven, community support |
| **HTTP Client** | Axios | Latest | Simple, reliable |
| **State Management** | Redux Toolkit | Latest | Standard, well-documented |

**Costo Dev:** 25-35 ore  
**Learning:** Diego imparerà React (base sia per mobile che web)

---

### Backend API
| Componente | Scelta | Versione | Rationale |
|-----------|--------|---------|-----------|
| **Runtime** | Node.js | 20+ LTS | Fast dev, low ops cost |
| **Framework** | Express.js | 4.x | Simple REST API, proven |
| **Database Driver** | pg (node-postgres) | Latest | Native PostgreSQL driver |
| **Authentication** | Auth0 SDK | Latest | Security managed, biometrics support |
| **Validation** | Zod | Latest | Type-safe request validation |
| **Error Handling** | Custom middleware | — | Structured error responses |
| **Logging** | Pino | Latest | Fast JSON logging |
| **Environment Config** | dotenv | Latest | .env file management |

**Costo Dev:** 30-40 ore  
**Technology:** Standard Node.js stack, minimal dependencies

---

### Database
| Componente | Scelta | Rationale |
|-----------|--------|-----------|
| **Engine** | PostgreSQL 14+ | ACID, relational, multi-tenant ready |
| **Hosting** | AWS RDS (Managed) | Auto-backup, failover, zero ops |
| **Region** | eu-west-1 (Ireland) | GDPR-compliant, low latency Italy |
| **Instance** | db.t3.micro (MVP) → db.t3.small (scale) | €30-50/mese MVP, auto-upgrade |
| **Backup** | AWS Automated Backups | 7-day retention, point-in-time recovery |
| **Multi-AZ** | Not for MVP (upgrade later) | Cost €60+ not justified for MVP |

**Schema:** Multi-tenant via schema separation (public schema + per-client schemas)

---

### Hosting & Infrastructure
| Componente | Scelta | Rationale |
|-----------|--------|-----------|
| **API Server** | AWS EC2 t3.small | €50-80/mese, familiar, scalable |
| **Region** | eu-west-1 (Ireland) | Same as RDS, low latency |
| **OS** | Ubuntu 22.04 LTS | Standard, well-supported |
| **Container** | Docker | Simplified deployment, CI/CD integration |
| **Load Balancer** | None (MVP) → AWS ALB (scale) | Not needed for MVP |
| **Auto-scaling** | Manual (MVP) → ASG (scale) | Upgrade when traffic justifies |

**Deployment:** Git → GitHub Actions → Docker build → ECR → EC2 deploy

---

### Frontend Web (Dashboard)
| Componente | Scelta | Versione | Rationale |
|-----------|--------|---------|-----------|
| **Framework** | React | 18+ | Code sharing with React Native |
| **Build Tool** | Vite | Latest | Fast HMR, small bundle |
| **HTTP Client** | Axios | Latest | Same as mobile app |
| **State Management** | Redux Toolkit | Latest | Consistent with mobile |
| **UI Components** | Material-UI (MUI) | 5.x | Rich component library, accessible |
| **Charts** | Recharts | Latest | Simple, responsive charts |
| **Styling** | Tailwind CSS | Latest | Utility-first, small bundle |
| **Tables** | TanStack Table (React Table) | Latest | Headless, flexible, performance |

**Hosting:** Netlify (auto-deploy on git push)  
**Costo Dev:** 20-30 ore

---

### Authentication & Security
| Componente | Scelta | Rationale |
|-----------|--------|-----------|
| **Provider** | Auth0 | €20-30/mese, GDPR-ready, biometric support |
| **Session** | JWT tokens | Stateless, scalable |
| **Token Expiry** | 30 minutes (access) + 7 days (refresh) | Security + UX balance |
| **Password Hashing** | bcrypt (if custom login) | Industry standard, Auth0 handles |
| **HTTPS** | Enforced everywhere | AWS ACM certificates (free) |
| **API Auth** | Bearer tokens + API keys | For backend-to-backend calls |

**Cost:** €20-30/mese Auth0, €0 for infrastructure (certificates included)

---

### Monitoring & Observability
| Componente | Scelta | Rationale |
|-----------|--------|-----------|
| **Error Tracking** | Sentry | €0 (free tier 5K events/mese) |
| **Application Logs** | CloudWatch | Included with EC2 |
| **Metrics** | CloudWatch | CPU, memory, disk monitoring |
| **Uptime Monitoring** | AWS CloudWatch Alarms | Free alerts via SNS/email |
| **Performance Tracking** | Sentry + browser DevTools | Real user monitoring |

**Cost:** €0-30/mese (Sentry free, upgrade when > 5K events)

---

### CI/CD & Deployment
| Componente | Scelta | Rationale |
|-----------|--------|-----------|
| **VCS** | GitHub | Industry standard, you'll learn it |
| **CI/CD** | GitHub Actions | Free tier, native to GitHub |
| **Container Registry** | AWS ECR | €0.20 per GB stored |
| **Deployment** | Manual via SSH + docker-compose | Simple for MVP, automated later |
| **Branches** | main (production), develop (staging) | Simple workflow |
| **Auto-deploy** | Netlify (frontend) | git push = auto-deploy |

**Pipeline:**
```
git push main → GitHub Actions:
  ├─ Lint (ESLint, Prettier)
  ├─ Test (Jest for backend, React Testing Library for frontend)
  ├─ Build Docker image
  ├─ Push to ECR
  └─ SSH to EC2 → docker pull + restart container
```

**Cost:** €0 (GitHub Actions free, ECR negligible)

---

## 📊 Complete Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    DATAXIOM BADGE SYSTEM                      │
└─────────────────────────────────────────────────────────────┘

CLIENT LAYER (Italia/Europa)
┌──────────────┐  ┌──────────────────┐  ┌──────────────┐
│  Mobile App  │  │ Web Dashboard    │  │ QR Code      │
│ (React Native)  │  (React + Netlify)│  │ (Printed)    │
└──────┬───────┘  └────────┬─────────┘  └──────┬───────┘
       │                   │                    │
       └───────────────────┼────────────────────┘
                           │
                    HTTPS/TLS (Enforced)
                           │
DATAXIOM API LAYER (AWS eu-west-1)
┌─────────────────────────────────────────────────────────────┐
│  AWS EC2 (t3.small, Ubuntu 22.04)                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Node.js + Express.js Container                        │  │
│  │ ┌────────────────────────────────────────────────────┐│  │
│  │ │ API Routes:                                        ││  │
│  │ │ ├─ POST /api/auth/login (Auth0)                  ││  │
│  │ │ ├─ POST /api/checkin (QR scan + Face ID)         ││  │
│  │ │ ├─ GET /api/presences (dashboard)                ││  │
│  │ │ ├─ POST /api/corrections (edit check-in)         ││  │
│  │ │ ├─ GET /api/export (CSV download)                ││  │
│  │ │ └─ Admin endpoints (create client/site/employee) ││  │
│  │ │                                                    ││  │
│  │ │ Middleware:                                       ││  │
│  │ │ ├─ Auth0 JWT validation                          ││  │
│  │ │ ├─ Request logging (Pino)                        ││  │
│  │ │ ├─ Error handling                                ││  │
│  │ │ └─ CORS + security headers                       ││  │
│  │ └────────────────────────────────────────────────────┘│  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                   │
└───────────────────────────┼───────────────────────────────────┘
                            │
           ┌────────────────┴────────────────┐
           │                                 │
    AWS RDS (PostgreSQL)        External Services
    eu-west-1                    ┌──────────────┐
    ┌─────────────────┐         │  Auth0       │
    │ Automated       │         │  (Biometric) │
    │ Backups         │         └──────────────┘
    │ 7-day retention │         ┌──────────────┐
    │ Point-in-time   │         │  Sentry      │
    │ recovery        │         │  (Errors)    │
    │                 │         └──────────────┘
    │ Multi-tenant    │         ┌──────────────┐
    │ schema-based    │         │  CloudWatch  │
    │ isolation       │         │  (Logs/Metrics)
    └─────────────────┘         └──────────────┘

DEPLOYMENT
┌──────────────────┐
│ GitHub           │
│ (VCS)            │
└────────┬─────────┘
         │
┌────────▼──────────┐
│ GitHub Actions    │
│ (CI/CD)           │
└────────┬──────────┘
         │
┌────────▼──────────┐
│ AWS ECR           │
│ (Container Image) │
└────────┬──────────┘
         │
┌────────▼──────────┐
│ AWS EC2 Instance  │
│ (Pull + Deploy)   │
└───────────────────┘
         │
┌────────▼──────────┐
│ Netlify (Frontend)│
│ (Auto git push)   │
└───────────────────┘
```

---

## 💰 Cost Breakdown

### Development Costs (One-time)
| Item | Hours | Rate | Cost |
|------|-------|------|------|
| Backend API (Node.js) | 30-40 | €50/h | €1500-2000 |
| Mobile App (React Native) | 25-35 | €50/h | €1250-1750 |
| Web Dashboard (React) | 20-30 | €50/h | €1000-1500 |
| Infrastructure Setup | 10-15 | €50/h | €500-750 |
| Testing + Documentation | 10-15 | €50/h | €500-750 |
| Buffer (20%) | — | — | €1000 |
| **TOTAL DEV** | **95-140h** | **€50/h** | **€6250-7750** |

### Monthly Operating Costs (MVP: 1 cliente, 25 dipendenti)
| Item | Cost |
|------|------|
| AWS EC2 t3.small | €40-50 |
| AWS RDS PostgreSQL | €30-50 |
| AWS Data Transfer | €5-10 |
| Netlify (free tier) | €0 |
| Auth0 | €20-30 |
| Sentry (free tier) | €0 |
| CloudWatch | €5-10 |
| Domain + miscellaneous | €5-10 |
| **TOTAL/mese** | **€105-160** |

### Monthly Operating Costs (Scaled: 5-10 clienti, ~250 dipendenti)
| Item | Cost |
|------|------|
| AWS EC2 t3.medium | €80-100 |
| AWS RDS db.t3.small | €60-80 |
| AWS Data Transfer | €20-30 |
| Netlify (free tier) | €0 |
| Auth0 (paid users) | €50-100 |
| Sentry (paid) | €0-50 |
| CloudWatch + ALB | €30-50 |
| Domain + miscellaneous | €10-15 |
| **TOTAL/mese** | **€250-425** |

### Revenue Projection
```
MVP Cliente (25 dipendenti, 1 sede):
  €10 × 25 = €250/mese
  Margin: €250 - €150 = €100/mese (40% gross margin)

5 Clienti Medi (50 dipendenti each, 1 sede each):
  €10 × 250 + (4 × €250) = €2500 + €1000 = €3500/mese
  Margin: €3500 - €400 = €3100/mese (88% gross margin)
```

---

## 📅 Development Timeline

### Sprint 1: Foundation (Weeks 1-2)
- [ ] GitHub account setup + learn Git basics (Diego)
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

### Sprint 4: Demo Ready (Week 7-8)
- [ ] Deploy to AWS (EC2 + RDS production)
- [ ] Netlify deployment (frontend)
- [ ] Customer-facing documentation
- [ ] Training material for first customer
- [ ] Bug fixes + polish

**Deliverable:** Ready to launch with first customer

---

## ✅ Pre-Launch Checklist

### Critical Checks (REQUIRED)
- [ ] Smoke test: login → check-in → dashboard → export
- [ ] Security review: passwords hashed, HTTPS enforced, JWT validated
- [ ] GDPR checklist: privacy policy, data retention, export rights
- [ ] API response time < 500ms
- [ ] No console errors (Sentry clean)

### Recommended Checks
- [ ] Load test: 50 simultaneous check-ins (no crash)
- [ ] Performance baseline: dashboard loads < 3 sec
- [ ] Manual testing: all user flows end-to-end

### Documentation
- [ ] API documentation (Postman / Swagger)
- [ ] Deployment runbook (how to deploy to prod)
- [ ] Customer onboarding guide
- [ ] Support SOP (how to debug issues)

---

## 🔐 Security & Compliance

### Authentication
- ✅ Face ID nativo (biometric, no passwords stored)
- ✅ Auth0 managed (OWASP Top 10 protected)
- ✅ JWT tokens with 30-min expiry
- ✅ Refresh tokens with 7-day expiry

### Data Protection
- ✅ HTTPS enforced everywhere
- ✅ Database encryption at rest (AWS RDS)
- ✅ Role-based access control (RBAC: dipendente, manager, admin)
- ✅ Audit log: every modification tracked (who, when, what)

### GDPR Compliance
- ✅ Privacy policy on website
- ✅ Data retention: delete employee data after 12 months (configurable)
- ✅ Data export: customer can download all data as CSV
- ✅ Right to be forgotten: delete employee + all their check-ins
- ✅ Data Processing Agreement (DPA) template for customers

### Compliance Future (Post-MVP)
- ⏳ SOC 2 Type II audit
- ⏳ Penetration testing
- ⏳ Advanced monitoring (anomaly detection)

---

## 🚀 Next Steps (Implementation)

1. **Week 1:** GitHub onboarding (Diego learns Git)
2. **Week 2:** AWS setup + Docker environment
3. **Week 3:** Start Sprint 1 (backend foundation)
4. **Week 4:** Start Sprint 2 (core features)
5. **Week 5:** Start Sprint 3 (testing + polish)
6. **Week 6:** Start Sprint 4 (production launch)
7. **September:** MVP live with first customer

---

## 📝 Approval Sign-off

**Architettura approvata da:** Diego Falletti  
**Data approvazione:** 27 Maggio 2026  
**Status:** APPROVED ✅  
**Prossima fase:** Development Planning + Task Breakdown  

---

**NOTE:** Questo documento è la source of truth per l'architettura. Se cambiamenti richiesti durante development, aggiorna qui e communica con il team.
