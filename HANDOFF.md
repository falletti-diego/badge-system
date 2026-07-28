# Badge System — Session 84 Handoff

**Date:** 2026-07-28
**Session:** 84 — Valutazione critica MVP → onboarding cliente self-service (spec+piano) + SES sandbox-exit
**Status:** 🟡 **IN CORSO.** Spec e piano di implementazione dell'onboarding self-service scritti e committati (pronti, non eseguiti). SES: DKIM verificato, ma la richiesta di uscita dalla sandbox è passata a `DENIED` dopo una prima controreplica dettagliata — **da controllare domani** il motivo esatto nel Support Center AWS.

---

## Goal

Con l'app mobile ora disponibile sia su iOS che su Android (Session 83), valutare criticamente cosa manca all'MVP per essere più solido e commercialmente appetibile — richiesto esplicitamente dall'utente via `/superpowers:brainstorming`.

---

## Current Progress

**Analisi critica MVP**: rivisto l'intero backlog (`TASKS.md`, `PROJECT_DECISIONS.md`, rischi noti `CLAUDE.md`). Identificati 3 gap principali in ordine di urgenza: (1) SES ancora in sandbox — blocco commerciale letterale, quasi a costo zero da chiudere; (2) nessun ambiente di staging — dichiarato già obbligatorio pre-cliente-reale in una decisione precedente (Session 45), mai avviato; (3) onboarding cliente self-service — scelto dall'utente come priorità.

**Correzione importante fatta durante il grilling**: l'utente ricordava un piano "demo self-service" fermo a metà (worktree Session 61, Task 3/9) — verificato nel codice che quella feature (demo per PROSPECT) è in realtà **già completa e live** (`/prova-demo` risponde 200, `POST /demo/start`, `TryDemoPage`, `DemoTour`, `DemoBanner` tutti esistenti). Il gap reale è un altro: l'onboarding del cliente **pagante** dopo la firma, oggi ancora "concierge" manuale (`backend/scripts/onboard-client.js` eseguito a mano da Dataxiom).

**5 decisioni di design onboarding** (via `AskUserQuestion` sequenziali): perimetro solo-popolamento-dati (niente self-signup, il record `clients` resta creato da Dataxiom); primo accesso via invito email con token one-time; meccanismo dati = riuso dell'upload Excel esistente (non un form manuale); distribuzione credenziali dipendenti = email diretta automatica (non più CSV manuale); wizard sempre riutilizzabile (non solo al primo onboarding).

**Scoperta chiave** (3 agenti Explore paralleli, questa sessione): il sistema ha *già* un meccanismo "password temporanea + `must_change_password`" riusato identicamente da C.1 (reset password) e dall'import CSV — quindi il welcome-email ai dipendenti **non richiede nuova infrastruttura di token**, solo l'invito del primo admin la richiede davvero (nessuna riga `employees` esiste ancora su cui applicare il flusso esistente).

**Documenti prodotti** (Plan Mode → `/superpowers:executing-plans`, tutto direttamente su `main`):
- `docs/superpowers/specs/2026-07-28-onboarding-self-service-design.md` (commit `9d3f6e2`)
- `docs/superpowers/plans/2026-07-28-onboarding-self-service.md` (commit `1524104`) — 8 task TDD bite-sized, **non ancora eseguiti**, deliberatamente rinviati a dopo la chiusura di SES.

**SES Parte B eseguita in parallelo** (`docs/superpowers/plans/2026-07-19-demo-funnel-screenshots-ses.md`):
- Task 4: identità dominio `dataxiom.it` creata, 3 token DKIM generati (`aws sesv2 create-email-identity`).
- Utente ha inserito i 3 record CNAME su register.it (Tipo CNAME, TTL default).
- Task 5: verificato **`Dkim: SUCCESS`, `Verified: true`**.
- Task 6: prima richiesta di sandbox-exit inviata con testo aggiornato (include ora anche i futuri flussi onboarding, non solo il funnel demo) → AWS ha risposto chiedendo dettagli aggiuntivi (frequenza, gestione liste, bounce/complaint, esempi email reali) → controreplica dettagliata preparata e inviata dall'utente (citato un dato reale: la suppression list automatica BOUNCE+COMPLAINT è già attiva sull'account, verificato via `aws sesv2 get-account`) → **stato passato a `DENIED`** al controllo successivo. Nessuna visibilità sul motivo via CLI (l'account non ha piano Premium Support, `aws support describe-cases` risponde `SubscriptionRequiredException`).

---

## What Worked

- **Verificare nel codice prima di fidarsi della memoria di sessioni precedenti**: l'utente ricordava un piano fermo a metà che in realtà era stato superato — un controllo diretto (`curl`, `grep` sui file reali) ha evitato di ripianificare da zero una feature già fatta.
- **Esplorazione parallela mirata (3 agenti Explore) prima di scrivere il piano**: ha rivelato che gran parte dell'infrastruttura "nuova" ipotizzata (token per ogni email) in realtà già esisteva sotto altro nome (`must_change_password`) — ha ridotto sensibilmente lo scope del piano rispetto alla bozza iniziale.
- **Verificare i costi AWS prima di raccomandare un'azione**: la domanda esplicita dell'utente su eventuali costi SES ha permesso di dare una raccomandazione di sequenza (SES prima, onboarding poi) basata su un fatto verificato (costo zero), non su un'assunzione.
- **Citare un dato reale (suppression list già attiva) nella risposta ad AWS** invece di una descrizione generica — verificato via CLI prima di scriverlo nella risposta.

## What Didn't Work / Lezioni

- **La richiesta di sandbox-exit è passata a `DENIED` nonostante una risposta dettagliata** — motivo non ancora noto (serve controllare manualmente il Support Center, l'account non ha visibilità CLI sui case senza Premium Support). Non dare per scontato che una risposta esaustiva garantisca l'approvazione — il ciclo review AWS può richiedere più iterazioni.
- **Nessun piano di supporto Premium Support su questo account AWS** — scoperto solo al bisogno (`aws support describe-cases` → `SubscriptionRequiredException`). Per qualunque interazione futura con case AWS Support, l'unica via resta il Support Center web, non la CLI.

---

## Next Steps

1. **Controllare domani il case AWS Support** (`https://console.aws.amazon.com/support/home#/case/?displayId=178527134900387`) per il motivo esatto del `DENIED` — poi decidere se serve un'altra controreplica o una nuova richiesta da zero.
2. **Solo dopo che SES è verificato in produzione**: eseguire `docs/superpowers/plans/2026-07-28-onboarding-self-service.md` (8 task TDD) con `/superpowers:subagent-driven-development` o `/superpowers:executing-plans`.
3. **Task 7 del piano SES** (chiusura config produzione: parametro SSM `MAX_ACTIVE_DEMOS`, restart container, test E2E finale, aggiornamento `TASKS.md`) resta bloccato finché il sandbox-exit non è approvato.
4. Backlog invariato da Session 83: `ANDROID.1`/`ANDROID.1b`, `ANDROID.2`, ambiente di staging (mai avviato, dichiarato obbligatorio pre-cliente-reale), Task B6 Offline Mode retest finale.

---

## Dove sono le cose

- **Spec onboarding**: `docs/superpowers/specs/2026-07-28-onboarding-self-service-design.md`
- **Piano onboarding** (non eseguito): `docs/superpowers/plans/2026-07-28-onboarding-self-service.md`
- **Piano SES** (Parte B in corso): `docs/superpowers/plans/2026-07-19-demo-funnel-screenshots-ses.md`
- **Case AWS Support**: displayId `178527134900387`
- **Commit Session 84**: `9d3f6e2` (spec onboarding), `1524104` (piano onboarding) — nessun commit di codice applicativo in questa sessione (solo documentazione + azioni AWS)

## Note operative

- **Ricontrollare stato SES**: `aws sesv2 get-account --region eu-west-1 --query '{ProductionAccessEnabled: ProductionAccessEnabled, ReviewStatus: Details.ReviewDetails.Status}'`
- **DKIM già verificato** — non serve rifare Task 4/5 del piano SES, solo Task 6 (sandbox-exit) resta aperto.
- Deploy landing: SEMPRE `--site a31a2216-fb06-47e0-b632-a1193a88039a` · Deploy badge frontend: `--site 29a79b49-...` · Backend: automatico su push `main` (`backend/**`) · Mobile iOS: build via Codemagic (workflow `badge-ios-testflight`) · Mobile Android: solo build locale EAS
- **Credenziali test mobile**: `maria@badge.local` / `maria01` (employee, Torino) · `pino@badge.local` (manager, Torino, password nota all'utente)
- TestFlight Build (numerazione corrente, build 33) scade **2026-09-08** — reminder rinnovo **2026-08-25**.
