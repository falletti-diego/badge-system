# Runbook operativo — Badge System

**Creato:** 2026-11-15 (punto 3 della review: resilienza operativa)
**Infra:** EC2 `i-033bb0cc6ad03f88f` (badge-system-api, t3.micro, eu-west-1) · RDS `badge-system-db` (PG 16.15, 20GB, retention backup 7 giorni) · RDS `badge-system-db-staging` (PG 14, retention 1 giorno)

---

## Monitoring attivo (cosa suona e dove)

| Controllo | Meccanismo | Notifica |
|---|---|---|
| API + dashboard giù, cert TLS in scadenza | `.github/workflows/uptime-check.yml` ogni 15 min | Email GitHub Actions su run fallito |
| EC2 status check fallito | CloudWatch `badge-ec2-status-check-failed` | SNS `badge-system-alerts` → email |
| CPU EC2 >90% per 15 min | CloudWatch `badge-ec2-cpu-high` | SNS → email |
| Spazio libero RDS <2GB | CloudWatch `badge-rds-storage-low` | SNS → email |
| Disco EC2 pieno | `/home/ubuntu/ops/ec2-disk-guard.sh` ogni 30 min (cron): auto-prune a ≥75% | Self-healing; log in `/var/log/badge-disk-guard.log` |

⚠️ L'iscrizione email al topic SNS va **confermata una volta** (email "AWS Notification - Subscription Confirmation"). Verificare:
`aws sns list-subscriptions-by-topic --region eu-west-1 --topic-arn arn:aws:sns:eu-west-1:125579685235:badge-system-alerts`

## Difese sul disco EC2 (incidente Session 123: disco pieno → backend giù)

1. Prune al deploy (`deploy-to-ec2.yml`, Session 124)
2. `ec2-disk-guard.sh` ogni 30 min: log disco/RAM, `docker system prune -af` + vacuum journald a ≥75% (sorgente versionata: `infrastructure/ec2-disk-guard.sh`)
3. Prune completo settimanale (cron domenica 04:00)

## Memoria EC2 (crash-loop OOM: Session 89 e precedenti)

t3.micro, 909MB RAM. Dal 2026-11-15 c'è **1GB di swapfile** (`/swapfile`, persistente in fstab, `vm.swappiness=10`): un picco di memoria rallenta invece di uccidere il container. Se `swapon --show` mostra uso di swap costante (non solo picchi), è il segnale per passare a t3.small.

---

## Restore RDS — procedura (DA TESTARE, vedi sotto)

Il backup automatico (retention 7 giorni, point-in-time recovery) **non è mai stato ripristinato in prova**. Un backup mai testato non è garanzia. Procedura di test (costo: ~1-2h di una seconda db.t3.micro, pochi centesimi):

```bash
# 1. Restore point-in-time su NUOVA istanza (non tocca la produzione)
aws rds restore-db-instance-to-point-in-time --region eu-west-1 \
  --source-db-instance-identifier badge-system-db \
  --target-db-instance-identifier badge-system-db-restore-test \
  --restore-time "$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)" \
  --db-instance-class db.t3.micro --no-multi-az

# 2. Attendere 'available' (10-20 min)
aws rds wait db-instance-available --region eu-west-1 \
  --db-instance-identifier badge-system-db-restore-test

# 3. Verifica integrità: connettersi (stesse credenziali della prod,
#    endpoint nuovo) e controllare le tabelle chiave
#    SELECT COUNT(*) FROM checkins; SELECT MAX(applied_at) FROM schema_migrations;

# 4. ELIMINARE l'istanza di test (altrimenti resta a pagamento!)
aws rds delete-db-instance --region eu-west-1 \
  --db-instance-identifier badge-system-db-restore-test \
  --skip-final-snapshot
```

In caso di disastro reale: stessa procedura, poi puntare `DB_HOST` del backend al nuovo endpoint (SSM `/badge/production` + restart container) o rinominare le istanze.

**TODO (da pianificare):** eseguire il test di restore una volta, annotare qui data ed esito, poi ripeterlo ~ogni 6 mesi.

## Comandi rapidi di diagnosi

```bash
# Stato container + salute API dall'EC2
ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@<IP-EC2> \
  'docker ps; curl -s localhost:3000/health; df -h /; free -m; tail -5 /var/log/badge-disk-guard.log'

# IP attuale dell'istanza (cambia a ogni stop/start)
aws ec2 describe-instances --region eu-west-1 --instance-ids i-033bb0cc6ad03f88f \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text

# Allarmi in stato ALARM
aws cloudwatch describe-alarms --region eu-west-1 --state-value ALARM \
  --query 'MetricAlarms[*].AlarmName'
```

## Lacune note (accettate per ora)

- **Niente metriche disco/RAM in CloudWatch**: servirebbe il CloudWatch agent (~50-100MB di RAM su una macchina che ne ha 909) o `cloudwatch:PutMetricData` sulle credenziali dell'host. Mitigato dal disk-guard self-healing + uptime check esterno.
- **Singola istanza EC2**: un guasto hardware = downtime fino a restore manuale. Accettabile a zero clienti; da rivedere al primo cliente pagante.
