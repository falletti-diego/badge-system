#!/bin/bash
# Disk guard — Badge System EC2 (installato in cron, ogni 30 minuti)
#
# Perché esiste: il 2026-11-14 (Session 122-123) il disco root si è riempito
# di immagini Docker accumulate e il backend è andato giù. Il fix in
# deploy-to-ec2.yml fa prune solo AL deploy: tra un deploy e l'altro nulla
# impedisce al disco di riempirsi (log, layer, build interrotte). Questo
# script chiude quel buco: auto-prune sopra soglia, log sempre.
#
# Installazione (vedi docs/RUNBOOK-OPERATIONS.md):
#   scp infrastructure/ec2-disk-guard.sh ubuntu@<EC2>:/home/ubuntu/ops/
#   chmod +x /home/ubuntu/ops/ec2-disk-guard.sh
#   cron: */30 * * * * /home/ubuntu/ops/ec2-disk-guard.sh >> /var/log/badge-disk-guard.log 2>&1

set -u

THRESHOLD_PCT=75
USED_PCT=$(df --output=pcent / | tail -1 | tr -dc '0-9')
MEM_AVAILABLE_MB=$(awk '/MemAvailable/ {printf "%d", $2/1024}' /proc/meminfo)

echo "$(date -u +%FT%TZ) disk=${USED_PCT}% mem_available=${MEM_AVAILABLE_MB}MB"

if [ "$USED_PCT" -ge "$THRESHOLD_PCT" ]; then
  echo "$(date -u +%FT%TZ) SOGLIA SUPERATA (>=${THRESHOLD_PCT}%) — eseguo docker system prune"
  # -a: anche immagini non usate da container (l'immagine del container in
  # esecuzione NON viene toccata); --volumes escluso di proposito.
  docker system prune -af 2>&1
  # Journald può crescere senza limiti di default
  sudo journalctl --vacuum-size=200M 2>&1
  NEW_PCT=$(df --output=pcent / | tail -1 | tr -dc '0-9')
  echo "$(date -u +%FT%TZ) dopo prune: disk=${NEW_PCT}%"
  if [ "$NEW_PCT" -ge 90 ]; then
    echo "$(date -u +%FT%TZ) CRITICO: disco ancora >=90% dopo prune — serve intervento manuale"
  fi
fi
