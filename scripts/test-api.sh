#!/usr/bin/env bash
# test-api.sh — Suite completa di test per tutti gli endpoint Badge System API
# Usage: ./scripts/test-api.sh [API_URL]
# Default API_URL: https://api.dataxiom.it

set -euo pipefail

API_URL="${1:-https://api.dataxiom.it}"
TORINO_SITE_ID="550e8400-e29b-41d4-a716-446655440012"
PASS=0
FAIL=0
WARN=0

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

pass() { echo -e "  ${GREEN}✅ PASS${NC}  $*"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}❌ FAIL${NC}  $*"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}⚠️  WARN${NC}  $*"; WARN=$((WARN + 1)); }
section() { echo -e "\n${BLUE}${BOLD}▸ $*${NC}"; }

# ── Helper: HTTP request con status code ──────────────────────────────────────
# Restituisce: "STATUS BODY" separati da newline
http() {
  local method="$1" url="$2" token="${3:-}" body="${4:-}"
  local curl_args=(-s -o /tmp/api_body -w "%{http_code}" --max-time 10)
  [[ -n "$token" ]] && curl_args+=(-H "Authorization: Bearer $token")
  [[ -n "$body" ]] && curl_args+=(-H "Content-Type: application/json" -d "$body")
  local status
  status=$(curl "${curl_args[@]}" -X "$method" "$url" 2>/dev/null) || status="000"
  echo "$status"
}

http_body() { cat /tmp/api_body 2>/dev/null || echo ""; }

# ── Helper: login e ottieni token ─────────────────────────────────────────────
login() {
  local email="$1" password="$2"
  local status
  status=$(http POST "$API_URL/api/auth/login" "" "{\"email\":\"$email\",\"password\":\"$password\"}")
  if [[ "$status" == "200" ]]; then
    http_body | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null || echo ""
  else
    echo ""
  fi
}

# ── Helper: controlla status ──────────────────────────────────────────────────
expect() {
  local label="$1" status="$2" expected="$3"
  if [[ "$status" == "$expected" ]]; then
    pass "$label → HTTP $status"
  elif [[ "$status" == "000" ]]; then
    fail "$label → API non raggiungibile (timeout/connection refused)"
  else
    fail "$label → HTTP $status (atteso: $expected)"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
echo -e "\n${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       BADGE SYSTEM — API TEST SUITE                     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo -e "  API: ${BLUE}$API_URL${NC}"
echo -e "  Data: $(date '+%Y-%m-%d %H:%M:%S')\n"

# ══════════════════════════════════════════════════════════════════════════════
section "1. HEALTH CHECK"
status=$(http GET "$API_URL/health")
expect "GET /health" "$status" "200"
if [[ "$status" == "200" ]]; then
  body=$(http_body)
  db_status=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('database','?'))" 2>/dev/null || echo "?")
  [[ "$db_status" == "connected" ]] && pass "Database: connected" || warn "Database: $db_status"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "2. AUTENTICAZIONE — Login demo accounts"

echo -e "  ${BOLD}Login come admin (pippo@badge.local)${NC}"
TOKEN_ADMIN=$(login "pippo@badge.local" "pippo01")
[[ -n "$TOKEN_ADMIN" ]] && pass "Login admin → token ricevuto" || fail "Login admin → nessun token"

echo -e "  ${BOLD}Login come manager (diego@badge.local / Torino)${NC}"
TOKEN_MANAGER=$(login "diego@badge.local" "Diego1975")
[[ -n "$TOKEN_MANAGER" ]] && pass "Login manager Torino → token ricevuto" || fail "Login manager → nessun token"

echo -e "  ${BOLD}Login come employee (luca.verdi@employee.it)${NC}"
TOKEN_EMPLOYEE=$(login "luca.verdi@employee.it" "Luca1975")
[[ -n "$TOKEN_EMPLOYEE" ]] && pass "Login employee → token ricevuto" || fail "Login employee → nessun token"

echo -e "  ${BOLD}Credenziali errate → deve dare 4xx (rifiutato)${NC}"
status=$(http POST "$API_URL/api/auth/login" "" '{"email":"fake@test.it","password":"wrong"}')
if [[ "$status" == "400" || "$status" == "401" || "$status" == "429" ]]; then
  pass "Login credenziali errate → HTTP $status (rifiutato correttamente)"
else
  fail "Login credenziali errate → HTTP $status (atteso: 400/401/429)"
fi

echo -e "  ${BOLD}Endpoint senza token → deve dare 401${NC}"
status=$(http GET "$API_URL/api/employees")
expect "GET /employees senza token" "$status" "401"

# ══════════════════════════════════════════════════════════════════════════════
section "3. EMPLOYEES"

status=$(http GET "$API_URL/api/employees" "$TOKEN_ADMIN")
expect "GET /employees (admin)" "$status" "200"
if [[ "$status" == "200" ]]; then
  count=$(http_body | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null || echo "?")
  pass "Employees restituiti: $count"
fi

status=$(http GET "$API_URL/api/employees" "$TOKEN_EMPLOYEE")
if [[ "$status" == "403" ]]; then
  pass "GET /employees (employee → 403 corretto)"
elif [[ "$status" == "200" ]]; then
  fail "GET /employees (employee → 200: BUG RBAC — employee vede tutti i dipendenti)"
else
  fail "GET /employees (employee → $status, atteso: 403)"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "4. CHECKINS"

status=$(http GET "$API_URL/api/checkins" "$TOKEN_MANAGER")
expect "GET /checkins (manager)" "$status" "200"
if [[ "$status" == "200" ]]; then
  count=$(http_body | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null || echo "?")
  pass "Checkins restituiti: $count"
fi

status=$(http GET "$API_URL/api/checkins" "$TOKEN_EMPLOYEE")
expect "GET /checkins (employee → solo propri)" "$status" "200"

# ══════════════════════════════════════════════════════════════════════════════
section "5. SHIFTS (Planning)"

status=$(http GET "$API_URL/api/shifts/$TORINO_SITE_ID?month=6&year=2026" "$TOKEN_MANAGER")
expect "GET /shifts/:siteId (manager Torino)" "$status" "200"

status=$(http GET "$API_URL/api/shifts/my-schedule?month=6&year=2026" "$TOKEN_EMPLOYEE")
expect "GET /shifts/my-schedule (employee)" "$status" "200"

status=$(http GET "$API_URL/api/shifts/$TORINO_SITE_ID?month=6&year=2026" "$TOKEN_EMPLOYEE")
expect "GET /shifts/:siteId (employee → 403)" "$status" "403"

# ══════════════════════════════════════════════════════════════════════════════
section "6. SITES"

status=$(http GET "$API_URL/api/sites" "$TOKEN_ADMIN")
expect "GET /sites (admin)" "$status" "200"
if [[ "$status" == "200" ]]; then
  count=$(http_body | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null || echo "?")
  pass "Sites restituiti: $count"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "7. EXPORT CSV"

status=$(http GET "$API_URL/api/export/csv?month=6&year=2026" "$TOKEN_MANAGER")
expect "GET /export/csv (manager)" "$status" "200"

status=$(http GET "$API_URL/api/export/csv?month=6&year=2026" "$TOKEN_EMPLOYEE")
if [[ "$status" == "403" ]]; then
  pass "GET /export/csv (employee → 403 corretto)"
elif [[ "$status" == "200" ]]; then
  fail "GET /export/csv (employee → 200: BUG RBAC — employee scarica il CSV di tutti)"
else
  fail "GET /export/csv (employee → $status, atteso: 403)"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "8. NOTIFICATIONS"

status=$(http GET "$API_URL/api/notifications" "$TOKEN_EMPLOYEE")
expect "GET /notifications (employee)" "$status" "200"

status=$(http PUT "$API_URL/api/notifications/read-all" "$TOKEN_EMPLOYEE")
expect "PUT /notifications/read-all (employee)" "$status" "200"

# ══════════════════════════════════════════════════════════════════════════════
section "9. CORS (richiesta da frontend Netlify)"

cors_status=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Origin: https://dataxiom-badge.netlify.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  -X OPTIONS "$API_URL/api/checkins" --max-time 10 2>/dev/null || echo "000")

cors_header=$(curl -s -I \
  -H "Origin: https://dataxiom-badge.netlify.app" \
  "$API_URL/api/checkins" --max-time 10 2>/dev/null | grep -i "access-control-allow-origin" | tr -d '\r' || echo "")

if [[ -n "$cors_header" ]]; then
  pass "CORS header presente: $cors_header"
else
  fail "CORS: Access-Control-Allow-Origin mancante"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  RISULTATI FINALI                                        ║${NC}"
echo -e "║  ${GREEN}✅ PASS: $PASS${NC}  ${RED}❌ FAIL: $FAIL${NC}  ${YELLOW}⚠️  WARN: $WARN${NC}$(printf '%*s' $((20 - ${#PASS} - ${#FAIL} - ${#WARN})) '')  ${BOLD}║${NC}"

TOTAL=$((PASS + FAIL + WARN))
if [[ $FAIL -eq 0 ]]; then
  echo -e "${BOLD}║  ${GREEN}✅ TUTTI I TEST PASSATI — API pronta per deploy${NC}$(printf '%*s' 12 '')${BOLD}║${NC}"
  STATUS=0
else
  echo -e "${BOLD}║  ${RED}❌ $FAIL TEST FALLITI — NON deployare fino a fix${NC}$(printf '%*s' 10 '')${BOLD}║${NC}"
  STATUS=1
fi
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}\n"

exit $STATUS
