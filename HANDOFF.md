# Badge System — Session 104 Handoff

**Date:** 2026-08-17
**Session:** 104 — Campi Nuovo Dipendente (Sede/Matricola/Data assunzione/Manager) implementati end-to-end e mergeabili
**Status:** ✅ **Piano completamente eseguito (15/15 task), su branch/worktree isolato `worktree-new-employee-fields`, non ancora mergeato su `main`.** Prossimo passo per l'utente: revisionare il branch e decidere se/quando fare merge su `main` e push.

---

## Goal (Session 104)

Continuazione diretta di Session 103. L'utente ha segnalato una mancanza reale nel form admin "Nuovo Dipendente" (`badge.dataxiom.it/admin`): mancavano Sede, Data assunzione, Matricola, Manager di riferimento — con la richiesta esplicita che la Data assunzione dovesse **bloccare realmente** lo scan QR prima di quella data (non solo essere informativa). Percorso completo: `/superpowers:brainstorming` → `/grilling` (10 domande chiuse) → `/senior-backend`+`/senior-frontend` (analisi critica) → `/senior-architect` (spec formale) → `/superpowers:writing-plans` (piano 15 task in 3 fasi con checkpoint) → `/superpowers:subagent-driven-development` (esecuzione completa).

## Current Progress

**Piano completato 15/15 task** (`docs/superpowers/plans/2026-08-16-new-employee-fields.md`), su worktree isolato `/.claude/worktrees/new-employee-fields`, branch `worktree-new-employee-fields` (rebasato su `main` all'avvio, mai pushato). ~35 commit totali (implementazione + fix trovati dai checkpoint).

**Fase 1 — Backend core**: migration `040_add_manager_id_to_employees.sql` (self-referencing, `ON DELETE SET NULL`), `EmploymentNotStartedError`/`InvalidManagerAssignmentError`, `AdminEmployeeSchema` esteso (matricola/hiring_date/manager_id), `POST /admin/employees` esteso con validazione server-side del manager, enforcement `hiring_date` reale in `POST /checkins`.

**Fase 2 — Frontend**: 4 nuovi campi nel form "Nuovo Dipendente" (`EmployeesTab.jsx`) — Sede sempre visibile (employee+manager), Matricola con validazione bloccante, Data assunzione (default oggi, min oggi), Manager di riferimento con stato disabled/helper-text a 3 vie.

**Fase 3 — Wizard xlsx**: colonna `manager_email` aggiunta a template/parsing/validazione/risoluzione/persistenza, con guardia self-reference e coerenza active/site con l'endpoint di creazione singola.

**Ogni fase chiusa da un checkpoint dedicato** (code review multi-angolo + `/test-all`) che ha trovato e fixato bug reali prima di proseguire — vedi "What Worked" sotto per il dettaglio dei più importanti.

**Verifica finale**: backend 795/809 (14 skip pre-esistenti, live-token), frontend-web 308/309 (1 skip pre-esistente), build frontend pulita. Un fallimento isolato (`checkins-rbac.test.js`) confermato flaky pre-esistente (verificato: fallisce in parallelo, passa in isolamento e in rerun pulito, file mai toccato da questo branch).

## What Worked

- **I 3 checkpoint dedicati (uno per fase, richiesti esplicitamente dall'utente) hanno trovato bug reali che le review per-task non avevano catturato**, in ordine di severità:
  - **Checkpoint Fase 1**: il guard `hiring_date` sul check-in confrontava contro la data server "oggi", non contro `occurred_at` (la data effettiva dell'evento) — un check-in offline backdated fino a 48h prima dell'assunzione avrebbe bypassato il blocco. Fixato confrontando contro la data effettiva dell'evento.
  - **Checkpoint Fase 2**: il dropdown "Manager di riferimento" era popolato dai dati filtrati per il filtro della TABELLA dipendenti (`filterClient`), non dal cliente selezionato nel form di creazione — poteva mostrare manager sbagliati/vuoti se i due filtri divergevano. Fixato con una fetch dedicata, disaccoppiata.
  - **Checkpoint Fase 3 (finale)**: bug di data-corruption silenziosa — `computeDiff.js` confrontava le email DB non normalizzate (case-sensitive) contro le email del file xlsx (sempre lowercase), causando la creazione di un dipendente **duplicato** (nessun vincolo UNIQUE sulla sola email) più un falso flag "dipendente uscito" per l'originale, ogni volta che un dipendente aveva un'email con maiuscole nel DB. Terza istanza dello stesso bug class già fixato 2 volte nello stesso file per `manager_email` — fixato lowercasando anche `dbByEmail`. Trovato indipendentemente da 3 dei 5 agenti di review paralleli.
  - Stesso checkpoint finale: il wizard xlsx bulk non applicava gli stessi controlli (`active=true`, stessa sede) che l'endpoint di creazione singola applica al `manager_id` — un manager disattivato o di un'altra sede poteva essere assegnato silenziosamente via upload. Fixato allineando le due strade.
- **Un implementer ha corretto proattivamente un bug nel piano stesso**: il piano suggeriva un confronto `Date` object per `hiring_date` nel check-in (stessa classe di bug TZ-fragile già fixata nel Task 3 per la validazione Zod) — l'implementer l'ha riconosciuto e ha implementato un confronto string-based TZ-safe invece di seguire il piano alla lettera.
- **Rifiutare di "aggiustare" il prodotto per far passare un test scritto male**: durante il Task 7, per far passare `toBeDisabled()`/un match esatto sull'etichetta, un primo tentativo aveva tolto `required` dal campo Sede e sostituito il dropdown Manager con un `<select>` nativo (rompendo la coerenza visiva del form). Riconosciuto come "adattare l'implementazione al test" nella direzione sbagliata — revertito, e i TEST sono stati corretti per asserire correttamente (`getByRole('combobox', ...)`, `aria-disabled`) mantenendo il prodotto invariato.

## What Didn't Work / Da tenere a mente

- **5 agenti di review paralleli lanciati per il checkpoint finale sono falliti una volta per limite di sessione** ("hit your session limit, resets 2am Europe/Rome") — risolti rilanciandoli identici dopo il cambio di data (reset naturale). Nessuna perdita di lavoro, solo un ritardo.
- **Lavorare in un worktree richiede attenzione ai file `.env*` (gitignored)**: non vengono copiati automaticamente da `EnterWorktree` — copiati manualmente da `main` all'inizio sessione. Se si crea un nuovo worktree in futuro, ricordarsene subito o i test integration falliscono con "DATABASE_URL MISSING".
- **Il worktree era stato creato da `origin/main` (stale) invece che dal `main` locale** (che aveva ~9 commit non pushati, incluso il piano stesso appena scritto) — risolto con `git rebase main` dentro il worktree prima di iniziare l'esecuzione. Da controllare sempre quando si apre un worktree in una sessione con lavoro locale non pushato.

## Next Steps (in ordine di urgenza)

1. **Decidere se/quando mergeare `worktree-new-employee-fields` su `main` e pushare** — il branch è pronto, testato, review-completo, ma non ancora mergeato (nessuna azione automatica presa, in linea con la policy "mai push senza conferma esplicita" di questo progetto). Il worktree stesso può essere rimosso dopo il merge (`ExitWorktree` con `action: remove`, o manualmente).
2. **Applicare la migration `040` anche in staging/produzione** al momento del deploy (non ancora fatto — resta locale a dev/test in questa sessione).
3. **Verifica manuale live pre-deploy** (facoltativa nel piano, non eseguita in questa sessione per frizione sandbox — la copertura automatica reale-DB è comunque estesa): creare un manager su una sede, poi un dipendente sulla stessa sede verificando che compaia nel dropdown Manager; provare matricola duplicata; scaricare il template xlsx e verificare la colonna `manager_email`.
4. Tutto il backlog invariato da Session 103 resta aperto — vedi handoff precedente sotto: istruzione correttiva Cowork mai incollata, primo run reale routine LinkedIn (17/8, oggi — verificare), `CLAUDE.md` payroll stale, piano lista contatti verificata non eseguito, S.27/S.28/S.29 GDPR, ANDROID.1/1b.

**Dettaglio task-by-task completo**: vedi il piano stesso `docs/superpowers/plans/2026-08-16-new-employee-fields.md` (ogni task ha i suoi step spuntati) e lo spec `docs/superpowers/specs/2026-08-16-new-employee-fields-design.md`.

---

# Badge System — Session 103 Handoff

**Date:** 2026-08-15
**Session:** 103 — Awareness LinkedIn + budget tattico primo cliente + design/piano lista contatti verificata (non eseguito)
**Status:** 📋 **Piano pronto e committato, in sospeso — nessuna esecuzione ancora avviata.** Nessuna azione bloccante richiesta all'utente (a differenza dell'handoff precedente): il lavoro di questa sessione è tutto documentale/pianificazione, pronto per essere eseguito quando si deciderà di procedere.

---

## Goal (Session 103)

Continuazione diretta di Session 102 (piano documento di contesto marketing chiuso). Tre fili, tutti richiesti dall'utente in sequenza nella stessa sessione: (1) quali attività di awareness perseguire oltre il cold outreach, (2) come allocare €3000 (poi dimezzato a €1500) di budget marketing per acquisire il primo cliente pilota, (3) design + piano di implementazione per il sotto-progetto più concreto emerso da (2): la lista contatti verificata.

## Current Progress

- **Awareness LinkedIn**: `docs/marketing/linkedin-content-plan.md` scritto e committato (`2176f94`), cadenza alternata a settimane pari/dispari con un filone BI/Analytics già esistente (routine cloud "Cowork", non un prodotto separato — commit `c8ae48e`). Nuova routine cloud `badge-system-linkedin-content` creata (id `trig_01QDj3iyHhTLg6zjzsiopRom`, ogni lunedì, no-op nelle settimane ISO dispari) e testata con un run manuale — **il primo run con generazione reale di contenuto resta da verificare al 17/8 (settimana ISO 34)**.
- **Budget tattico**: `docs/marketing/piano-tattico-3000-primo-cliente.md` scritto e committato (`72b2d32`), con scenario pieno €3000 e scenario dimezzato €1500 (ads tagliati per primi, lista contatti ridotta ma non eliminata).
- **`.agents/product-marketing.md` v2→v3**: corrette 2 assunzioni sbagliate durante la verifica del piano budget — esiste già `dataxiom.it/badge-system` con demo self-serve (`badge.dataxiom.it`), e l'export tracciati paghe Zucchetti/TeamSystem è reale e funzionante (non "Fase 2" come dichiara ancora `CLAUDE.md`).
- **Lista contatti verificata**: design (`docs/superpowers/specs/2026-08-13-verified-contact-list-design.md`, commit `1e83fb0`) e piano di implementazione 10 task (`docs/superpowers/plans/2026-08-15-verified-contact-list.md`, commit `33222cb`) scritti e committati — **esplicitamente non eseguiti**, su richiesta diretta dell'utente ("lo scriviamo, lo committiamo e lo teniamo lì").

## What Worked

- **Verificare invece di assumere, due volte nella stessa sessione**: quando l'utente ha chiesto "la landing page dataxiom.it non è sufficiente?", un controllo diretto (`WebFetch` + `curl` grezzo) ha corretto un'assunzione sbagliata portata avanti dall'inizio sessione ("nessuna pagina pubblica"). Stesso schema per l'export paghe Zucchetti/TeamSystem, scoperto per caso durante quella stessa verifica.
- **Analisi critica esplicita richiesta dall'utente prima di scrivere lo spec della lista contatti**: ha trovato 8 problemi reali (il più importante: il design ignorava le relazioni Dataxiom già esistenti, potenzialmente più efficaci di qualunque contatto freddo) — tutti integrati prima di committare, non dopo.
- **Segnalare esplicitamente quando una skill richiesta è sproporzionata per il compito**: la skill `marketing-plan` è tarata per un piano fCMO a 12 mesi; usarla come lente concettuale invece di eseguirne il template completo a 13 sezioni ha evitato un documento gonfio di sezioni "N/A pre-revenue" per un obiettivo bounded a 4 settimane.

## What Didn't Work

- **Fidarsi di un primo `WebFetch` senza verifica su una pagina che richiede login**: un fetch anonimo della company page LinkedIn ha restituito un riepilogo dettagliato di 4 post — completamente allucinato (un `curl` grezzo ha poi mostrato che la pagina senza login restituisce solo un redirect anti-bot, nessun contenuto reale). Errore riconosciuto esplicitamente, corretto chiedendo il testo reale all'utente. **Lezione**: per pagine dietro login, non fidarsi del riassunto di `WebFetch` senza un secondo controllo grezzo, specialmente prima di dare un giudizio su contenuto altrui.
- **Il Cowork BI/Analytics esistente cita statistiche con fonti che, verificate, non le contengono** (2/2 controllate: 46% PMI Excel/ERP, 80% tempo pulizia dati — nessuna presente testualmente nelle fonti linkate). Non un errore mio in questa sessione, ma un problema di processo scoperto e non ancora corretto alla fonte — l'istruzione correttiva scritta va incollata manualmente nella routine su claude.ai, **non ancora fatto**.

## Next Steps (in ordine di urgenza)

1. **Incollare l'istruzione correttiva sulla verifica delle fonti nella routine Cowork BI/Analytics** su claude.ai (scritta in questa sessione, mai applicata) — rischio di credibilità concreto se un altro post pubblica una statistica non verificata prima di questo fix.
2. **Verificare il primo run reale della routine `badge-system-linkedin-content`** al 17/8 (settimana ISO 34) — finora testata solo lo skip nelle settimane dispari, mai la generazione effettiva di una bozza.
3. **Correggere il disallineamento in `CLAUDE.md`** sulla dicitura "Payroll API — Fase 2, fuori scope MVP", ormai smentita dall'export tracciati Zucchetti/TeamSystem già reale.
4. **Decidere se e quando eseguire il piano lista contatti** (`docs/superpowers/plans/2026-08-15-verified-contact-list.md`) — pronto ma volutamente non avviato in questa sessione. Il Task 2 (Passo 0, controllo relazioni Dataxiom esistenti) è il punto di partenza a più alto rapporto valore/tempo.
5. **S.27/S.28/S.29** (backlog GDPR, HIGH, ereditato da sessioni precedenti) — base giuridica consenso GPS, autorizzazione Statuto Lavoratori/ITL, DPIA obbligatoria. Resta prioritario prima che un cliente reale attivi il geofencing.
6. **ANDROID.1/1b** — verifica manuale scan QR reale su device fisico/Virtual Scene, bloccato da un limite di automazione GUI-only (ereditato, invariato).

## Note operative (Session 103)

- **"Claude Cowork" è il nome dato dall'utente a una routine cloud schedulata** (tool `RemoteTrigger`, skill `schedule`) — non un prodotto separato. Utile saperlo per non reinvestigare da zero in una sessione futura.
- **Il monte ore reale del progetto (10h/settimana, `CLAUDE.md`) va confrontato esplicitamente con qualunque nuovo impegno di tempo proposto** (in questo caso: 5-8h/settimana per la lista contatti) — non è tempo "gratis" aggiuntivo, compete col resto del lavoro sul progetto.

**Dettaglio completo**: vedi `PROJECT_DECISIONS.md` sezione Session 103.

---

## Handoff precedenti (invariati, riportati sotto per contesto)

### Session 102 — Piano documento di contesto marketing completato (Task 2-6/6)

**Esito:** Ripresa post-riavvio VS Code (vedi Session 101 sotto), skill `marketing-skills` correttamente disponibili. Task 2 (`competitor-profiling`, adattato con `WebFetch` mirato — tool Firecrawl/DataForSEO del plugin non disponibili): pricing competitor confermato invariato, unico scostamento reale NoBadge con QR "dinamico" anti-frode (mitiga clonazione screenshot, non risolve impersonificazione). Task 3 (`pricing`): stress-test value metric/WTP — esito CONFERMA, nessun aggiustamento. Task 4: `.agents/product-marketing.md` v1→v2 (commit `7397776`). Task 5: one-pager + cold-email template creati (commit `dfe5dc5`). Piano `docs/superpowers/plans/2026-08-11-product-marketing-context-plan.md` chiuso.

**Dettaglio completo**: vedi `TASKS.md` Session Log riga 102 (non fu scritta una sezione dedicata in `PROJECT_DECISIONS.md` per questa sessione).

---

### Session 101 — Plugin marketing-skills installato + design/piano documento di contesto marketing (Task 1/6 eseguito, sessione sospesa per riavvio VS Code)

**Esito:** Ricerca comparativa di skill marketing su GitHub (verificata con `gh api`) → installato `coreyhaines31/marketingskills` (43.864★, 49 skill). Design + piano 6 task via `/superpowers:brainstorming`+`/grilling`+`/superpowers:writing-plans`. Task 1 completato: `.agents/product-marketing.md` v1 creato (commit `9e12778`). **Scoperta di processo**: le skill di un plugin appena installato richiedono un riavvio di VS Code per essere scoperte correttamente — causa identificata, **sessione risolta e completata in Session 102** (vedi sopra), questa nota resta solo per contesto storico.

**Dettaglio completo**: vedi `PROJECT_DECISIONS.md` sezione Session 101.

---

### Session 100 — S.24 chiuso (privacy policy pubblica) + Firma digitale cartellino mensile in produzione

**Goal:** Continuazione diretta di Session 99. Due lavori: chiudere l'ultimo sotto-task di S.24 (pagina pubblica privacy policy GPS, mai pubblicata) e implementare "Firma digitale cartellino mensile" (backlog Session 57).

**Esito:**

**S.24**: `docs/privacy-policy-IT.md` conteneva testo pre-Fase-C ancora "facoltativo" sul GPS — corretto su 6 punti (revoca consenso reale aggiunta, Accesso Art.15 corretto da falso self-service a richiesta manuale, Sentry aggiunto ai sub-processori). **Analisi critica contro fonti GDPR verificate online** (non solo lettura codice) prima di pubblicare ha trovato 3 gap più profondi, registrati come nuovo backlog con citazioni verificate: **S.27** base giuridica consenso GPS probabilmente invalida (EDPB Guidelines 05/2020 §21-22 — consenso in rapporto di lavoro non "liberamente prestato" se il rifiuto ha conseguenze negative, esattamente lo scenario Fase C); **S.28** Statuto Lavoratori Art.4/autorizzazione ITL mancante nell'onboarding cliente (confermato da un caso sanzionatorio reale, Garante Provvedimento n.7/16-01-2025); **S.29** DPIA mai eseguita ma esplicitamente obbligatoria (non "probabile") per la Delibera Garante n.467/2018. Pagina pubblicata (`privacy-policy-it.html`, pattern DPA), verificata live — un primo check aveva mostrato la SPA per cache Netlify Edge su un path mai richiesto prima, non un bug della regola, risolto da solo con retry.

**Firma digitale cartellino mensile**: scoperto che il dipendente non aveva nessuna vista sulle proprie ore (`GET /presences/summary` vietato al ruolo employee) — costruita anche quella. **Analisi critica esplicita** (`/senior-architect` + verifica manuale — `/senior-fullstack`/`/senior-backend` giudicate non pertinenti, tarate per grilling greenfield non per una feature su stack già deciso) ha trovato 3 problemi nella bozza: nessuna idempotenza su `POST /timesheet/sign` (fix: `UNIQUE(employee_id,month,year)` + upsert), nessun blocco server-side sul mese corrente (fix: guard esplicito), invalidazione della firma pensata solo per correzioni — mancava il caso della sincronizzazione offline (`POST /checkins` con backdating fino a 48h) che avrebbe potuto invalidare una firma silenziosamente (fix: funzione condivisa richiamata da creazione E correzione check-in). **Bug ambientale reale trovato in esecuzione**: la migration 039 era applicata solo al DB `development`, non al DB `test` — 2 integration test reali fallivano; risolto applicandola anche lì. Esecuzione inline con `/superpowers:executing-plans` (non subagent-driven, su richiesta esplicita).

**Verifica finale**: backend 750/750, frontend-web 299/299, 0 errori lint, push su `main`, CI a cascata verde, endpoint verificati live in produzione (401 non 404 — migration confermata applicata anche in produzione dato che girano fail-fast all'avvio container).

**Dettaglio completo**: vedi `PROJECT_DECISIONS.md` sezione Session 100.

---

## Handoff precedenti (invariati, riportati sotto per contesto)

### Session 99 — Fase C: geofencing GPS reale + invalidazione QR (finding #2+#5) chiusa e in produzione

**Goal:** Chiudere Fase C (geofencing GPS reale + invalidazione QR), tenuta deliberatamente da parte durante tutta Session 98. Ciclo completo: brainstorming→spec→piano→esecuzione task-by-task→verifica staging→build nativa→merge produzione, tutto nella stessa sessione.

**Esito:**

**Piano 14 task** eseguito via `/superpowers:subagent-driven-development` con **pausa esplicita dopo ogni singolo task** (override del default "esecuzione continua" dello skill, su istruzione esplicita dell'utente). Backend: rimosso gate morto `GEOFENCING_ENABLED`, validazione `qr_content` contro `sites.qr_code_content`, `POST /admin/sites/:id/regenerate-qr`, script retention GPS 90gg, `POST /consent/gps-revoke` (nel farlo, trovato e fixato un bug preesistente: `logAudit` su `/gps-acceptance` scartava silenziosamente i parametri per naming mismatch). Mobile: `expo-location`, **riscrittura completa di `GPSConsentDialog.jsx`** (importava `AlertDialog` da `react-native` — componente inesistente, mai eseguibile), retry GPS su `GEOFENCE_COORDINATES_REQUIRED`, blocco offline fail-safe su sedi geofenced note/sconosciute, revoca consenso in Impostazioni. Web: bottone "Rigenera QR".

**3 livelli di review, tutti richiesti esplicitamente dall'utente**, hanno trovato **5 bug reali** che le review più leggere non avrebbero catturato: 3 durante il checkpoint a metà piano (scrittura cache GPS senza try/catch dopo check-in riuscito — mostrava "Errore check-in" a un check-in in realtà riuscito; stessa scrittura poteva causare unhandled rejection con `loading` bloccato per sempre; consenso GPS fallito senza feedback utente), 2 durante la review finale sull'intero piano (script di retention GPS mai agganciato al vero cron di produzione — `exec` nel wrapper impediva strutturalmente a un secondo comando di girare; permesso posizione negato permanentemente non gestito, a differenza del pattern già esistente per la fotocamera).

**Verifica manuale staging eseguita da Claude** (su richiesta esplicita dell'utente, non dall'utente stesso) via chiamate API dirette invece che app mobile reale — stesso approccio di Session 97. Tutti i comportamenti attesi confermati: toggle geofencing solo via API admin (nessun SSM), `GEOFENCE_COORDINATES_REQUIRED`, `OUTSIDE_GEOFENCE` con distanza corretta, rigenerazione QR invalida il vecchio, consenso GPS accept/revoke con audit trail. Staging ripristinato a fine verifica.

**Build nativa Codemagic — 2 fallimenti diagnosticati sistematicamente, non 2 tentativi al buio**: primo fallimento (`bundle version must be higher than 35`) diagnosticato confrontando `app.json` di `main` vs `develop` — ipotesi: branch sbagliato. Secondo fallimento con lo stesso identico errore dopo che l'utente credeva di aver corretto — richiesto il log completo invece di ipotizzare alla cieca, che ha mostrato il commit checked-out essere esattamente la punta di `main`: la selezione branch su Codemagic non era stata applicata. Terzo tentativo con `develop` confermato esplicitamente → Build 36 su TestFlight.

**Merge finale**: `main` fast-forward pulito a `f1d9270`, push, CI a cascata verificata (`Build & Push Backend to ECR` → `Deploy to EC2` produzione, entrambi ✅). Worktree e branch temporaneo rimossi a fine sessione.

**Dettaglio completo**: vedi `PROJECT_DECISIONS.md` sezione Session 99.

---

### Session 98 — Gruppo 1 backlog post-Fase-C: PDF export Riepilogo Ore + Help/FAQ in-app (web+mobile)

**Goal:** Con Fase C tenuta deliberatamente da parte, l'utente ha chiesto quali altre attività indirizzare dal backlog MVP. `/superpowers:brainstorming` ha prodotto 9 item, raggruppati in batch coerenti su richiesta esplicita. L'utente ha scelto il Gruppo 1 (quick win frontend-web): PDF export sul Riepilogo Ore + Help/FAQ in-app statica (web+mobile).

**Esito:** Ciclo completo design→spec→piano→implementazione→merge→push via skill chain `superpowers:brainstorming` → `writing-plans` → (`subagent-driven-development` poi switchato su richiesta a `executing-plans`) → `finishing-a-development-branch`. **Due passate critiche esplicite sulla spec** (richieste dall'utente, non spontanee) hanno trovato bug reali prima di scrivere codice: (1) il filtro di visibilità per ruolo era fail-open (`role !== 'employee'`), sostituito con un'allowlist fail-closed `isVisible()`; (2) lo script di sync-check FAQ web/mobile come concepito era tecnicamente infattibile (richiedeva eseguire moduli cross-progetto tra un `frontend-web` ESM puro e un `frontend-mobile` senza risoluzione Metro), ridisegnato come estrazione testuale via regex. **Self-review del piano** ha trovato e corretto un test scritto in sintassi Jest che non avrebbe mai girato (riscritto con `node:test` nativo) e uno script senza error handling sui file mancanti (verificato con dry-run reale in `/tmp`). **2 scoperte implementative non previste dal piano**, entrambe diagnosticate correttamente: MUI `Accordion` tiene montato il contenuto collassato nel DOM (fix `TransitionProps={{ unmountOnExit: true }}`); `SettingsScreen.jsx` mobile richiede un vero `NavigationContainer` per `useFocusEffect` (test riscritto con navigator reale). **Risultato**: 10/10 task TDD completati, nessuna modifica backend, Help/FAQ mobile distribuibile via OTA (nessun modulo nativo). Merge locale su raccomandazione esplicita, push su `origin/main` (commit `5f1eca6`→`8118387`). Worktree/branch temporaneo puliti manualmente dopo un errore di provenance su `ExitWorktree`.

**Dettaglio completo**: vedi `PROJECT_DECISIONS.md` sezione Session 98.

---

### Session 97 — P2.5: checklist wizard 6.4/6.5 verificate via API diretta su staging, chiude l'intero backlog P2

**Goal:**

Continuazione diretta di Session 96. Ultimo punto del backlog P2: verificare la checklist wizard sezioni 6.4/6.5 (check-in accettato sulla nuova sede, rifiutato sulla vecchia, dopo un trasferimento via wizard) — rimasta aperta da Session 92 perché mancava una build mobile puntata su staging.

## Esito (Session 97)

### Tentativo con l'app mobile reale — bloccato
L'utente ha avviato `npx expo start --tunnel` puntato su staging. Due ostacoli: conflitto porta 8081 (risolto con 8082), poi la Fotocamera di sistema iOS che apriva l'URL del tunnel in Safari invece di passarlo a Expo Go (lo scan va fatto dall'app Expo Go stessa, la cui posizione UI non era ovvia).

### Pivot su richiesta esplicita dell'utente — verifica via API diretta
L'utente ha chiesto un workaround (`/superpowers:brainstorming`). Punto chiave: l'autorizzazione del check-in è **interamente lato server** (`checkins.js`, verifica `assigned_sites` — finding #10 già chiuso in Fase A), il mobile non applica alcuna logica propria — un test via API esercita lo stesso path di codice. Confermato dall'utente via `AskUserQuestion`.

### Esecuzione — meccanismo reale del wizard, non un bypass DB
Login admin su staging, scaricato il template reale (`GET /employee-sync/template`), modificato con `exceljs` (già dipendenza del backend), caricato via i veri endpoint `/employee-sync/preview` + `/apply` — stesso flusso già validato dalla UI in Session 92.

### Scoperta imprevista: `maria@badge.local` non è un'identità reale
Il primo tentativo (con `maria@badge.local`) ha dato un risultato incoerente — invece di assumere un bug, verificato il JWT: quell'email è un account `DEMO_USERS` **hardcoded** (`auth.js`, mai una riga reale in `employees`, per design), il cui `employee_id` punta a una riga DB completamente diversa. La riga `employees` con quell'email è un duplicato decorativo scollegato da ogni login reale. Non un bug — comportamento voluto e commentato nel codice — ma una trappola realistica per un tester futuro. Ripristinata la riga, annotata la scoperta.

### Risultato
Rieseguito con `giulia.bianchi@employee.it` (password temporanea via `POST /admin/employees/:id/reset-password`), trasferita Milano→Roma via wizard. `POST /checkins` su Roma → `201 Created` (**6.4 ✅**). `POST /checkins` su Milano → `400 NOT_ASSIGNED_TO_SITE` (**6.5 ✅**). Staging ripristinato a fine test. Checklist aggiornata (`docs/employee-sync-wizard-test-checklist.md`).

## Backlog per la prossima sessione (in ordine di urgenza)

1. **Fase C** (geofencing/QR rotation reali, finding #2+#5) — non iniziata. Resta l'unico finding HIGH aperto di `findings2agosto2016.md` e l'unica priorità P0 rimasta.
2. **S.26** — consenso GPS esplicito (GDPR Art. 7, HIGH) — dormiente finché nessun cliente reale chiede il geofencing, va di pari passo con Fase C.
3. **ANDROID.1/1b** — verifica manuale scan QR reale su device fisico/Virtual Scene, bloccato da un limite di automazione GUI-only.
4. (Opzionale) Verifica manuale della Build 35 su un dispositivo reale — login, secure storage, TestFlight expiry esatta su App Store Connect (portato avanti da Session 95, mai eseguito).

## Note operative (Session 97)

- **Quando un test manuale end-to-end si scontra con frizione UI (QR/tunnel/deep-link), chiedersi prima "dove vive davvero la logica sotto test?"**: se è lato server, un test via API diretta è equivalente per lo scopo del test, anche se rinuncia alla copertura UI. Non insistere su un canale fragile quando ne esiste uno più diretto e altrettanto valido per l'obiettivo specifico.
- **Non simulare un meccanismo applicativo con una scorciatoia sul DB quando il meccanismo reale è raggiungibile via API**: per testare il trasferimento sede si sono usati i veri endpoint `/employee-sync/preview`+`/apply` (stesso codice della UI), non un `UPDATE` diretto — questo ha reso il test fedele al comportamento reale, non solo al risultato atteso.
- **Le email `@badge.local` sono account fixture hardcoded, mai righe reali in `employees`** — qualunque riga `employees` con quell'email è decorativa/orfana, il suo `employee_id` non corrisponde a quello nel JWT di login. Per test che coinvolgono lo stato reale di un dipendente (site, assigned_sites, ecc.), usare sempre un account `@employee.it` creato da import/wizard.
- **Prima di attribuire un risultato inatteso a un bug, verificare l'identità/lo stato effettivo coinvolto** (in questo caso: decodificare il JWT) — ha evitato di inseguire un falso bug nel codice di autorizzazione quando la causa reale era una discrepanza nei dati di test.
- **Il classificatore automatico può bloccare comandi compositi (login+query in un unico script) anche quando le singole azioni sono innocue** — se un comando composito viene bloccato, scomporlo in passaggi singoli (login separato, salvare il token, poi query separate) spesso risolve senza bisogno di intervento dell'utente.

### Session 96 — P2 backlog: fix root cause flakiness `MyScheduleScreen.test.jsx` + `npm audit fix` non-breaking su backend/web/mobile

**Goal:** Continuazione diretta di Session 95. Chiudere i 2 punti P2 del backlog: la flakiness nota di `MyScheduleScreen.test.jsx` e le vulnerabilità `npm audit` già documentate.

**Esito:** Fix flakiness — non era mai vera flakiness, bug deterministico dipendente dalla data hardcoded nel test (Luglio vs orologio reale passato ad Agosto), risolto rendendo le date dinamiche (commit `21fdacd`). `npm audit fix` non-breaking sui 3 progetti, verificato con suite di test completa dopo ciascuno prima di committare: backend (`brace-expansion` risolto, commit `3d28206`), web (`axios`+`form-data` risolti, commit `9f61b74`), mobile (patch `expo` 54.0.35→54.0.36, 22→15 vulnerabilità production-relevant, commit `982a0bf`). Tutto ciò che richiederebbe `--force`/breaking lasciato come rischio accettato. Push su `origin/main`.

**Credenziali/dettagli completi**: vedi `PROJECT_DECISIONS.md` sezione Session 96.

---

### Session 95 — Build nativa iOS #35 rilasciata su TestFlight, distribuisce il fix Fase B (finding #1) a utenti reali

**Goal:** Continuazione diretta di Session 94, stessa giornata. Chiudere il gap "mergeato ma non distribuito": la Fase B è in `main` da Session 94 ma `expo-secure-store` è un modulo nativo, non raggiungibile via OTA — serve una build nativa nuova per arrivare a un dispositivo reale.

**Esito:** Backlog MVP prioritizzato prodotto su richiesta, con correzione di una voce stale (bug redirect post-login, già fixato Session 89 ma segnalato ancora aperto). Bump `buildNumber` 34→35 (`app.json`, commit `6a7761b`). Scoperto un disallineamento tra lo skill `/build-mobile` (userebbe `eas build --profile preview`, non arriva su TestFlight) e la pipeline reale del progetto (Codemagic, submit automatico a TestFlight) — segnalato esplicitamente, confermata la scelta di Codemagic dall'utente. Nessun trigger automatico configurato in `codemagic.yaml` e nessuna credenziale API disponibile — build avviata manualmente dall'utente sul dashboard Codemagic. **Build 35 completata con successo**, confermato dall'utente — fix Fase B ora attivo su utenti reali (test interno).

**Credenziali/dettagli completi**: vedi `PROJECT_DECISIONS.md` sezione Session 95.

---

### Session 94 — Fase B findings 2 Agosto (finding #1, secure storage mobile) implementata e mergeata in `main`

**Goal:** Continuazione diretta di Session 93 nella stessa giornata: indirizzare il Finding #1 (Fase B) di `findings2agosto2016.md` — token mobile (access token, refresh token, oggetto utente) salvati in chiaro via `AsyncStorage` invece che in `expo-secure-store` cifrato.

**Esito:** Design via `/superpowers:brainstorming` (nuovo modulo `secureAuthStorage.js`, nessuna migrazione dati — forza re-login, + scrubbing Sentry mobile + gestione esplicita errori SecureStore aggiunti allo scope). Piano 9 task TDD via `/superpowers:writing-plans`, eseguito con `/superpowers:subagent-driven-development` in worktree isolato. Problema di provenance del worktree (branchato prima dei commit di spec+piano) risolto con `git rebase --onto`. 2 bug reali trovati durante l'esecuzione: `await import()` incompatibile con Jest in `apiClient.js` (fixato con `require()` lazy), `Promise.all` del cold-start senza `.catch` in `RootNavigator.jsx` dopo la migrazione a `SecureStore` (che può fallire davvero, a differenza di `AsyncStorage`). Merge fast-forward pulito su `main`, push su `origin/main` (13 commit, incluso backlog Session 93 mai pushato). **Non fatto**: nessuna build nativa lanciata — chiuso in Session 95 (vedi sopra).

**Credenziali/dettagli completi**: vedi `PROJECT_DECISIONS.md` sezione Session 94.

---

### Session 93 — Fase A findings 2 Agosto + bug strutturale `assigned_sites` + wizard "Aggiorna Dipendenti" in produzione + fix migration 035 + rinnovo TestFlight

**Goal:** Chiudere gli 8 findings isolati a basso rischio di `findings2agosto2016.md`, verificarli su staging, promuoverli in produzione.

**Esito:** **(1) Fase A** — 8 findings (#4,6,7,9,10,11,12,13) chiusi via `/superpowers:subagent-driven-development` (14 task, doppia review ciascuno). Review finale olistica ha trovato il problema più importante: header `X-Truncated` non esposto in `Access-Control-Expose-Headers`, vanificava silenziosamente il fix del finding #13 su un'architettura cross-origin — corretto. **(2) Bug strutturale `assigned_sites`** scoperto durante la verifica manuale (`maria@badge.local` non timbrava su staging): le migration storiche 018/019a valorizzano solo `site_id`, mai `assigned_sites` (stessa causa già colpita in produzione una volta, Session 81, patch one-off mai generalizzata). Verifica quantitativa su produzione: 1 riga rotta dal 19 Giugno. Fix strutturale: migration 038 con backfill + trigger Postgres `BEFORE INSERT OR UPDATE` che mantiene per sempre l'invariante, testato a 3 livelli su richiesta esplicita dell'utente. **(3)** Deploy complicato da un major outage GitHub Actions (~11 ore) — risolto senza bypass, solo `workflow_dispatch`/commit vuoto. Il merge `develop`→`main` ha portato con sé anche il wizard "Aggiorna Dipendenti" (segnalato esplicitamente prima di procedere). **(4)** Fix CI ricorrente: migration 035 resa idempotente (`IF NOT EXISTS`), verificato replicando lo scenario CI esatto in locale. **Bonus**: `/skill-doctor`, rimosse 2 skill duplicate. **Rinnovo TestFlight** eseguito a fine sessione: Build 34, scadenza reale calcolata **5 Novembre 2026** (promemoria 21 Ottobre) — la nota precedente ("Build 14, 2026-09-08") era rimasta non aggiornata per 3 build consecutive.

**Credenziali/dettagli completi**: vedi `PROJECT_DECISIONS.md` sezioni Session 93 (se presenti) e `TASKS.md` riga Session 93 nel Session Log per il resoconto integrale.

---

### Session 92 — Verifica manuale wizard (12/12 sezioni) + saldo ferie negativo

**Goal:** Continuazione diretta di Session 91 (wizard "Aggiorna Dipendenti" appena implementato, mai testato manualmente da un umano reale). L'utente ha eseguito personalmente, sezione per sezione, `docs/employee-sync-wizard-test-checklist.md` (12 sezioni) contro staging, chiedendo ad ogni segnalazione una verifica indipendente. A fine checklist, richiesta aggiuntiva fuori scope wizard: rimuovere il blocco sul saldo ferie negativo.

**Esito:** Verifica checklist 12/12 sezioni chiuse. 5 bug reali aggiuntivi trovati (totale 9 sull'intero ciclo di vita del wizard): IAM SES mai concesso su staging (email di benvenuto falliva silenziosamente), dettaglio del cambiamento assente per righe Modificati/Riattivati (fix con nomi sede leggibili), 3 bug minori dalla verifica automatica precedente. 3 miglioramenti UX su proposta dell'utente (lista scorrevole Anomalie, email "bentornato" con reset password automatico, bottone "Annulla" nella preview). Fuori scope: rimosso il blocco `INSUFFICIENT_SALDO` — saldo ferie ora può scendere sotto zero, mostrato in rosso. `/code-review:code-review` (5 agenti + scoring Haiku, nessun blocco ≥80) + `/test-all` finale (backend 706/706, frontend-web 264/264). Tutto rimasto su `develop` per istruzione esplicita dell'utente ("Lascialo su staging per ora") — **promosso su `main` in Session 93**.

**Credenziali staging usate**: `pippo@badge.local` / `NQQG65D7Zawy57ur` (admin, cliente "Dataxiom MVP"), password Maria/Pino da SSM `/badge/staging/DEMO_MARIA_PASSWORD`/`DEMO_PINO_PASSWORD`.

---

### Session 89 — SES fuori sandbox + Gate finale onboarding self-service

**Goal:** AWS ha approvato il sandbox-exit SES (dopo `DENIED` fermo da Session 84). L'utente ha scelto di eseguire in sequenza: Task 7 del piano SES (config produzione), poi il Gate finale del piano onboarding self-service.

**Esito:** Task 7 SES completato, `MAX_ACTIVE_DEMOS=20` in SSM produzione, test E2E email reale riuscito. Gate finale onboarding ha scoperto 2 bug di produzione reali: 55 commit mai pushati (Session 83-88), `exceljs` in `devDependencies` invece che `dependencies` (crash-loop container). Entrambi fixati e deployati. Gate finale eseguito passo-passo dall'utente: creazione client → invito → accept → wizard → import Excel → welcome email — tutto riuscito. Bug UX scoperto (non fixato allora): redirect post-login per admin con onboarding incompleto (`LoginPage.jsx:44`) — **fixato in Session 89 stessa più avanti** (vedi `TASKS.md` MVP Hardening).

**Note operative**: `npm test` non esegue `lint` in questo repo — controllare `npm run lint` prima di push importanti. Qualunque modulo richiesto a runtime da `backend/src/` deve stare in `dependencies`, mai `devDependencies`.

---

### Session 87-88 — ANDROID.2

**Esito:** Jank animazioni Android low-end ridotto (`deviceTier.js`, `isLowEndDevice()`). Causa reale del blocco d'ambiente Session 87: PIN di blocco schermo residuo sugli AVD (BFU state), non un problema di toolchain. `FaceIDScreen` mediana dimezzata 61ms→32ms dopo il fix; `QRScannerScreen` marginale (CameraView resta il collo di bottiglia). Dettaglio completo in `PROJECT_DECISIONS.md`.

---

### Session 85 — Onboarding cliente self-service implementato

**Esito:** 8/8 task del piano eseguiti. Code review finale ha trovato 5 problemi reali (JWT senza `employee_id` su accept-invito, guard fail-fast mancante, audit log mancante, `generateInviteToken()` fuori dal try, rate-limiter condiviso tra `/onboarding/invite` e `/demo/start`). QA manuale ha trovato un leak di password in chiaro nel preview. Suite finale: backend 630/644, frontend-web 248/249. SES ancora `DENIED` a quel punto (risolto Session 89).

**Dove sono le cose**: piano `docs/superpowers/plans/2026-07-28-onboarding-self-service.md`, nuovi file backend (`onboardingInvite.js`, `admin/onboarding.js`, `inviteTokens.js`, `services/onboarding/*.js`), nuovi file frontend (`AcceptInvitePage.jsx`, `OnboardingWizardPage.jsx`, `useOnboarding.js`).
