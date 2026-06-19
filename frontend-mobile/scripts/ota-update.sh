#!/usr/bin/env bash
# OTA Update — pubblica un aggiornamento JS senza build nativa
# Uso: ./scripts/ota-update.sh "messaggio descrittivo"
# Il branch default è "production" (l'app su TestFlight Build 16)
#
# Esempi:
#   ./scripts/ota-update.sh "feat: schermata ferie dipendente"
#   ./scripts/ota-update.sh "fix: crash QR scanner su iOS 17" --branch preview

set -e

BRANCH="${BRANCH:-production}"
MESSAGE="${1:-OTA update $(date '+%Y-%m-%d %H:%M')}"

# Consenti override branch da flag --branch
for i in "$@"; do
  if [[ "$i" == "--branch" ]]; then
    NEXT_IS_BRANCH=1
  elif [[ "$NEXT_IS_BRANCH" == "1" ]]; then
    BRANCH="$i"
    NEXT_IS_BRANCH=0
  fi
done

echo ""
echo "============================================"
echo "  EAS OTA Update"
echo "  Branch  : $BRANCH"
echo "  Messaggio: $MESSAGE"
echo "============================================"
echo ""

cd "$(dirname "$0")/.."

npx eas update \
  --branch "$BRANCH" \
  --message "$MESSAGE" \
  --non-interactive

echo ""
echo "✅ OTA update pubblicato su branch: $BRANCH"
echo "   L'app si aggiornerà al prossimo avvio."
echo ""
