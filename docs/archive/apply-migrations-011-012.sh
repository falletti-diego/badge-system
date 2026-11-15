#!/bin/bash
# Apply migrations 011 & 012 to RDS production
# Purpose: Enable GDPR compliance for Italian market (DPA + GPS consent)
# Safety: Wrapped in transaction — rolls back on any error

set -e

# Configuration
MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# RDS connection details (set via environment variables for security)
# Example: export PGHOST=badge-system-db.xxxxx.rds.amazonaws.com
# export PGPORT=5432
# export PGDATABASE=badge_db
# export PGUSER=postgres
# export PGPASSWORD=<password>

if [ -z "$PGHOST" ] || [ -z "$PGDATABASE" ] || [ -z "$PGUSER" ]; then
  echo "❌ Error: Missing RDS connection environment variables"
  echo "Set: PGHOST, PGPORT (default 5432), PGDATABASE, PGUSER, PGPASSWORD"
  echo ""
  echo "Example:"
  echo "  export PGHOST=badge-system-db.xxxxx.rds.amazonaws.com"
  echo "  export PGDATABASE=badge_db"
  echo "  export PGUSER=postgres"
  echo "  export PGPASSWORD=<password>"
  echo "  $0"
  exit 1
fi

echo "🔷 Applying GDPR compliance migrations (011 & 012)..."
echo "Host: $PGHOST"
echo "Database: $PGDATABASE"
echo ""

# Execute migrations in a transaction
psql <<EOF
-- Start transaction (rolls back on any error)
BEGIN;

-- Migration 011: Add DPA acknowledgements table
$(cat "$MIGRATIONS_DIR/011_add_dpa_acknowledgements.sql")

-- Migration 012: Add employee consent tracking
$(cat "$MIGRATIONS_DIR/012_add_consent_tracking.sql")

-- Commit transaction
COMMIT;

-- Verify migrations applied
\echo ''
\echo '✅ Migrations applied successfully!'
\echo ''
\echo 'Verifying new tables/columns:'
\dt dpa_acknowledgements employee_consent_log
\d employees | grep gps_consent

EOF

echo ""
echo "✅ All migrations applied! Database is now GDPR Art. 28 + Art. 7 compliant."
echo ""
echo "Next steps:"
echo "  1. Build mobile app 18 with GPS consent dialog"
echo "  2. Test DPA acknowledgement flow: POST /api/admin/dpa-acknowledgement"
echo "  3. Test GPS consent flow: mobile dialog → POST /api/consent/gps-acceptance"
echo "  4. Review audit trail: GET /api/consent/my-consents"
