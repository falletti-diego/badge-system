# Badge System — Session 81 Handoff

**Date:** 2026-07-25
**Session:** 81 — Task B6 (Offline Mode su device reale) proseguito: Sezioni 3-8 testate, 5 bug reali + 1 feature, Build 33 pronta per il retest finale
**Status:** 🟡 **Task B6 QUASI CONCLUSO.** Build 33 pushata su Codemagic ma non ancora lanciata/testata dall'utente. Checklist `docs/offline-mode-test-checklist.md` — Sezioni 1-8 testate almeno una volta, tutti i bug trovati finora fixati e (dove backend) verificati live; serve un ultimo giro di retest completo sulla build 33.

---

## Goal

Completare la verifica su iPhone reale del codice Offline Mode (Fase A backend + Fase B mobile, Session 78-79), riprendendo da dove la Session 80 si era interrotta a metà Sezione 3 di `docs/superpowers/plans/2026-07-19-offline-mode.md`.

---

## Current Progress

**Falso allarme iniziale**: login `maria@badge.local` sembrava rotto (messaggio generico "Email o password non corretti"). Verificato via `curl` diretto su `api.dataxiom.it` che le credenziali erano valide — il messaggio generico scatta solo per un errore di rete/timeout, non per un vero rifiuto delle credenziali (che avrebbe un testo diverso). Causa reale: telefono ancora in modalità aereo dai test della sera prima. Nessun fix, confermato dall'utente.

**Sezioni 3-6**: retest pulito, nessun bug (Sezione 3 ri-verificata su Build 30 con i 3 fix della Session 80; Sezioni 4-6 mai testate prima, tutte OK).

**Sezione 7 (device condiviso)** — usato `pino@badge.local` (manager, stesso sito di Maria — Torino) al posto di un tenant demo isolato. **3 bug trovati**:
1. `pino` non aveva mai `employee_id` nel fixture `DEMO_USERS` → ogni QR scan falliva con "Employee ID non trovato" (bug indipendente dall'offline mode, mai esercitato prima). Fix in `demo-users.js`.
2. Anche con `employee_id` corretto, `pino` non era in `assigned_sites` per Torino (solo `site_id` era stato sistemato da una migration precedente, mai `assigned_sites`) — `POST /checkins` richiede entrambi. Fix: migration `033_add_torino_to_pino_assigned_sites.sql`.
3. Dopo il re-login di Maria con la timbratura ancora in coda (step 7.6), il sync non partiva finché non si toccava manualmente la rete — `flushQueue()` non scatta mai al login stesso, solo su avvio app/riconnessione rete/foreground. Fix: `LoginScreen.jsx` chiama `flushQueue()` dopo un login riuscito.

**Sezione 8 (cache turni/presenze)** — 1 bug: banner "Sei offline" mai visibile su "I Miei Turni". Causa: `MyScheduleScreen.jsx` usava `useEffect([month,year])` invece di `useFocusEffect` (a differenza di `MyPresencesScreen.jsx`, dove funzionava) — le schermate in un `Tab.Navigator` restano montate tra i cambi tab, quindi tornare sul tab senza cambiare mese non rifaceva mai la fetch. Fix: allineato a `useFocusEffect`.

**Feature richiesta dall'utente**: dopo un kill completo dell'app, l'ultimo utente restava loggato — inaccettabile su un device condiviso in negozio. Fix: `RootNavigator.jsx` cancella token/refresh/user/cache a ogni mount (segnale affidabile di kill+riapertura, mai di background/foreground) e forza sempre Login. La coda offline resta intatta (deve sopravvivere al kill).

**Bug infra scoperto verificando il fix 2** (regola CLAUDE.md: ri-verificare dopo modifiche a schema/FK): `scripts/run-migrations.js` non caricava mai la configurazione ambiente → falliva sempre con `ECONNREFUSED` in produzione. Causa profonda: la produzione inietta i segreti via AWS SSM attraverso `entrypoint.sh`, che scrive `/etc/badge/.env` e lo sorgente SOLO nel processo di boot originale — invisibile a un `docker exec` successivo. Fix in due passi: `run-migrations.js` ora richiede `config-loader.js`; `config-loader.js` ora carica anche `/etc/badge/.env` se presente. Effetto collaterale positivo: sblocca ogni futura migration manuale in produzione, non solo la 033.

**Ostacolo**: deploy fallito una volta per disco EC2 pieno (99%, accumulo immagini Docker vecchie). Pulito con `docker system prune -af` (autorizzato esplicitamente dall'utente) — liberati 5GB, disco al 17%. Deploy poi riuscito.

**Verifica finale**: migration 033 confermata applicata e verificata con una query diretta in produzione — `assigned_sites` di Pino contiene correttamente Torino.

---

## What Worked

- **Verificare ogni fix con una prova diretta, mai dichiararlo "fatto" per ipotesi** — sia per i bug mobile (letture di codice mirate, confronto diretto con il pattern già funzionante in `MyPresencesScreen.jsx`) sia per i bug backend (curl diretto su produzione, query dirette via `docker exec`, log di CI/deploy). Questo ha catturato il bug 2 di Sezione 7 (assigned_sites) PRIMA che l'utente lo trovasse testando — e il bug infra di `run-migrations.js` prima di dare per buono un fix a metà.
- **Non fermarsi al primo fix "plausibile"**: il fix dell'`employee_id` di Pino sembrava sufficiente, ma rileggere l'intero percorso `checkins.js` (invece di fermarsi dopo il primo errore risolto) ha rivelato il secondo blocco (`assigned_sites`) prima del retest sul device.
- **Chiedere conferma quando il sintomo poteva avere due spiegazioni diverse** (AskUserQuestion): il "falso allarme" del login di Maria si è risolto in un turno chiedendo se il telefono fosse ancora in modalità aereo, invece di investigare codice che non aveva nulla che non andasse.

## What Didn't Work / Lezioni

- **I comandi SSH verso produzione sono stati bloccati dal classificatore di sicurezza della sessione**, anche per letture innocue (`df -h`, `which psql`) — serve l'autorizzazione esplicita dell'utente per ogni azione diretta su EC2/RDS in questo ambiente, anche quando è chiaramente nell'interesse del task.
- **`docker exec` NON eredita l'ambiente di runtime del container** (né le var passate a `docker run --env-file`, né quelle esportate a runtime da un altro processo tipo l'entrypoint) — solo le var backate nell'immagine (`Config.Env`) o quelle passate esplicitamente. Questo ha causato diversi tentativi falliti (`/proc/1/environ` → permission denied; `docker inspect --env-file` → vars non presenti perché mai OS-level) prima di arrivare alla causa vera: i segreti di produzione vivono SOLO in un file (`/etc/badge/.env`) scritto da un bootstrap SSM, non nell'ambiente del container.
- **Un fix che funziona in locale non garantisce che funzioni in produzione se i due ambienti caricano la configurazione in modo diverso** — il primo fix a `run-migrations.js` (richiedere `config-loader`) è stato verificato e dichiarato "corretto" solo dopo un test locale; si è rivelato insufficiente in produzione, dove lo schema di provisioning segreti è completamente diverso (SSM + file generato a runtime, non un file statico nell'immagine).

---

## Next Steps

1. **Lanciare la Build 33 su Codemagic** e installarla sul device (sostituisce la Build 30-32 già testate parzialmente).
2. **Retest completo Sezione 7** (device condiviso): Pino ora sbloccato a entrambi i livelli (employee_id + assigned_sites) — verificare l'intero flusso 7.1-7.7 end-to-end su Pino reale, non solo i due bug già trovati.
3. **Retest Sezione 8** (cache turni/presenze): verificare che il banner "Sei offline" appaia correttamente su "I Miei Turni" al rientro sul tab, e che il comportamento sui mesi non in cache resti quello atteso (8.4).
4. **Nota operativa per Sezione 4** (persistenza coda dopo kill): con la nuova feature di login forzato, dopo il kill+riapertura serve un re-login PRIMA di poter controllare che il contatore mostri ancora le timbrature in coda — la coda stessa non è toccata dal fix, solo la sessione.
5. **Solo dopo che TUTTE le sezioni passano sulla Build 33**: chiudere Task B6 in TASKS.md/PROJECT_DECISIONS.md/HANDOFF.md, poi valutare il claim marketing "Mai persa una timbratura" (subordinato all'ok esplicito dell'utente).
6. Backlog invariato: SES fuori Sandbox (unico bloccante commerciale reale), staging ambiente (obbligatorio solo prima del primo cliente pagante), CI `Security Check` rosso pre-esistente (3 vulnerabilità npm high, non affrontato).

---

## Dove sono le cose

- **Checklist di test in corso**: `docs/offline-mode-test-checklist.md` — Sezioni 1-8 testate almeno una volta, retest finale su Build 33 in sospeso
- **Piano Offline Mode**: `docs/superpowers/plans/2026-07-19-offline-mode.md` (Fase A ✅, Fase B ✅ codice, Task B6 quasi concluso)
- **File mobile corretti in questa sessione**: `frontend-mobile/src/screens/auth/LoginScreen.jsx` (flush dopo login), `frontend-mobile/src/screens/schedule/MyScheduleScreen.jsx` (useFocusEffect), `frontend-mobile/src/navigation/RootNavigator.jsx` (login forzato dopo kill)
- **File backend/infra corretti in questa sessione**: `backend/src/__fixtures__/demo-users.js` (employee_id Pino), `backend/migrations/033_add_torino_to_pino_assigned_sites.sql` (nuova, applicata e verificata live), `backend/scripts/run-migrations.js` + `backend/src/config-loader.js` (bootstrap SSM in produzione)
- **buildNumber attuale**: 33 (`frontend-mobile/app.json`) — NON ancora lanciata su Codemagic dall'utente
- **Commit range Session 81**: `9397354` → `3b7cbc6` (6 commit: fix Pino employee_id+flush, fix banner turni, feature login-forzato, migration assigned_sites, fix run-migrations.js, fix config-loader.js)

## Note operative

- Deploy landing: SEMPRE `--site a31a2216-fb06-47e0-b632-a1193a88039a` · Deploy badge frontend: `--site 29a79b49-...` · Backend: automatico su push `main` (`backend/**`) · **Mobile: build via Codemagic (workflow `badge-ios-testflight`), trigger manuale dall'utente sulla dashboard Codemagic dopo un push**
- **Credenziali test mobile**: `maria@badge.local` / `maria01` (employee, Torino) · `pino@badge.local` / [password nota all'utente, non salvata qui] (manager, Torino — ora abilitato al check-in QR)
- **Migration manuali in produzione**: ora funzionano con il comando standard, senza trucchi — `ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@34.245.145.143` poi `docker exec badge-system-api npm run migrations` (il bug che lo impediva è stato fixato in questa sessione)
- **Se il disco EC2 si riempie di nuovo** (deploy frequenti accumulano immagini Docker vecchie): `docker system prune -af` sull'istanza, sicuro (non tocca dati/volumi), libera diversi GB
- **RDS non raggiungibile dal locale** (security group VPC-only) — solo via SSH+docker exec da EC2
- **I comandi SSH/EC2 possono essere bloccati dal classificatore di sicurezza della sessione** anche per letture innocue — se serve un'azione diretta su produzione, potrebbe servire l'autorizzazione esplicita dell'utente
- TestFlight Build (numerazione corrente) scade **2026-09-08** — reminder rinnovo **2026-08-25**.
