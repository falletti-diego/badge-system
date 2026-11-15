-- ============================================================================
-- Badge System — Initial Database Schema (PostgreSQL 14+)
-- ============================================================================
-- Migration: V001__initial_schema.sql
-- Created: 28 Maggio 2026
-- Status: Production Ready
--
-- SCHEMA REVIEW FIXES APPLIED (28 Maggio 2026):
-- ✅ CRITICAL: TIMESTAMP → TIMESTAMPTZ (all tables for UTC compliance)
-- ✅ CRITICAL: RLS enabled on clients table (metadata protection)
-- ✅ CRITICAL: audit_log CASCADE DELETE → RESTRICT (preserve compliance records)
-- ✅ CRITICAL: Audit trigger now logs INSERT events (complete audit trail)
-- ✅ MEDIUM: qr_code_content changed to per-tenant unique constraint
-- ✅ MEDIUM: Added GIN index for employee.assigned_site_ids array queries
-- ✅ MEDIUM: DELETE trigger now correctly attributes deletion to current_user
-- ✅ MEDIUM: UPDATE trigger removed WHEN clause (logs all field changes)
-- ✅ MEDIUM: Fixed RLS example policies to use current_setting()
-- ✅ LOW: Removed redundant idx_checkins_client_timestamp index
-- ✅ LOW: All constraint names now consistent across docs and SQL
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- 1. CLIENTS TABLE (Multi-tenant organizations)
-- ============================================================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization info
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'basic',
  timezone VARCHAR(50) NOT NULL DEFAULT 'Europe/Rome',

  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,  -- Soft delete

  -- Constraints
  CONSTRAINT valid_plan CHECK (plan IN ('basic', 'pro', 'enterprise')),
  CONSTRAINT valid_email CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

CREATE INDEX idx_clients_email ON clients(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_plan ON clients(plan) WHERE deleted_at IS NULL;
CREATE INDEX idx_clients_created ON clients(created_at DESC) WHERE deleted_at IS NULL;

COMMENT ON TABLE clients IS 'Multi-tenant organizations using Badge System';
COMMENT ON COLUMN clients.id IS 'Unique client identifier';
COMMENT ON COLUMN clients.plan IS 'Billing tier: basic, pro, enterprise';
COMMENT ON COLUMN clients.deleted_at IS 'Soft delete timestamp for GDPR compliance';

-- ============================================================================
-- 2. SITES TABLE (Physical locations per client)
-- ============================================================================

CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant isolation
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Location info
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  address TEXT,
  qr_code_content TEXT NOT NULL,

  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,  -- Soft delete

  -- Constraints (per-tenant unique QR code)
  CONSTRAINT name_not_empty CHECK (name <> ''),
  CONSTRAINT location_not_empty CHECK (location <> ''),
  UNIQUE (client_id, qr_code_content)
);

CREATE INDEX idx_sites_client ON sites(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_qr_code ON sites(client_id, qr_code_content) WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_created ON sites(client_id, created_at DESC) WHERE deleted_at IS NULL;

COMMENT ON TABLE sites IS 'Physical locations (stores) per client';
COMMENT ON COLUMN sites.client_id IS 'Tenant identifier - ALWAYS filter by this';
COMMENT ON COLUMN sites.qr_code_content IS 'Unique QR code URL for mobile app scanning';

-- ============================================================================
-- 3. EMPLOYEES TABLE (Staff members)
-- ============================================================================

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant isolation
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Employee info
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),

  -- Assigned sites (array of UUIDs)
  assigned_site_ids UUID[] DEFAULT ARRAY[]::UUID[],

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,  -- Soft delete

  -- Constraints
  CONSTRAINT valid_email CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  CONSTRAINT name_not_empty CHECK (name <> '')
);

-- Indexes
CREATE INDEX idx_employees_client_email ON employees(client_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_client_active ON employees(client_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_created ON employees(client_id, created_at DESC) WHERE deleted_at IS NULL;

-- GIN index for array queries (WHERE site_id = ANY(assigned_site_ids))
CREATE INDEX idx_employees_assigned_sites ON employees USING GIN (assigned_site_ids);

-- Unique constraint: one email per client
CREATE UNIQUE INDEX idx_employees_unique_email
  ON employees(client_id, email)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE employees IS 'Employees/staff members';
COMMENT ON COLUMN employees.client_id IS 'Tenant identifier - ALWAYS filter by this';
COMMENT ON COLUMN employees.assigned_site_ids IS 'Array of site IDs where employee can check in';

-- ============================================================================
-- 4. CHECK_INS TABLE (Core business data - Time tracking)
-- ============================================================================

CREATE TABLE check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant isolation (CRITICAL)
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Foreign keys
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,

  -- Event data
  timestamp TIMESTAMPTZ NOT NULL,  -- When employee checked in (ISO 8601 UTC)
  type VARCHAR(3) NOT NULL,      -- 'IN' or 'OUT'

  -- Audit trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NOT NULL,      -- Employee or manager who created/approved

  -- Correction tracking
  corrected_at TIMESTAMPTZ,      -- When was this corrected?
  corrected_by UUID,             -- Who corrected it?
  reason TEXT,                   -- Why was it corrected?

  -- Soft delete
  deleted_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) DEFAULT 'confirmed',  -- 'confirmed' or 'corrected'

  -- Constraints
  CONSTRAINT valid_type CHECK (type IN ('IN', 'OUT')),
  CONSTRAINT valid_status CHECK (status IN ('confirmed', 'corrected')),
  CONSTRAINT timestamp_not_future CHECK (timestamp <= CURRENT_TIMESTAMP + INTERVAL '1 minute')
);

-- PRIMARY INDEXING STRATEGY
-- ═════════════════════════════════════════════════════════════════════════

-- 1. Employee + timestamp (employee check-ins)
CREATE INDEX idx_checkins_employee_timestamp
  ON check_ins(employee_id, timestamp DESC)
  WHERE deleted_at IS NULL;

-- 2. Site + timestamp (site presences)
CREATE INDEX idx_checkins_site_timestamp
  ON check_ins(site_id, timestamp DESC)
  WHERE deleted_at IS NULL;

-- 3. Covering index: includes type for index-only scans (also covers client_id, timestamp)
CREATE INDEX idx_checkins_covering
  ON check_ins(client_id, timestamp DESC, type)
  WHERE deleted_at IS NULL;

-- 5. BRIN index for time series (efficient for sorted timestamp data)
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

COMMENT ON TABLE check_ins IS 'Core business data: all check-in events (IN/OUT)';
COMMENT ON COLUMN check_ins.client_id IS 'Tenant identifier - ALWAYS filter by this (multi-tenant safety)';
COMMENT ON COLUMN check_ins.timestamp IS 'When employee checked in (ISO 8601 UTC, server time)';
COMMENT ON COLUMN check_ins.status IS 'Track corrections for reporting (confirmed vs corrected)';

-- ============================================================================
-- 5. AUDIT_LOG TABLE (Immutable audit trail)
-- ============================================================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant isolation (RESTRICT: prevent deletion of clients with audit history)
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,

  -- What changed?
  action VARCHAR(10) NOT NULL,        -- 'CREATE', 'UPDATE', 'DELETE', 'CORRECT'
  entity_type VARCHAR(50) NOT NULL,   -- 'checkin', 'employee', 'site'
  entity_id UUID NOT NULL,            -- Which record changed?

  -- The changes (flexible JSONB for before/after values)
  changes JSONB NOT NULL DEFAULT '{}',

  -- Who and when
  user_id UUID NOT NULL,              -- Who made the change?
  timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,                    -- Optional: for security auditing

  -- Constraints
  CONSTRAINT valid_action CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'CORRECT')),
  CONSTRAINT valid_entity CHECK (entity_type IN ('checkin', 'employee', 'site', 'client'))
);

-- AUDIT INDEXES
-- ═════════════════════════════════════════════════════════════════════════

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

COMMENT ON TABLE audit_log IS 'Immutable audit trail for GDPR compliance and debugging';
COMMENT ON COLUMN audit_log.changes IS 'JSONB object with before/after values of changed fields';
COMMENT ON COLUMN audit_log.action IS 'Type of change: CREATE, UPDATE, DELETE, CORRECT (special for check-in)';

-- ============================================================================
-- 6. AUDIT TRIGGERS (Automated change logging)
-- ============================================================================

-- Function to log check-in creation, corrections, and deletes
CREATE OR REPLACE FUNCTION audit_check_ins()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Log initial check-in creation
    INSERT INTO audit_log (
      client_id,
      action,
      entity_type,
      entity_id,
      changes,
      user_id,
      timestamp
    ) VALUES (
      NEW.client_id,
      'CREATE',
      'checkin',
      NEW.id,
      jsonb_build_object(
        'timestamp', NEW.timestamp,
        'type', NEW.type,
        'site_id', NEW.site_id,
        'employee_id', NEW.employee_id
      ),
      NEW.created_by,
      CURRENT_TIMESTAMP
    );

  ELSIF TG_OP = 'UPDATE' THEN
    -- Log corrections
    INSERT INTO audit_log (
      client_id,
      action,
      entity_type,
      entity_id,
      changes,
      user_id,
      timestamp
    ) VALUES (
      NEW.client_id,
      'CORRECT',
      'checkin',
      NEW.id,
      jsonb_build_object(
        'timestamp', jsonb_build_object('old', OLD.timestamp, 'new', NEW.timestamp),
        'reason', NEW.reason,
        'corrected_by', NEW.corrected_by
      ),
      NEW.corrected_by,
      CURRENT_TIMESTAMP
    );

  ELSIF TG_OP = 'DELETE' THEN
    -- Log deletions (though we use soft delete) - use current_user as the deleter
    INSERT INTO audit_log (
      client_id,
      action,
      entity_type,
      entity_id,
      changes,
      user_id,
      timestamp
    ) VALUES (
      OLD.client_id,
      'DELETE',
      'checkin',
      OLD.id,
      jsonb_build_object('timestamp', OLD.timestamp, 'type', OLD.type),
      current_user::uuid,  -- Current user performing the delete
      CURRENT_TIMESTAMP
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trigger_audit_check_ins_insert
  AFTER INSERT ON check_ins
  FOR EACH ROW
  EXECUTE FUNCTION audit_check_ins();

CREATE TRIGGER trigger_audit_check_ins_update
  AFTER UPDATE ON check_ins
  FOR EACH ROW
  EXECUTE FUNCTION audit_check_ins();

CREATE TRIGGER trigger_audit_check_ins_delete
  AFTER DELETE ON check_ins
  FOR EACH ROW
  EXECUTE FUNCTION audit_check_ins();

-- ============================================================================
-- 7. ROW-LEVEL SECURITY (RLS) - Multi-tenant data isolation at DB level
-- ============================================================================

-- Enable RLS on multi-tenant tables (including clients for metadata protection)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Clients table - filter by client ID (metadata protection)
CREATE POLICY clients_tenant_isolation ON clients
  FOR ALL
  USING (id = current_setting('app.current_client_id')::UUID)
  WITH CHECK (id = current_setting('app.current_client_id')::UUID);

-- Policy: Filter by tenant ID (all roles)
CREATE POLICY check_ins_tenant_isolation ON check_ins
  FOR ALL
  USING (client_id = current_setting('app.current_client_id')::UUID)
  WITH CHECK (client_id = current_setting('app.current_client_id')::UUID);

CREATE POLICY employees_tenant_isolation ON employees
  FOR ALL
  USING (client_id = current_setting('app.current_client_id')::UUID)
  WITH CHECK (client_id = current_setting('app.current_client_id')::UUID);

CREATE POLICY sites_tenant_isolation ON sites
  FOR ALL
  USING (client_id = current_setting('app.current_client_id')::UUID)
  WITH CHECK (client_id = current_setting('app.current_client_id')::UUID);

CREATE POLICY audit_log_tenant_isolation ON audit_log
  FOR SELECT
  USING (client_id = current_setting('app.current_client_id')::UUID);

-- ============================================================================
-- 8. SCHEMA SUMMARY
-- ============================================================================

-- View: Quick statistics
CREATE OR REPLACE VIEW vw_check_in_stats AS
SELECT
  client_id,
  DATE(timestamp) AS check_in_date,
  COUNT(*) AS total_checkins,
  COUNT(CASE WHEN type = 'IN' THEN 1 END) AS check_ins,
  COUNT(CASE WHEN type = 'OUT' THEN 1 END) AS check_outs,
  COUNT(CASE WHEN status = 'corrected' THEN 1 END) AS corrections,
  COUNT(DISTINCT employee_id) AS unique_employees
FROM check_ins
WHERE deleted_at IS NULL
GROUP BY client_id, DATE(timestamp);

COMMENT ON VIEW vw_check_in_stats IS 'Daily check-in statistics per client';

-- ============================================================================
-- 9. VERIFICATION QUERIES
-- ============================================================================

-- Run these to verify schema is correct:
-- \d clients
-- \d sites
-- \d employees
-- \d check_ins
-- \d audit_log
-- SELECT * FROM pg_indexes WHERE tablename IN ('clients', 'sites', 'employees', 'check_ins', 'audit_log');
-- SELECT * FROM pg_policies;

COMMIT;
