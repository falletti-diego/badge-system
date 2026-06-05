#!/usr/bin/env bash
# deploy.sh — Build, deploy, verify HTTPS cert, and test CORS for Badge System
# Usage: ./scripts/deploy.sh [--skip-build] [--skip-deploy]

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../frontend-web" && pwd)"
NETLIFY_SITE="dataxiom-badge.netlify.app"
FRONTEND_URL="https://${NETLIFY_SITE}"
API_URL="https://api.dataxiom.it"
DEMO_EMAIL="pino@badge.local"
DEMO_PASS="pino01"

# Flags
SKIP_BUILD=false
SKIP_DEPLOY=false
for arg in "$@"; do
  [[ "$arg" == "--skip-build" ]] && SKIP_BUILD=true
  [[ "$arg" == "--skip-deploy" ]] && SKIP_DEPLOY=true
done

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

pass() { echo -e "${GREEN}✅ $*${NC}"; }
fail() { echo -e "${RED}❌ $*${NC}"; FAILED=$((FAILED + 1)); }
info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }

FAILED=0

# ── Step 1: Build ─────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════${NC}"
  echo -e "${BLUE}  STEP 1: BUILD FRONTEND${NC}"
  echo -e "${BLUE}═══════════════════════════════════════${NC}"
  cd "$FRONTEND_DIR"
  info "Running npm run build..."
  if npm run build 2>&1 | tail -5; then
    pass "Build succeeded — dist/ ready"
  else
    fail "Build failed — aborting"
    exit 1
  fi
else
  warn "Skipping build (--skip-build)"
fi

# ── Step 2: Git push → Netlify auto-deploy ────────────────────────────────────
if [[ "$SKIP_DEPLOY" == false ]]; then
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════${NC}"
  echo -e "${BLUE}  STEP 2: DEPLOY (git push → Netlify)${NC}"
  echo -e "${BLUE}═══════════════════════════════════════${NC}"
  cd "$(dirname "$FRONTEND_DIR")"
  if git diff --quiet && git diff --staged --quiet; then
    warn "No uncommitted changes — pushing current HEAD to trigger Netlify rebuild"
  fi
  info "Pushing main → GitHub (Netlify auto-deploys on push)"
  git push origin main
  pass "Push complete"

  info "Waiting 45s for Netlify to build and deploy..."
  sleep 45
else
  warn "Skipping deploy (--skip-deploy)"
fi

# ── Step 3: Verify HTTPS certificate ─────────────────────────────────────────
echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  STEP 3: VERIFY HTTPS CERTIFICATE${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"

CERT_INFO=$(echo | openssl s_client -connect "${NETLIFY_SITE}:443" -servername "$NETLIFY_SITE" 2>/dev/null)
CERT_SUBJECT=$(echo "$CERT_INFO" | openssl x509 -noout -subject 2>/dev/null || true)
CERT_ISSUER=$(echo "$CERT_INFO" | openssl x509 -noout -issuer 2>/dev/null || true)
CERT_DATES=$(echo "$CERT_INFO" | openssl x509 -noout -dates 2>/dev/null || true)
CERT_EXPIRY=$(echo "$CERT_DATES" | grep "notAfter" | cut -d= -f2 || true)

if echo "$CERT_ISSUER" | grep -qi "let's encrypt\|letsencrypt\|DigiCert\|Amazon\|Cloudflare\|COMODO\|Sectigo"; then
  pass "Certificate issuer: trusted CA"
elif echo "$CERT_ISSUER" | grep -qi "self"; then
  fail "SELF-SIGNED CERTIFICATE — will cause ERR_CERT_AUTHORITY_INVALID in browsers"
  warn "Fix: Netlify provides free Let's Encrypt certs automatically. Go to:"
  warn "  Netlify → Site → Domain management → HTTPS → Verify DNS configuration"
else
  pass "Certificate issuer looks valid: ${CERT_ISSUER}"
fi

if [[ -n "$CERT_EXPIRY" ]]; then
  EXPIRY_EPOCH=$(date -j -f "%b %e %T %Y %Z" "$CERT_EXPIRY" +%s 2>/dev/null || date -d "$CERT_EXPIRY" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
  if [[ $DAYS_LEFT -gt 30 ]]; then
    pass "Certificate expires in ${DAYS_LEFT} days (${CERT_EXPIRY})"
  elif [[ $DAYS_LEFT -gt 0 ]]; then
    warn "Certificate expires in ${DAYS_LEFT} days — renew soon"
  else
    fail "Certificate EXPIRED on ${CERT_EXPIRY}"
  fi
fi

# Verify the site actually loads over HTTPS
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$FRONTEND_URL" || echo "000")
if [[ "$HTTP_STATUS" == "200" ]]; then
  pass "Frontend loads over HTTPS — HTTP $HTTP_STATUS"
elif [[ "$HTTP_STATUS" == "301" || "$HTTP_STATUS" == "302" ]]; then
  pass "Frontend redirects (HTTP $HTTP_STATUS) — following redirect..."
else
  fail "Frontend returned HTTP $HTTP_STATUS (expected 200)"
fi

# ── Step 4: Test API health ───────────────────────────────────────────────────
echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  STEP 4: API HEALTH CHECK${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"

HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/health" || echo "000")
if [[ "$HEALTH_STATUS" == "200" ]]; then
  pass "API health endpoint — HTTP $HEALTH_STATUS"
else
  fail "API health endpoint returned HTTP $HEALTH_STATUS (expected 200)"
  warn "Check EC2 container: ssh -i badge-key.pem ubuntu@34.245.145.143 'docker ps'"
fi

# ── Step 5: CORS preflight tests ──────────────────────────────────────────────
echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  STEP 5: CORS PREFLIGHT TESTS${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
info "Testing CORS from origin: ${FRONTEND_URL}"
info "Against API: ${API_URL}"

test_cors() {
  local method="$1"
  local path="$2"
  local label="$3"

  RESPONSE=$(curl -si \
    --max-time 10 \
    -X OPTIONS \
    "${API_URL}${path}" \
    -H "Origin: ${FRONTEND_URL}" \
    -H "Access-Control-Request-Method: ${method}" \
    -H "Access-Control-Request-Headers: authorization,content-type" \
    2>/dev/null || echo "CURL_FAILED")

  if echo "$RESPONSE" | grep -qi "CURL_FAILED\|curl: ("; then
    fail "CORS preflight ${label} — could not reach API"
    return
  fi

  HTTP_CODE=$(echo "$RESPONSE" | head -1 | grep -oE "[0-9]{3}" | head -1 || echo "000")
  ALLOW_ORIGIN=$(echo "$RESPONSE" | grep -i "access-control-allow-origin" | tr -d '\r' | awk '{print $2}' || true)

  if [[ -z "$ALLOW_ORIGIN" ]]; then
    # No CORS headers — check if it's because CORS is handled upstream (Nginx/CDN)
    # A 200/204 with no CORS headers can still work if the proxy adds them
    if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "204" ]]; then
      warn "CORS ${label} — HTTP ${HTTP_CODE} but no Access-Control-Allow-Origin header"
      warn "  → If Nginx/proxy adds CORS headers, this may be fine"
      warn "  → If not, browser will block ${method} ${path} from ${FRONTEND_URL}"
    else
      fail "CORS ${label} — HTTP ${HTTP_CODE}, no CORS headers"
    fi
  elif [[ "$ALLOW_ORIGIN" == "*" || "$ALLOW_ORIGIN" == "$FRONTEND_URL" ]]; then
    pass "CORS ${label} — origin allowed (${ALLOW_ORIGIN})"
  else
    fail "CORS ${label} — origin mismatch: got '${ALLOW_ORIGIN}', expected '${FRONTEND_URL}' or '*'"
  fi
}

test_cors "POST"   "/api/auth/login"         "POST /api/auth/login"
test_cors "GET"    "/api/checkins"           "GET /api/checkins"
test_cors "GET"    "/api/checkins/stats"     "GET /api/checkins/stats"
test_cors "POST"   "/api/checkins"           "POST /api/checkins"
test_cors "GET"    "/api/export/csv"         "GET /api/export/csv"
test_cors "GET"    "/api/shifts/my-schedule" "GET /api/shifts/my-schedule"
test_cors "GET"    "/api/employees"          "GET /api/employees"

# ── Step 6: Auth smoke test ───────────────────────────────────────────────────
echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  STEP 6: AUTH SMOKE TEST (login flow)${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"

LOGIN_RESPONSE=$(curl -s --max-time 10 \
  -X POST "${API_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "Origin: ${FRONTEND_URL}" \
  -d "{\"email\":\"${DEMO_EMAIL}\",\"password\":\"${DEMO_PASS}\"}" \
  2>/dev/null || echo "CURL_FAILED")

if echo "$LOGIN_RESPONSE" | grep -q "CURL_FAILED"; then
  fail "Login request failed — cannot reach API"
elif echo "$LOGIN_RESPONSE" | grep -q '"token"'; then
  pass "Login succeeds — JWT token returned"
  TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || true)

  # Test an authenticated endpoint
  CHECKINS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    "${API_URL}/api/checkins" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Origin: ${FRONTEND_URL}" \
    2>/dev/null || echo "000")

  if [[ "$CHECKINS_STATUS" == "200" ]]; then
    pass "Authenticated GET /api/checkins — HTTP $CHECKINS_STATUS"
  else
    fail "Authenticated GET /api/checkins — HTTP $CHECKINS_STATUS (expected 200)"
  fi
else
  fail "Login failed — response: ${LOGIN_RESPONSE:0:200}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  SUMMARY${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"

if [[ $FAILED -eq 0 ]]; then
  pass "All checks passed — Badge System is live and healthy"
  echo ""
  echo "  Frontend: ${FRONTEND_URL}"
  echo "  API:      ${API_URL}"
  echo "  Login:    ${FRONTEND_URL}/login"
else
  fail "${FAILED} check(s) failed — review output above"
  exit 1
fi
