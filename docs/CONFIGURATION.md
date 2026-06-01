# 🔧 Badge System — Environment Configuration Guide

**Version:** 1.0  
**Last Updated:** May 28, 2026  
**Status:** Complete

---

## 📋 Table of Contents

1. [Quick Start](#quick-start-5-minutes)
2. [Environment Setup](#environment-specific-setup)
3. [Configuration Variables](#complete-variable-reference)
4. [Security Checklist](#security-checklist)
5. [Troubleshooting](#troubleshooting)
6. [Multi-Tenant Considerations](#multi-tenant-architecture)

---

## Quick Start (5 minutes)

### For Local Development with Docker Compose

```bash
# 1. Navigate to backend directory
cd backend

# 2. Copy the example file
cp .env.example .env

# 3. (Optional) Edit .env for testing without Auth0
# Uncomment: DISABLE_AUTH=true, MOCK_AUTH0=true

# 4. Start Docker Compose
cd ../infrastructure
docker-compose up

# 5. Backend starts and validates config
# Look for: ✅ "Server listening on port 3000"

# 6. Frontend dev server (separate terminal)
cd frontend-web
npm run dev
# Dashboard at http://localhost:5173

# 7. Mobile app (separate terminal)
cd frontend-mobile
expo start
# Scan QR code with Expo Go app
```

---

## Environment-Specific Setup

### Development (Local Machine)

**Use Case:** Developers building features locally

**Files to copy:**
- `backend/.env.example` → `backend/.env`
- `frontend-web/.env.example` → `frontend-web/.env`
- `frontend-mobile/.env.example` → `frontend-mobile/.env`

**Key Values:**

```bash
# backend/.env
NODE_ENV=development
DATABASE_URL=postgresql://badge_user:badge_pass@postgres:5432/badge_dev
DISABLE_AUTH=true         # Skip Auth0 for faster testing
MOCK_AUTH0=true           # Mock JWT tokens
LOG_LEVEL=debug

# frontend-web/.env
VITE_API_URL=http://localhost:3000
VITE_AUTH0_REDIRECT_URI=http://localhost:5173/dashboard
VITE_LOG_LEVEL=debug

# frontend-mobile/.env
# Find your machine IP:
#   macOS/Linux: ifconfig | grep "inet " | grep -v 127.0.0.1
#   Windows: ipconfig
EXPO_PUBLIC_API_URL=http://<YOUR_MACHINE_IP>:3000
EXPO_PUBLIC_LOG_LEVEL=debug
EXPO_PUBLIC_DEBUG=true
```

**What Works:**
- Full check-in flow without Auth0 credentials
- Real database (local PostgreSQL in Docker)
- Verbose logging for debugging
- Source maps for debugging

**What Doesn't Work:**
- Real Face ID (emulator only)
- Real Auth0 biometric integration
- Sentry error tracking

---

### Staging (AWS + Auth0 Test Tenant)

**Use Case:** QA testing, pre-production validation

**Database Setup:**
1. Create AWS RDS instance (db.t3.micro)
2. Get connection string: `postgresql://user:pass@hostname.rds.amazonaws.com:5432/badge_staging`
3. Run migrations: `psql <CONNECTION_URL> < migrations/V001__initial_schema.sql`

**Auth0 Setup:**
1. Create Auth0 tenant (test/staging) at https://auth0.com
2. Applications → Create → Single Page App
3. Copy Domain, Client ID, Client Secret
4. APIs → Create → Badge API (staging) → Identifier: `https://api-staging.badge.dataxiom.it`
5. Settings → Allowed Callback URLs: `https://dashboard-staging.badge.dataxiom.it/dashboard`

**Key Values:**

```bash
# backend/.env
NODE_ENV=staging
DATABASE_URL=postgresql://badge_user:password@badge-staging.xxxxx.eu-west-1.rds.amazonaws.com:5432/badge_staging
AUTH0_DOMAIN=badge-staging.auth0.com
AUTH0_CLIENT_ID=<staging_client_id>
AUTH0_CLIENT_SECRET=<staging_client_secret>
SENTRY_DSN=<staging-sentry-dsn>
LOG_LEVEL=info

# frontend-web/.env
VITE_API_URL=https://api-staging.badge.dataxiom.it
VITE_AUTH0_DOMAIN=badge-staging.auth0.com
VITE_AUTH0_REDIRECT_URI=https://dashboard-staging.badge.dataxiom.it/dashboard

# frontend-mobile/.env
EXPO_PUBLIC_API_URL=https://api-staging.badge.dataxiom.it
EXPO_PUBLIC_AUTH0_DOMAIN=badge-staging.auth0.com
```

**What Works:**
- Real Auth0 authentication (test tenant)
- Real Face ID on physical devices
- Full end-to-end testing
- QR code scanning
- CSV export
- Sentry error tracking

---

### Production (AWS + Auth0 Production Tenant)

**Use Case:** Customer-facing production

**Critical: Secrets Management**
- Do NOT put secrets in `.env` files in production
- Use AWS Secrets Manager or GitHub Secrets
- IAM roles for EC2 → RDS (no credentials in env)

**Database Setup:**
1. Create AWS RDS instance (db.t3.small) with Multi-AZ
2. Get endpoint: `badge-prod.xxxxx.eu-west-1.rds.amazonaws.com`
3. Run migrations on production DB

**Auth0 Setup:**
1. Create production Auth0 tenant
2. Applications → Badge System (Production)
3. Copy credentials
4. APIs → Badge API (Production)
5. Allowed Callback URLs: `https://dashboard.badge.dataxiom.it/dashboard`

**SSL/TLS Setup:**
1. Request SSL certificate via AWS ACM
2. Use domain: `api.badge.dataxiom.it`
3. Configure EC2 nginx reverse proxy (port 443)

**GitHub Actions Secrets:**
```bash
# In GitHub repo Settings → Secrets and variables → Actions
DATABASE_URL_PROD=postgresql://...
AUTH0_CLIENT_SECRET_PROD=...
JWT_SECRET_PROD=<strong_32_char_key>
SENTRY_DSN_PROD=https://...
```

**Key Values:**

```bash
# backend/.env (on EC2, loaded from AWS Secrets Manager)
NODE_ENV=production
DATABASE_URL=postgresql://badge_user:password@badge-prod.xxxxx.eu-west-1.rds.amazonaws.com:5432/badge_prod
AUTH0_DOMAIN=badge.auth0.com
AUTH0_CLIENT_ID=<prod_client_id>
AUTH0_CLIENT_SECRET=<prod_client_secret>
SENTRY_DSN=<prod-sentry-dsn>
SENTRY_ENVIRONMENT=production
LOG_LEVEL=warn
CORS_ORIGIN=https://dashboard.badge.dataxiom.it
CORS_CREDENTIALS=true

# frontend-web/.env (built into Docker image)
VITE_API_URL=https://api.badge.dataxiom.it
VITE_AUTH0_DOMAIN=badge.auth0.com
VITE_AUTH0_REDIRECT_URI=https://dashboard.badge.dataxiom.it/dashboard
VITE_LOG_LEVEL=error
VITE_SOURCEMAP=false

# frontend-mobile/.env (built into app)
EXPO_PUBLIC_API_URL=https://api.badge.dataxiom.it
EXPO_PUBLIC_AUTH0_DOMAIN=badge.auth0.com
EXPO_PUBLIC_LOG_LEVEL=error
EXPO_PUBLIC_DEBUG=false
EXPO_PUBLIC_SENTRY_DSN=<prod-sentry-dsn>
```

**Deployment via GitHub Actions:**
1. Commit to main branch
2. GitHub Actions automatically:
   - Runs linting & tests
   - Builds Docker image
   - Pushes to AWS ECR
   - SSH deploys to EC2
   - Pulls latest image
   - Restarts services

---

## Complete Variable Reference

### Backend Variables

| Variable | Required | Type | Example | Notes |
|----------|----------|------|---------|-------|
| NODE_ENV | ✅ | enum | development | Affects logging, optimizations |
| PORT | ✅ | number | 3000 | Usually 3000 locally, 443 in prod (via nginx) |
| LOG_LEVEL | ❌ | enum | debug | debug, info, warn, error |
| DATABASE_URL | ✅ | string (URL) | postgresql://... | CRITICAL: Must start with postgresql:// |
| DB_POOL_MIN | ❌ | number | 5 | Connection pool minimum |
| DB_POOL_MAX | ❌ | number | 10 | Connection pool maximum |
| AUTH0_DOMAIN | ✅ | string | badge.auth0.com | From Auth0 dashboard |
| AUTH0_CLIENT_ID | ✅ | string | xxx | From Auth0 dashboard |
| AUTH0_CLIENT_SECRET | ✅ | string | xxx | KEEP SECRET! |
| AUTH0_AUDIENCE | ✅ | string (URL) | https://api.badge.dataxiom.it | API identifier |
| JWT_SECRET | ✅ | string | xxx | >= 32 chars, use: openssl rand -base64 32 |
| JWT_EXPIRY | ❌ | duration | 30m | Format: 30m, 24h, 7d |
| JWT_REFRESH_SECRET | ✅ | string | xxx | >= 32 chars, different from JWT_SECRET |
| JWT_REFRESH_EXPIRY | ❌ | duration | 7d | Format: 30m, 24h, 7d |
| CORS_ORIGIN | ❌ | string | http://localhost:5173 | Comma-separated URLs |
| CORS_CREDENTIALS | ❌ | boolean | true | Include cookies in CORS? |
| RATE_LIMIT_WINDOW_MS | ❌ | number | 60000 | Rate limit window in milliseconds |
| RATE_LIMIT_MAX_REQUESTS | ❌ | number | 100 | Max requests per window per IP |
| SENTRY_DSN | ❌ | string (URL) | https://key@sentry.io/... | Leave empty to disable |
| SENTRY_ENVIRONMENT | ❌ | enum | development | For Sentry filtering |
| ENABLE_OFFLINE_MODE | ❌ | boolean | false | Phase 2 feature |
| ENABLE_PAYROLL_API | ❌ | boolean | false | Phase 2 feature |
| ENABLE_WEBHOOKS | ❌ | boolean | false | Phase 2 feature |
| DISABLE_AUTH | ❌ | boolean | false | SECURITY: NEVER true in production |
| SEED_TEST_DATA | ❌ | boolean | false | Disable in production |
| MOCK_AUTH0 | ❌ | boolean | false | NEVER true in production |
| AWS_REGION | ❌ | string | eu-west-1 | GDPR region |
| AWS_S3_BUCKET | ❌ | string | badge-exports-prod | Phase 2 feature |

### Frontend Web Variables

| Variable | Required | Type | Example | Notes |
|----------|----------|------|---------|-------|
| VITE_API_URL | ✅ | string (URL) | http://localhost:3000 | Backend API endpoint |
| VITE_API_TIMEOUT | ❌ | number | 30000 | Request timeout in ms |
| VITE_AUTH0_DOMAIN | ✅ | string | badge.auth0.com | From Auth0 dashboard |
| VITE_AUTH0_CLIENT_ID | ✅ | string | xxx | Public Client ID |
| VITE_AUTH0_REDIRECT_URI | ✅ | string (URL) | http://localhost:5173/dashboard | Where to return after login |
| VITE_AUTH0_AUDIENCE | ✅ | string (URL) | https://api.badge.dataxiom.it | Must match backend |
| VITE_APP_NAME | ❌ | string | Badge System | Display name |
| VITE_APP_VERSION | ❌ | string | 1.0.0 | For bug reports |
| VITE_LOG_LEVEL | ❌ | enum | debug | debug, info, warn, error |
| VITE_SOURCEMAP | ❌ | boolean | true | Enable in dev, disable in prod |
| VITE_SENTRY_DSN | ❌ | string (URL) | https://... | Leave empty to disable |

### Frontend Mobile Variables

| Variable | Required | Type | Example | Notes |
|----------|----------|------|---------|-------|
| EXPO_PUBLIC_API_URL | ✅ | string (URL) | http://<YOUR_MACHINE_IP>:3000 | Use your machine IP for local dev |
| EXPO_PUBLIC_API_TIMEOUT | ❌ | number | 30000 | Request timeout in ms |
| EXPO_PUBLIC_AUTH0_DOMAIN | ✅ | string | badge.auth0.com | From Auth0 dashboard |
| EXPO_PUBLIC_AUTH0_CLIENT_ID | ✅ | string | xxx | Public Client ID |
| EXPO_PUBLIC_AUTH0_AUDIENCE | ✅ | string (URL) | https://api.badge.dataxiom.it | Must match backend |
| EXPO_PUBLIC_APP_NAME | ❌ | string | Badge System | Display name |
| EXPO_PUBLIC_APP_VERSION | ❌ | string | 1.0.0 | For analytics |
| EXPO_PUBLIC_LOG_LEVEL | ❌ | enum | debug | debug, info, warn, error |
| EXPO_PUBLIC_ENABLE_FACE_ID | ❌ | boolean | true | Enable biometric? |
| EXPO_PUBLIC_ENABLE_OFFLINE_CACHE | ❌ | boolean | false | Phase 2 feature |
| EXPO_PUBLIC_SENTRY_DSN | ❌ | string (URL) | https://... | Leave empty to disable |
| EXPO_PUBLIC_DEBUG | ❌ | boolean | true | Show dev menu? |

---

## Security Checklist

Before deploying to **any** environment, verify:

### Development

- [ ] `.env` file is in `.gitignore` (no accidental commits)
- [ ] Can start backend: `npm start` → ✅ "Server listening"
- [ ] Can login without Auth0: `DISABLE_AUTH=true`

### Staging

- [ ] `.env` added to .gitignore (verified in git)
- [ ] Auth0 credentials from **staging** tenant (not production)
- [ ] DATABASE_URL points to **staging** RDS (not production)
- [ ] SENTRY_DSN configured for error tracking
- [ ] JWT_SECRET is >= 32 characters
- [ ] CORS_ORIGIN includes staging frontend URL
- [ ] No sensitive data in logs
- [ ] Test: Full check-in flow works end-to-end
- [ ] Test: Auth0 login works (Face ID on device)
- [ ] Test: CSV export works

### Production

- [ ] .env **NOT** in git repo (critical!)
- [ ] Auth0 credentials from **production** tenant
- [ ] DATABASE_URL points to **production** RDS (db.t3.small, Multi-AZ)
- [ ] NODE_ENV=production (enables optimizations)
- [ ] DISABLE_AUTH=false (no test mode)
- [ ] MOCK_AUTH0=false (real Auth0)
- [ ] SENTRY_DSN configured for error tracking
- [ ] SENTRY_ENVIRONMENT=production
- [ ] JWT_SECRET >= 32 chars, rotated before this deploy
- [ ] JWT_REFRESH_SECRET different from JWT_SECRET
- [ ] CORS_ORIGIN only contains production URLs (https://)
- [ ] CORS_CREDENTIALS=true (allow secure requests)
- [ ] LOG_LEVEL=warn (reduce log volume)
- [ ] VITE_SOURCEMAP=false (no debug symbols shipped)
- [ ] Rate limiting configured (RATE_LIMIT_MAX_REQUESTS)
- [ ] SSL certificate valid (no warnings)
- [ ] Secrets stored in AWS Secrets Manager (not in .env)
- [ ] IAM roles allow EC2 → RDS access (no hardcoded credentials)
- [ ] Backup strategy tested (RDS automated backups + restore)
- [ ] Test: Full check-in flow works end-to-end
- [ ] Test: Error tracking works (check Sentry dashboard)

---

## Troubleshooting

### "ENOMSG: no message of this type" Error

**Cause:** Missing required environment variable

**Solution:** Check which variable is missing in logs, add it to `.env`

```bash
# Backend startup shows:
❌ Configuration validation failed:
   DATABASE_URL: must be a valid URL starting with 'postgresql://'
   AUTH0_DOMAIN: is required

# Add missing variables to .env, then restart
```

---

### "Invalid DATABASE_URL format"

**Cause:** Wrong connection string format

**Solution:** Ensure URL starts with `postgresql://`:

```bash
# ❌ WRONG
DATABASE_URL=postgres://user:pass@host/db

# ✅ CORRECT
DATABASE_URL=postgresql://user:pass@host:5432/db

# ✅ ALSO CORRECT (with special characters)
DATABASE_URL=postgresql://user:p%40ssword@host:5432/db
```

---

### "JWT_SECRET too short" or "Must be at least 32 characters"

**Cause:** JWT secret is less than 32 characters

**Solution:** Generate a new secret:

```bash
# Generate strong random secret
openssl rand -base64 32

# Copy output to JWT_SECRET in .env
JWT_SECRET=abc123xyz...
```

---

### "Auth0 connection refused" or "Invalid credentials"

**Cause:** Auth0 domain or credentials are wrong

**Solution:** Verify Auth0 dashboard:

```bash
# Check Auth0 dashboard:
# Settings → Domain → Copy full domain
# Applications → Your App → Client ID, Client Secret

# Example correct values:
AUTH0_DOMAIN=badge.auth0.com
AUTH0_CLIENT_ID=abc123xyz
AUTH0_CLIENT_SECRET=def456uvw
```

---

### "Can't connect to PostgreSQL on localhost:5432"

**Cause:** Database not running or wrong hostname

**Solution:**

```bash
# Check if Docker Compose is running
docker ps | grep postgres

# If not running, start it
cd infrastructure
docker-compose up -d postgres

# Check connection
psql postgresql://badge_user:badge_pass@localhost:5432/badge_dev
```

---

### "Frontend can't connect to API (CORS error)"

**Cause:** API URL is wrong or CORS_ORIGIN doesn't include frontend

**Solution:**

```bash
# Check frontend .env has correct API_URL
# Local: VITE_API_URL=http://localhost:3000
# Production: VITE_API_URL=https://api.badge.dataxiom.it

# Check backend CORS_ORIGIN includes frontend
# Local: CORS_ORIGIN=http://localhost:5173,http://localhost:3000
# Production: CORS_ORIGIN=https://dashboard.badge.dataxiom.it
```

---

### "Mobile app can't reach API (localhost doesn't work)"

**Cause:** Mobile device can't access `localhost` (it's the device itself, not the computer)

**Solution:** Use machine IP address:

```bash
# Find your machine's IP
ifconfig | grep "inet " | grep -v 127.0.0.1

# Or for Windows
ipconfig

# Use the IP in .env (⚠️ IMPORTANT: Replace <YOUR_MACHINE_IP> with actual IP from above)
EXPO_PUBLIC_API_URL=http://<YOUR_MACHINE_IP>:3000
```

---

## Multi-Tenant Architecture

### What is app.current_client_id?

The Badge System supports multiple customers (tenants) on the same database. Each customer's data is isolated using:

1. **client_id column** on all tables (employees, check_ins, sites, audit_log)
2. **Row-Level Security (RLS)** enforced by PostgreSQL
3. **app.current_client_id setting** set per request

### How It Works

```
1. Manager logs in with Auth0
   ↓
2. Backend extracts client_id from JWT claims
   ↓
3. Backend sets PostgreSQL setting: SET app.current_client_id = '12345'
   ↓
4. All queries automatically filtered by RLS policies
   ↓
5. Manager can ONLY see their own customer's data (client_id = '12345')
```

### For Developers

**You don't need to set app.current_client_id in .env.** It's set automatically per request by the middleware:

```typescript
// backend/src/middleware/tenant.ts (example)
import { verifyAuth } from './auth';

export function tenantMiddleware(req, res, next) {
  const decoded = verifyAuth(req.headers.authorization);
  const clientId = decoded.client_id;  // From JWT
  
  // Set PostgreSQL session variable
  await db.query(`SET app.current_client_id = $1`, [clientId]);
  
  next();
}
```

So: No env var needed. Multi-tenancy is handled at the database level.

---

## Summary

✅ **Development:** Copy `.env.example` → `.env`, edit DATABASE_URL and optionally Auth0 variables  
✅ **Staging:** Use staging RDS endpoint and Auth0 test tenant  
✅ **Production:** Use AWS Secrets Manager, Auth0 production tenant, strong secrets  

Any questions? Check logs first, then troubleshooting section above.

---

**Last Updated:** May 28, 2026  
**For Issues:** Check backend logs with `LOG_LEVEL=debug`
