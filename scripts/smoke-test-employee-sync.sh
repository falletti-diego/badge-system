#!/usr/bin/env bash
# scripts/smoke-test-employee-sync.sh — Golden path E2E per il wizard "Aggiorna Dipendenti".
# Uso: ./scripts/smoke-test-employee-sync.sh <base_url> <admin_email> <admin_password> <client_id>
#
# Endpoint reali (verificati leggendo backend/src/routes/admin/employeeSync.js):
#   GET  /api/v1/admin/employee-sync/template?client_id=...   (query string, solo per superadmin)
#        -> risposta binaria .xlsx (Content-Disposition attachment)
#   POST /api/v1/admin/employee-sync/preview                  multipart: file + client_id (form field)
#        -> {"data": {"errors": [...], "nuovi": [...], "riattivati": [...], "rimossi": [...],
#                      "modificati": [...], "anomalie": [...]}}
#
# Il campo client_id viene letto da req.body (form-data) in /preview e /apply, non dalla query
# string — vedi validateClientIdFromBody() nella route. E' rilevante solo se l'utente loggato ha
# role=superadmin; per un admin normale del client viene ignorato lato server (resolveTenantScope
# usa comunque il client_id dell'utente), quindi passarlo sempre non causa effetti collaterali.
set -euo pipefail

BASE_URL="${1:?Uso: $0 <base_url> <admin_email> <admin_password> <client_id>}"
ADMIN_EMAIL="${2:?Manca admin_email}"
ADMIN_PASSWORD="${3:?Manca admin_password}"
CLIENT_ID="${4:?Manca client_id}"
FAIL=0

step() { echo "▶ $1"; }
pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAIL=1; }

json_get() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

TEMPLATE_FILE="/tmp/employee-sync-template.xlsx"
trap 'rm -f "$TEMPLATE_FILE"' EXIT

step "Login admin"
LOGIN_RES=$(curl -sf -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
TOKEN=$(echo "$LOGIN_RES" | json_get "['data']['token']")
[ -n "$TOKEN" ] && pass "Login OK" || { fail "Login fallito: $LOGIN_RES"; exit 1; }

step "Scarica template pre-compilato"
curl -sf "$BASE_URL/api/v1/admin/employee-sync/template?client_id=$CLIENT_ID" \
  -H "Authorization: Bearer $TOKEN" -o "$TEMPLATE_FILE"
[ -s "$TEMPLATE_FILE" ] && pass "Template scaricato" || { fail "Template vuoto/mancante"; exit 1; }

step "Preview: carica lo stesso file senza modifiche (nessuna variazione attesa)"
PREVIEW_RES=$(curl -sf -X POST "$BASE_URL/api/v1/admin/employee-sync/preview" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TEMPLATE_FILE" \
  -F "client_id=$CLIENT_ID")

ERRORS_COUNT=$(echo "$PREVIEW_RES" | json_get "['data']['errors'].__len__()" 2>/dev/null || echo "?")
[ "$ERRORS_COUNT" = "0" ] && pass "Nessun errore di validazione nel file scaricato" || fail "Errori inattesi nel preview: $PREVIEW_RES"

for FIELD in nuovi riattivati rimossi modificati; do
  COUNT=$(echo "$PREVIEW_RES" | json_get "['data']['$FIELD'].__len__()" 2>/dev/null || echo "?")
  [ "$COUNT" = "0" ] && pass "Nessuna variazione in '$FIELD' su file invariato" || fail "Variazioni inattese in '$FIELD' su file invariato: $PREVIEW_RES"
done

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "🎉 SMOKE TEST: TUTTI I PASSI SUPERATI"
  exit 0
else
  echo "💥 SMOKE TEST: ALMENO UN PASSO FALLITO — vedi sopra"
  exit 1
fi
