#!/usr/bin/env bash
# scripts/smoke-test-staging.sh — Golden path E2E contro l'ambiente di staging.
# Uso: ./scripts/smoke-test-staging.sh <base_url> <maria_password> <pino_password>
#
# Le password NON sono hardcoded: sono le stesse generate e scritte in
# /badge/staging/DEMO_MARIA_PASSWORD e /badge/staging/DEMO_PINO_PASSWORD al
# Task 5. Gli utenti demo esistenti sono solo pippo (admin), pino (manager),
# maria (employee) — vedi backend/src/__fixtures__/demo-users.js, non esiste
# un utente "diego@badge.local".
set -euo pipefail

BASE_URL="${1:?Uso: $0 <base_url> <maria_password> <pino_password>}"
MARIA_PASSWORD="${2:?Manca la password di maria@badge.local}"
PINO_PASSWORD="${3:?Manca la password di pino@badge.local}"
FAIL=0

step() { echo "▶ $1"; }
pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAIL=1; }

json_get() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

step "Login Maria (employee)"
MARIA_RES=$(curl -sf -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"maria@badge.local\",\"password\":\"$MARIA_PASSWORD\"}")
MARIA_TOKEN=$(echo "$MARIA_RES" | json_get "['data']['token']")
[ -n "$MARIA_TOKEN" ] && pass "Login Maria OK" || { fail "Login Maria fallito"; exit 1; }

step "Maria richiede ferie"
LEAVE_RES=$(curl -sf -X POST "$BASE_URL/api/v1/leaves/requests" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MARIA_TOKEN" \
  -d '{"leave_type":"ferie","start_date":"2026-09-01","end_date":"2026-09-02","reason":"smoke test"}')
LEAVE_ID=$(echo "$LEAVE_RES" | json_get "['data']['id']")
[ -n "$LEAVE_ID" ] && pass "Richiesta ferie creata (id=$LEAVE_ID)" || { fail "Richiesta ferie fallita"; exit 1; }

step "Login Pino (manager)"
PINO_RES=$(curl -sf -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"pino@badge.local\",\"password\":\"$PINO_PASSWORD\"}")
PINO_TOKEN=$(echo "$PINO_RES" | json_get "['data']['token']")
[ -n "$PINO_TOKEN" ] && pass "Login Pino OK" || { fail "Login Pino fallito"; exit 1; }

step "Pino approva la richiesta di Maria"
APPROVE_RES=$(curl -sf -X PUT "$BASE_URL/api/v1/leaves/requests/$LEAVE_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PINO_TOKEN" \
  -d '{"status":"approved"}')
APPROVED_STATUS=$(echo "$APPROVE_RES" | json_get "['data']['status']")
[ "$APPROVED_STATUS" = "approved" ] && pass "Ferie approvate" || fail "Approvazione fallita (status=$APPROVED_STATUS)"

step "Maria verifica le ferie in 'I Miei Turni'"
MYSHIFTS_RES=$(curl -sf "$BASE_URL/api/v1/leaves/requests?user_id=self" \
  -H "Authorization: Bearer $MARIA_TOKEN")
FOUND=$(echo "$MYSHIFTS_RES" | python3 -c "import json,sys; d=json.load(sys.stdin); print(any(r['id']=='$LEAVE_ID' and r['status']=='approved' for r in d['data']))")
[ "$FOUND" = "True" ] && pass "Ferie visibili e approvate per Maria" || fail "Ferie non trovate/non approvate lato Maria"

step "Pino verifica il planning mostra le ferie di Maria"
PLANNING_RES=$(curl -sf "$BASE_URL/api/v1/shifts?start_date=2026-09-01&end_date=2026-09-02" \
  -H "Authorization: Bearer $PINO_TOKEN")
echo "$PLANNING_RES" | grep -q "ferie" && pass "Planning mostra le ferie" || fail "Planning non mostra le ferie"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "🎉 SMOKE TEST: TUTTI I PASSI SUPERATI"
  exit 0
else
  echo "💥 SMOKE TEST: ALMENO UN PASSO FALLITO — vedi sopra"
  exit 1
fi
