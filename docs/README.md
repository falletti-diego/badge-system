# Documentation Hub

**Purpose:** Central repository for all project documentation

---

## 📚 Documentation Files

### **API.md** (Swagger/OpenAPI)
Complete REST API documentation:
- All endpoints with request/response examples
- Authentication flows
- Error codes
- Rate limiting
- Webhooks (Phase 2)

### **SCHEMA.md** (Database)
Database design:
- Entity Relationship Diagram (ERD)
- Table definitions
- Indexes & constraints
- Multi-tenant isolation strategy
- Migration procedures

### **DEPLOYMENT.md** (Infrastructure)
Step-by-step deployment guide:
- AWS setup (RDS, EC2, IAM)
- Docker builds
- CI/CD pipeline configuration
- DNS setup
- SSL certificates
- Monitoring setup

### **SECURITY.md** (Security Checklist)
Security best practices:
- OWASP Top 10 mitigations
- GDPR compliance checklist
- Password policies
- API key management
- Encryption standards
- Incident response procedures

### **ERRORS.md** (Error Codes)
All API error responses:
- Authentication errors (401, 403)
- Validation errors (400, 422)
- Not found errors (404)
- Server errors (500, 503)
- Custom error codes

### **ARCHITECTURE.md** (System Design)
High-level architecture:
- Component diagram
- Data flow
- API layers
- Frontend architecture
- Database architecture
- Deployment architecture

### **ONBOARDING.md** (Getting Started)
New developer setup:
- Environment setup
- First-time configuration
- Running the project locally
- Common issues & solutions
- Development workflow

### **TESTING.md** (Test Strategy)
Testing guidelines:
- Unit test structure
- Integration test examples
- E2E test setup
- Coverage targets
- CI/CD test automation

---

## 📖 Reading Order for New Developers

1. **Start here:** ONBOARDING.md
2. **Understand the system:** ARCHITECTURE.md
3. **API development:** API.md + SCHEMA.md
4. **Deployment:** DEPLOYMENT.md
5. **Reference:** ERRORS.md, SECURITY.md

---

## 🗂️ Additional Resources

### External Links
- **Auth0 Docs:** https://auth0.com/docs
- **Express.js Guide:** https://expressjs.com/
- **React Docs:** https://react.dev
- **PostgreSQL Manual:** https://www.postgresql.org/docs/
- **AWS Documentation:** https://docs.aws.amazon.com/

### Internal Links
- **Source Code:** ../backend, ../frontend-web, ../frontend-mobile
- **Infrastructure:** ../infrastructure
- **Project Context:** ../CLAUDE.md

---

**Last Updated:** 28 Maggio 2026  
**Maintained By:** Development Team
