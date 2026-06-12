#!/usr/bin/env bash
# entrypoint.sh — Bootstrap container config from AWS SSM Parameter Store
#
# Runs as root at container start:
#   1. Fetches all params under SSM_PARAM_PATH (default: /badge/production)
#   2. Writes them to /etc/badge/.env as shell export statements
#   3. Fails fast (exit 1) if any CRITICAL_VARS are missing
#   4. Sources the env file so the app process inherits all vars
#   5. Drops to 'nodejs' user via su-exec, then execs dumb-init → app
#
# Required IAM: ssm:GetParametersByPath on arn:aws:ssm:*:*:parameter/badge/production/*
#
set -euo pipefail

SSM_PATH="${SSM_PARAM_PATH:-/badge/production}"
ENV_FILE="/etc/badge/.env"
REGION="${AWS_REGION:-eu-west-1}"

# Variables that MUST be present — container refuses to start if any are missing
CRITICAL_VARS=(DB_HOST DB_PASSWORD JWT_PRIVATE_KEY JWT_PUBLIC_KEY)

# Temp files for Python scripts (avoids heredoc-in-subshell quoting issues)
PY_FETCH=/tmp/_ssm_fetch.py
PY_WRITE=/tmp/_ssm_write.py
SSM_RAW=/tmp/_ssm_raw.json

ts()  { date -Iseconds; }
log() { echo "$(ts) [bootstrap] $*" >&2; }
ok()  { log "✅ $*"; }
die() { log "❌ $*" >&2; exit 1; }

# Cleanup temp files on exit
trap 'rm -f "$PY_FETCH" "$PY_WRITE" "$SSM_RAW"' EXIT

# ── 1. Prepare secure env directory ─────────────────────────────────────────
mkdir -p /etc/badge
chmod 700 /etc/badge

log "Fetching parameters from SSM path: ${SSM_PATH}/*  region: ${REGION}"

# ── 2. Write SSM fetch script to temp file ───────────────────────────────────
# Using a file avoids heredoc-in-subshell $() quoting issues in bash
printf '%s\n' \
  'import subprocess, json, sys, os' \
  'path   = os.environ.get("SSM_PARAM_PATH", "/badge/production")' \
  'region = os.environ.get("AWS_REGION", "eu-west-1")' \
  'all_params = []' \
  'cmd_base = ["aws","ssm","get-parameters-by-path","--path",path,"--with-decryption","--recursive","--region",region,"--output","json"]' \
  'next_token = None' \
  'while True:' \
  '    cmd = cmd_base + (["--starting-token", next_token] if next_token else [])' \
  '    r = subprocess.run(cmd, capture_output=True, text=True)' \
  '    if r.returncode != 0: sys.stderr.write(r.stderr.strip()); sys.exit(1)' \
  '    data = json.loads(r.stdout)' \
  '    all_params.extend(data.get("Parameters", []))' \
  '    next_token = data.get("NextToken")' \
  '    if not next_token: break' \
  'print(json.dumps(all_params))' \
  > "$PY_FETCH"

# ── 3. Fetch all parameters (with pagination) ───────────────────────────────
if ! python3 "$PY_FETCH" > "$SSM_RAW" 2>/tmp/_ssm_err.txt; then
  die "SSM fetch failed: $(cat /tmp/_ssm_err.txt)
  → Check EC2 IAM role has ssm:GetParametersByPath on ${SSM_PATH}/*"
fi

PARAM_COUNT=$(python3 -c "import json; print(len(json.load(open('$SSM_RAW'))))")

if [[ "$PARAM_COUNT" -eq 0 ]]; then
  die "No parameters found under $SSM_PATH — run: aws ssm get-parameters-by-path --path $SSM_PATH --region $REGION"
fi

# ── 4. Write KEY=value pairs using shlex.quote() for safe shell sourcing ────
printf '%s\n' \
  'import json, shlex' \
  'params = json.load(open("'"$SSM_RAW"'"))' \
  'out = open("'"$ENV_FILE"'", "w")' \
  'for p in params:' \
  '    name  = p["Name"].rsplit("/", 1)[-1]' \
  '    value = shlex.quote(p["Value"])' \
  '    out.write("export " + name + "=" + value + "\n")' \
  'out.close()' \
  > "$PY_WRITE"

python3 "$PY_WRITE"
chmod 600 "$ENV_FILE"
chown nodejs:nodejs "$ENV_FILE"
ok "Wrote $PARAM_COUNT variable(s) to $ENV_FILE"

# ── 5. Validate critical variables ──────────────────────────────────────────
MISSING=()
for var in "${CRITICAL_VARS[@]}"; do
  grep -q "^export ${var}=" "$ENV_FILE" || MISSING+=("${SSM_PATH}/${var}")
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  die "Missing critical SSM parameters:
$(printf '  aws ssm put-parameter --name %s --type SecureString --value <value> --region %s\n' "${MISSING[@]}" "$REGION")"
fi
ok "Critical variables verified: ${CRITICAL_VARS[*]}"

# ── 6. Source env into current shell so exec inherits all vars ───────────────
# shellcheck source=/dev/null
source "$ENV_FILE"
ok "Environment loaded — starting app as 'nodejs' user"

# ── 7. Run database migrations (idempotent, fail-fast) ───────────────────────
log "Running database migrations..."
node /app/scripts/run-migrations.js
MIGRATION_EXIT=$?

if [[ $MIGRATION_EXIT -ne 0 ]]; then
  die "Database migrations failed (exit code: $MIGRATION_EXIT)"
fi

ok "Database migrations completed successfully"

# ── 8. Drop privileges and exec dumb-init → app ──────────────────────────────
log "Starting Express server..."
exec su-exec nodejs dumb-init -- "$@"
