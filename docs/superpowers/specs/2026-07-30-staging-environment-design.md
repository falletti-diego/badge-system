# Ambiente di Staging — Design

**Data:** 30 Luglio 2026
**Sessione:** 89
**Decisione originaria:** Session 45 (2026-06-20) — staging dichiarato obbligatorio prima del primo cliente reale, mai implementato
**Verifica costi:** Session 89 — ~€16-24/mese (AWS Pricing API eu-west-1, vedi `TASKS.md` sezione STAGING)

---

## Contesto

Il Badge System ha un solo ambiente oltre allo sviluppo locale: la produzione (`api.dataxiom.it` + `badge.dataxiom.it`). Ogni modifica backend che supera i test unitari (mockati) viene deployata direttamente in produzione tramite push su `main`. Session 45 ha documentato una cascata di 4 bug di integrazione consecutivi, tutti invisibili ai test unitari e scoperti solo in produzione — motivo per cui lo staging fu dichiarato **obbligatorio prima di un cliente reale pagante**, ma rimandato per l'MVP demo interno.

Con l'onboarding self-service, SES fuori sandbox e il fix del redirect post-login tutti chiusi in questa stessa sessione, l'MVP è ora tecnicamente pronto per un primo cliente — lo staging resta l'ultimo gap tecnico bloccante dichiarato.

Il branch `develop` esiste già su GitHub ma è fermo al commit iniziale del progetto (752 commit indietro rispetto a `main`) — di fatto mai usato.

## Decisioni (via `/grilling`, 6 domande)

1. **Dominio API staging:** `staging-api.dataxiom.it` (simmetrico a `api.dataxiom.it`)
2. **Topologia:** EC2 dedicata separata (non un container aggiuntivo sulla EC2 di produzione) — isolamento completo, nessun rischio che un deploy/test di staging impatti le risorse della produzione
3. **`NODE_ENV` nel container di staging:** `production` (non `staging`) — per comportamento runtime identico alla produzione, incluso SSL su RDS (`backend/src/db/pool.js:36` abilita SSL solo se `NODE_ENV === 'production'`); la sola differenza tra i due ambienti è quali credenziali/dati usano (`SSM_PARAM_PATH=/badge/staging`), non il codice eseguito
4. **Frontend staging:** nuovo sito Netlify dedicato con **auto-deploy su push a `develop`** — deviazione intenzionale dalla policy di produzione ("mai `git push` come trigger, sempre `netlify deploy --prod` esplicito"), perché lo staging esiste apposta per essere un bersaglio sicuro di deploy automatici
5. **Branch `develop`:** resettato per allinearsi a `main` ora (`git push --force-with-lease origin main:develop`), ripartendo da uno stato pulito e coerente col codice attuale
6. **Gate CI (STG.5 originario):** **nessun gate PR bloccante** per ora — lo smoke test gira automaticamente dopo ogni deploy su staging e riporta pass/fail, senza bloccare nulla. In 89 sessioni di lavoro non è mai stata usata una Pull Request (sempre push diretto su `main`); introdurre un gate PR obbligatorio sarebbe un cambio di processo più ampio del semplice "aggiungere staging", rimandato a un'eventuale futura decisione esplicita.

## Verifica tecnica preliminare (fatta durante l'esplorazione, non una decisione da discutere)

- **DNS:** `dataxiom.it` è gestito su **register.it**, non Route53/AWS — il record A per `staging-api.dataxiom.it` va creato manualmente nel pannello del registrar, non è scriptabile via CLI AWS
- **IAM esistente:** il ruolo EC2 di produzione (`badge-system-ec2-ecr-role`) ha una policy `BadgeSSMReadProduction` scoped esplicitamente a `/badge/production/*` — un nuovo ruolo per staging è necessario, non un allargamento del ruolo esistente
- **`entrypoint.sh`** è già completamente parametrico su `SSM_PARAM_PATH` (default `/badge/production`, override via env var `-e SSM_PARAM_PATH=/badge/staging`) — nessuna modifica al codice esistente richiesta, solo un valore diverso nel `docker run` del nuovo workflow
- **nginx/TLS produzione**: pattern già stabilito (redirect 80→443, Let's Encrypt, reverse proxy su `localhost:3000`, CORS gestito da Express non da nginx) — replicabile identico per staging cambiando solo `server_name`

## Architettura

```
push a develop
      │
      ▼
┌─────────────────────────┐        ┌──────────────────────────┐
│ GitHub Actions           │        │ Netlify (sito staging)    │
│ deploy-staging.yml       │        │ auto-deploy su push        │
│  1. lint+test (riuso)    │        │ develop → staging URL      │
│  2. build+push ECR       │        └──────────────────────────┘
│     tag :staging-latest  │
│  3. SSH deploy EC2 staging│
│  4. smoke test E2E        │
└───────────┬──────────────┘
            │ docker run -e SSM_PARAM_PATH=/badge/staging
            ▼
┌─────────────────────────────┐      ┌───────────────────────────┐
│ EC2 badge-system-api-staging │──────│ RDS badge-system-db-staging│
│ nginx+LE: staging-api.       │      │ db.t3.micro, Single-AZ     │
│ dataxiom.it → :3000          │      └───────────────────────────┘
│ IAM role scoped a            │
│ /badge/staging/* soltanto    │
└───────────────────────────────┘
```

## Componenti

- **`badge-system-ec2-staging-role`** (nuovo ruolo IAM) — stesse policy attached della prod (`CloudWatchAgentServerPolicy`, `AmazonSSMManagedInstanceCore`, `AmazonEC2ContainerRegistryReadOnly`) + una policy inline `BadgeSSMReadStaging` scoped a `arn:aws:ssm:eu-west-1:125579685235:parameter/badge/staging/*` (mai `/badge/production/*`)
- **EC2 `badge-system-api-staging`** — `t3.micro`, stessa AMI/Docker della prod, security group che apre solo 22 (SSH, IP ristretto)/80/443
- **RDS `badge-system-db-staging`** — `db.t3.micro`, Single-AZ, 20GB gp2, security group che accetta solo dalla EC2 staging
- **SSM `/badge/staging/*`** — 30 parametri replicati 1:1 dai nomi di `/badge/production/*` (stessa struttura, valori distinti: nuova `DB_HOST`/`DB_PASSWORD`, nuove `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` generate ex-novo — un token emesso da staging non deve mai essere valido contro la produzione)
- **`.github/workflows/deploy-staging.yml`** (nuovo) — trigger su push `develop` con path `backend/**`, ricalca `ecr-push.yml` (lint+test+build+push, tag `:staging-latest` invece di `:latest`) poi `deploy-to-ec2.yml` (SSH deploy, ma su host/secrets di staging, `SSM_PARAM_PATH=/badge/staging`), poi un job aggiuntivo `smoke-test` che esegue lo script E2E
- **`scripts/smoke-test-staging.sh`** (nuovo) — bash+curl, esegue il golden path: login Maria→richiesta ferie→logout, login Diego→approva ferie→logout, login Maria→verifica ferie in "I Miei Turni"→logout, login Diego→verifica planning mostra 🏖️ Ferie→logout. Usa gli utenti demo `@badge.local` già seedati da `demoSeed.js` (nessun dato nuovo da creare)
- **nginx + certbot su EC2 staging** — config identica al pattern di produzione, `server_name staging-api.dataxiom.it`
- **Sito Netlify staging** (nuovo) — collegato al branch `develop`, auto-deploy su push, env var `VITE_API_URL=https://staging-api.dataxiom.it`
- **`docs/runbook.md`** — nuova sezione "Staging" che documenta il flusso "push develop → deploy automatico → smoke test → se OK, quando pronto cherry-pick/merge in main"

## Data flow

1. Sviluppatore pusha su `develop` (o merge da un branch di lavoro)
2. `deploy-staging.yml` si attiva (stesso trigger-path pattern di `ecr-push.yml`, ma branch `develop`)
3. Job `lint-and-test`: identico a produzione (riuso della stessa configurazione test)
4. Job `build-and-push`: builda l'immagine Docker (stesso `Dockerfile`), la tagga `:staging-latest` e la pusha sullo stesso repository ECR `badge-system-backend` (nessun repository ECR duplicato — i tag distinguono gli ambienti)
5. Job `deploy`: SSH sulla EC2 staging, pull `:staging-latest`, `docker run` con `-e SSM_PARAM_PATH=/badge/staging` — l'`entrypoint.sh` esistente fa il resto (fetch SSM, scrive `/etc/badge/.env`, migration, avvio)
6. Job `smoke-test`: attende health check, poi esegue `scripts/smoke-test-staging.sh` contro `https://staging-api.dataxiom.it`
7. In parallelo, Netlify rileva il push su `develop` e builda/deploya il frontend sul sito staging

## Gestione errori

- **Deploy staging fallito**: nessun impatto sulla produzione — host, RDS, IAM e ECR tag completamente separati. Il workflow termina con `exit 1`, visibile solo in GitHub Actions
- **Smoke test fallito**: il job termina con `exit 1` e stampa quale step del golden path è fallito (status HTTP + risposta) — nessun blocco automatico su `main` o altri branch (per la decisione #6 sopra), è puramente informativo in questa fase
- **SSM staging con parametri mancanti**: `entrypoint.sh` esistente già fail-fast (`CRITICAL_VARS` check) — comportamento riusato identico, nessuna modifica
- **Certificato Let's Encrypt**: rinnovo automatico via `certbot renew` + cron (stesso pattern, se già presente, della produzione — da verificare/replicare durante l'implementazione)

## Testing (di questo piano, non del prodotto)

Ogni task del piano di implementazione (Fase 3) chiude con una verifica concreta ed eseguibile — non un "dovrebbe funzionare": provisioning verificato con describe-instances/describe-db-instances, DNS verificato con `dig`, TLS verificato con `curl -v`, SSM verificato con `get-parameters-by-path`, deploy verificato con `/health` 200, smoke test verificato sia in caso di successo (golden path reale) sia in caso di fallimento indotto deliberatamente (es. credenziale demo sbagliata) per confermare che il gate segnali davvero un problema e non passi sempre per costruzione.

## Fuori perimetro (esplicito)

- **Nessun gate PR bloccante** (vedi decisione #6) — resta un'evoluzione futura
- **Nessuna Multi-AZ per RDS staging** — Single-AZ è sufficiente per un ambiente di verifica, non serve l'alta disponibilità che avrebbe senso solo in produzione
- **Nessuna migrazione della `develop` esistente** — viene resettata da zero (decisione #5), non c'è storia da preservare (752 commit indietro, mai realmente usata)
- **Nessuna modifica al flusso di produzione esistente** (`ecr-push.yml`/`deploy-to-ec2.yml` restano invariati) — lo staging è additivo, non sostitutivo
