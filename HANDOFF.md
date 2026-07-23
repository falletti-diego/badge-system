# Badge System — Session 80 Handoff

**Date:** 2026-07-23
**Session:** 80 — Task B6 (Offline Mode su device reale): 3 crash trovati e fixati, sessione interrotta a metà checklist
**Status:** 🟡 **Task B6 IN CORSO.** Build 30 pronta per il retest sul device dell'utente. Checklist `docs/offline-mode-test-checklist.md` interrotta a metà Sezione 3 di 8.

---

## Goal

Verificare su un iPhone reale il codice Offline Mode (Fase A backend + Fase B mobile, Session 78-79) mai testato prima d'ora fuori da smoke test da server e lettura statica del codice — esattamente lo scopo del Task B6 del piano `docs/superpowers/plans/2026-07-19-offline-mode.md`.

---

## Current Progress

L'utente ha avviato manualmente la build su Codemagic (workflow consolidato: bump `buildNumber` in `app.json` → push su `main` → build automatica → TestFlight) e condotto la checklist `docs/offline-mode-test-checklist.md` in prima persona, riportando i risultati man mano.

**Sezione 1 (sanity online)**: OK. Nota UX non bloccante: la cella "in corso" al posto dell'orario di uscita in `MyPresencesScreen.jsx` — comportamento pre-esistente e semanticamente corretto (sostituisce l'orario di uscita mancante, non è un'etichetta del tipo di timbratura), non modificato.

**Sezione 2 (errore applicativo)**: OK, nessuna timbratura finita in coda per errore.

**Sezione 3 (timbratura offline singola)**: ha rivelato **3 crash reali in sequenza**, uno per ogni build re-testata (Build 27→30):

1. **`ReferenceError` su `payload`** (`frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`) — `const payload` dichiarata dentro `try{}`, letta da `catch{}`: scope lessicali separati in JS. Fix: hoist a `let payload = null` prima del `try`, più distinzione corretta tra vero errore di rete (`err.isAxiosError && !err.response`) ed errore di validazione client-side. Commit `3b00882`, Build 28.
2. **Stesso bug su `siteId`** — mascherato dal primo, emerso solo dopo averlo corretto. Diagnosticato con l'aiuto della skill `/grill-me` (durata hang 10-30s, nessun evento Sentry nemmeno dopo riavvio con rete → esclude crash nativo, conferma eccezione JS sfuggita). Fix: hoist di `siteId`, intera sequenza enqueue+navigazione in un unico try/catch. Commit `1f6c63e`, Build 29.
3. **Date perse nella cache offline** (`frontend-mobile/src/screens/presences/MyPresencesScreen.jsx`) — `firstIn`/`lastOut` sono oggetti `Date`, ma `JSON.stringify`/`JSON.parse` li trasforma in stringhe senza ricostruirli; `renderItem` chiamava `.toLocaleTimeString()` su una stringa → crash aprendo "Presenze" offline. Fix: revive esplicito in `new Date(...)` dopo la lettura dalla cache. Commit `eedf9e1`, Build 30.

Tutti e tre riprodotti isolatamente con uno script Node **prima** di applicare il fix (mai un fix "a sensazione"). 43/43 test mobile invariati per tutti e tre — **nessuna test coverage esiste per componenti React Native in questo progetto** (Jest mobile è node-only, nessun `jest-expo`/`@testing-library/react-native`), quindi nessuno di questi bug poteva emergere prima di un vero test su device.

**Sessione interrotta dall'utente a fine giornata**, a metà della Sezione 3 (verificata su Build 27, prima dei fix — da ripetere su Build 30). Sezioni 4-8 non ancora testate.

---

## What Worked

- **Riprodurre ogni ipotesi isolatamente in Node prima di toccare il codice** — per tutti e 3 i bug, uno script minimale ha confermato la causa (scoping try/catch, round-trip JSON di un `Date`) prima di scrivere qualsiasi fix. Nessuna correzione "al buio".
- **Usare `/grill-me` quando l'informazione mancante non era ricavabile dal codice** (bug 2): invece di indovinare, ho chiesto all'utente durata dell'hang e stato Sentry — la risposta ("nessun evento anche dopo riavvio con rete") ha escluso una pista (crash nativo) e confermato l'altra (eccezione JS non gestita), restringendo la ricerca invece di allargarla.
- **Rileggere l'intero file dopo ogni fix** cercando ATTIVAMENTE altre istanze dello stesso errore, non solo correggere il sintomo puntuale — ha permesso di trovare `siteId` prima che l'utente lo segnalasse una terza volta.

## What Didn't Work / Lezioni

- **Il code-review statico (8 finder-agent, Session 79) non ha trovato nessuno dei 3 bug** — tutti e tre sono errori che "sembrano corretti" leggendo il codice linearmente (uno scope try/catch che sembra un unico blocco logico; una cache che sembra funzionare perché testata solo con mock, mai con un vero round-trip JSON). Nessuna quantità di lettura statica sostituisce un test reale su device per bug di questa classe.
- **Gap di test coverage confermato reale, non teorico**: l'assenza di test per componenti React Native in questo progetto ha lasciato 3 bug di produzione (2 crash totali dell'app) invisibili fino al test manuale. Da valutare, non urgente ora: se vale la pena investire in `@testing-library/react-native` almeno per i file critici del flusso offline, prima di espandere ulteriormente la feature.
- **Un bug può nascondere un secondo bug identico** (`payload` → `siteId`): dopo un fix, non fermarsi al primo caso trovato — controllare se lo stesso pattern di errore si ripete altrove nello stesso file/funzione.

---

## Next Steps

1. **Riprendere il test su device reale**: ripetere la Sezione 3 (3.1-3.3) su **Build 30** (i fix precedenti erano su build già superate). Se passa, proseguire con le **Sezioni 4-8** della checklist (`docs/offline-mode-test-checklist.md`) con la stessa cautela — probabile presenza di altri bug della stessa natura (mai esercitati offline prima d'ora): coda multipla + persistenza dopo kill app, sync automatico, no-duplicati, **device condiviso tra dipendenti** (Sezione 7, priorità alta — testa il bug di sicurezza corretto in Session 79), cache turni/presenze.
2. Per la Sezione 7 (device condiviso), l'utente ha scelto di usare un **tenant demo isolato** (`POST /api/v1/demo/start`) con due dipendenti fittizi invece di un secondo account reale — da preparare quando si arriva a quel punto.
3. Solo dopo che TUTTE le sezioni passano: chiudere Task B6 in TASKS.md/PROJECT_DECISIONS.md/HANDOFF.md, poi valutare il claim marketing "Mai persa una timbratura" (subordinato all'ok esplicito dell'utente).
4. Backlog invariato: SES fuori Sandbox (unico bloccante commerciale reale), staging ambiente (obbligatorio solo prima del primo cliente pagante), CI `Security Check` rosso pre-esistente (3 vulnerabilità npm high, non affrontato).

---

## Dove sono le cose

- **Checklist di test in corso**: `docs/offline-mode-test-checklist.md` — Sezioni 1-2 ✅, Sezione 3 da riverificare su Build 30, Sezioni 4-8 da fare
- **Piano Offline Mode**: `docs/superpowers/plans/2026-07-19-offline-mode.md` (Fase A ✅, Fase B ✅ codice, Task B6 in corso)
- **File corretti in questa sessione**: `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx` (2 fix), `frontend-mobile/src/screens/presences/MyPresencesScreen.jsx` (1 fix)
- **buildNumber attuale**: 30 (`frontend-mobile/app.json`)
- **Commit range Session 80**: `d019c72` (bump 27) → `eedf9e1` (fix Date cache, bump 30)

## Note operative

- Deploy landing: SEMPRE `--site a31a2216-fb06-47e0-b632-a1193a88039a` · Deploy badge frontend: `--site 29a79b49-...` · Backend: automatico su push `main` (`backend/**`) · **Mobile: build via Codemagic (workflow `badge-ios-testflight`), trigger manuale dall'utente sulla dashboard Codemagic dopo un push** — non `eas build` diretto (la skill `/build-mobile` documenta ancora il comando EAS ma il pipeline reale in uso da diverse sessioni è Codemagic)
- **Credenziali test mobile**: `maria@badge.local` / `maria01` (employee, sede Torino) — unico account employee reale in produzione. Per test multi-employee (Sezione 7 checklist) serve un tenant demo isolato.
- **RDS non raggiungibile dal locale** (security group VPC-only) — per migration su produzione: SSH su EC2 (`ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@34.245.145.143`), poi `psql` da lì.
- TestFlight Build (numerazione corrente) scade **2026-09-08** — reminder rinnovo **2026-08-25**.
