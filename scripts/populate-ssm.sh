#!/usr/bin/env bash
# populate-ssm.sh — One-time script to create SSM parameters for badge production
#
# Run this ONCE from your local machine (AWS CLI + admin credentials) before
# the first SSM-based deployment.
#
# Prerequisites:
#   - aws cli configured (aws configure) with AdministratorAccess or SSM write permissions
#   - Edit the values below with real production secrets
#
# Usage:
#   chmod +x scripts/populate-ssm.sh
#   ./scripts/populate-ssm.sh
#
set -euo pipefail

REGION="eu-west-1"
PATH_PREFIX="/badge/production"
OVERWRITE="--overwrite"  # remove this flag to fail if param already exists

# Helper: put a SecureString parameter (encrypted, for secrets)
put_secret() {
  local name="$1" value="$2"
  echo "  Putting SecureString: ${PATH_PREFIX}/${name}"
  aws ssm put-parameter \
    --region "$REGION" \
    --name "${PATH_PREFIX}/${name}" \
    --type SecureString \
    --value "$value" \
    $OVERWRITE \
    --output text 2>&1 | grep -v '^$' || true
}

# Helper: put a plain String parameter (non-sensitive config)
put_string() {
  local name="$1" value="$2"
  echo "  Putting String: ${PATH_PREFIX}/${name}"
  aws ssm put-parameter \
    --region "$REGION" \
    --name "${PATH_PREFIX}/${name}" \
    --type String \
    --value "$value" \
    $OVERWRITE \
    --output text 2>&1 | grep -v '^$' || true
}

echo "========================================================"
echo "  Populating SSM parameters under ${PATH_PREFIX}"
echo "  Region: ${REGION}"
echo "========================================================"
echo ""

# ── Database ─────────────────────────────────────────────────────────────────
put_string  "DB_HOST"     "badge-system-db.cvs80y0my080.eu-west-1.rds.amazonaws.com"
put_string  "DB_PORT"     "5432"
put_string  "DB_USER"     "postgres"
put_secret  "DB_PASSWORD" "CHANGE_ME_DB_PASSWORD"
put_string  "DB_NAME"     "badge_system"

# ── JWT ───────────────────────────────────────────────────────────────────────
put_secret  "JWT_SECRET"         "CHANGE_ME_JWT_SECRET_32_CHARS_MIN"
put_secret  "JWT_REFRESH_SECRET" "CHANGE_ME_JWT_REFRESH_SECRET_32_CHARS_MIN"
put_string  "JWT_EXPIRY"         "30m"
put_string  "JWT_REFRESH_EXPIRY" "7d"

# ── CORS ──────────────────────────────────────────────────────────────────────
put_string  "CORS_ORIGIN"      "https://dataxiom-badge.netlify.app,http://localhost:5173"
put_string  "CORS_CREDENTIALS" "true"

echo ""
echo "========================================================"
echo "  ✅ Done. Verify with:"
echo "  aws ssm get-parameters-by-path --path ${PATH_PREFIX} --region ${REGION} --query 'Parameters[*].Name'"
echo "========================================================"
