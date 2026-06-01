# Badge System — Database Schema

**Database:** PostgreSQL 14+  
**Strategy:** Shared-schema multi-tenant with Row-Level Security (RLS)  
**Last Updated:** 28 Maggio 2026  
**Status:** Production Ready ✅

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Entity Relationship Diagram](#entity-relationship-diagram)
3. [Core Tables](#core-tables)
4. [Indexes Strategy](#indexes-strategy)
5. [Row-Level Security (RLS)](#row-level-security-rls)
6. [Soft Delete Strategy](#soft-delete-strategy)
7. [Audit Logging](#audit-logging)
8. [Database Initialization](#database-initialization)
9. [Migrations](#migrations)

---

## 🏗️ Architecture Overview

### Multi-Tenant Strategy: Shared-Schema

```
Single PostgreSQL Database
│
├── public schema (meta data)
│   ├── clients (organizations)
│   ├── sites (locations per client)
│   └── employees (staff)
│
├── Shared Tables with tenant_id (data isolation)
│   ├── check_ins (all check-ins, filtered by tenant_id)
│   └── audit_log (all changes, filtered by tenant_id)
│
└── Security: Row-Level Security (RLS) + application filters
```

### Why Shared-Schema?
- ✅ Simpler for MVP (single database)
- ✅ Easier scaling (add tenants without new DB)
- ✅ RLS enforces isolation at DB level
- ✅ Cost-effective (no DB overhead per tenant)
- ⚠️ Requires discipline (tenant_id on every table)

---

## 📊 Entity Relationship Diagram

```
┌─────────────────┐
│    clients      │
├─────────────────┤
│ id (PK)         │
│ name            │
│ email           │
│ plan            │
│ timezone        │
│ created_at      │
│ deleted_at      │  ← Soft Delete
└────────┬────────┘
         │ (1..N)
         │
┌────────▼────────┐      ┌──────────────┐
│     sites       │      │  employees   │
├─────────────────┤      ├──────────────┤
│ id (PK)         │      │ id (PK)      │
│ client_id (FK)  │◄─────┤ client_id    │
│ name            │      │ email        │
│ location        │      │ name         │
│ qr_code_content │      │ phone        │
│ created_at      │      │ created_at   │
│ deleted_at      │      │ deleted_at   │
└────────┬────────┘      └──────────────┘
         │ (1..N)              │ (1..N)
         │                     │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │   check_ins         │
         ├─────────────────────┤
         │ id (PK)             │
         │ client_id (FK)      │ ← Tenant isolation
         │ employee_id (FK)    │
         │ site_id (FK)        │
         │ timestamp           │
         │ type (IN/OUT)       │
         │ created_at          │
         │ created_by          │
         │ corrected_at        │
         │ corrected_by        │
         │ reason              │
         │ deleted_at          │ ← Soft Delete
         └─────────────────────┘
                    │
         ┌──────────▼──────────┐
         │   audit_log         │
         ├─────────────────────┤
         │ id (PK)             │
         │ client_id (FK)      │
         │ action (CRUD)       │
         │ entity_type         │
         │ entity_id           │
         │ changes (JSONB)     │
         │ user_id             │
         │ timestamp           │
         └─────────────────────┘
```

---

## 💾 Core Tables

### 1. **clients** — Multi-tenant organizations

```sql
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Organization info
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'basic', -- basic, pro, enterprise
  timezone VARCHAR(50) NOT NULL DEFAULT 'Europe/Rome',
  
  -- Audit fields
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete
  
  -- Constraints
  CONSTRAINT valid_plan CHECK (plan IN ('basic', 'pro', 'enterprise')),
  CONSTRAINT valid_email CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

CREATE INDEX idx_clients_email ON clients(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_plan ON clients(plan) WHERE deleted_at IS NULL;
```

**Purpose:** One row per retail organization using Badge System  
**Key Fields:**
- `plan` — Billing tier (affects features, API rate limits)
- `timezone` — For local time reporting
- `deleted_at` — Soft delete (GDPR "right to be forgotten")

---

### 2. **sites** — Physical locations

```sql
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tenant isolation
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Location info
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,  -- "Milano Central", "Roma Est"
  address TEXT,                     -- Full address
  qr_code_content TEXT NOT NULL UNIQUE,  -- QR content (e.g., https://api.../site/{id})
  
  -- Audit fields
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete
  
  -- Constraints
  CONSTRAINT name_not_empty CHECK (name <> ''),
  CONSTRAINT location_not_empty CHECK (location <> '')
);

CREATE INDEX idx_sites_client ON sites(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_qr_code ON sites(qr_code_content) WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_created ON sites(client_id, created_at) WHERE deleted_at IS NULL;
```

**Purpose:** Physical locations (stores) per client  
**Key Fields:**
- `qr_code_content` — Unique QR URL (scanned by mobile app)
- `client_id` — Tenant identifier (on every table for safety)

---

### 3. **employees** — Staff members

```sql
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tenant isolation
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Employee info
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  
  -- Assigned sites (many-to-many via junction table)
  assigned_site_ids UUID[] DEFAULT ARRAY[]::UUID[],
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit fields
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- Soft delete
  
  -- Constraints
  CONSTRAINT valid_email CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  CONSTRAINT name_not_empty CHECK (name <> '')
);

CREATE INDEX idx_employees_client_email ON employees(client_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_client_active ON employees(client_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_created ON employees(client_id, created_at) WHERE deleted_at IS NULL;

-- Unique constraint: one email per client
CREATE UNIQUE INDEX idx_employees_unique_email 
  ON employees(client_id, email) 
  WHERE deleted_at IS NULL;
```

**Purpose:** Employees/staff members  
**Key Fields:**
- `assigned_site_ids` — Array of site UUIDs (efficient for small lists)
- `is_active` — Soft deactivation without delete
- `deleted_at` — Hard soft delete when employee leaves

---

### 4. **check_ins** — Time tracking events (Core table)

```sql
CREATE TABLE check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tenant isolation (CRITICAL)
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Foreign keys
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  
  -- Event data
  timestamp TIMESTAMP NOT NULL,  -- When employee checked in (ISO 8601 UTC)
  type VARCHAR(3) NOT NULL,      -- 'IN' or 'OUT'
  
  -- Audit trail
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NOT NULL,      -- Employee or manager who created/approved
  
  -- Correction tracking
  corrected_at TIMESTAMP,        -- When was this corrected?
  corrected_by UUID,             -- Who corrected it?
  reason TEXT,                   -- Why was it corrected?
  
  -- Soft delete
  deleted_at TIMESTAMP,
  
  -- Status
  status VARCHAR(20) DEFAULT 'confirmed',  -- 'confirmed' or 'corrected'
  
  -- Constraints
  CONSTRAINT valid_type CHECK (type IN ('IN', 'OUT')),
  CONSTRAINT valid_status CHECK (status IN ('confirmed', 'corrected')),
  CONSTRAINT timestamp_in_past CHECK (timestamp <= CURRENT_TIMESTAMP + INTERVAL '1 minute'),
  CONSTRAINT valid_correction_window CHECK (
    -- Employee: can correct within 2 hours
    -- Manager: can correct within 48 hours
    -- Admin: no limit (handled in application)
    corrected_at IS NULL OR corrected_at <= CURRENT_TIMESTAMP
  )
);

-- PRIMARY INDEXING STRATEGY
-- ─────────────────────────────────────

-- 1. Tenant + timestamp (most common query: presences for date range)
CREATE INDEX idx_checkins_client_timestamp 
  ON check_ins(client_id, timestamp DESC) 
  WHERE deleted_at IS NULL;

-- 2. Employee + timestamp (employee check-ins)
CREATE INDEX idx_checkins_employee_timestamp 
  ON check_ins(employee_id, timestamp DESC) 
  WHERE deleted_at IS NULL;

-- 3. Site + timestamp (site presences)
CREATE INDEX idx_checkins_site_timestamp 
  ON check_ins(site_id, timestamp DESC) 
  WHERE deleted_at IS NULL;

-- 4. Covering index: includes type for index-only scans
CREATE INDEX idx_checkins_covering 
  ON check_ins(client_id, timestamp DESC, type) 
  WHERE deleted_at IS NULL;

-- 5. BRIN index for time series (efficient for sorted data)
CREATE INDEX idx_checkins_brin_timestamp 
  ON check_ins USING BRIN (timestamp) 
  WHERE deleted_at IS NULL;

-- 6. Duplicate detection (within 60 seconds)
CREATE INDEX idx_checkins_duplicate_detection 
  ON check_ins(client_id, employee_id, site_id, timestamp DESC) 
  WHERE deleted_at IS NULL;

-- 7. Correction queries (find correctable check-ins)
CREATE INDEX idx_checkins_correction_window 
  ON check_ins(employee_id, created_at DESC) 
  WHERE deleted_at IS NULL AND corrected_at IS NULL;
```

**Purpose:** Core business data (all check-in events)  
**Performance Tuning:**
- Multiple indexes for different query patterns
- `timestamp DESC` (latest first, common query pattern)
- Covering indexes for index-only scans
- BRIN for time-series efficiency
- Partial indexes (WHERE deleted_at IS NULL) to exclude soft-deleted rows

**Key Fields:**
- `client_id` — **ALWAYS filter by this** (multi-tenant safety)
- `timestamp` — ISO 8601 UTC (server time, not client time)
- `created_by`, `corrected_by` — Audit trail of who made changes
- `reason` — Why was it corrected?
- `status` — Track corrections for reporting

---

### 5. **audit_log** — Complete change history

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tenant isolation
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- What changed?
  action VARCHAR(10) NOT NULL,   -- 'CREATE', 'UPDATE', 'DELETE', 'CORRECT'
  entity_type VARCHAR(50) NOT NULL,  -- 'checkin', 'employee', 'site'
  entity_id UUID NOT NULL,       -- Which record changed?
  
  -- The changes (flexible JSONB)
  -- Example: {"timestamp": {"old": "2026-05-28T09:15:00Z", "new": "2026-05-28T09:20:00Z"}}
  changes JSONB NOT NULL DEFAULT '{}',
  
  -- Who and when
  user_id UUID NOT NULL,         -- Who made the change?
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,               -- Optional: for security auditing
  
  -- Constraints
  CONSTRAINT valid_action CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'CORRECT')),
  CONSTRAINT valid_entity CHECK (entity_type IN ('checkin', 'employee', 'site', 'client'))
);

-- AUDIT INDEXES
-- ─────────────────────────────────────

-- 1. Find changes for a specific tenant
CREATE INDEX idx_audit_client_timestamp 
  ON audit_log(client_id, timestamp DESC);

-- 2. Find changes for a specific entity
CREATE INDEX idx_audit_entity 
  ON audit_log(entity_type, entity_id, timestamp DESC);

-- 3. Find changes by user (who changed what?)
CREATE INDEX idx_audit_user 
  ON audit_log(user_id, timestamp DESC);

-- 4. Find corrections (compliance)
CREATE INDEX idx_audit_corrections 
  ON audit_log(client_id, action) 
  WHERE action = 'CORRECT';
```

**Purpose:** Immutable audit trail (GDPR compliance, debugging)  
**Key Fields:**
- `changes` — JSONB to store flexible before/after values
- `action` — CREATE, UPDATE, DELETE, or CORRECT (special for check-in corrections)
- `timestamp` — When the change was made (for timeline audits)

---

## 🔍 Indexes Strategy

### Index Summary

| Purpose | Index Name | Columns | Type | Use Case |
|---------|-----------|---------|------|----------|
| **Presence Queries** | idx_checkins_client_timestamp | (client_id, timestamp DESC) | B-tree | Dashboard: "Show me all check-ins for 2026-05-28" |
| **Employee History** | idx_checkins_employee_timestamp | (employee_id, timestamp DESC) | B-tree | App: "Show my last 10 check-ins" |
| **Site Presences** | idx_checkins_site_timestamp | (site_id, timestamp DESC) | B-tree | Manager: "Who's checked in at Milano store?" |
| **Covering Index** | idx_checkins_covering | (client_id, timestamp, type) | B-tree | Index-only scans (faster) |
| **Time-Series** | idx_checkins_brin_timestamp | (timestamp) | BRIN | Efficient for large time-series tables |
| **Duplicate Detection** | idx_checkins_duplicate_detection | (client_id, employee_id, site_id, timestamp DESC) | B-tree | "Check if duplicate within 60s" |
| **Correction Window** | idx_checkins_correction_window | (employee_id, created_at DESC) | B-tree | "Find correctable check-ins" |

### Indexing Best Practices Applied

✅ **Multi-column indexes** — (client_id, timestamp) covers both filtering + sorting  
✅ **DESC for latest-first queries** — timestamp DESC matches dashboard sort order  
✅ **Covering indexes** — Include columns needed to avoid table lookups  
✅ **Partial indexes** — WHERE deleted_at IS NULL (exclude soft-deleted)  
✅ **BRIN for time-series** — Efficient for timestamp (sequential data)  
✅ **Avoid over-indexing** — 7 indexes on check_ins (common query patterns only)

---

## 🔐 Row-Level Security (RLS)

### RLS Policies

```sql
-- Enable RLS
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Employee can only see own check-ins
CREATE POLICY employee_checkins ON check_ins
  FOR SELECT
  USING (
    employee_id = (SELECT id FROM employees WHERE email = current_setting('app.current_user_email'))
    AND client_id = current_setting('app.current_client_id')::UUID
  );

-- Policy: Manager can see site check-ins
CREATE POLICY manager_checkins ON check_ins
  FOR SELECT
  USING (
    site_id IN (SELECT id FROM sites WHERE client_id = current_setting('app.current_client_id')::UUID)
    AND client_id = current_setting('app.current_client_id')::UUID
  );

-- Policy: Employee can only update own check-ins (within 2 hours)
CREATE POLICY employee_correct_own ON check_ins
  FOR UPDATE
  USING (
    employee_id = (SELECT id FROM employees WHERE email = current_setting('app.current_user_email'))
    AND created_at > CURRENT_TIMESTAMP - INTERVAL '2 hours'
  );
```

### How RLS Works

1. **Application sets session variable before query:**
   ```sql
   SET app.current_client_id = '12345-client-uuid';
   SET app.current_user_email = 'mario@retail.it';
   ```

2. **PostgreSQL automatically appends policy condition:**
   ```sql
   -- User query:
   SELECT * FROM check_ins;
   
   -- Becomes (with RLS):
   SELECT * FROM check_ins 
   WHERE client_id = '12345-client-uuid'
   AND employee_id = (SELECT id FROM employees WHERE email = 'mario@retail.it');
   ```

3. **Result: Database-level isolation** (safer than application-level filters)

---

## 🗑️ Soft Delete Strategy

### Soft Delete Implementation

```sql
-- Soft delete (mark as deleted, don't remove)
UPDATE check_ins SET deleted_at = CURRENT_TIMESTAMP
WHERE id = 'xyz';

-- Hard delete (permanent removal, only for old data)
DELETE FROM check_ins 
WHERE deleted_at < CURRENT_TIMESTAMP - INTERVAL '3 years';

-- Always filter in queries
SELECT * FROM check_ins WHERE deleted_at IS NULL;

-- Indexes exclude soft-deleted
CREATE INDEX idx_active ON check_ins(...) WHERE deleted_at IS NULL;
```

### Soft Delete Rules

✅ **Do use soft delete for:**
- Employees (GDPR "right to forget" after 12 months)
- Check-ins (reversible corrections, audit trail)
- Sites (deactivation without losing history)

✅ **Hard delete only for:**
- Audit logs older than 7 years (legal hold requirement)
- Test data

---

## 📝 Audit Logging

### Trigger-Based Audit

```sql
-- Trigger on check_ins updates
CREATE OR REPLACE FUNCTION audit_check_ins()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (client_id, action, entity_type, entity_id, changes, user_id)
    VALUES (
      NEW.client_id,
      'CORRECT',
      'checkin',
      NEW.id,
      jsonb_build_object(
        'timestamp', jsonb_build_object('old', OLD.timestamp, 'new', NEW.timestamp),
        'reason', NEW.reason
      ),
      NEW.corrected_by
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (client_id, action, entity_type, entity_id, changes, user_id)
    VALUES (NEW.client_id, 'DELETE', 'checkin', NEW.id, '{}', current_user);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_audit_check_ins
  AFTER UPDATE OR DELETE ON check_ins
  FOR EACH ROW
  EXECUTE FUNCTION audit_check_ins();
```

### Audit Trail Example

```json
{
  "id": "audit_123",
  "client_id": "client_xyz",
  "action": "CORRECT",
  "entity_type": "checkin",
  "entity_id": "checkin_abc",
  "changes": {
    "timestamp": {
      "old": "2026-05-28T09:15:00Z",
      "new": "2026-05-28T09:20:00Z"
    },
    "reason": "System glitch, scanned late"
  },
  "user_id": "emp_001",
  "timestamp": "2026-05-28T09:35:00Z"
}
```

---

## 🚀 Database Initialization

### 1. Create Database

```bash
createdb badge_db
```

### 2. Enable Extensions

```sql
-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- JSONB (already in PostgreSQL)
-- Full-text search (for future)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

### 3. Run Schema SQL

```bash
psql badge_db < schema.sql
```

### 4. Verify Setup

```sql
-- Check tables
\dt

-- Check indexes
\di

-- Check RLS policies
SELECT * FROM pg_policies;
```

---

## 📦 Migrations

### Migration Strategy

Use **Flyway** or **Liquibase** for schema versioning:

```
migrations/
├── V001__initial_schema.sql      (clients, sites, employees, check_ins, audit_log)
├── V002__add_indexes.sql         (all indexes)
├── V003__enable_rls.sql          (RLS policies)
├── V004__audit_triggers.sql      (audit logging)
└── V005__data_cleanup.sql        (backfill/migrate data)
```

### Example Migration

```sql
-- V001__initial_schema.sql

-- Clients table
CREATE TABLE clients (...);

-- Sites table
CREATE TABLE sites (...);

-- Employees table
CREATE TABLE employees (...);

-- Check-ins table
CREATE TABLE check_ins (...);

-- Audit log table
CREATE TABLE audit_log (...);

-- Add constraints and indexes
ALTER TABLE sites ADD CONSTRAINT fk_client FOREIGN KEY (client_id) REFERENCES clients(id);
...
```

### Running Migrations

```bash
# Using Flyway
flyway -url=jdbc:postgresql://localhost/badge_db -user=badge_user -password=*** migrate

# Or manually
psql badge_db -f migrations/V001__initial_schema.sql
psql badge_db -f migrations/V002__add_indexes.sql
```

---

## 📊 Capacity Planning

### Storage Estimation (MVP: 1 client, 25 employees, 1 year)

```
Check-ins per day: 25 × 2 (IN/OUT) = 50
Check-ins per year: 50 × 250 (business days) = 12,500
Per check-in: ~400 bytes

check_ins table: 12,500 × 400B = 5 MB
audit_log table: 12,500 × 500B = 6 MB
Other tables: ~1 MB

TOTAL: ~12 MB (very small!)
```

### Scaling to 5+ Clients

```
Check-ins per year: 12,500 × 5 = 62,500
Total storage: ~60 MB
Indexes: ~30 MB
Total: ~100 MB (still very small!)

→ Single PostgreSQL instance handles easily
```

---

## 🔗 Related Documentation

- **API Spec:** See `docs/API.md` for endpoint-to-table mapping
- **Deployment:** See `docs/DEPLOYMENT.md` for backup strategy
- **Security:** See `docs/SECURITY.md` for GDPR compliance

---

## Sources

- [Crunchy Data — Multi-Tenant PostgreSQL Design](https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy)
- [Medium — Audit Log Patterns](https://medium.com/@sehban.alam/lets-build-production-ready-audit-logs-in-postgresql-7125481713d8)
- [OneUptime — Soft Deletes in PostgreSQL](https://oneuptime.com/blog/post/2026-01-21-postgresql-soft-deletes/view)
- [Mydbops — PostgreSQL Indexing Best Practices](https://www.mydbops.com/blog/postgresql-indexing-best-practices-guide)
- [FreeCodeCamp — Advanced Indexing Strategies](https://www.freecodecamp.org/news/postgresql-indexing-strategies/)

---

**Last Updated:** 28 Maggio 2026  
**Status:** Ready for Implementation ✅
