# Badge System — Project Structure Overview

**Created:** 28 Maggio 2026  
**Status:** ✅ Complete  
**Total Files:** 9 README files + 3 .env.example + 1 .gitignore

---

## 📁 Directory Tree

```
badge/
├── 📄 CLAUDE.md                    # Project context & tech stack (AUTHORITATIVE)
├── 📄 PROJECT_STRUCTURE.md         # This file
├── 📄 .gitignore                   # Global git exclusions
│
├── 📁 backend/                     # Node.js + Express API
│   ├── 📄 README.md                # [400+ lines] Setup, MVC structure, API endpoints
│   ├── 📄 .env.example             # Database, Auth0, Sentry, AWS configs
│   ├── 📁 src/
│   │   ├── config/                 # DB connection, Auth0, constants
│   │   ├── models/                 # Entities (Client, Site, Employee, CheckIn, AuditLog)
│   │   ├── services/               # Business logic (auth, checkin, reporting, audit)
│   │   ├── controllers/            # HTTP handlers
│   │   ├── routes/                 # API endpoint definitions
│   │   ├── middleware/             # Auth, logging, error handling, CORS
│   │   └── utils/                  # Validation (Zod), formatters, helpers
│   ├── migrations/                 # Migration SQL (runner: scripts/run-migrations.js + schema_migrations)
│   └── tests/                      # Jest unit + integration tests
│
├── 📁 frontend-web/                # React + Vite Web Dashboard
│   ├── 📄 README.md                # [350+ lines] Feature-based arch, routing, styling
│   ├── 📄 .env.example             # API, Auth0, Sentry configs
│   ├── 📁 src/
│   │   ├── components/             # Shared UI components (Button, Table, Card, etc)
│   │   ├── hooks/                  # Custom hooks (useAuth, usePresences, useFetch)
│   │   ├── services/               # API clients (axios configured, endpoints)
│   │   ├── store/                  # Redux (store, slices, selectors)
│   │   ├── styles/                 # Global CSS, Tailwind theme
│   │   ├── lib/                    # 3rd-party utilities, constants
│   │   ├── features/               # Feature modules
│   │   │   ├── auth/               # Login (pages, components)
│   │   │   ├── dashboard/          # Presences table (pages, components)
│   │   │   ├── corrections/        # Edit check-ins (pages, components)
│   │   │   └── export/             # CSV download (components)
│   │   ├── App.jsx
│   │   ├── index.jsx
│   │   └── main.jsx
│   ├── public/                     # Static assets
│   └── tests/                      # Vitest + React Testing Library
│
├── 📁 frontend-mobile/             # React Native + Expo Mobile App
│   ├── 📄 README.md                # [350+ lines] Screens, navigation, Face ID + QR
│   ├── 📄 .env.example             # API, Auth0, Expo variables
│   ├── 📁 src/
│   │   ├── components/             # Shared UI components (React Native)
│   │   ├── screens/                # Full-screen features
│   │   │   ├── auth/               # Login, Face ID setup
│   │   │   ├── checkin/            # QR scanner, check-in flow
│   │   │   └── history/            # Check-in history, corrections
│   │   ├── navigation/             # React Navigation (RootNavigator, AuthStack, AppStack)
│   │   ├── services/               # API clients, storage
│   │   ├── store/                  # Redux state management
│   │   ├── hooks/                  # Custom hooks (useAuth, useFaceId, useQRScanner)
│   │   ├── utils/                  # Validation, formatters, constants
│   │   ├── App.jsx
│   │   └── index.js
│   ├── assets/                     # Images, fonts
│   └── tests/                      # Jest tests
│
├── 📁 infrastructure/              # Docker & Cloud Setup
│   ├── 📄 README.md                # [250+ lines] Docker, AWS, CI/CD, monitoring
│   ├── 📁 docker/
│   │   ├── Dockerfile.backend      # Node.js image
│   │   ├── Dockerfile.frontend     # Static React build
│   │   └── .dockerignore
│   ├── docker-compose.yml          # Local dev: PostgreSQL + backend
│   ├── docker-compose.prod.yml     # Production setup
│   ├── 📁 aws/
│   │   ├── ec2-setup.sh            # EC2 instance initialization
│   │   ├── rds-setup.sh            # RDS PostgreSQL setup
│   │   ├── iam-roles.json          # IAM policies
│   │   └── security-groups.json    # AWS security rules
│   ├── 📁 ci-cd/
│   │   ├── github-actions-setup.yml   # CI/CD workflow
│   │   └── deploy-script.sh           # Deployment to EC2
│   └── 📁 nginx/
│       └── nginx.conf              # Reverse proxy (optional)
│
├── 📁 docs/                        # Documentation Hub
│   ├── 📄 README.md                # Documentation index & reading order
│   ├── 📄 API.md                   # (to create) REST API OpenAPI spec
│   ├── 📄 SCHEMA.md                # (to create) Database ERD & migrations
│   ├── 📄 DEPLOYMENT.md            # (to create) Step-by-step deploy guide
│   ├── 📄 SECURITY.md              # (to create) OWASP checklist, GDPR
│   ├── 📄 ERRORS.md                # (to create) All API error codes
│   ├── 📄 ARCHITECTURE.md          # (to create) System design diagrams
│   ├── 📄 ONBOARDING.md            # (to create) New developer setup
│   └── 📄 TESTING.md               # (to create) Test strategy & examples
│
└── 📁 scripts/                     # Utility scripts (future use)
    ├── setup-local.sh              # (to create) Local dev setup
    ├── seed-db.js                  # (to create) Test data seeding
    └── health-check.sh             # (to create) System health monitoring
```

---

## 📋 Files Created (This Session)

### Documentation Files (5)
| File | Lines | Purpose |
|------|-------|---------|
| `backend/README.md` | 400+ | MVC structure, setup, API endpoints, testing, deployment |
| `frontend-web/README.md` | 350+ | Feature-based arch, routing, Tailwind + MUI integration |
| `frontend-mobile/README.md` | 350+ | Expo setup, screens, Face ID, QR scanner, navigation |
| `infrastructure/README.md` | 250+ | Docker, AWS RDS/EC2, CI/CD, monitoring, disaster recovery |
| `docs/README.md` | 80+ | Documentation index, reading order, resource links |

### Configuration Files (4)
| File | Purpose |
|------|---------|
| `backend/.env.example` | Database, Auth0, Sentry, JWT, AWS configs |
| `frontend-web/.env.example` | API URL, Auth0, Sentry |
| `frontend-mobile/.env.example` | API URL, Auth0, Expo variables, feature flags |
| `.gitignore` | Node.js, IDE, build, secrets, OS exclusions |

### Structure Documentation (1)
| File | Purpose |
|------|---------|
| `PROJECT_STRUCTURE.md` | This overview + directory tree |

---

## 🎯 Key Design Decisions

### 1. **MVC Pattern (Backend)**
- Models → Services → Controllers → Routes
- Separation of concerns (business logic outside HTTP)
- Easy testing and scaling

### 2. **Feature-Based Organization (Frontend)**
- Auth, Dashboard, Corrections, Export as isolated modules
- Each feature has pages, components, styling
- Reduces import path depth, improves maintainability

### 3. **Multi-Repo Strategy**
- Separate backend, frontend-web, frontend-mobile repos
- Independent versioning and deployment
- Clear ownership per team

### 4. **Environment Configuration**
- `.env.example` committed to git (safe)
- `.env` excluded from git (contains secrets)
- Clear instructions in each README

### 5. **Documentation First**
- Every folder has README with setup instructions
- API docs, schema docs, deployment docs separated
- New developers can onboard via `/docs/ONBOARDING.md`

---

## ✅ Next Steps (Task #2-8)

### Task #2-3: UI/UX Design (Figma)
- Create mobile app wireframes (login, QR, check-in, history)
- Create web dashboard mockups (presences, corrections, export)
- Define design system (colors, typography, components)

### Task #4: API Specification
- OpenAPI/Swagger documentation
- Request/response examples
- Error codes reference

### Task #5: Database Schema
- SQL migrations
- Entity Relationship Diagram (ERD)
- Indexes and constraints

### Task #6: .env Configuration
- Docker-compose setup for local dev
- AWS setup scripts
- Configuration templates

### Task #7: Architecture Diagrams
- Component diagram
- Data flow diagram
- Deployment architecture

### Task #8: Detailed ROADMAP
- Sprint-by-sprint task breakdown
- Time estimates (hours)
- Dependencies and milestones

---

## 🚀 How to Use This Structure

### For Developers
1. Read `CLAUDE.md` (project context)
2. Read `backend/README.md` (or frontend-*/README.md)
3. Copy `.env.example` → `.env` and fill in values
4. Follow quick start steps in respective README

### For Deployment
1. Read `infrastructure/README.md`
2. Run AWS setup scripts
3. Configure GitHub Actions CI/CD
4. Deploy with `docker-compose up`

### For Documentation
1. Start at `docs/README.md`
2. Follow "Reading Order for New Developers"
3. Reference specific docs (API.md, SCHEMA.md, etc)

---

## 📞 Support & Questions

**Structure unclear?** Check:
1. The relevant README.md in that folder
2. `docs/ARCHITECTURE.md` (when created)
3. `docs/ONBOARDING.md` for new developers

---

**Created By:** Claude Code  
**Last Updated:** 28 Maggio 2026  
**Status:** ✅ Ready for Development
