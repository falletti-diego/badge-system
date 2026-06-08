#!/bin/bash
# Wrapper: fetch DB config from SSM → export → run audit-log-retention.js
# Used by: docker exec badge-system-api /app/scripts/run-retention.sh [--dry-run]
set -e

SSM_PATH="${SSM_PARAM_PATH:-/badge/production}"
REGION="${AWS_REGION:-eu-west-1}"

echo "[retention] Fetching DB config from SSM: $SSM_PATH"

get_param() {
  aws ssm get-parameter \
    --name "$SSM_PATH/$1" \
    --with-decryption \
    --region "$REGION" \
    --query "Parameter.Value" \
    --output text 2>/dev/null
}

export DB_HOST=$(get_param DB_HOST)
export DB_PORT=$(get_param DB_PORT)
export DB_NAME=$(get_param DB_NAME)
export DB_USER=$(get_param DB_USER)
export DB_PASSWORD=$(get_param DB_PASSWORD)
export DB_SSL=$(get_param DB_SSL)

if [ -z "$DB_HOST" ]; then
  echo "[retention] ERROR: DB_HOST not found in SSM at $SSM_PATH/DB_HOST"
  exit 1
fi

echo "[retention] DB config loaded. Host: $DB_HOST DB: $DB_NAME"
exec node /app/scripts/audit-log-retention.js "$@"
