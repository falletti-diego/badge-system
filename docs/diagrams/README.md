# 📊 Badge System — Architecture Diagrams

**Location:** `/docs/diagrams/`  
**Format:** Mermaid (.mmd files)  
**Last Updated:** 28 Maggio 2026  
**Status:** Production Ready ✅

---

## 📋 Overview

This directory contains 3 complementary architecture diagrams that document the Badge System from different perspectives:

1. **Component Diagram** — System architecture and component interactions
2. **Data Flow Diagram** — Core check-in process with happy path and error cases
3. **Deployment Diagram** — AWS infrastructure, environments, and CI/CD pipeline

All diagrams use **Mermaid.js** (text-based, git-versioned, markdown-compatible).

---

## 🎯 Diagrams

### 1️⃣ Component Diagram (`component.mmd`)

**Purpose:** Show all system components and their connections

**Shows:**
- **Client Layer:** Mobile App (React Native) + Web Dashboard (React 18)
- **API Layer:** Express.js services (Auth, Check-in, Reporting, Admin)
- **External Services:** Auth0, Sentry
- **Data Layer:** PostgreSQL tables (clients, sites, employees, check_ins, audit_log)
- **Infrastructure:** AWS EC2, RDS, CloudWatch

**Key Connections:**
- Mobile/Web ↔ API: HTTPS REST + JWT Bearer auth
- API ↔ Auth0: OAuth2 token verification
- API ↔ Database: pg driver with RLS policies
- EC2 ↔ RDS: Private VPC subnet, no internet access

**When to Reference:**
- System overview presentations
- Onboarding new team members
- Architecture reviews
- Understanding data isolation (multi-tenant RLS)

---

### 2️⃣ Data Flow Diagram (`dataflow.mmd`)

**Purpose:** Trace data flow through the system for the core business process (Check-in)

**Shows:**
- **Happy Path:** Employee scans QR → Face ID → Check-in recorded → Dashboard updates
- **Validation Steps:** 
  - JWT token valid?
  - Employee assigned to site?
  - No duplicate (within 60 seconds)?
  - Timestamp not too old (< 1 minute)?
- **Error Cases:** DUPLICATE_CHECKIN, INVALID_QR_CODE, EMPLOYEE_NOT_ASSIGNED, CORRECTION_WINDOW_CLOSED
- **Correction Process:** Manager corrects with time windows (2h employee, 48h manager)
- **Compliance:** Immutable audit trail with GDPR compliance
- **CSV Export:** Manager downloads presences as CSV

**Timing Constraints:**
- API response: < 500ms
- Duplicate window: exactly 60 seconds
- Employee correction window: 2 hours
- Manager correction window: 48 hours
- Dashboard refresh: real-time (WebSocket) or 10s polling

**When to Reference:**
- Understanding check-in workflow
- Debugging API behavior
- Testing error handling
- Explaining correction process to customers
- Audit trail validation

---

### 3️⃣ Deployment Diagram (`deployment.mmd`)

**Purpose:** Show AWS infrastructure, environments, and deployment pipeline

**Shows:**
- **Local Development:** Docker Compose with Node.js + PostgreSQL
- **GitHub:** Repository branches and GitHub Actions CI/CD
- **AWS VPC (eu-west-1):**
  - **Public Subnet:** EC2 instances (Staging + Production), ALB, Security Groups
  - **Private Subnet:** RDS databases, Security Groups (RDS only accepts from API)
  - **AWS Services:** ECR (Docker registry), ACM (SSL certificates), CloudWatch (monitoring), Route 53 (DNS)
- **External Services:** Netlify (frontend), Auth0 (auth), Sentry (error tracking)
- **Backup & Disaster Recovery:** RDS automated backups, point-in-time recovery
- **Monitoring:** CloudWatch metrics and alarms

**Environments:**
| Environment | EC2 Instance | RDS Instance | Purpose |
|------------|--------------|--------------|---------|
| **Development** | Docker Compose local | PostgreSQL 14 | Developer machines |
| **Staging** | t3.small | db.t3.micro | Pre-production testing |
| **Production** | t3.small+ | db.t3.small | Customer-facing |

**CI/CD Pipeline:**
```
git push main
  ↓
GitHub Actions
  ├─ npm ci (dependencies)
  ├─ npm run lint (code style)
  ├─ npm run test (unit tests)
  ├─ docker build -t badge:main
  ├─ docker push 123456.dkr.ecr.eu-west-1.amazonaws.com/badge:main
  └─ SSH to EC2 prod
      ├─ docker pull latest
      ├─ docker-compose restart
      └─ curl /health (verify)
```

**When to Reference:**
- Understanding deployment process
- Troubleshooting infrastructure issues
- Capacity planning and scaling
- Disaster recovery procedures
- Cost analysis
- Network diagram for security team

---

## 🔍 How to View Diagrams

### Option 1: GitHub (Recommended for Browsing)

Mermaid diagrams render automatically in GitHub:

```
git push → Open PR → See diagrams in browser
```

No setup required. GitHub renders `.mmd` files automatically.

### Option 2: VS Code (Recommended for Editing)

Install **Mermaid extension** in VS Code:

```bash
# Install extension
code --install-extension bierner.markdown-mermaid

# Then open any .mmd file and preview in right panel
```

### Option 3: Local Rendering with mermaid-cli

Generate PNG/SVG versions locally:

```bash
# Install globally
npm install -g @mermaid-js/mermaid-cli

# Render individual diagram
mmdc -i component.mmd -o component.svg
mmdc -i component.mmd -o component.png

# Or render all
for file in *.mmd; do mmdc -i "$file" -o "${file%.mmd}.png"; done
```

### Option 4: Mermaid Live Editor

Paste diagram content at: https://mermaid.live/

---

## ✏️ Editing Diagrams

### Add a New Component

**component.mmd:**
```mermaid
newComponent["📌 New Service<br/>(Technology)<br/>─────<br/>• Feature 1<br/>• Feature 2"]
```

### Add a New Flow Step

**dataflow.mmd:**
```mermaid
Actor->>NewComponent: Send request
NewComponent->>Database: Query data
Database-->>NewComponent: Return results
```

### Update Infrastructure

**deployment.mmd:**
```mermaid
newEC2["🖥️ EC2 t3.medium<br/>─────<br/>More powerful instance"]
```

### Update and Commit

```bash
git add docs/diagrams/*.mmd
git commit -m "docs: update architecture diagrams - add caching layer"
git push
```

---

## 🔄 Validation Checklist

Use this checklist when updating diagrams:

### Component Diagram
- [ ] All components labeled with responsibilities
- [ ] Connections show protocol (HTTPS, OAuth2, pg, etc.)
- [ ] External services identified (Auth0, Sentry, Netlify)
- [ ] Multi-tenant isolation clear (RLS policies)
- [ ] No circular dependencies

### Data Flow Diagram
- [ ] Happy path from actor to database to dashboard complete
- [ ] All error cases documented (at least 3 main ones)
- [ ] Timing constraints explicit (< 500ms, 60s, 2h, 48h)
- [ ] Audit trail included (who, what, when)
- [ ] Correction windows differentiated (employee vs manager)

### Deployment Diagram
- [ ] Dev, Staging, Production clearly separated
- [ ] CI/CD pipeline end-to-end visible
- [ ] AWS regions correct (eu-west-1)
- [ ] Security groups and subnets shown
- [ ] Backup and DR strategy visible

---

## 📌 Architecture Principles Documented

These diagrams enforce:

1. **Multi-Tenant Isolation:** RLS policies on every table + client_id in check_ins
2. **GDPR Compliance:** Soft delete + immutable audit_log + data export
3. **Security:** JWT + SSL + RLS + Auth0 integration
4. **Performance:** < 500ms API response + strategic indexes
5. **Scalability:** Shared-schema design for multi-client growth
6. **Cost Efficiency:** AWS t3 instances + managed RDS
7. **GDPR Region:** eu-west-1 (Ireland, GDPR-compliant)
8. **Disaster Recovery:** Automated RDS backups + point-in-time recovery

---

## 🔗 Related Documentation

| Document | Purpose |
|----------|---------|
| `docs/API.md` | REST API endpoints and examples |
| `docs/openapi.yaml` | OpenAPI 3.0 specification (machine-readable) |
| `docs/SCHEMA.md` | PostgreSQL schema design and RLS policies |
| `docs/ERRORS.md` | Complete error reference with HTTP codes |
| `migrations/V001__initial_schema.sql` | Database migration script |

---

## ❓ FAQ

**Q: Why Mermaid instead of Draw.io/Lucidchart?**  
A: Text-based format allows version control, git diffs, and no lock-in to proprietary tools. Renders natively in GitHub.

**Q: How do I export these to PDF for presentations?**  
A: Use mermaid-cli: `mmdc -i component.mmd -o component.pdf`

**Q: What if I need to update a diagram?**  
A: Edit the .mmd file in any text editor, push to git. GitHub will auto-render the new version.

**Q: Can I embed these in other documents?**  
A: Yes! Use markdown code blocks with ` ```mermaid` ` syntax.

**Q: What if someone doesn't know Mermaid syntax?**  
A: Use Mermaid Live Editor (https://mermaid.live/) to design visually, then copy-paste the generated Mermaid code.

---

## 📞 Questions?

Refer to:
- [Mermaid Documentation](https://mermaid.js.org/)
- [Mermaid Syntax Examples](https://mermaid.js.org/intro/)
- Project CLAUDE.md for architecture decisions

---

**Last Updated:** 28 Maggio 2026  
**Status:** Complete and Validated ✅  
**Next Review:** Before Sprint 2 (after Sprint 1 development)
