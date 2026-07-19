# Demo Funnel Completion — Screenshots reali + SES produzione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere i due bloccanti commerciali del funnel demo: (A) screenshot reali del prodotto al posto dei placeholder grigi su `/prova-demo`; (B) AWS SES fuori dalla Sandbox con dominio `dataxiom.it` verificato, così le email raggiungono prospect reali.

**Architecture:** Parte A è interamente locale+frontend: uno script Node (`puppeteer-core` che guida il Chrome già installato — nessun download di browser) cattura 3 screenshot da una sessione demo reale su stack locale, le immagini entrano nel bundle Vite via import, `TryDemoPage.jsx` sostituisce i placeholder. Parte B è setup AWS in 2 tempi: generazione record DKIM (io) → inserimento su register.it (utente, pannello manuale — nessuna API) → verifica + richiesta production access via CLI (io, testo pre-approvato).

**Tech Stack:** puppeteer-core (devDep, ~3MB), Chrome locale, Vite asset imports, MUI, AWS CLI (`sesv2`), SSM Parameter Store.

**Decisioni chiuse (grilling 2026-07-19):**
1. DNS: solo-piano — l'utente non ha accesso a register.it in questa sessione; i record vengono generati nella sessione Parte B e incollati dall'utente.
2. Identità SES: NON creata ora — il comando è descritto nel Task 5, si esegue nella sessione Parte B.
3. Sandbox exit: la inoltro io via `aws sesv2 put-account-details`, testo del caso d'uso pre-scritto nel Task 7 (l'utente lo approva prima dell'invio).

**Vincoli/contesto:**
- Gli screenshot si catturano da una **sessione demo vera** (`POST /demo/start` su stack locale): è l'unico dataset con 30 giorni di dati che finiscono OGGI (il seed statico di giugno 2026 renderebbe la dashboard di luglio vuota). Il DemoTour si sopprime via localStorage (`badge_demo_tour_seen`), il DemoBanner si nasconde via CSS injection solo durante la cattura.
- Chiavi localStorage di sessione (da `authService.js`): `badge_auth_token`, `badge_refresh_token`, `badge_user`.
- `MAX_ACTIVE_DEMOS` ha già default 20 nel codice (`demo.js:56`) — in SSM va solo esplicitato per visibilità, non è bloccante.
- `SES_FROM_EMAIL` resta `diego@dataxiom.it` (già in SSM e funzionante; col dominio verificato continuerà a funzionare senza modifiche).
- Rate limit `POST /demo/start`: 3/ora per IP — lo script di cattura riusa la stessa sessione per tutti gli scatti.
- Il lockfile `frontend-web/package-lock.json` cambierà per la devDep nuova: VA committato (dipendenza reale, non rumore).

---

## PARTE A — Screenshot reali su /prova-demo (implementabile subito)

### Task 1: Script di cattura screenshot

**Files:**
- Create: `frontend-web/scripts/capture-demo-screenshots.mjs`
- Modify: `frontend-web/package.json` (devDep `puppeteer-core` + script npm)

- [ ] **Step 1: Installa puppeteer-core**

```bash
cd frontend-web && npm install --save-dev puppeteer-core
```

- [ ] **Step 2: Avvia lo stack locale** (due terminali o background)

```bash
# backend (porta 3000) — kill preventivo porta per EADDRINUSE
cd backend && lsof -ti:3000 | xargs kill -9 2>/dev/null; npm run dev
# frontend (porta 5173)
cd frontend-web && npm run dev
```

Attendere `GET http://localhost:3000/health` → `"status":"ok"`.

- [ ] **Step 3: Scrivi lo script di cattura**

```javascript
// frontend-web/scripts/capture-demo-screenshots.mjs
// Cattura i 3 screenshot per la sezione "Cosa vedrai" di /prova-demo da una
// sessione demo REALE (dati degli ultimi 30 giorni) su stack locale.
// Usa il Chrome installato via puppeteer-core: nessun download di browser.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FRONTEND = 'http://localhost:5173';
const BACKEND = 'http://localhost:3000';
const OUT_DIR = resolve(import.meta.dirname, '../src/assets/demo');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. Sessione demo reale (una sola: rate limit 3/ora per IP)
  const res = await fetch(`${BACKEND}/api/v1/demo/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `screenshot-${Date.now()}@dataxiom.it` }),
  });
  if (!res.ok) throw new Error(`demo/start failed: ${res.status} ${await res.text()}`);
  const { data } = await res.json();

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  // 2. Inietta la sessione come farebbe authService.setSession + sopprimi il tour
  await page.goto(`${FRONTEND}/login`, { waitUntil: 'networkidle0' });
  await page.evaluate((session) => {
    localStorage.setItem('badge_auth_token', session.token);
    localStorage.setItem('badge_refresh_token', session.refresh_token);
    localStorage.setItem('badge_user', JSON.stringify(session.user));
    localStorage.setItem('badge_demo_tour_seen', 'true');
  }, data);

  // 3. Dashboard — nascondi il banner demo SOLO nello scatto (CSS injection)
  await page.goto(`${FRONTEND}/dashboard`, { waitUntil: 'networkidle0' });
  await page.addStyleTag({ content: '[data-testid="demo-banner"], .demo-banner { display: none !important; }' });
  await new Promise((r) => setTimeout(r, 1500)); // grafici Recharts animati
  await page.screenshot({ path: `${OUT_DIR}/dashboard.png` });

  // 4. Grafici Trend — scatto dell'elemento TrendChart
  const trend = await page.$('[data-testid="trend-chart"]') ?? await page.$('.recharts-wrapper');
  if (!trend) throw new Error('TrendChart non trovato nella dashboard');
  await trend.screenshot({ path: `${OUT_DIR}/trend.png` });

  // 5. Export — tabella presenze con il bottone Export CSV visibile
  const exportBtn = await page.$('button ::-p-text(CSV)') ?? await page.$('button ::-p-text(Export)');
  if (exportBtn) await exportBtn.scrollIntoViewIfNeeded?.();
  await page.screenshot({ path: `${OUT_DIR}/export.png` });

  await browser.close();
  console.log(`✅ 3 screenshot salvati in ${OUT_DIR}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

**Nota per l'implementatore:** i selettori di banner/trend/export vanno VERIFICATI sul DOM reale prima dello scatto (`data-testid` potrebbero non esistere — in tal caso ispezionare i componenti `DemoBanner.jsx`/`TrendChart.jsx`/`DashboardPage.jsx` e usare i selettori veri; aggiungere un `data-testid` ai componenti è accettabile e testabile). Gli scatti vanno CONTROLLATI visivamente (Read del PNG) prima di dichiararli buoni: niente banner, dati popolati, nessun overlay.

- [ ] **Step 4: Aggiungi lo script npm**

In `frontend-web/package.json` → `"scripts"`:
```json
"capture-screenshots": "node scripts/capture-demo-screenshots.mjs"
```

- [ ] **Step 5: Esegui e verifica visivamente**

```bash
cd frontend-web && npm run capture-screenshots
```
Expected: `✅ 3 screenshot salvati`. Aprire/leggere i 3 PNG e verificare: dashboard con KPI+dati, trend chart leggibile, export visibile. Rifare lo scatto se un grafico è a metà animazione.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/scripts/capture-demo-screenshots.mjs frontend-web/package.json frontend-web/package-lock.json frontend-web/src/assets/demo/
git commit -m "feat(demo): capture script + 3 real product screenshots for /prova-demo"
```

### Task 2: TryDemoPage — sostituzione placeholder con immagini reali (TDD)

**Files:**
- Modify: `frontend-web/src/pages/TryDemoPage.jsx` (righe ~12-16 SCREENSHOTS, ~300-338 render)
- Test: `frontend-web/src/__tests__/TryDemoPage.test.jsx`

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungere a `TryDemoPage.test.jsx` (dentro il describe esistente, riusando il render helper del file):

```jsx
it('mostra 3 screenshot reali (img con alt) nella sezione "Cosa vedrai"', () => {
  renderPage(); // usare l'helper di render già presente nel file
  const shots = screen.getAllByRole('img', { name: /anteprima/i });
  expect(shots).toHaveLength(3);
  shots.forEach((img) => expect(img).toHaveAttribute('src'));
  // i placeholder testuali non devono più esistere
  expect(screen.queryByText(/— anteprima$/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verifica che fallisca**

```bash
cd frontend-web && npx vitest run src/__tests__/TryDemoPage.test.jsx
```
Expected: FAIL (nessuna img trovata).

- [ ] **Step 3: Implementa**

In `TryDemoPage.jsx`:

```jsx
import dashboardShot from '../assets/demo/dashboard.png';
import trendShot from '../assets/demo/trend.png';
import exportShot from '../assets/demo/export.png';

const SCREENSHOTS = [
  { key: 'dashboard', img: dashboardShot, title: 'Dashboard', caption: 'Presenze in tempo reale, KPI del mese, filtri per sede' },
  { key: 'trend', img: trendShot, title: 'Grafici Trend', caption: 'Andamento presenze e ore lavorate settimana per settimana' },
  { key: 'export', img: exportShot, title: 'Export', caption: 'Esporta tutto in CSV con un click, pronto per il commercialista' },
];
```

E nel render, il Box placeholder (righe ~311-329, incluso il commento "Placeholder — no real product screenshots...") diventa:

```jsx
<Box
  component="img"
  src={shot.img}
  alt={`${shot.title} — anteprima del prodotto`}
  loading="lazy"
  sx={{
    height: 160,
    width: '100%',
    objectFit: 'cover',
    objectPosition: 'top left',
    display: 'block',
  }}
/>
```

- [ ] **Step 4: Verifica che passi + suite frontend intera**

```bash
npx vitest run src/__tests__/TryDemoPage.test.jsx   # PASS
npm test                                             # nessuna regressione
```

- [ ] **Step 5: Verifica build (le immagini entrano nel bundle)**

```bash
npm run build && ls dist/assets | grep -iE "dashboard|trend|export"
```
Expected: 3 file immagine hashati in `dist/assets`.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/TryDemoPage.jsx frontend-web/src/__tests__/TryDemoPage.test.jsx
git commit -m "feat(demo): real product screenshots replace grey placeholders on /prova-demo"
```

### Task 3: Verifica finale Parte A

- [ ] **Step 1:** `/test-all` — backend Jest + frontend Vitest, entrambe verdi (backend atteso 599 pass/14 skip, frontend atteso +1 test).
- [ ] **Step 2:** `/code-review` con skill `code-reviewer` sul diff della Parte A; fixare eventuali finding Critical/Important prima del deploy.
- [ ] **Step 3:** Push su `main` (nessun file `backend/**` toccato → nessun deploy backend).
- [ ] **Step 4:** Deploy Netlify esplicito (⚠️ **gate utente: chiedere ok prima**):
```bash
cd frontend-web && npm run build && netlify deploy --prod --dir dist --site 29a79b49-5571-4249-8c2b-d0813de4bf17
```
- [ ] **Step 5:** Verifica produzione: `https://badge.dataxiom.it/prova-demo` → le 3 immagini si caricano (controllare gli URL hashati nel bundle con `curl`).

---

## PARTE B — SES produzione (sessione dedicata, richiede accesso DNS utente)

### Task 4: Crea identità dominio SES e genera i record DKIM

- [ ] **Step 1:** Crea l'identità (⚠️ autorizzazione utente già data in linea di principio, riconfermare a inizio sessione):
```bash
aws sesv2 create-email-identity --email-identity dataxiom.it --region eu-west-1
```
- [ ] **Step 2:** Estrai i 3 token DKIM:
```bash
aws sesv2 get-email-identity --email-identity dataxiom.it --region eu-west-1 \
  --query 'DkimAttributes.Tokens' --output text
```
- [ ] **Step 3:** Consegna all'utente la tabella dei 3 record per register.it (formato: per ogni `<token>`):

| Tipo | Nome host | Valore |
|---|---|---|
| CNAME | `<token1>._domainkey.dataxiom.it` | `<token1>.dkim.amazonses.com` |
| CNAME | `<token2>._domainkey.dataxiom.it` | `<token2>.dkim.amazonses.com` |
| CNAME | `<token3>._domainkey.dataxiom.it` | `<token3>.dkim.amazonses.com` |

**Nota register.it:** nel pannello il campo "Nome" di solito vuole solo la parte prima di `.dataxiom.it` (cioè `<token>._domainkey`). Nessun record MX/TXT va toccato (l'email hosting resta su register.it — SES serve solo per INVIARE).

### Task 5: Verifica DKIM (dopo che l'utente ha inserito i record)

- [ ] **Step 1:** Attendere propagazione (da minuti a ore), poi:
```bash
aws sesv2 get-email-identity --email-identity dataxiom.it --region eu-west-1 \
  --query '{Verified: VerifiedForSendingStatus, Dkim: DkimAttributes.Status}'
```
Expected: `Dkim: "SUCCESS"`, `Verified: true`. Se resta PENDING oltre qualche ora: `dig +short CNAME <token1>._domainkey.dataxiom.it` per verificare che i record rispondano.

### Task 6: Richiesta uscita Sandbox (production access)

- [ ] **Step 1:** Far approvare all'utente questo testo (già pronto, in inglese come richiede AWS):

> Badge System (https://badge.dataxiom.it) is a B2B SaaS for employee attendance tracking in Italian retail. We send only transactional email: (1) contact-request notifications from our self-service product demo to our own sales inbox, and (2) demo-account lifecycle notices to business prospects who explicitly requested a trial by submitting their email on our site. Volume is very low (well under 100/day). Every recipient has explicitly opted in by initiating a demo; we do not send marketing or bulk mail. Bounces and complaints are monitored via SES notifications, and demo data is automatically deleted after 14 days (GDPR).

- [ ] **Step 2:** Inoltra la richiesta:
```bash
aws sesv2 put-account-details --region eu-west-1 \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url "https://badge.dataxiom.it" \
  --use-case-description "<testo approvato sopra>" \
  --additional-contact-email-addresses "diego@dataxiom.it" \
  --contact-language EN
```
- [ ] **Step 3:** Verifica stato: `aws sesv2 get-account --region eu-west-1 --query 'ProductionAccessEnabled'` → diventerà `true` all'approvazione (AWS risponde tipicamente in 24-48h; l'esito arriva anche via email al contatto account).

### Task 7: Chiusura configurazione produzione

- [ ] **Step 1:** Esplicita il cap demo in SSM (valore = default attuale del codice):
```bash
aws ssm put-parameter --region eu-west-1 --name /badge/production/MAX_ACTIVE_DEMOS --type String --value "20" --overwrite
```
- [ ] **Step 2:** Riavvia il container per caricare la variabile (`ssh` EC2 → `docker restart badge-system-api`), verifica `/health` → ok.
- [ ] **Step 3:** Test E2E finale in produzione: form "Parliamo" su `https://badge.dataxiom.it/prova-demo` → email arriva a `diego@dataxiom.it`; poi test verso un indirizzo NON verificato (es. `falletti.diego2533@gmail.com`) per provare l'uscita dalla Sandbox — via il path di codice reale (`docker exec` con `SESClient.send`, come in Session 75), NON verso indirizzi di terzi.
- [ ] **Step 4:** Aggiornare TASKS.md (item SES in SECURITY TECH DEBT → `[x]`) + handoff, commit.

---

## Self-review (writing-plans)

- **Copertura**: Parte A copre lo screenshot-gap (item Session 72); Parte B copre tutti i sub-item SES residui (dominio, sandbox, MAX_ACTIVE_DEMOS) — lo scheduler è già fatto (Session 76). ✓
- **Nessun placeholder**: ogni step ha comando o codice completo; gli unici valori simbolici (`<token>`) sono output AWS non conoscibili prima dell'esecuzione, per decisione esplicita di grilling. ✓
- **Coerenza**: chiavi localStorage verificate su `authService.js` reale; selettori DOM dichiarati DA VERIFICARE (nota esplicita all'implementatore); rate limit demo rispettato (1 sola sessione). ✓
