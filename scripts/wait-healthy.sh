#!/usr/bin/env bash
# wait-healthy.sh — Poll a Docker container until healthy or timeout
#
# Usage:
#   ./scripts/wait-healthy.sh <container_name> [options]
#
# Options:
#   --port PORT       Port for /health HTTP check (default: 3000)
#   --host HOST       Host for /health HTTP check (default: localhost)
#   --path PATH       Health endpoint path (default: /health)
#   --timeout SECS    Max wait time in seconds (default: 300)
#   --verbose         Print curl output and docker inspect details
#
# Exit codes:
#   0  Container became healthy within timeout
#   1  Timeout reached, container unhealthy, or container crashed
#
# Examples:
#   ./scripts/wait-healthy.sh badge-system-api
#   ./scripts/wait-healthy.sh badge-system-api --port 8080 --verbose
#   ./scripts/wait-healthy.sh badge-system-api --timeout 120

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
CONTAINER=""
PORT=3000
HOST="localhost"
HEALTH_PATH="/health"
MAX_TIMEOUT=300   # 5 minutes
VERBOSE=false

BACKOFF_START=1
BACKOFF_MAX=30

# ── Colors ────────────────────────────────────────────────────────────────────
C_GREEN='\033[0;32m'
C_RED='\033[0;31m'
C_YELLOW='\033[1;33m'
C_BLUE='\033[0;34m'
C_GRAY='\033[0;90m'
C_BOLD='\033[1m'
C_NC='\033[0m'

log()         { echo -e "$(date '+%H:%M:%S')  $*"; }
log_pass()    { log "${C_GREEN}✅${C_NC}  $*"; }
log_fail()    { log "${C_RED}❌${C_NC}  $*"; }
log_warn()    { log "${C_YELLOW}⚠️ ${C_NC}  $*"; }
log_info()    { log "${C_BLUE}ℹ️ ${C_NC}  $*"; }
log_verbose() { $VERBOSE && log "${C_GRAY}   $*${C_NC}" || true; }

# ── Argument parsing ──────────────────────────────────────────────────────────
if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <container_name> [--port PORT] [--host HOST] [--path PATH] [--timeout SECS] [--verbose]"
  exit 1
fi

CONTAINER="$1"; shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)    PORT="$2";       shift 2 ;;
    --host)    HOST="$2";       shift 2 ;;
    --path)    HEALTH_PATH="$2"; shift 2 ;;
    --timeout) MAX_TIMEOUT="$2"; shift 2 ;;
    --verbose) VERBOSE=true;    shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

HEALTH_URL="http://${HOST}:${PORT}${HEALTH_PATH}"

# ── Helper: check if container exists ─────────────────────────────────────────
container_exists() {
  docker inspect "$CONTAINER" &>/dev/null
}

# ── Helper: get Docker health status ──────────────────────────────────────────
docker_health_status() {
  docker inspect "$CONTAINER" \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    2>/dev/null || echo "unknown"
}

# ── Helper: get container run state ───────────────────────────────────────────
container_state() {
  docker inspect "$CONTAINER" --format '{{.State.Status}}' 2>/dev/null || echo "unknown"
}

# ── Helper: HTTP health check ─────────────────────────────────────────────────
http_health_check() {
  local curl_flags=(-s -o /tmp/whealthy_body -w "%{http_code}" --max-time 5)
  local status
  status=$(curl "${curl_flags[@]}" "$HEALTH_URL" 2>/dev/null) || status="000"

  log_verbose "curl $HEALTH_URL → HTTP $status"

  if $VERBOSE && [[ -s /tmp/whealthy_body ]]; then
    log_verbose "body: $(cat /tmp/whealthy_body | head -c 200)"
  fi

  echo "$status"
}

# ── Helper: print crash logs ──────────────────────────────────────────────────
print_crash_logs() {
  echo ""
  log_warn "Container '${CONTAINER}' crashed — last 20 log lines:"
  echo -e "${C_GRAY}────────────────────────────────────────────────────${C_NC}"
  docker logs --tail 20 "$CONTAINER" 2>&1 | sed "s/^/  ${C_GRAY}│${C_NC}  /"
  echo -e "${C_GRAY}────────────────────────────────────────────────────${C_NC}"
  echo ""
}

# ── Exponential backoff: next delay ───────────────────────────────────────────
# Double each time, cap at BACKOFF_MAX, never exceed remaining timeout
next_delay() {
  local current_delay="$1"
  local elapsed="$2"
  local doubled=$(( current_delay * 2 ))
  local capped=$(( doubled < BACKOFF_MAX ? doubled : BACKOFF_MAX ))
  local remaining=$(( MAX_TIMEOUT - elapsed ))
  # Never sleep longer than what's left
  echo $(( capped < remaining ? capped : remaining ))
}

# ── Main ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${C_BOLD}╔══════════════════════════════════════════════════════════╗${C_NC}"
echo -e "${C_BOLD}║  wait-healthy — Docker Container Health Poller          ║${C_NC}"
echo -e "${C_BOLD}╚══════════════════════════════════════════════════════════╝${C_NC}"
echo -e "  Container : ${C_BOLD}${CONTAINER}${C_NC}"
echo -e "  Health URL: ${C_BLUE}${HEALTH_URL}${C_NC}"
echo -e "  Max timeout: ${MAX_TIMEOUT}s  |  Backoff: ${BACKOFF_START}s → ${BACKOFF_MAX}s"
$VERBOSE && echo -e "  Mode: ${C_YELLOW}VERBOSE${C_NC}"
echo ""

# Guard: container must exist
if ! container_exists; then
  log_fail "Container '${CONTAINER}' not found. Is it running?"
  exit 1
fi

START_TIME=$(date +%s)
ATTEMPT=0
DELAY=$BACKOFF_START

while true; do
  ATTEMPT=$(( ATTEMPT + 1 ))
  NOW=$(date +%s)
  ELAPSED=$(( NOW - START_TIME ))

  # ── Timeout guard ────────────────────────────────────────────────────────
  if [[ $ELAPSED -ge $MAX_TIMEOUT ]]; then
    echo ""
    log_fail "Timeout reached after ${ELAPSED}s (max: ${MAX_TIMEOUT}s)"
    log_warn "Container state: $(container_state) | Docker health: $(docker_health_status)"
    print_crash_logs
    exit 1
  fi

  # ── Check container is still running ─────────────────────────────────────
  STATE=$(container_state)
  if [[ "$STATE" == "exited" || "$STATE" == "dead" ]]; then
    echo ""
    log_fail "Container '${CONTAINER}' has stopped (state: ${STATE})"
    print_crash_logs
    exit 1
  fi

  # ── Docker health status ─────────────────────────────────────────────────
  DOCKER_STATUS=$(docker_health_status)

  # ── HTTP health check ────────────────────────────────────────────────────
  HTTP_STATUS=$(http_health_check)

  # Determine overall status
  if [[ "$HTTP_STATUS" == "200" ]]; then
    HTTP_LABEL="${C_GREEN}HTTP 200${C_NC}"
  elif [[ "$HTTP_STATUS" == "000" ]]; then
    HTTP_LABEL="${C_RED}no response${C_NC}"
  else
    HTTP_LABEL="${C_YELLOW}HTTP ${HTTP_STATUS}${C_NC}"
  fi

  case "$DOCKER_STATUS" in
    healthy)   DOCKER_LABEL="${C_GREEN}healthy${C_NC}" ;;
    starting)  DOCKER_LABEL="${C_YELLOW}starting${C_NC}" ;;
    unhealthy) DOCKER_LABEL="${C_RED}unhealthy${C_NC}" ;;
    none)      DOCKER_LABEL="${C_GRAY}no healthcheck${C_NC}" ;;
    *)         DOCKER_LABEL="${C_GRAY}${DOCKER_STATUS}${C_NC}" ;;
  esac

  log "Attempt ${C_BOLD}#${ATTEMPT}${C_NC} [${ELAPSED}s/${MAX_TIMEOUT}s] — docker: $(echo -e $DOCKER_LABEL) | http: $(echo -e $HTTP_LABEL) | next retry: ${DELAY}s"

  # ── Success condition: Docker healthy OR HTTP 200 (handles no healthcheck) ─
  if [[ "$DOCKER_STATUS" == "healthy" ]] || \
     [[ "$DOCKER_STATUS" == "none" && "$HTTP_STATUS" == "200" ]]; then
    echo ""
    log_pass "Container '${CONTAINER}' is healthy! (elapsed: ${ELAPSED}s, attempts: ${ATTEMPT})"

    if $VERBOSE; then
      log_verbose "Final docker inspect:"
      docker inspect "$CONTAINER" --format \
        '  Image:   {{.Config.Image}}{{"\n"}}  State:   {{.State.Status}}{{"\n"}}  Started: {{.State.StartedAt}}' \
        2>/dev/null | sed 's/^/  /'
    fi
    echo ""
    exit 0
  fi

  # ── Crash detection ───────────────────────────────────────────────────────
  if [[ "$DOCKER_STATUS" == "unhealthy" ]]; then
    # Give it one more check before declaring dead (transient failure)
    if [[ "$HTTP_STATUS" != "200" ]]; then
      echo ""
      log_fail "Container '${CONTAINER}' is unhealthy and HTTP check failed"
      print_crash_logs
      exit 1
    fi
    # HTTP says 200 even though Docker health says unhealthy — keep trying
    log_warn "Docker reports unhealthy but HTTP 200 — continuing..."
  fi

  # ── Recalculate delay (avoids sleeping past timeout) ─────────────────────
  DELAY=$(next_delay "$DELAY" "$ELAPSED")

  # ── Sleep with per-second progress dots in verbose mode ──────────────────
  if $VERBOSE; then
    printf "  ${C_GRAY}waiting ${DELAY}s "
    for _ in $(seq 1 "$DELAY"); do
      sleep 1
      printf "."
    done
    printf "${C_NC}\n"
  else
    sleep "$DELAY"
  fi
done
