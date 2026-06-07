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
CRITICAL_VARS=(DB_HOST DB_PASSWORD JWT_SECRET JWT_REFRESH_SECRET)

ts()  { date -Iseconds; }
log() { echo "$(ts) [bootstrap] $*" >&2; }
ok()  { log "✅ $*"; }
die() { log "❌ $*" >&2; exit 1; }

# ── 1. Prepare secure env directory ─────────────────────────────────────────
mkdir -p /etc/badge
chmod 700 /etc/badge

log "Fetching parameters from SSM path: ${SSM_PATH}/*  region: ${REGION}"

# ── 2. Fetch all pages from SSM (handles >10 params via NextToken) ──────────
ALL_PARAMS_JSON=$(python3 - <<PYEOF 2>&1) || die "SSM fetch failed:\n$ALL_PARAMS_JSON"
import subprocess, json, sys

path   = "$SSM_PATH"
region = "$REGION"
all_params = []

cmd_base = [
    "aws", "ssm", "get-parameters-by-path",
    "--path", path,
    "--with-decryption",
    "--recursive",
    "--region", region,
    "--output", "json",
]

next_token = None
while True:
    cmd = cmd_base + (["--starting-token", next_token] if next_token else [])
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stderr.strip(), file=sys.stderr)
        sys.exit(1)
    data = json.loads(result.stdout)
    all_params.extend(data.get("Parameters", []))
    next_token = data.get("NextToken")
    if not next_token:
        break

print(json.dumps(all_params))
PYEOF

PARAM_COUNT=$(echo "$ALL_PARAMS_JSON" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")

if [[ "$PARAM_COUNT" -eq 0 ]]; then
  die "No parameters found under $SSM_PATH
  → Check that SSM parameters exist (e.g. aws ssm get-parameters-by-path --path $SSM_PATH)
  → Check that the EC2 instance IAM role has ssm:GetParametersByPath permission"
fi

# ── 3. Write KEY=value pairs using shlex.quote() for safe shell sourcing ─────
# shlex.quote handles all special chars: spaces, $, quotes, backslashes, etc.
echo "$ALL_PARAMS_JSON" | python3 - <<'PYEOF'
import sys, json, shlex

params = json.load(sys.stdin)
with open("/etc/badge/.env", "w") as f:
    for p in params:
        name  = p["Name"].rsplit("/", 1)[-1]      # strip /badge/production/ prefix
        value = shlex.quote(p["Value"])
        f.write(f"export {name}={value}\n")
PYEOF

chmod 600 "$ENV_FILE"
chown nodejs:nodejs "$ENV_FILE"
ok "Wrote $PARAM_COUNT variable(s) to $ENV_FILE"

# ── 4. Validate critical variables ──────────────────────────────────────────
MISSING=()
for var in "${CRITICAL_VARS[@]}"; do
  grep -q "^export ${var}=" "$ENV_FILE" || MISSING+=("${SSM_PATH}/${var}")
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  die "Missing critical SSM parameters — create them with:
$(printf '  aws ssm put-parameter --name %s --type SecureString --value <value>\n' "${MISSING[@]}")"
fi
ok "Critical variables verified: ${CRITICAL_VARS[*]}"

# ── 5. Source env into current shell so exec inherits all vars ───────────────
# shellcheck source=/dev/null
source "$ENV_FILE"
ok "Environment loaded — starting app as 'nodejs' user"

# ── 6. Drop privileges and exec dumb-init → app ──────────────────────────────
# su-exec replaces itself with the next command (no extra PID), keeping PID 1 = dumb-init
exec su-exec nodejs dumb-init -- "$@"
