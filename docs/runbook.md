# Badge System — Runbook Operativo

**Versione:** 1.0  
**Data:** 2026-06-10  
**Autore:** Diego Falletti  

Questo documento è la guida di riferimento per operazioni di manutenzione, incident response, e onboarding clienti. Leggere **sezione 1** prima di qualsiasi intervento.

---

## Indice

1. [Riferimenti rapidi](#1-riferimenti-rapidi)
2. [Restart container EC2](#2-restart-container-ec2)
3. [Deploy manuale / rollback immagine](#3-deploy-manuale--rollback-immagine)
4. [Diagnosi problemi comuni](#4-diagnosi-problemi-comuni)
5. [Rollback database (RDS point-in-time)](#5-rollback-database-rds-point-in-time)
6. [Onboarding nuovo cliente](#6-onboarding-nuovo-cliente)
7. [Credenziali e dove trovarle](#7-credenziali-e-dove-trovarle)
8. [Escalation e SLA informale](#8-escalation-e-sla-informale)

---

## 1. Riferimenti rapidi

| Risorsa | URL / Comando |
|---------|---------------|
| **API production** | https://api.dataxiom.it |
| **Web dashboard** | https://badge.dataxiom.it |
| **Health check** | https://api.dataxiom.it/health |
| **EC2 SSH** | `ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@34.245.145.143` |
| **EC2 IP** | 34.245.145.143 (eu-west-1b) |
| **RDS endpoint** | badge-system-db.cvs80y0my080.eu-west-1.rds.amazonaws.com |
| **ECR image** | 125579685235.dkr.ecr.eu-west-1.amazonaws.com/badge-system-backend:latest |
| **CloudWatch logs** | Log group `/badge/api` — stream `badge-api` (eu-west-1) |
| **GitHub repo** | https://github.com/falletti-diego/badge-system |
| **Netlify site ID** | 29a79b49-5571-4249-8c2b-d0813de4bf17 |

**Verifica stato sistema (30 secondi):**
```bash
curl -s https://api.dataxiom.it/health | python3 -m json.tool
```
Risposta attesa: `"status": "ok"`, `"database": "connected"`.

---

## 2. Restart container EC2

Usare quando: container crashato, API non risponde, health check in timeout.

```bash
# 1. Connetti via SSH
ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@34.245.145.143

# 2. Verifica stato container
docker ps -a --filter name=badge-system-api

# 3a. Container esiste → restart
docker restart badge-system-api

# 3b. Container non esiste o in stato "Exited" → avvia da immagine già scaricata
docker start badge-system-api

# 4. Monitora avvio (attendi "Server running on port 3000")
docker logs -f badge-system-api --tail 50

# 5. Verifica health
curl -s http://localhost:3000/health
```

**Tempo atteso per startup:** 10–30 secondi (include fetch SSM parameters).

Se il container si avvia ma crasha subito (exit code 1):
```bash
docker logs badge-system-api --tail 100 | grep -E "FATAL|ERROR|Missing"
```
Causa più comune: parametro SSM mancante o IAM role scaduta.

---

## 3. Deploy manuale / rollback immagine

### Deploy manuale (senza GitHub Actions)

Usare quando: CI/CD è bloccato ma serve deployare urgentemente.

```bash
ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@34.245.145.143

# Login ECR
aws ecr get-login-password --region eu-west-1 | \
  docker login --username AWS --password-stdin \
  125579685235.dkr.ecr.eu-west-1.amazonaws.com

# Pull ultima immagine
docker pull 125579685235.dkr.ecr.eu-west-1.amazonaws.com/badge-system-backend:latest

# Ferma container corrente
docker stop badge-system-api && docker rm badge-system-api

# Avvia nuovo container
docker run -d \
  --name badge-system-api \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  -e PORT=3000 \
  -e AWS_REGION=eu-west-1 \
  -e SSM_PARAM_PATH=/badge/production \
  --log-driver awslogs \
  --log-opt awslogs-region=eu-west-1 \
  --log-opt awslogs-group=/badge/api \
  --log-opt awslogs-stream=badge-api \
  125579685235.dkr.ecr.eu-west-1.amazonaws.com/badge-system-backend:latest

docker logs -f badge-system-api --tail 30
```

### Rollback a versione precedente

ECR mantiene le ultime N immagini. Trova il tag della versione precedente:

```bash
# Lista immagini disponibili su ECR (dalla macchina locale o EC2)
aws ecr describe-images \
  --repository-name badge-system-backend \
  --region eu-west-1 \
  --query 'sort_by(imageDetails, &imagePushedAt)[-5:].{tag:imageTags[0],pushed:imagePushedAt}' \
  --output table
```

Sostituisci `:latest` con il digest SHA o il tag desiderato nel comando `docker run`.

### Trigger deploy via GitHub Actions

Se vuoi forzare un re-deploy dell'immagine già in ECR senza push di codice:
```bash
gh workflow run "Deploy to EC2" --repo falletti-diego/badge-system
```

---

## 4. Diagnosi problemi comuni

### API risponde 502 / non raggiungibile

```bash
# 1. Verifica che il container giri
ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@34.245.145.143
docker ps --filter name=badge-system-api

# 2. Verifica porta 3000
sudo lsof -i :3000

# 3. Verifica nginx (proxy HTTPS → 3000)
sudo nginx -t
sudo systemctl status nginx
sudo systemctl restart nginx   # se necessario

# 4. Verifica certificato TLS (scade 2026-09-01, auto-renewal certbot)
sudo certbot certificates
```

### Database connection failed

```bash
# Dall'EC2, testa connessione RDS
docker exec badge-system-api \
  node -e "const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL}); p.query('SELECT NOW()').then(r=>console.log('✅',r.rows[0])).catch(e=>console.error('❌',e.message)).finally(()=>p.end())"

# Se fallisce: verifica security group RDS (porta 5432 da EC2 sg-08afbfd5f7c042313)
# AWS Console → RDS → badge-system-db → Connectivity → Security Groups
```

### Container si riavvia in loop (restart loop)

```bash
docker logs badge-system-api --tail 50
# Cerca: "FATAL", "Missing critical SSM parameters", "ECONNREFUSED"

# Verifica parametri SSM
aws ssm get-parameters-by-path \
  --path /badge/production \
  --with-decryption \
  --region eu-west-1 \
  --query 'Parameters[*].Name' \
  --output table
```

### Errori 5xx in produzione

Leggi i log strutturati su CloudWatch:
```bash
# Ultimi 100 errori 5xx
aws logs filter-log-events \
  --log-group-name /badge/api \
  --log-stream-name badge-api \
  --filter-pattern '{ $.res.statusCode >= 500 }' \
  --region eu-west-1 \
  --start-time $(date -d '1 hour ago' +%s000 2>/dev/null || date -v-1H +%s000) \
  --query 'events[*].message' \
  --output text | head -50
```

Oppure direttamente dall'EC2:
```bash
docker logs badge-system-api --since 1h 2>&1 | grep '"level":50'
```

---

## 5. Rollback database (RDS point-in-time)

> ⚠️ **Attenzione:** il ripristino crea una NUOVA istanza RDS. L'istanza corrente rimane attiva. Dopo il test, valuta se sostituire o eliminare.

**Prerequisito:** backup automatico attivo (retention 1 giorno, finestra 02:00–02:30 UTC).

### Procedura da AWS Console

1. Vai su **AWS Console → RDS → Databases → badge-system-db**
2. Clicca **Actions → Restore to point in time**
3. Imposta:
   - **Restore time:** scegli il timestamp desiderato (max 24h fa)
   - **DB instance identifier:** `badge-restore-YYYYMMDD` (mai sovrascrivere l'originale)
   - **Instance class:** db.t3.micro (stesso dell'originale)
   - **VPC / Subnet group / Security group:** stessi dell'istanza originale
4. Clicca **Restore DB instance** — attendi ~10 minuti
5. Verifica i dati sulla nuova istanza prima di qualsiasi switch

### Procedura da CLI

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier badge-system-db \
  --target-db-instance-identifier badge-restore-$(date +%Y%m%d) \
  --restore-time "2026-06-10T02:00:00Z" \
  --db-instance-class db.t3.micro \
  --region eu-west-1
```

### Switch traffico alla nuova istanza (se necessario)

1. Aggiorna il parametro SSM `DB_HOST` con il nuovo endpoint:
   ```bash
   aws ssm put-parameter \
     --name /badge/production/DB_HOST \
     --value "badge-restore-YYYYMMDD.XXXX.eu-west-1.rds.amazonaws.com" \
     --type String \
     --overwrite \
     --region eu-west-1
   ```
2. Restart container: `docker restart badge-system-api`
3. Verifica health: `curl https://api.dataxiom.it/health`

---

## 6. Onboarding nuovo cliente

Eseguire in questo ordine esatto. Ogni step dipende dal precedente.

### Step 1 — Crea il client nel DB

Dalla dashboard admin (`https://badge.dataxiom.it/admin`), login come `pippo@badge.local`:

1. Tab **Clienti** → **Aggiungi Cliente**
2. Compila: Nome azienda, email di contatto, piano (`standard`)
3. Salva → copia il **Client ID** (UUID) che appare nella tabella

### Step 2 — Crea le sedi (una per sede fisica)

1. Tab **Sedi** → **Aggiungi Sede**
2. Per ogni sede: Nome (es. "Torino Store"), Client ID, indirizzo
3. Salva → il QR code viene generato automaticamente

### Step 3 — Scarica i QR code

1. Tab **Sedi** → clicca **Scarica QR** per ogni sede
2. Stampa il QR in formato A5 o A4, plastificalo e appendi vicino all'ingresso del negozio

### Step 4 — Importa dipendenti via CSV

Prepara il file CSV con intestazione:
```
email,name,phone,role,site_name
mario.rossi@azienda.it,Mario Rossi,3391234567,employee,Torino Store
anna.bianchi@azienda.it,Anna Bianchi,3391234568,manager,Torino Store
```

- `role`: `employee` o `manager`
- `site_name`: deve corrispondere esattamente al nome della sede creata al Step 2
- Max 500 righe per import

1. Tab **Dipendenti** → **Importa CSV**
2. Seleziona il file e il Client ID
3. Controlla il report: righe create / skippate / errori
4. Per ogni dipendente creato, la password temporanea viene mostrata nel report — **copiarla subito** (non viene memorizzata)

### Step 5 — Invia email di benvenuto

Usa il template in `scripts/welcome-email-template.html`:
1. Aprilo nel browser, personalizza con nome cliente e credenziali
2. Invia via email normale (Gmail, Outlook, ecc.)
3. Il template include: link alla dashboard, istruzioni download app, credenziali di accesso, riferimento supporto

### Step 6 — Verifica funzionamento

```bash
# Verifica che il nuovo cliente sia nel DB
curl -s https://api.dataxiom.it/health | python3 -m json.tool

# Login con un dipendente del nuovo cliente
curl -s -X POST https://api.dataxiom.it/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"mario.rossi@azienda.it","password":"<temp_password>"}' \
  | python3 -m json.tool
```

---

## 7. Credenziali e dove trovarle

> ⚠️ Le credenziali **non sono** in questo documento. Sono in AWS SSM Parameter Store.

### Parametri SSM (path: `/badge/production/`)

```bash
# Lista tutti i parametri (senza valori)
aws ssm get-parameters-by-path \
  --path /badge/production \
  --region eu-west-1 \
  --query 'Parameters[*].Name' \
  --output table

# Leggi un parametro specifico
aws ssm get-parameter \
  --name /badge/production/DB_PASSWORD \
  --with-decryption \
  --region eu-west-1 \
  --query 'Parameter.Value' \
  --output text
```

| Parametro SSM | Descrizione |
|---------------|-------------|
| `/badge/production/DB_HOST` | RDS endpoint |
| `/badge/production/DB_PASSWORD` | Password PostgreSQL |
| `/badge/production/DB_NAME` | Nome database (`badge_system`) |
| `/badge/production/DB_USER` | Utente DB (`postgres`) |
| `/badge/production/JWT_PRIVATE_KEY` | Chiave privata RS256 per firma token |
| `/badge/production/JWT_PUBLIC_KEY` | Chiave pubblica RS256 per verifica token |
| `/badge/production/CORS_ORIGIN` | Origini CORS permesse |
| `/badge/production/DEMO_*_PASSWORD` | Password account demo |

### Accesso AWS Console

- Account: https://aws.amazon.com/console/
- Regione: eu-west-1 (Ireland)
- IAM user per CI/CD: vedere `aws_iam_github_actions.md` in project memory

### SSH EC2

- Key file: `~/.ssh/badge-system-ec2-v2.pem`
- Se la chiave è persa: vai su **AWS Console → EC2 → Key Pairs** e crea una nuova keypair, poi aggiorna il secret `EC2_SSH_KEY` su GitHub Actions

---

## 8. Escalation e SLA informale

### Orari di supporto

| Giorno | Orario | Risposta |
|--------|--------|----------|
| Lunedì–Venerdì | 09:00–18:00 CET | Entro 4 ore |
| Sabato | 10:00–14:00 CET | Entro 8 ore |
| Domenica / Festivi | — | Next business day |

### Severity e tempi di risposta

| Severity | Definizione | Target risoluzione |
|----------|-------------|-------------------|
| **CRITICO** | API non risponde, 0 check-in possibili, tutti gli utenti bloccati | 2 ore |
| **ALTO** | Feature principale rotta (es. QR scan), ma workaround disponibile | 8 ore |
| **MEDIO** | Feature secondaria rotta (es. export CSV), nessun impatto su check-in | 24 ore |
| **BASSO** | Bug UI, lentezza, problema non bloccante | 72 ore |

### Manutenzione programmata

- Finestra: **domenica 02:00–04:00 UTC** (04:00–06:00 CET)
- Notifica al cliente: almeno 48 ore prima via email
- Durante la finestra: deploy, migrazioni DB, aggiornamenti certificati

### Contatti

| Ruolo | Contatto |
|-------|---------|
| **Supporto tecnico** | Diego Falletti — falletti.diego2533@gmail.com |
| **Emergenze** | Stesso contatto — indicare URGENTE nell'oggetto |

---

*Ultima modifica: 2026-06-10*
