# Branding Multi-Tenant e Strategia White-Label — Design

**Data:** 26 Luglio 2026
**Status:** Approvato — pronto per `/superpowers:writing-plans`

---

## Contesto e obiettivo

Badge System viene venduto in due forme commerciali:

1. **Tier 1 — SaaS multi-tenant condiviso** (modello attuale): app mobile e dashboard web condivise da tutti i clienti, gestione totale Dataxiom. Ogni cliente vorrà personalizzare colori, logo e nome visualizzato senza che questo richieda un deploy o un build dedicato.
2. **Tier 2 — White-label dedicato** (nuovo, per clienti grandi): Dataxiom continua a costruire e mantenere l'app/dashboard, ma completamente rebrandizzata per quel cliente specifico (nome/icona proprie in App Store, possibile dominio web dedicato). Ci si aspetta che questi clienti richiedano nel tempo anche funzionalità esclusive che non si applicano al resto della base clienti.

Questo documento disegna entrambe le capacità. Scala attesa: 1-2 clienti Tier 2 nel primo anno — le decisioni sotto sono calibrate su questa scala, non su una piattaforma multi-tenant-di-white-label generica.

**Fuori perimetro esplicito:**
- Modello di pricing/fee di setup per il Tier 2 — decisione commerciale, non architetturale.
- Tier "cliente costruisce la propria app via API" (headless) — scartato: il modello concordato è Dataxiom-gestito per entrambi i tier.
- Personalizzazione della schermata di login (pre-autenticazione) — decisione esplicita di restringere il branding al post-login, per non introdurre superficie di attacco pubblica (enumerazione clienti, phishing mirato).

---

## Parte A — Branding Tier 1 (multi-tenant condiviso)

### A.1 Modello dati

Estensione della tabella `clients` esistente (non una tabella separata — stesso pattern già in uso per `meal_voucher_hours`/`geofencing_feature_enabled`, migration 009):

```sql
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) NULL,
  ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) NULL,
  ADD COLUMN IF NOT EXISTS logo_storage_key VARCHAR(255) NULL;
```

- `display_name`: se `NULL`, fallback su `name` (già esistente, usato oggi per identificare il cliente in admin/audit — non va confuso con il nome "commerciale" mostrato ai dipendenti).
- `primary_color`/`secondary_color`: stringa esadecimale `#RRGGBB`, validata rigorosamente lato server (vedi A.4).
- `logo_storage_key`: chiave interna verso lo storage (S3), mai esposta al client così com'è — il client riceve solo un booleano `has_logo` e recupera il file da un endpoint proxato (vedi A.3).

### A.2 Perché solo post-login

Il branding non deve essere visibile prima dell'autenticazione. Motivazione (decisione esplicita, discussa e confermata):

- Se il branding fosse recuperabile prima del login (per mostrare il logo giusto sulla schermata di accesso), servirebbe un modo per identificare il tenant senza credenziali — o un sottodominio dedicato per cliente, o un endpoint pubblico che accetta un identificativo azienda.
- Un endpoint pubblico di questo tipo introduce due rischi concreti: **enumerazione** (chiunque potrebbe scoprire l'intero elenco clienti Dataxiom provando identificativi in sequenza — informazione competitivamente sensibile) e **phishing mirato** (un attaccante che clona esattamente il branding di un'azienda specifica per una pagina di login fasulla più convincente).
- Restringendo il branding al post-login, viaggia nella stessa risposta autenticata che oggi restituisce già `client_id` — protetto gratis dallo stesso RBAC/tenant-scoping già in produzione. Zero nuova superficie di attacco pubblica.

### A.3 API Backend

**Lettura branding** — `GET /api/v1/branding` (nuovo endpoint, `requireAuth`):
- Deriva il tenant da `req.user.client_id` (mai da un parametro client-supplied — stesso principio fail-closed di ogni altra route tenant-scoped in questo codebase, es. RBAC Session 71).
- Risponde: `{ display_name, primary_color, secondary_color, has_logo }`.

**Lettura logo** — `GET /api/v1/branding/logo` (nuovo endpoint, `requireAuth`):
- Fa da proxy autenticato ai byte del file, letti da uno storage privato (S3, bucket non pubblico). Nessun URL diretto al bucket viene mai esposto al frontend.
- Questo chiude il rischio residuo: anche se il logo di per sé non è un'informazione segreta, l'URL del file non deve essere una risorsa pubblica indovinabile — altrimenti si bypassa l'intero perimetro di autenticazione appena descritto, e si rischia comunque la fuga di informazione "l'azienda X è cliente Badge System".

**Scrittura settings** — estensione di `backend/src/routes/admin/settings.js` (route esistente, `PUT /api/admin/settings`):
- Aggiungere `display_name`, `primary_color`, `secondary_color` allo schema Zod (`AdminSettingsSchema`) e al blocco `setClauses`/`params` dinamico già presente — stesso pattern usato oggi per `meal_voucher_hours`/`geofencing_feature_enabled`, nessuna logica nuova da inventare.
- Guard RBAC: `req.user.role !== 'admin'` → 403 (già presente in questo file, riusato as-is).
- Audit log: già presente in questo file (`logAudit(..., action: 'update_settings', ...)`) — estendere il payload di `newValue` per includere i nuovi campi.

**Upload logo** — nuovo endpoint `POST /api/admin/branding/logo` (multipart, admin-only):
- Separato dal JSON settings perché gestisce un file binario, non un campo di testo.
- Nessuna infrastruttura di file-upload esiste oggi in questo codebase (verificato: nessun uso di S3 per storage file, solo SES per email) — è nuova infrastruttura, non un riuso.

### A.4 Validazione e sicurezza dei contenuti

- **Colori**: regex server-side rigorosa `^#[0-9A-Fa-f]{6}$` prima di qualunque salvataggio. Motivazione: se un valore non validato finisse iniettato in CSS/inline-style, un admin malevolo (o un account admin compromesso) potrebbe usarlo come vettore di injection.
- **Logo**: verifica del tipo file sui byte reali (magic bytes), non sull'estensione dichiarata dal client. Formati accettati: **PNG, JPG**. **SVG escluso esplicitamente** — un SVG può contenere `<script>` embedded; se mai renderizzato inline (non come semplice `<img src>`) diventerebbe un vettore XSS.
- **Dimensione massima**: 2MB.
- **Nome file storage**: generato server-side (UUID), mai il nome fornito dal client — evita path traversal e collisioni.
- **Isolamento per tenant**: ogni oggetto storage è associato a un solo `client_id` tramite `logo_storage_key`; l'endpoint di lettura logo verifica sempre che la chiave richiesta appartenga al tenant del chiamante.

### A.5 Frontend Web

- `frontend-web/src/App.jsx`: il `createTheme()` oggi è una costante statica creata all'avvio (`palette.primary.main: '#1E3A5F'` hardcoded). Diventa costruito dinamicamente da un fetch a `GET /api/v1/branding`, eseguito subito dopo il login (stesso punto in cui l'app già legge `client_id` dal token) — nessun rebuild, puro dato a runtime.
- Le occorrenze hardcoded della stringa "Badge System" (almeno 10 individuate: `NavBar`, `DashboardPage`, `SummaryPage`, `LoginPage`, `DemoExpiredPage`) sostituite da un valore letto da un contesto React popolato dal branding fetchato, con fallback esplicito su "Badge System" quando `display_name` è `NULL` (cliente che non ha personalizzato nulla).
- Nessun cambio all'architettura di deploy: resta un'unica SPA Netlify condivisa. Un dominio personalizzato per cliente (es. `presenze.clientexyz.it` via CNAME) è un'aggiunta a costo quasi zero, indipendente da questo lavoro — non specificata qui, nota per quando servirà davvero.

### A.6 Test

- Backend: TDD sul nuovo endpoint `GET /branding`, `GET /branding/logo`, l'estensione di `PUT /admin/settings`, e `POST /admin/branding/logo` — pattern `admin-*.test.js` già in uso nel progetto. Casi da coprire: colore invalido → 400; logo non-immagine (magic bytes) → 400; logo oltre 2MB → 400; SVG → 400; RBAC (non-admin → 403); tenant scoping (impossibile leggere il logo di un altro `client_id`).
- Frontend web: test Vitest sul tema dinamico (fallback su colori/nome default quando branding è vuoto, applicazione corretta quando branding è popolato).

---

## Parte B — Strategia Tier 2 (white-label dedicato)

### B.1 Principio: branch Git, non repository separato

Un cliente Tier 2 ottiene un **branch Git di lunga durata** all'interno dello stesso repository (es. `client/acme-mobile`), derivato da `main` — non un fork/repository separato. Motivazione: un repository separato perderebbe silenziosamente ogni futuro fix di sicurezza, l'infrastruttura di test component (`jest-expo`+RNTL, 61 test) e i flow Maestro E2E costruiti in Session 82, costringendo a riprodurli manualmente. Un branch Git mantiene la storia condivisa e permette di portare i fix critici con un merge/cherry-pick mirato — un'operazione tracciata, non una riproduzione manuale.

Questa strategia è stata scelta rispetto a un `app.config.js` parametrizzato da un'unica codebase (alternativa considerata) perché: con solo 1-2 clienti attesi e una **divergenza funzionale esplicitamente prevista** (feature esclusive per cliente), un file di configurazione condiviso costringerebbe comunque a disseminare il codice comune di condizionali per-cliente (`if (clientId === 'acme') {...}`) — un debito tecnico permanente su codice che tutti gli altri clienti continuano a usare. Il branch isola la divergenza dove appartiene.

### B.2 Cosa vive sul branch vs. cosa resta condiviso

- **Sul branch**: `frontend-mobile/app.json` (bundle identifier, nome, icona, splash) ed `eas.json` (profilo di build dedicato) specifici del cliente; eventuali schermate o feature esclusive.
- **Mai sul branch, sempre da `main`**: servizi condivisi (`offlineQueue.js`, `apiClient.js`, `authService.js`, tutti gli `utils/`), l'infrastruttura di test (component test, `jest.setup.js`, `babel.config.js`), i flow Maestro base.

### B.3 Sincronizzazione con `main`

- Merge/rebase disciplinato dopo ogni release Tier 1 (non ad-hoc, non "quando capita") — un branch lasciato divergere a lungo rende ogni merge successivo più costoso e rischioso.
- **Precondizione esplicita**: questa strategia è sicura solo perché esiste già l'infrastruttura di test costruita in Session 82 (61 component test + 2 flow Maestro) — un merge su un branch divergente è esattamente il tipo di operazione che, senza quella rete, avrebbe rischiato di reintrodurre silenziosamente una regressione (come i bug di scoping trovati in Session 80, mai catturati da alcun test prima di quella sessione).

### B.4 CI

- `.github/workflows/ci.yml` oggi triggera solo su push/PR verso `main`/`develop` (verificato). Un branch cliente non riceve controlli automatici a meno di:
  - aggiungere il branch esplicitamente ai trigger (`branches: [main, develop, client/*]`), oppure
  - far confluire il lavoro sul branch tramite PR verso `develop` prima del merge in `main`.
- Decisione da prendere al momento della creazione del primo branch reale (non specificata qui in dettaglio, dipende da come si vorrà strutturare il flusso di rilascio per quel cliente).

### B.5 Onboarding operativo

Da aggiungere a `docs/runbook.md` come nuova checklist "Onboarding Cliente Tier 2 (white-label)", parallela a quella già esistente per l'onboarding standard:
- Creazione branch da `main`
- `app.json`/`eas.json` dedicati (bundle id, nome, icona, splash, profilo build EAS)
- Scheda App Store Connect separata (sotto l'account Apple Developer esistente di Dataxiom, non un account nuovo)
- Reminder di rinnovo TestFlight specifico per quel cliente (si aggiunge alla lista già tracciata per il Tier 1 — ogni build TestFlight scade ogni 90 giorni, N clienti Tier 2 significano N scadenze da monitorare separatamente)

---

## Verifica end-to-end

- Backend: suite Jest esistente (`npm test` in `backend/`) invariata + nuovi test TDD per gli endpoint di branding (Parte A.6)
- Frontend web: suite Vitest esistente invariata + nuovi test per il tema dinamico
- Mobile: nessun impatto sui 61 test component/2 flow Maestro esistenti — il primo branch Tier 2 li eredita da `main` al momento della creazione
- Regola CLAUDE.md: dopo la migration che estende `clients`, ri-eseguire una query reale (`SELECT display_name, primary_color, secondary_color, logo_storage_key FROM clients LIMIT 1`) prima di dichiarare il deploy riuscito

## Rischi noti e mitigazioni già incorporate nel design

| Rischio | Mitigazione |
|---|---|
| Logo/colori di un cliente visibili a un altro | Tutto scoped da `req.user.client_id` dal JWT, mai da parametro client-supplied |
| Logo servito da URL pubblico indovinabile | Proxy autenticato (`GET /branding/logo`), bucket S3 privato |
| Injection via colori non validati | Regex hex rigorosa server-side |
| XSS via SVG malevolo | SVG escluso dai formati accettati |
| Branch Tier 2 diverge silenziosamente da `main` fino a un merge doloroso | Cadenza di merge disciplinata dopo ogni release, non ad-hoc |
| Merge Tier 2 reintroduce una regressione | Rete di test Session 82 (61 component test + 2 flow Maestro) come precondizione esplicita |
| Branch Tier 2 senza copertura CI | Aggiungere il branch ai trigger `ci.yml` o instradarlo via PR su `develop` al momento della creazione |
