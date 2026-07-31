#!/usr/bin/env bash
# scripts/smoke-test-staging.sh — Golden path E2E contro l'ambiente di staging.
# Uso: ./scripts/smoke-test-staging.sh <base_url> <maria_password> <pino_password>
#
# Le password NON sono hardcoded: sono le stesse generate e scritte in
# /badge/staging/DEMO_MARIA_PASSWORD e /badge/staging/DEMO_PINO_PASSWORD al
# Task 5. Gli utenti demo esistenti sono solo pippo (admin), pino (manager),
# maria (employee) — vedi backend/src/__fixtures__/demo-users.js, non esiste
# un utente "diego@badge.local".
#
# Endpoint reali (verificati contro l'API live in Session 89 — il mount path
# e' /api/v1/leave, singolare, non /leaves/requests come in una prima stesura
# errata di questo script):
#   POST /api/v1/leave/request        body: {leave_type, start_date, end_date}
#   PUT  /api/v1/leave/:id/approve    body: {status: APPROVED|REJECTED}
#   GET  /api/v1/leave/my-requests    -> {data: [...]}
#   GET  /api/v1/leave/approved       -> {data: [...]} (per verifica planning)
set -euo pipefail

BASE_URL="${1:?Uso: $0 <base_url> <maria_password> <pino_password>}"
MARIA_PASSWORD="${2:?Manca la password di maria@badge.local}"
PINO_PASSWORD="${3:?Manca la password di pino@badge.local}"
FAIL=0

step() { echo "▶ $1"; }
pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAIL=1; }

json_get() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

# Date fisse nel futuro (2026-09), lontane da qualunque dato demo esistente
# cosi' da non collidere con leave_saldi gia' consumati da altri test.
START_DATE="2026-09-01"
END_DATE="2026-09-02"

step "Login Maria (employee)"
MARIA_RES=$(curl -sf -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"maria@badge.local\",\"password\":\"$MARIA_PASSWORD\"}")
MARIA_TOKEN=$(echo "$MARIA_RES" | json_get "['data']['token']")
[ -n "$MARIA_TOKEN" ] && pass "Login Maria OK" || { fail "Login Maria fallito"; exit 1; }

step "Maria richiede ferie"
LEAVE_RES=$(curl -sf -X POST "$BASE_URL/api/v1/leave/request" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MARIA_TOKEN" \
  -d "{\"leave_type\":\"FERIE_1\",\"start_date\":\"$START_DATE\",\"end_date\":\"$END_DATE\"}")
LEAVE_ID=$(echo "$LEAVE_RES" | json_get "['data']['id']")
[ -n "$LEAVE_ID" ] && pass "Richiesta ferie creata (id=$LEAVE_ID)" || { fail "Richiesta ferie fallita: $LEAVE_RES"; exit 1; }

step "Login Pino (manager)"
PINO_RES=$(curl -sf -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"pino@badge.local\",\"password\":\"$PINO_PASSWORD\"}")
PINO_TOKEN=$(echo "$PINO_RES" | json_get "['data']['token']")
[ -n "$PINO_TOKEN" ] && pass "Login Pino OK" || { fail "Login Pino fallito"; exit 1; }

step "Pino approva la richiesta di Maria"
APPROVE_RES=$(curl -sf -X PUT "$BASE_URL/api/v1/leave/$LEAVE_ID/approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PINO_TOKEN" \
  -d '{"status":"APPROVED"}')
APPROVED_STATUS=$(echo "$APPROVE_RES" | json_get "['data']['status']")
[ "$APPROVED_STATUS" = "APPROVED" ] && pass "Ferie approvate" || fail "Approvazione fallita (status=$APPROVED_STATUS)"

step "Maria verifica le ferie in 'I Miei Turni'"
MYREQUESTS_RES=$(curl -sf "$BASE_URL/api/v1/leave/my-requests" \
  -H "Authorization: Bearer $MARIA_TOKEN")
FOUND=$(echo "$MYREQUESTS_RES" | python3 -c "import json,sys; d=json.load(sys.stdin); print(any(r['id']=='$LEAVE_ID' and r['status']=='APPROVED' for r in d['data']))")
[ "$FOUND" = "True" ] && pass "Ferie visibili e approvate per Maria" || fail "Ferie non trovate/non approvate lato Maria"

step "Pino verifica il planning mostra le ferie di Maria"
PLANNING_RES=$(curl -sf "$BASE_URL/api/v1/leave/approved?start_date=$START_DATE&end_date=$END_DATE" \
  -H "Authorization: Bearer $PINO_TOKEN")
PLANNING_FOUND=$(echo "$PLANNING_RES" | python3 -c "import json,sys; d=json.load(sys.stdin); print(any(r['id']=='$LEAVE_ID' for r in d['data']))")
[ "$PLANNING_FOUND" = "True" ] && pass "Planning mostra le ferie di Maria" || fail "Planning non mostra le ferie"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "🎉 SMOKE TEST: TUTTI I PASSI SUPERATI"
  exit 0
else
  echo "💥 SMOKE TEST: ALMENO UN PASSO FALLITO — vedi sopra"
  exit 1
fi
