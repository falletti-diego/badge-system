# Pacchetto "Sales-Ready" — Readiness prodotto/legale prima del primo cliente pilota — Design Spec

**Data:** 23 Agosto 2026
**Status:** Approvato (via `/superpowers:brainstorming` + `/grilling`, 7 domande chiuse) — **revisionato con analisi critica post-scrittura**, 3 correzioni integrate (vedi sezione "Correzioni da analisi critica")

---

## Contesto e problema

Analisi critica dello stato del progetto (richiesta esplicitamente dall'utente) ha mostrato che:

- Il prodotto è tecnicamente completo e in produzione (QR+Face ID, dashboard, planning, offline mode, geofencing, firma digitale, SLA/DPA/Privacy Policy).
- **Zero clienti, zero contatti commerciali fatti finora.** Il piano tattico di outreach (`docs/marketing/piano-tattico-3000-primo-cliente.md`) e il piano "lista contatti verificata" (`docs/superpowers/plans/2026-08-15-verified-contact-list.md`) esistono ma sono stati **deliberatamente lasciati non eseguiti**.
- Tre gap legali aperti da Session 100 (2026-08-11), mai indirizzati: **S.27** (base giuridica del consenso GPS probabilmente non valida secondo EDPB Guidelines 05/2020 §21-22 in un rapporto di lavoro), **S.28** (autorizzazione Art. 4 Statuto Lavoratori/ITL mancante nel processo di onboarding cliente prima di attivare il geofencing — confermata da un caso sanzionatorio reale, Garante Provvedimento n. 7/16-01-2025), **S.29** (DPIA mai eseguita, esplicitamente obbligatoria per Delibera Garante n. 467/2018 per trattamenti di geolocalizzazione dipendenti).
- Una discrepanza documentale nota e mai corretta: `CLAUDE.md` dichiara ancora "Payroll API — Fase 2, fuori scope MVP" e "Offline mode — Fase 2", mentre entrambe le feature sono reali, live in produzione e usate come differenziatori commerciali in `.agents/product-marketing.md`.
- Positioning e pricing (gap ~1,3-1,9x vs il competitor diretto NoBadge) non sono mai stati testati con un prospect reale.

**Decisione a monte (via `/superpowers:brainstorming`):** dato il vincolo di 10h/settimana e la scadenza "MVP pronto Settembre 2026" (`CLAUDE.md`), si dà priorità a chiudere la readiness prodotto/legale **prima** di riprendere l'outreach, invece di lanciare l'outreach nello stato attuale (Opzione B tra 3 alternative proposte: solo blocchi legali / pacchetto sales-ready completo / tutto in parallelo — scelta l'Opzione B, pacchetto completo).

## Decisioni di design (via `/grilling`, 7 domande)

1. **Interpretazione della scadenza Settembre**: significa "readiness completa, pronti a vendere" entro quella data — **non** "cliente firmato entro quella data". L'outreach (mai iniziato, 4 settimane stimate nel piano tattico) riprende dopo la chiusura di questo pacchetto, con la propria timeline separata.

2. **Validazione dei contenuti legali (S.27/S.28/S.29)**: bozze interne, scritte al meglio delle fonti GDPR verificate (stesso standard già usato per `docs/privacy-policy-IT.md` e `docs/DPA_GDPR_Art28_IT.md`), marcate esplicitamente come **"bozza — da validare con un legale prima dell'uso vincolante con un cliente reale"**. Non si blocca la timeline in attesa di una revisione legale esterna; il rischio residuo resta scritto, non nascosto.

3. **Toggle Art. 4 Statuto Lavoratori per il geofencing**: **nessuna nuova infrastruttura** — esiste già `clients.geofencing_feature_enabled` (migration `013_add_geofencing_feature_flag.sql`, enforcement in `backend/src/routes/checkins.js:168`, UI in `frontend-web/src/features/admin/tabs/SettingsTab.jsx`). Per i **nuovi clienti onboardati da questo momento in poi**, il flusso di onboarding forza il default a `false` finché l'admin del cliente non conferma esplicitamente (checkbox) di aver ottenuto l'autorizzazione sindacale/ITL richiesta dall'Art. 4. **I clienti esistenti non vengono toccati** (nessuna regressione sul flag già impostato). *(Vedi correzione al punto "Toggle Art.4" sotto: il meccanismo esatto è stato rivisto dopo verifica del codice.)*

4. **Contratto cliente**: **non** un nuovo ToS/contratto completo — un **modulo d'ordine commerciale breve** (prezzo pattuito, modalità di fatturazione, durata dell'impegno, condizioni di rinnovo) che referenzia `docs/sla.md` e `docs/DPA_GDPR_Art28_IT.md` per tutto il resto (disdetta, limitazione di responsabilità, protezione dati — già coperti lì). Evita duplicazione/disallineamento tra due documenti che dicono la stessa cosa.

5. **Pricing pubblico**: **resta "su richiesta"**, non pubblicato. Coerente con una decisione già presa in precedenza sulla landing page esterna (Session 77b, 2026-07-19: "NIENTE prezzi in pagina — trattativa separata"). Nessun lavoro da fare su questo punto in questo pacchetto.

6. **Integrazione messaging Face ID/impersonificazione**: scope limitato al funnel demo self-serve **interno a questo repo** (`frontend-web`, `/prova-demo`). La landing pubblica `dataxiom.it/badge-system` vive in un repo separato (`falletti-diego/dataxiom-landing`), non raggiungibile da questa worktree — resta backlog separato, fuori scope.

7. **Metodo di esecuzione**: **inline**, via `/superpowers:executing-plans`, task per task con verifica esplicita a ogni step (test reali dove c'è codice, controllo contro fonti GDPR verificate dove c'è testo legale) — stesso pattern già usato per lavoro legal-adjacent di questa taglia in questo progetto (S.24 privacy policy, firma digitale cartellino, Session 100). Non si usa `/superpowers:subagent-driven-development`: lo scope, dopo i tagli di questo grilling, non giustifica l'overhead di processo.

## Correzioni da analisi critica (post-scrittura, prima di `writing-plans`)

Verifica diretta del codice ha corretto 2 assunzioni della prima stesura e ne ha rafforzata una terza:

1. **Non esiste un "wizard di onboarding" per un nuovo cliente.** `OnboardingWizardPage.jsx` gestisce l'import Excel dipendenti per un cliente *già esistente* — non crea tenant. La creazione di un nuovo cliente oggi è un form a 3 campi in `frontend-web/src/features/admin/tabs/ClientsTab.jsx:52-83` (Nome, Email, Piano), compilato da un **superadmin Dataxiom**, non dal cliente. Il meccanismo del punto 3 va quindi corretto così:
   - Il default `geofencing_feature_enabled = false` va **hardcoded nell'insert** di `POST /api/v1/admin/clients` (`backend/src/routes/admin/clients.js`), per ogni nuovo cliente indipendentemente da chi lo crea — non "nel flusso di onboarding" (che per la creazione tenant non esiste).
   - Il gate di conferma Art. 4 **non va legato alla creazione del cliente** (il superadmin che compila il form non è chi può attestare l'autorizzazione sindacale/ITL) — va agganciato al **tentativo di attivazione** in `SettingsTab.jsx` / `PUT /api/admin/settings`, dove è l'admin del cliente stesso a provare a portare il flag a `true`. Un cliente può nascere con geofencing spento e attivarlo mesi dopo: il gate deve valere in quel momento, non solo alla creazione.

2. **La conferma Art. 4 va registrata come voce di audit dedicata**, non solo come uno stato booleano. `AuditLog` esiste già ed è già usato da `settings.js` — si aggiunge un'azione esplicita tipo `geofencing_art4_confirmed` (chi, quando, client_id) invece di farla annegare genericamente nel log di modifica settings. Costo marginale, rilevanza reale in un'eventuale ispezione ITL futura.

3. **Il testo di consenso GPS (S.27) vive in un solo punto di codice** (`frontend-mobile/src/components/GPSConsentDialog.jsx:102-119` — verificato, nessuna duplicazione in `SettingsScreen.jsx`/`QRScannerScreen.jsx`, che hanno stringhe UX brevi separate). **Ma** la stessa base giuridica è probabilmente descritta anche in `docs/privacy-policy-IT.md` e nel suo gemello pubblico `frontend-web/public/privacy-policy-it.html` — il Task 1 va esteso a mantenerli coerenti quando cambia il framing legale, per evitare la stessa divergenza doc/codice già vista e corretta in Session 100 (S.24).

## Scope — cosa è dentro, cosa è fuori

**Dentro:**

| # | Item | Sezione | Verifica di chiusura | Stima |
|---|------|---------|----------------------|-------|
| 1 | Revisione testo consenso GPS in `GPSConsentDialog.jsx` **+ coerenza in `docs/privacy-policy-IT.md` e `frontend-web/public/privacy-policy-it.html`** (base giuridica: "legittimo interesse bilanciato" invece di "consenso puro", EDPB Guidelines 05/2020) — bozza interna con disclaimer | Legale | Lettura incrociata dei 3 file: stesso framing legale ovunque | ~2-3h |
| 2 | Default `geofencing_feature_enabled = false` hardcoded in `POST /api/v1/admin/clients` (nuovi clienti) + gate di conferma Art.4/ITL su tentativo di attivazione in `SettingsTab.jsx`/`PUT /api/admin/settings`, con voce di audit log dedicata | Legale | Test reale-Postgres: nuovo cliente → flag `false`; cliente esistente → invariato; tentativo di attivazione senza conferma → bloccato; conferma → riga in `AuditLog` con azione dedicata | ~4-5h |
| 3 | Template DPIA precompilato (sezioni Dataxiom-as-processor scritte, sezioni cliente-as-titolare a compilazione guidata) — bozza interna con disclaimer | Legale | Confronto contro l'elenco di sezioni richieste da Delibera Garante n. 467/2018 | ~3-4h |
| 4 | Fix `CLAUDE.md`: dicitura payroll (export Zucchetti/TeamSystem è reale, non "Fase 2") e Offline Mode (✅ non ❌) | Documentale | Diff del file, nessuna dicitura stale residua | ~0,5h |
| 5 | Verifica/aggiornamento copy Face ID/impersonificazione in `/prova-demo` (solo questo repo) | Prospect-facing | Lettura manuale della pagina in locale | ~1-2h |
| 6 | Modulo d'ordine commerciale breve (prezzo, fatturazione, durata, rinnovo — referenzia SLA/DPA esistenti) | Prospect-facing | Nessun contenuto duplicato rispetto a `docs/sla.md`/`docs/DPA_GDPR_Art28_IT.md` | ~2-3h |

**Totale stimato: ~12,5-17,5h** (rivisto dopo le correzioni — il Task 2 è cresciuto per il test reale-Postgres e l'audit log dedicato, il Task 1 per la coerenza sui 3 file; resta comunque ridotto rispetto alla stima iniziale di 15-22h e dentro un margine ragionevole per la finestra Settembre a 10h/settimana, ~1,5-2 settimane).

**Fuori scope (esplicitamente, con motivazione):**
- Pubblicazione pricing sul sito — deciso di non farlo (punto 5)
- Aggiornamento della landing esterna `dataxiom.it/badge-system` — repo diverso, non raggiungibile da qui (punto 6)
- Revisione legale esterna reale di S.27/S.28/S.29 — bozze interne con disclaimer, non blocco della timeline (punto 2)
- Esecuzione dell'outreach (piano tattico, lista contatti) — segue *dopo* la chiusura di questo pacchetto, con la propria timeline

## Rischi residui (dichiarati, non nascosti)

- I tre testi legali (consenso GPS, Art. 4, DPIA) restano bozze non validate da un legale esterno — se un cliente reale con avvocati interni li scrutina a fondo, potrebbero emergere correzioni. Mitigato dal disclaimer esplicito e dal fatto che il flag geofencing di un nuovo cliente parte comunque spento finché non conferma l'autorizzazione.
- Il gap di prezzo vs NoBadge (1,3-1,9x) resta non testato con un prospect reale fino a quando l'outreach non riparte — questo pacchetto non lo risolve, lo lascia scoperto consapevolmente (fuori scope per decisione esplicita).
- Il messaging sulla landing esterna resta disallineato rispetto agli aggiornamenti fatti qui (es. se cambia la formulazione Face ID nel funnel interno) finché non si pianifica un lavoro dedicato su quel repo.

## Prossimo passo

Invocare `/superpowers:writing-plans` per trasformare questo scope in un piano di task eseguibile inline via `/superpowers:executing-plans`.
