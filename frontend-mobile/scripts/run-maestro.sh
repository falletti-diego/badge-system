#!/usr/bin/env bash
# Maestro E2E — avvia simulatore iOS + Metro (dev-client) ed esegue i flow Maestro
# Prerequisiti (una tantum, non versionati nel repo):
#   - Maestro CLI: curl -Ls "https://get.maestro.mobile.dev" | bash
#   - Java Runtime (richiesto da Maestro): es. `brew install openjdk@17`
#   - Dev client per simulatore installato su un simulatore avviabile:
#     eas build --profile development-simulator --platform ios --local
#     xcrun simctl install booted <path-.app-generato>
#
# Uso: ./scripts/run-maestro.sh ["Nome Simulatore"]
#   Default simulatore: "iPhone 17 Pro"

set -e

# Assicura che maestro sia in PATH anche in shell non interattive/non-login
# (l'installer di get.maestro.mobile.dev scrive solo in .bash_profile/.zshrc)
export PATH="$PATH:$HOME/.maestro/bin"

FRONTEND_MOBILE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$FRONTEND_MOBILE_DIR"

SIMULATOR_NAME="${1:-iPhone 17 Pro}"
METRO_LOG="$(mktemp -t metro-maestro-log)"
METRO_PID=""

cleanup() {
  if [[ -n "$METRO_PID" ]] && kill -0 "$METRO_PID" 2>/dev/null; then
    echo ""
    echo "Arresto Metro (PID $METRO_PID)..."
    kill "$METRO_PID" 2>/dev/null || true
    wait "$METRO_PID" 2>/dev/null || true
  fi
  rm -f "$METRO_LOG"
}
trap cleanup EXIT

echo ""
echo "============================================"
echo "  Maestro E2E — Badge System"
echo "  Simulatore: $SIMULATOR_NAME"
echo "============================================"
echo ""

# 1. Boot simulatore (se non già avviato)
BOOTED=$(xcrun simctl list devices | grep "$SIMULATOR_NAME" | grep -c "(Booted)" || true)
if [[ "$BOOTED" -eq 0 ]]; then
  echo "Avvio simulatore \"$SIMULATOR_NAME\"..."
  xcrun simctl boot "$SIMULATOR_NAME"
else
  echo "Simulatore \"$SIMULATOR_NAME\" già avviato."
fi

# Assicura che l'app Simulator.app sia in primo piano (utile per debugging locale)
open -a Simulator --args -CurrentDeviceUDID "$(xcrun simctl list devices | grep "$SIMULATOR_NAME" | grep "(Booted)" | grep -Eo '[0-9A-F-]{36}' | head -1)" 2>/dev/null || true

# 2. Avvia Metro in dev-client mode, in background
echo "Avvio Metro (dev-client)..."
npx expo start --dev-client --non-interactive > "$METRO_LOG" 2>&1 &
METRO_PID=$!

# 3. Attende che Metro sia pronto (bundler in ascolto)
echo "Attendo che Metro sia pronto..."
READY=0
for i in $(seq 1 60); do
  if ! kill -0 "$METRO_PID" 2>/dev/null; then
    echo "❌ Metro si è chiuso inaspettatamente. Log:"
    cat "$METRO_LOG"
    exit 1
  fi
  if grep -qE "Metro waiting on|Logs for your project|Web is waiting on" "$METRO_LOG" 2>/dev/null \
     || curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/status 2>/dev/null | grep -q "200"; then
    READY=1
    break
  fi
  sleep 1
done

if [[ "$READY" -ne 1 ]]; then
  echo "❌ Timeout: Metro non è diventato disponibile entro 60s. Log:"
  cat "$METRO_LOG"
  exit 1
fi

echo "✅ Metro pronto."
echo ""

# 4. Esegue i flow Maestro
echo "Esecuzione test Maestro ($FRONTEND_MOBILE_DIR/maestro/)..."
maestro test "$FRONTEND_MOBILE_DIR/maestro/"
MAESTRO_EXIT=$?

exit "$MAESTRO_EXIT"
