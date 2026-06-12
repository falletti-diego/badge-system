# S.32.5 — Migration Runner: Fix Duplicate 011, Add Tracking Table, Automate Runner

**Data:** 2026-06-12  
**Status:** Design approvato  
**Priorità:** 🟡 MEDIA — Manual SSH migrations error-prone, duplicate numbering blocks deployments  
**Origine:** Analisi critica Session 32 (piano d'azione S.32 in TASKS.md)

---

## Problema

### Problema 1: Duplicate Migration Numbering

In `backend/migrations/`, there are two migrations numbered `011_*`:
- `011_add_dpa_acknowledgements.sql` — Creates DPA tracking table (Compliance)
- `011_add_geofencing_feature_flag.sql` — Adds geofencing feature flag to clients table

**Risk:** When applying migrations in order, only one of them (filesystem order) gets applied. The other is skipped silently.

### Problema 2: No Migration Tracking

There is no `schema_migrations` table or equivalent. Migrations are applied **manually via SSH**:
```bash
ssh ubuntu@EC2_IP "psql -U postgres -d badge_system < migration.sql"
```

**Risk:** 
- No idempotency — running same migration twice may cause duplicate inserts or schema errors
- No audit trail — can't tell which migrations have been applied
- Previous incident (Session 12, migration 004) was caused by manual application failures

### Problema 3: No Automated Runner

Deployments don't run migrations automatically. They must be run manually after ECR push + SSH.

**Risk:** Migrations get forgotten, schema diverges between environments.

---

## Contesto

**Ambienti:**
- **Dev:** SQLite in-memory (not applicable)
- **Staging:** RDS PostgreSQL (real instance, needs tracking)
- **Prod:** RDS PostgreSQL (critical — zero tolerance for schema inconsistency)

**Migrazioni attuali:**
- Ubicazione: `backend/migrations/` (11 files, 001-012)
- Formato: Plain SQL (no version markers like Flyway/Liquibase)
- Applicazione: Manual SSH + psql

---

## Soluzione

### 1. Create `schema_migrations` Table

In new migration file `013_create_schema_migrations.sql`:

```sql
-- Migration 013: Create schema_migrations tracking table
-- Purpose: Track which migrations have been applied (idempotency)
-- Date: 2026-06-12

CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  execution_time_ms INT,
  checksum VARCHAR(64) -- SHA256 of migration content (optional, for integrity)
);

CREATE INDEX idx_schema_migrations_filename ON schema_migrations(filename);
```

**Behavior:**
- `filename`: exact filename from disk (e.g., `001_create_shifts_table.sql`)
- `applied_at`: timestamp when migration was applied
- `execution_time_ms`: how long migration took (debugging)
- `checksum`: optional SHA256 of migration content (catch accidental edits)

### 2. Rename Duplicate Migration

Rename `011_add_geofencing_feature_flag.sql` → `013_add_geofencing_feature_flag.sql`

Update the comment inside to reflect new number:
```sql
-- Migration 013: Add client-level geofencing feature flag
```

**Result:**
- `011_add_dpa_acknowledgements.sql` remains (first to be applied)
- `013_add_geofencing_feature_flag.sql` (new number, no conflict)
- Migration 012 (`012_add_consent_tracking.sql`) becomes 012

### 3. Create Migration Runner Script

File: `backend/scripts/run-migrations.js`

**Behavior:**
- Reads all `.sql` files from `backend/migrations/` directory (sorted alphabetically/numerically)
- Checks `schema_migrations` table to see which have been applied
- For each unapplied migration:
  - Wrap in transaction (BEGIN/ROLLBACK on error)
  - Execute migration SQL
  - Insert row into `schema_migrations` on success
  - Log execution time

**Idempotency:** If migration is already in `schema_migrations`, skip it. Safe to run repeatedly.

**Exit codes:**
- 0: Success (all migrations applied or already up-to-date)
- 1: Error (migration failed, transaction rolled back)
- 2: Missing schema_migrations table (special case)

### 4. Integrate into Deployment

Add to `backend/entrypoint.sh` (Docker entry point):

```bash
# Apply database migrations (idempotent)
node scripts/run-migrations.js || exit 1
```

This runs **before** Express server starts, ensuring schema is always current.

---

## Scope & Timeline

**Effort:** 2-3h
- Create schema_migrations table: 15 min
- Rename duplicate migration: 10 min
- Write migration runner script: 60-90 min
- Integration + testing: 30 min

**Breakability:** Very low — migrations are appended, never updated in place. If runner fails, transaction rolls back.

---

## Testing Strategy

### Test 1: Manual First Run

```bash
# Docker doesn't exist yet, so run locally against staging RDS
psql -h staging-rds.aws.com -U postgres -d badge_system \
  < backend/migrations/013_create_schema_migrations.sql

# Then run migration runner
cd backend
node scripts/run-migrations.js

# Verify table populated
psql -h staging-rds.aws.com -U postgres -d badge_system \
  -c "SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at;"
```

Expected: `schema_migrations` populated with all 11 migrationfiles.

### Test 2: Idempotency

```bash
# Run migration runner again
node scripts/run-migrations.js

# Verify no new rows added to schema_migrations
psql -h staging-rds.aws.com -U postgres -d badge_system \
  -c "SELECT COUNT(*) FROM schema_migrations;"
```

Expected: Same count as before (no duplicates).

### Test 3: New Migration

```bash
# Create new migration
echo "ALTER TABLE ... " > backend/migrations/014_example.sql

# Run runner
node scripts/run-migrations.js

# Verify new migration applied
psql -h staging-rds.aws.com -U postgres -d badge_system \
  -c "SELECT * FROM schema_migrations WHERE filename = '014_example.sql';"
```

Expected: New row with timestamp.

### Test 4: Failed Migration Rollback

```bash
# Create broken migration
echo "SELECT * FROM nonexistent_table;" > backend/migrations/015_broken.sql

# Run runner
node scripts/run-migrations.js

# Verify table not created (transaction rolled back)
psql -h staging-rds.aws.com -U postgres -d badge_system \
  -c "SELECT * FROM schema_migrations WHERE filename = '015_broken.sql';"
```

Expected: No row (migration rolled back, error logged).

---

## Deploy & Verification

**Pre-Deployment Checklist:**
1. Rename migration file in git (001 migration commit)
2. Create schema_migrations table (002 migration commit)
3. Create migration runner script + entrypoint.sh integration (003 script commit)
4. Test against staging RDS (4 manual tests above)
5. Deploy to production

**Monitoring:**
```bash
# After deployment, check migrations table
curl https://api.dataxiom.it/health
psql (via bastion) -c "SELECT * FROM schema_migrations ORDER BY applied_at;"
```

---

## Fuori Scope

- Rollback mechanism (Phase 2 — complex, requires manual review)
- Version markers (Flyway/Liquibase style) — not needed for MVP
- Schema validation (checksums optional for MVP)

---

## Impatto in Produzione

**Before:** Manual SSH, error-prone, schema may diverge  
**After:** Automatic on startup, idempotent, audit trail in schema_migrations table

**Zero downtime:** Migrations are structural only, no data deletion.

---

## Future Considerations

- Add checksum validation (detect accidental migration edits)
- Add rollback script (analyze forward vs. backward migrations)
- Monitor execution_time_ms for slow migrations (query optimization hint)
- Schema versioning in API response (e.g., `GET /health` returns current schema version)
