---
name: api-test
description: Testa tutti gli endpoint API Badge System in produzione (login, CRUD, CORS, RBAC) con un singolo comando
disable-model-invocation: true
---

# /api-test — Suite Test API Completa

Sostituisce i 150+ curl manuali ripetitivi. Esegue in ~15 secondi tutti i test
che prima richiedevano minuti di copia-incolla.

## Usage

```
/api-test                    # testa https://api.dataxiom.it (default)
/api-test local              # testa http://localhost:3000
/api-test http://custom:3000 # testa URL arbitrario
```

---

## Esecuzione

```bash
# Produzione (default)
bash scripts/test-api.sh

# Locale (backend dev)
bash scripts/test-api.sh http://localhost:3000

# URL custom
bash scripts/test-api.sh http://34.245.145.143:3000
```

Lo script si trova in `scripts/test-api.sh` e non richiede dipendenze oltre
`curl` e `python3` (già presenti sul sistema).

---

## Cosa testa

| # | Sezione | Test inclusi |
|---|---------|-------------|
| 1 | **Health** | GET /health, database connected |
| 2 | **Auth** | Login admin/manager/employee, credenziali errate → 401, no-token → 401 |
| 3 | **Employees** | Admin vede tutti, employee → 403 |
| 4 | **Checkins** | Manager vede tutto, employee vede solo propri |
| 5 | **Shifts** | Manager legge sito, employee legge my-schedule, employee → 403 su sito altrui |
| 6 | **Sites** | Admin vede lista siti |
| 7 | **Export CSV** | Manager scarica, employee → 403 |
| 8 | **Notifications** | Employee legge, mark-all-read |
| 9 | **CORS** | Preflight da dataxiom-badge.netlify.app → header presente |

**Account demo usati:**
- Admin: `pippo@badge.local / pippo01`
- Manager Torino: `pino@badge.local / pino01`
- Employee: `maria@badge.local / maria01`

---

## Interpretare i risultati

```
╔══════════════════════════════════════════════════════════╗
║       BADGE SYSTEM — API TEST SUITE                     ║
╚══════════════════════════════════════════════════════════╝
  API: https://api.dataxiom.it
  Data: 2026-06-07 14:32:01

▸ 1. HEALTH CHECK
  ✅ PASS  GET /health → HTTP 200
  ✅ PASS  Database: connected

▸ 2. AUTENTICAZIONE — Login demo accounts
  ✅ PASS  Login admin → token ricevuto
  ...
╔══════════════════════════════════════════════════════════╗
║  RISULTATI FINALI                                        ║
║  ✅ PASS: 22  ❌ FAIL: 0  ⚠️  WARN: 0                   ║
║  ✅ TUTTI I TEST PASSATI — API pronta per deploy         ║
╚══════════════════════════════════════════════════════════╝
```

**Exit code:**
- `0` — tutti i test passati → safe to deploy
- `1` — almeno un FAIL → NON deployare, diagnosi richiesta

---

## Diagnosi errori comuni

| Sintomo | Causa | Fix |
|---------|-------|-----|
| `API non raggiungibile (timeout)` | EC2 down o container crashato | SSH → `docker ps && docker logs badge-api --tail 30` |
| Login admin fallisce | JWT_SECRET mancante nel container | Verifica `docker inspect badge-api \| grep JWT` |
| CORS header mancante | `CORS_ORIGIN` env var non impostata | Riavvia container con `--env-file .env.production` |
| Shifts 404 | Site ID non trovato nel DB | Verifica seed data con `PGPASSWORD=... psql ...` |
| Employee vede dati altrui | RBAC rotto nel middleware | Controlla `backend/src/middleware/auth.js` |

---

## Quando usare

- **Prima di ogni `/deploy`** — conferma che l'API funziona prima di toccare il frontend
- **Dopo un riavvio container EC2** — verifica che tutto si sia ripreso
- **Dopo una migration DB** — controlla che nessun endpoint sia rotto
- **In debug CORS** — vedi subito se il header è presente o meno
- **Dopo aggiornamento dipendenze** — regressione check rapido
