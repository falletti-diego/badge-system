# Badge System — Session 79 Handoff

**Date:** 2026-07-23
**Session:** 79 — Offline Mode Fase B (mobile) implementata via `/superpowers:subagent-driven-development`, code-reviewata con 2 giri di fix
**Status:** ✅ **Fase B completa lato codice, testata (43/43), pushata.** ⏳ Non ancora buildata/verificata su device reale (Task B6 — richiede iPhone fisico + autorizzazione utente per l'EAS build).

---

## Goal

Implementare la Fase B (mobile) del piano Offline Mode: coda offline persistente per le timbrature, sync automatico al ritorno della rete, UI "in attesa di rete", cache read-only per turni/presenze. Prosegue dalla Session 78 (Fase A backend, già live in produzione).

---

## Current Progress

Eseguita con `/superpowers:subagent-driven-development` (su richiesta esplicita dell'utente): un subagent implementer per task, ciascuno verificato indipendentemente dal coordinatore (rilettura diretta del diff/commit, mai fiducia cieca nel solo report del subagent) prima di passare al task successivo.

- **B1** — `STORAGE_KEYS`/`OFFLINE_CONFIG` in `endpoints.js` + dipendenza `expo-crypto` (aggiunta — il piano assumeva erroneamente fosse già presente).
- **B2** (TDD, 14→18 test) — `offlineQueue.js`: coda persistente in AsyncStorage, flush sequenziale mutex-guarded, dedup-aware (`deduplicated:true` conta come successo), FIFO.
- **B3** — listener `NetInfo`/`AppState` in `RootNavigator.jsx` (useRef guard, stesso pattern del fix duplicati "Build 7").
- **B4** — `QRScannerScreen` genera sempre `client_uuid`+`occurred_at` prima del POST; su errore di rete/timeout mette in coda e naviga a un `SuccessScreen` variante "pending"; su errore applicativo comportamento invariato (mai messo in coda). Contatore "N in attesa" in `CheckInScreen`.
- **B5** — cache read-only (`AsyncStorage`) per turni/presenze, banner "Sei offline — dati aggiornati al..." su `MyScheduleScreen`/`MyPresencesScreen` quando il GET fallisce per rete e una cache compatibile esiste.

**`/test-all`**: backend 610/610, frontend-web 239/240 (1 skip pre-esistente), mobile 39/39 → 43/43 (dopo i fix del code-review).

**`/code-review`** (medium effort, 8 finder-agent + verifica) — **primo giro**, 3 problemi trovati e corretti (commit `0cde2eb`):
1. Leak cache cross-utente: `authService.logout()` non ripuliva `CACHE_SHIFTS`/`CACHE_PRESENCES`.
2. `flushQueue` persisteva la coda una sola volta a fine ciclo (non incrementale) — rischio re-invio su kill app a metà flush.
3. `flushQueue` poteva propagare un'eccezione inattesa come promise rejection non gestita (chiamata fire-and-forget da `RootNavigator`).

**Secondo giro — security review automatico POST-COMMIT** (non dal code-review iniziale, scattato dopo il push): il fix #1 sopra non bastava. La coda offline (deliberatamente non ripulita al logout — le timbrature restano di chi le ha create) non era **scoped per utente**. Su un device condiviso tra dipendenti (scenario comune nel retail, il caso d'uso primario del prodotto), se l'employee B faceva scattare un flush con timbrature dell'employee A ancora in coda, il backend le avrebbe rifiutate con `403` (ownership check, Fase A) e `flushQueue` le marcava `failed` **permanentemente** — perdendo la timbratura reale di A. Vanificava esattamente "mai persa una timbratura". **Fix**: `flushQueue` ora tenta solo gli item dell'employee attualmente autenticato; gli altri restano `pending` intatti. Commit `8a5e6ad`.

**Gate B-G3 (regressione flusso online)**: nessun simulatore/device disponibile in questo ambiente. Verificato con smoke test diretto su `api.dataxiom.it` (tenant demo isolato, poi ripulito): il payload esatto ora inviato da `QRScannerScreen` per un check-in online produce `201`/`is_offline:false` — nessuna regressione lato backend.

Commit range Fase B: `52ced4b` → `ef135a4` (9 commit), tutti pushati su `origin/main`.

---

## What Worked

- Verificare ogni commit dei subagent **direttamente** (non solo leggere il loro report) — ha permesso di correggere l'ordine sbagliato di un `writeQueue` dentro il try/catch del POST, introdotto dal mio stesso primo fix del code-review.
- `/test-all` + `/code-review` come gate obbligatorio ha trovato 3 problemi reali nel primo giro; il secondo giro (security review automatico) ne ha trovato un quarto più serio dopo il commit — nessuno dei due controlli da solo sarebbe bastato.
- Simulare il payload esatto che il mobile ora invia con curl contro `api.dataxiom.it` (tenant demo isolato) per compensare l'assenza di un simulatore/device — non perfetto ma meglio di nessuna verifica end-to-end.

## What Didn't Work (lezioni)

- **Il piano sottostimava le dipendenze e i percorsi test reali**: `expo-crypto` non era installato nonostante "zero dipendenze nuove"; il percorso test proposto (`src/services/__tests__/`) non sarebbe mai stato eseguito da `npm test` (jest `testMatch` piatto). Entrambi scoperti PRIMA di dispatchare i subagent (esplorazione diretta del codice), non durante l'esecuzione — buona pratica da ripetere.
- **Un fix del code-review può introdurre un bug nuovo**: spostare `writeQueue` dentro lo stesso try/catch del POST ha fatto sì che un fallimento di storage venisse scambiato per un errore di rete sul check-in. Trovato rieseguendo io stesso i test dopo il fix (non fidandosi che "il fix è ovviamente corretto").
- **Il code-review a un certo effort non è garanzia assoluta**: il finding più serio di questa fase (perdita permanente di timbrature su device condivisi) è arrivato da un secondo controllo automatico DOPO il commit, non dal primo giro di `/code-review`. Vale la stessa lezione della Fase A: continuare a verificare anche dopo aver "chiuso" un gate.

---

## Next Steps

1. **Task B6** — EAS build TestFlight (skill `/build-mobile`) + checklist E2E in modalità aereo su iPhone reale (6 scenari nel piano: coda persiste dopo kill app, sync automatico al reconnect, timestamp reali + badge Offline in dashboard, nessun duplicato su retry ripetuti). **Richiede un device fisico e un'autorizzazione esplicita dell'utente** per consumare un build EAS — non eseguibile in questo ambiente. Reminder: Build 14 scade l'8 settembre, rinnovo entro il 25 agosto.
2. Dopo B6: claim marketing "Mai persa una timbratura — funziona anche senza rete" su `badge-system.html` e materiale LinkedIn futuro — esplicitamente subordinato all'ok dell'utente (non fatto finché B6 non è verificato su device reale).
3. **SES Parte B** (email a prospect reali): resta l'unico bloccante commerciale — serve accesso DNS register.it dell'utente.
4. **Fuori scope, segnalato non affrontato**: la pipeline CI ha uno step `Security Check` rosso pre-esistente (3 vulnerabilità npm `high` su dipendenze backend) — non causato da questa sessione (il diff Fase B è mobile-only).
5. Backlog minor invariato (flake inter-worker test demo, saldi superadmin, pattern di cache-fallback duplicato tra `MyScheduleScreen`/`MyPresencesScreen` — candidato per un hook condiviso futuro) — vedi TASKS.md.

---

## Dove sono le cose

- **Piano Offline Mode**: `docs/superpowers/plans/2026-07-19-offline-mode.md` (Fase A ✅, Fase B ✅ tranne verifica device — checkbox + note deviazioni complete, Task B6 da eseguire)
- **Servizio coda**: `frontend-mobile/src/services/offlineQueue.js` + test in `frontend-mobile/src/__tests__/offlineQueue.test.js` (18 test)
- **Sync automatico**: `frontend-mobile/src/navigation/RootNavigator.jsx`
- **Flusso timbratura**: `frontend-mobile/src/screens/checkin/{CheckInScreen,QRScannerScreen,SuccessScreen}.jsx`
- **Cache read-only**: `frontend-mobile/src/screens/schedule/MyScheduleScreen.jsx`, `frontend-mobile/src/screens/presences/MyPresencesScreen.jsx`
- **Logout (fix leak cache)**: `frontend-mobile/src/services/authService.js`
- **Backend Fase A** (già live): migration `backend/migrations/032_add_offline_checkin_fields.sql`, route `backend/src/routes/checkins.js`, dashboard `frontend-web/src/features/dashboard/components/PresencesTable.jsx`

## Note operative

- Deploy landing: SEMPRE `--site a31a2216-fb06-47e0-b632-a1193a88039a` · Deploy badge frontend: `--site 29a79b49-...` · Backend: automatico su push `main` (`backend/**`) · **Mobile: nessun auto-deploy, EAS build sempre manuale** (skill `/build-mobile`)
- **RDS non raggiungibile dal locale** (security group VPC-only) — per migration su produzione: SSH su EC2 (`ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@34.245.145.143`), poi `psql` da lì (già installato).
- Credenziali RDS/EC2 in memoria (`aws_rds_postgres.md`, `rds_new_instance_2026_06_03.md`, `aws_ec2_instance.md`).
- Cron produzione EC2: 2:00 retention, 3:30 cleanup demo (verificati in sessioni precedenti).
