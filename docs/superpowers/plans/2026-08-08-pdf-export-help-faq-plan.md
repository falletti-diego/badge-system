# PDF Export + Help/FAQ In-App (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere un export PDF client-side a `SummaryPage.jsx` e una schermata Help/FAQ statica, filtrata per ruolo, su web e mobile (Gruppo 1 del backlog MVP, `TASKS.md` voci 3 e 8).

**Architecture:** Il PDF export riusa esattamente il pattern `window.print()` + CSS `@media print` già in produzione in `PlanningPage.jsx`, nessun nuovo componente. L'Help/FAQ ha una fonte di contenuto scritta due volte (web e mobile sono progetti npm separati, nessun monorepo) in due file dati paralleli con identica funzione di filtro `isVisible(item, role)` fail-closed (allowlist esplicita), tenuti allineati da uno script Node (`scripts/check-faq-sync.js`) eseguito in CI che confronta il blocco dati normalizzato tra i due file.

**Tech Stack:** React + Vite + MUI (web), React Native + Expo SDK 54 (mobile), Vitest + RTL (web test), Jest + jest-expo + RNTL (mobile test), Node puro (script di sync check).

**Riferimento spec:** `docs/superpowers/specs/2026-08-08-pdf-export-help-faq-design.md`

---

## File Structure (riepilogo)

**Nuovi:**
- `frontend-web/src/data/faq.js` — `FAQ_ITEMS`, `STAFF_ROLES`, `isVisible()`
- `frontend-web/src/data/__tests__/faq.test.js`
- `frontend-web/src/pages/HelpPage.jsx`
- `frontend-web/src/__tests__/HelpPage.test.jsx`
- `frontend-mobile/src/data/faq.js` — stesso contenuto/funzione, duplicato
- `frontend-mobile/src/__tests__/faq.test.js`
- `frontend-mobile/src/screens/settings/HelpScreen.jsx`
- `frontend-mobile/src/__tests__/HelpScreen.test.jsx`
- `scripts/check-faq-sync.js`
- `scripts/__tests__/check-faq-sync.test.js`

**Modificati:**
- `frontend-web/src/pages/SummaryPage.jsx` (bottone + CSS export PDF)
- `frontend-web/src/__tests__/SummaryPage.test.jsx` (nuovo file — non esiste oggi nessun test per questa pagina)
- `frontend-web/src/App.jsx` (route `/help`)
- `frontend-web/src/components/NavBar.jsx` (voce menu "Guida")
- `frontend-web/src/components/__tests__/NavBar.test.jsx` (estensione)
- `frontend-mobile/src/screens/settings/SettingsScreen.jsx` (voce "Guida")
- `frontend-mobile/src/__tests__/SettingsScreen.test.jsx` (nuovo file — non esiste oggi nessun test per questa schermata)
- `frontend-mobile/src/navigation/RootNavigator.jsx` (registra `HelpScreen` nello `SettingsStack`)
- `.github/workflows/ci.yml` (nuovo step nel job `backend`: `node scripts/check-faq-sync.js`)

---

## Task 1: PDF Export — SummaryPage.jsx

**Files:**
- Modify: `frontend-web/src/pages/SummaryPage.jsx`
- Test: Create `frontend-web/src/__tests__/SummaryPage.test.jsx` (non esiste oggi — nessun test copre questa pagina)

- [ ] **Step 1: Scrivere il test rosso**

```javascript
// frontend-web/src/__tests__/SummaryPage.test.jsx
import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import SummaryPage from '../pages/SummaryPage';
import apiClient from '../services/apiClient';
import authService from '../services/authService';

vi.mock('../services/apiClient', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../services/authService', () => ({
  default: { getUserRole: vi.fn().mockReturnValue('manager') },
}));

const mockPrint = vi.fn();

describe('SummaryPage — PDF export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authService.getUserRole.mockReturnValue('manager');
    window.print = mockPrint;
    apiClient.get.mockResolvedValue({
      data: {
        data: {
          employees: [
            { id: 'e1', name: 'Mario Rossi', matricola: 'M001', giorni_presenti: 20, ore_totali: 160, ore_ordinarie: 160, ore_straordinarie: 0, buoni_pasto: 20, presenze_aperte: 0 },
          ],
          totals: { giorni_presenti: 20, ore_totali: 160, ore_ordinarie: 160, ore_straordinarie: 0, buoni_pasto: 20 },
          meal_voucher_threshold_hours: 6,
        },
      },
    });
  });

  test('il bottone "Esporta PDF" chiama window.print', async () => {
    render(<Router><SummaryPage /></Router>);
    await waitFor(() => expect(screen.getByText('Mario Rossi')).toBeInTheDocument());

    fireEvent.click(screen.getByText('PDF'));

    expect(mockPrint).toHaveBeenCalledTimes(1);
  });

  test('il titolo di stampa mostra il mese e anno correnti', async () => {
    render(<Router><SummaryPage /></Router>);
    await waitFor(() => expect(screen.getByText('Mario Rossi')).toBeInTheDocument());

    const now = new Date();
    const monthNames = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const expectedTitle = `📊 Riepilogo Ore — ${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    expect(screen.getByText(expectedTitle)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-web && npx vitest run SummaryPage`
Expected: FAIL — non esiste alcun bottone "PDF" oggi, `window.print` mai chiamato; il testo `.print-title` non esiste.

- [ ] **Step 3: Implementare il bottone e il CSS di stampa**

In `frontend-web/src/pages/SummaryPage.jsx`, aggiungere l'import di `GlobalStyles` e `PictureAsPdfIcon` alle righe 8-16:

```javascript
import {
  Container, Box, Button, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, CircularProgress, Alert, Chip, IconButton, Tooltip, GlobalStyles,
} from '@mui/material';
import { NavBar } from '../components/NavBar';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
```

Subito dopo l'apertura del `<div className="min-h-screen bg-linen">` (riga 101), aggiungere il CSS di stampa e il titolo nascosto, stesso pattern di `PlanningPage.jsx`:

```jsx
    <div className="min-h-screen bg-linen">
      <GlobalStyles styles={`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 10mm; }
          .MuiAppBar-root { display: none !important; }
          .MuiTableCell-root { padding: 2px 4px !important; font-size: 9px !important; border: 1px solid #ccc !important; }
          .MuiPaper-root { box-shadow: none !important; }
          .print-title { display: block !important; font-size: 14px; font-weight: bold; margin-bottom: 8px; }
        }
        .print-title { display: none; }
      `} />

      <div className="print-title">
        📊 Riepilogo Ore — {MONTH_NAMES[month - 1]} {year}
      </div>

      {/* Navbar */}
      <NavBar title="Badge System">
```

Marcare la `NavBar` come `.no-print` non serve modificarla: `NavBar.jsx` applica già `className="no-print"` al proprio `AppBar` (verificato, riga 50). Nel blocco header (righe 126-152), aggiungere `className="no-print"` al `Box` esterno e il nuovo bottone accanto a quello CSV:

```jsx
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }} className="no-print">
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E3A5F' }}>
            📊 Riepilogo Mensile
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton onClick={prevMonth} size="small"><ArrowBackIosNewIcon fontSize="small" /></IconButton>
            <Typography sx={{ fontWeight: 600, minWidth: 140, textAlign: 'center' }}>
              {MONTH_NAMES[month - 1]} {year}
            </Typography>
            <IconButton onClick={nextMonth} size="small"><ArrowForwardIosIcon fontSize="small" /></IconButton>

            <Tooltip title="Esporta CSV">
              <span>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  disabled={!data || data.employees.length === 0}
                  onClick={() => exportCsv(data, month, year)}
                  sx={{ ml: 2, borderColor: '#1E3A5F', color: '#1E3A5F', textTransform: 'none' }}
                >
                  CSV
                </Button>
              </span>
            </Tooltip>

            <Tooltip title="Esporta PDF">
              <span>
                <Button
                  variant="outlined"
                  startIcon={<PictureAsPdfIcon />}
                  disabled={!data || data.employees.length === 0}
                  onClick={() => window.print()}
                  sx={{ ml: 1, borderColor: '#1E3A5F', color: '#1E3A5F', textTransform: 'none' }}
                >
                  PDF
                </Button>
              </span>
            </Tooltip>
          </Box>
        </Box>
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-web && npx vitest run SummaryPage`
Expected: PASS.

- [ ] **Step 5: Suite completa frontend-web per non-regressione**

Run: `cd frontend-web && npm test`
Expected: tutti verdi, nessuna regressione.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/SummaryPage.jsx frontend-web/src/__tests__/SummaryPage.test.jsx
git commit -m "feat(web): add PDF export to Riepilogo Ore via window.print (backlog MVP #3)"
```

---

## Task 2: Dati FAQ + filtro ruolo — web

**Files:**
- Create: `frontend-web/src/data/faq.js`
- Test: Create `frontend-web/src/data/__tests__/faq.test.js`

- [ ] **Step 1: Scrivere il test rosso**

```javascript
// frontend-web/src/data/__tests__/faq.test.js
import { describe, test, expect } from 'vitest';
import { FAQ_ITEMS, STAFF_ROLES, isVisible } from '../faq';

describe('faq data — isVisible (fail-closed allowlist)', () => {
  test('audience "all" è sempre visibile, qualunque ruolo', () => {
    const item = { audience: 'all' };
    expect(isVisible(item, 'employee')).toBe(true);
    expect(isVisible(item, 'admin')).toBe(true);
    expect(isVisible(item, null)).toBe(true);
    expect(isVisible(item, undefined)).toBe(true);
  });

  test('audience "employee" è visibile solo a role === "employee"', () => {
    const item = { audience: 'employee' };
    expect(isVisible(item, 'employee')).toBe(true);
    expect(isVisible(item, 'manager')).toBe(false);
    expect(isVisible(item, 'admin')).toBe(false);
    expect(isVisible(item, 'viewer')).toBe(false);
  });

  test('audience "staff" è visibile a manager/admin/viewer, non a employee', () => {
    const item = { audience: 'staff' };
    expect(isVisible(item, 'manager')).toBe(true);
    expect(isVisible(item, 'admin')).toBe(true);
    expect(isVisible(item, 'viewer')).toBe(true);
    expect(isVisible(item, 'employee')).toBe(false);
  });

  test('fail-closed: ruolo undefined/null non vede contenuti staff né employee', () => {
    const staffItem = { audience: 'staff' };
    const employeeItem = { audience: 'employee' };
    expect(isVisible(staffItem, undefined)).toBe(false);
    expect(isVisible(staffItem, null)).toBe(false);
    expect(isVisible(employeeItem, undefined)).toBe(false);
    expect(isVisible(employeeItem, null)).toBe(false);
  });

  test('audience sconosciuto/malformato è nascosto per default', () => {
    const item = { audience: 'qualcosa-di-strano' };
    expect(isVisible(item, 'admin')).toBe(false);
  });

  test('FAQ_ITEMS ha almeno una voce per ciascuna audience e ogni voce ha id/question/answer non vuoti', () => {
    const audiences = new Set(FAQ_ITEMS.map((i) => i.audience));
    expect(audiences.has('all')).toBe(true);
    expect(audiences.has('employee')).toBe(true);
    expect(audiences.has('staff')).toBe(true);

    for (const item of FAQ_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.question).toBeTruthy();
      expect(item.answer).toBeTruthy();
      expect(STAFF_ROLES.includes('manager')).toBe(true); // sanity sul fixture di ruoli
    }
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-web && npx vitest run data/faq`
Expected: FAIL — `frontend-web/src/data/faq.js` non esiste ancora.

- [ ] **Step 3: Creare il file dati**

```javascript
// frontend-web/src/data/faq.js
//
// Fonte di contenuto duplicata intenzionalmente in
// frontend-mobile/src/data/faq.js (web e mobile sono due progetti npm
// separati, nessun monorepo/package condiviso — vedi
// docs/superpowers/specs/2026-08-08-pdf-export-help-faq-design.md).
// I due file vanno tenuti identici: scripts/check-faq-sync.js lo verifica
// in CI confrontando il blocco FAQ_ITEMS normalizzato tra i due file.

export const FAQ_ITEMS = [
  {
    id: 'checkin-rifiutato',
    question: 'Perché non riesco a timbrare (check-in rifiutato)?',
    answer: 'Il check-in può essere rifiutato per due motivi: non sei assegnato alla sede che hai scansionato (chiedi al tuo manager di verificare la tua sede in Admin), oppure hai già un check-in dello stesso tipo aperto (es. hai già fatto ingresso senza uscita). Se il problema persiste, contatta il tuo responsabile.',
    audience: 'employee',
  },
  {
    id: 'face-id-toggle',
    question: 'Come attivo o disattivo il Face ID per il check-in?',
    answer: 'Vai su Impostazioni → Face ID e usa l\'interruttore. Se disattivato, il check-in avviene senza richiedere l\'autenticazione biometrica.',
    audience: 'employee',
  },
  {
    id: 'ferie-malattia',
    question: 'Come richiedo ferie o segnalo una malattia?',
    answer: 'Dalla schermata principale dell\'app, usa i pulsanti "Ferie" o "Malattia" per aprire il modulo di richiesta. La richiesta viene inviata al tuo manager per l\'approvazione.',
    audience: 'employee',
  },
  {
    id: 'password-dimenticata',
    question: 'Ho dimenticato la password, cosa faccio?',
    answer: 'Contatta il tuo manager o l\'amministratore: solo un account con permessi admin può reimpostare la password di un dipendente. Al primo accesso con la nuova password ti verrà chiesto di sceglierne una tua.',
    audience: 'all',
  },
  {
    id: 'offline-banner',
    question: 'Vedo un banner "Sei offline" nell\'app — cosa significa?',
    answer: 'Significa che il telefono non ha connessione al momento. Il check-in viene comunque salvato sul dispositivo e sincronizzato automaticamente non appena torna la connessione — non serve rifare l\'operazione.',
    audience: 'employee',
  },
  {
    id: 'checkout-dimenticato',
    question: 'Un dipendente ha dimenticato di fare check-out. Come si risolve?',
    answer: 'Apri la Dashboard, trova il check-in di ingresso senza un\'uscita corrispondente e aggiungi manualmente l\'uscita tramite il pulsante di correzione ✏️. La modifica viene tracciata nel log di audit con il tuo nome.',
    audience: 'staff',
  },
  {
    id: 'qr-sede-sbagliata',
    question: 'Il dipendente ha scansionato il QR sbagliato (altra sede). Come si corregge?',
    answer: 'Puoi correggere la sede dal pannello di modifica della singola presenza. La correzione è possibile entro 7 giorni dall\'orario originale del check-in.',
    audience: 'staff',
  },
  {
    id: 'multi-sede-manager',
    question: 'Quante sedi posso gestire con un unico account manager?',
    answer: 'Un account manager può essere assegnato a una o più sedi. Per aggiungere sedi al tuo profilo, contatta il supporto Dataxiom. La dashboard mostra sempre solo i dati delle sedi di tua competenza.',
    audience: 'staff',
  },
  {
    id: 'funziona-offline',
    question: 'Il sistema funziona senza connessione internet?',
    answer: 'Sì, entro certi limiti: l\'app mobile mette in coda i check-in effettuati offline e li sincronizza automaticamente alla riconnessione. La dashboard web richiede sempre una connessione attiva.',
    audience: 'all',
  },
  {
    id: 'protezione-dati',
    question: 'Come vengono protetti i dati dei dipendenti?',
    answer: 'Tutti i dati sono cifrati in transito (HTTPS) e a riposo. I server sono in Irlanda (UE) e rispettano il GDPR. I dati biometrici (Face ID) non vengono mai inviati ai server — restano sul dispositivo.',
    audience: 'all',
  },
  {
    id: 'conservazione-dati',
    question: 'Per quanto tempo vengono conservati i dati delle presenze?',
    answer: 'Per impostazione predefinita i dati vengono conservati 12 mesi dalla data del check-in (configurabile su richiesta). Ogni cliente può richiedere l\'export completo o la cancellazione dei dati, come previsto dal GDPR.',
    audience: 'all',
  },
  {
    id: 'privacy-colleghi',
    question: 'Un dipendente può vedere le presenze di un collega?',
    answer: 'No. I dipendenti vedono solo le proprie presenze e i propri turni. Solo manager e amministratori accedono ai dati di tutti i dipendenti della sede.',
    audience: 'all',
  },
  {
    id: 'aggiungere-dipendente',
    question: 'Come posso aggiungere un nuovo dipendente?',
    answer: 'Dal pannello di amministrazione puoi aggiungere dipendenti singolarmente o tramite il wizard di import Excel, che gestisce anche trasferimenti di sede e disattivazioni.',
    audience: 'staff',
  },
];

export const STAFF_ROLES = ['manager', 'admin', 'viewer'];

export function isVisible(item, role) {
  if (item.audience === 'all') return true;
  if (item.audience === 'employee') return role === 'employee';
  if (item.audience === 'staff') return STAFF_ROLES.includes(role);
  return false; // audience sconosciuto/malformato → nascosto, non mostrato per default
}
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-web && npx vitest run data/faq`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/data/faq.js frontend-web/src/data/__tests__/faq.test.js
git commit -m "feat(web): add FAQ content + fail-closed role-visibility filter (backlog MVP #8)"
```

---

## Task 3: Dati FAQ + filtro ruolo — mobile (duplicato identico)

**Files:**
- Create: `frontend-mobile/src/data/faq.js`
- Test: Create `frontend-mobile/src/__tests__/faq.test.js`

- [ ] **Step 1: Scrivere il test rosso**

```javascript
// frontend-mobile/src/__tests__/faq.test.js
const { interopDefault } = require('./helpers/rntl');
const faqModule = require('../data/faq');
const { FAQ_ITEMS, STAFF_ROLES, isVisible } = faqModule.default || faqModule;

describe('faq data (mobile) — isVisible (fail-closed allowlist)', () => {
  test('audience "all" è sempre visibile, qualunque ruolo', () => {
    const item = { audience: 'all' };
    expect(isVisible(item, 'employee')).toBe(true);
    expect(isVisible(item, 'manager')).toBe(true);
    expect(isVisible(item, null)).toBe(true);
    expect(isVisible(item, undefined)).toBe(true);
  });

  test('audience "employee" è visibile solo a role === "employee"', () => {
    const item = { audience: 'employee' };
    expect(isVisible(item, 'employee')).toBe(true);
    expect(isVisible(item, 'manager')).toBe(false);
  });

  test('audience "staff" è visibile a manager/admin/viewer, non a employee', () => {
    const item = { audience: 'staff' };
    expect(isVisible(item, 'manager')).toBe(true);
    expect(isVisible(item, 'employee')).toBe(false);
  });

  test('fail-closed: ruolo undefined/null non vede contenuti staff né employee', () => {
    expect(isVisible({ audience: 'staff' }, undefined)).toBe(false);
    expect(isVisible({ audience: 'employee' }, null)).toBe(false);
  });

  test('FAQ_ITEMS ha almeno una voce per ciascuna audience', () => {
    const audiences = new Set(FAQ_ITEMS.map((i) => i.audience));
    expect(audiences.has('all')).toBe(true);
    expect(audiences.has('employee')).toBe(true);
    expect(audiences.has('staff')).toBe(true);
  });

  test('il contenuto è identico a quello del progetto web (stesso numero di voci, stessi id, nello stesso ordine)', () => {
    // Elenco degli id atteso, copiato 1:1 dall'ordine in frontend-web/src/data/faq.js —
    // se questo test fallisce dopo una modifica a uno solo dei due file, è il segnale
    // che scripts/check-faq-sync.js dovrebbe intercettare anche in CI.
    const expectedIds = [
      'checkin-rifiutato', 'face-id-toggle', 'ferie-malattia', 'password-dimenticata',
      'offline-banner', 'checkout-dimenticato', 'qr-sede-sbagliata', 'multi-sede-manager',
      'funziona-offline', 'protezione-dati', 'conservazione-dati', 'privacy-colleghi',
      'aggiungere-dipendente',
    ];
    expect(FAQ_ITEMS.map((i) => i.id)).toEqual(expectedIds);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- faq`
Expected: FAIL — `frontend-mobile/src/data/faq.js` non esiste ancora.

- [ ] **Step 3: Creare il file dati (contenuto identico al web, Task 2 Step 3)**

Copiare **esattamente** il contenuto di `frontend-web/src/data/faq.js` (creato nel Task 2) in `frontend-mobile/src/data/faq.js` — stesso `FAQ_ITEMS`, stesso `STAFF_ROLES`, stessa funzione `isVisible`, stesso commento in testa. Aggiungere in fondo l'export CommonJS-compatibile per l'interop già in uso nei test mobile (RN/Jest usa `module.exports` accanto a `export` grazie a Babel, ma verificarlo con lo Step 2 seguente):

```javascript
// frontend-mobile/src/data/faq.js
//
// Fonte di contenuto duplicata intenzionalmente in
// frontend-web/src/data/faq.js (web e mobile sono due progetti npm
// separati, nessun monorepo/package condiviso — vedi
// docs/superpowers/specs/2026-08-08-pdf-export-help-faq-design.md).
// I due file vanno tenuti identici: scripts/check-faq-sync.js lo verifica
// in CI confrontando il blocco FAQ_ITEMS normalizzato tra i due file.

export const FAQ_ITEMS = [
  {
    id: 'checkin-rifiutato',
    question: 'Perché non riesco a timbrare (check-in rifiutato)?',
    answer: 'Il check-in può essere rifiutato per due motivi: non sei assegnato alla sede che hai scansionato (chiedi al tuo manager di verificare la tua sede in Admin), oppure hai già un check-in dello stesso tipo aperto (es. hai già fatto ingresso senza uscita). Se il problema persiste, contatta il tuo responsabile.',
    audience: 'employee',
  },
  {
    id: 'face-id-toggle',
    question: 'Come attivo o disattivo il Face ID per il check-in?',
    answer: 'Vai su Impostazioni → Face ID e usa l\'interruttore. Se disattivato, il check-in avviene senza richiedere l\'autenticazione biometrica.',
    audience: 'employee',
  },
  {
    id: 'ferie-malattia',
    question: 'Come richiedo ferie o segnalo una malattia?',
    answer: 'Dalla schermata principale dell\'app, usa i pulsanti "Ferie" o "Malattia" per aprire il modulo di richiesta. La richiesta viene inviata al tuo manager per l\'approvazione.',
    audience: 'employee',
  },
  {
    id: 'password-dimenticata',
    question: 'Ho dimenticato la password, cosa faccio?',
    answer: 'Contatta il tuo manager o l\'amministratore: solo un account con permessi admin può reimpostare la password di un dipendente. Al primo accesso con la nuova password ti verrà chiesto di sceglierne una tua.',
    audience: 'all',
  },
  {
    id: 'offline-banner',
    question: 'Vedo un banner "Sei offline" nell\'app — cosa significa?',
    answer: 'Significa che il telefono non ha connessione al momento. Il check-in viene comunque salvato sul dispositivo e sincronizzato automaticamente non appena torna la connessione — non serve rifare l\'operazione.',
    audience: 'employee',
  },
  {
    id: 'checkout-dimenticato',
    question: 'Un dipendente ha dimenticato di fare check-out. Come si risolve?',
    answer: 'Apri la Dashboard, trova il check-in di ingresso senza un\'uscita corrispondente e aggiungi manualmente l\'uscita tramite il pulsante di correzione ✏️. La modifica viene tracciata nel log di audit con il tuo nome.',
    audience: 'staff',
  },
  {
    id: 'qr-sede-sbagliata',
    question: 'Il dipendente ha scansionato il QR sbagliato (altra sede). Come si corregge?',
    answer: 'Puoi correggere la sede dal pannello di modifica della singola presenza. La correzione è possibile entro 7 giorni dall\'orario originale del check-in.',
    audience: 'staff',
  },
  {
    id: 'multi-sede-manager',
    question: 'Quante sedi posso gestire con un unico account manager?',
    answer: 'Un account manager può essere assegnato a una o più sedi. Per aggiungere sedi al tuo profilo, contatta il supporto Dataxiom. La dashboard mostra sempre solo i dati delle sedi di tua competenza.',
    audience: 'staff',
  },
  {
    id: 'funziona-offline',
    question: 'Il sistema funziona senza connessione internet?',
    answer: 'Sì, entro certi limiti: l\'app mobile mette in coda i check-in effettuati offline e li sincronizza automaticamente alla riconnessione. La dashboard web richiede sempre una connessione attiva.',
    audience: 'all',
  },
  {
    id: 'protezione-dati',
    question: 'Come vengono protetti i dati dei dipendenti?',
    answer: 'Tutti i dati sono cifrati in transito (HTTPS) e a riposo. I server sono in Irlanda (UE) e rispettano il GDPR. I dati biometrici (Face ID) non vengono mai inviati ai server — restano sul dispositivo.',
    audience: 'all',
  },
  {
    id: 'conservazione-dati',
    question: 'Per quanto tempo vengono conservati i dati delle presenze?',
    answer: 'Per impostazione predefinita i dati vengono conservati 12 mesi dalla data del check-in (configurabile su richiesta). Ogni cliente può richiedere l\'export completo o la cancellazione dei dati, come previsto dal GDPR.',
    audience: 'all',
  },
  {
    id: 'privacy-colleghi',
    question: 'Un dipendente può vedere le presenze di un collega?',
    answer: 'No. I dipendenti vedono solo le proprie presenze e i propri turni. Solo manager e amministratori accedono ai dati di tutti i dipendenti della sede.',
    audience: 'all',
  },
  {
    id: 'aggiungere-dipendente',
    question: 'Come posso aggiungere un nuovo dipendente?',
    answer: 'Dal pannello di amministrazione puoi aggiungere dipendenti singolarmente o tramite il wizard di import Excel, che gestisce anche trasferimenti di sede e disattivazioni.',
    audience: 'staff',
  },
];

export const STAFF_ROLES = ['manager', 'admin', 'viewer'];

export function isVisible(item, role) {
  if (item.audience === 'all') return true;
  if (item.audience === 'employee') return role === 'employee';
  if (item.audience === 'staff') return STAFF_ROLES.includes(role);
  return false; // audience sconosciuto/malformato → nascosto, non mostrato per default
}
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-mobile && npm test -- faq`
Expected: PASS. Se il test `require('../data/faq')` non espone `FAQ_ITEMS` direttamente (dipende da come Babel interopera `export const` con `require()` in questo progetto — verificato altrove nel repo con `interopDefault`), usare `interopDefault(require('../data/faq'))` come fanno gli altri test mobile invece di destrutturare `.default`.

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/src/data/faq.js frontend-mobile/src/__tests__/faq.test.js
git commit -m "feat(mobile): add FAQ content + fail-closed role-visibility filter, mirrors web (backlog MVP #8)"
```

---

## Task 4: Script di verifica sync tra i due `faq.js`

**Files:**
- Create: `scripts/check-faq-sync.js`
- Test: Create `scripts/__tests__/check-faq-sync.test.js`

**Nota tecnica:** `scripts/` non appartiene né a `backend/` né a `frontend-web/`/`frontend-mobile/` — non ha (e non deve avere) un proprio `package.json`/runner Jest solo per questo. Il test usa il test runner **nativo di Node** (`node:test`, incluso in Node 20+ senza dipendenze aggiuntive), eseguibile con `node --test` da riga di comando esattamente come girerà in CI.

- [ ] **Step 1: Scrivere il test rosso**

```javascript
// scripts/__tests__/check-faq-sync.test.js
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT_PATH = path.join(__dirname, '..', 'check-faq-sync.js');

function writeTempFaqFile(dir, name, content) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

const VALID_FAQ_CONTENT = `
export const FAQ_ITEMS = [
  {
    id: 'a',
    question: 'Domanda A?',
    answer: 'Risposta A.',
    audience: 'all',
  },
];
`;

const MISMATCHED_FAQ_CONTENT = `
export const FAQ_ITEMS = [
  {
    id: 'a',
    question: 'Domanda A modificata?',
    answer: 'Risposta A.',
    audience: 'all',
  },
];
`;

describe('scripts/check-faq-sync.js', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'faq-sync-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('exit code 0 quando i due file hanno lo stesso blocco FAQ_ITEMS', () => {
    const webFile = writeTempFaqFile(tmpDir, 'web-faq.js', VALID_FAQ_CONTENT);
    const mobileFile = writeTempFaqFile(tmpDir, 'mobile-faq.js', VALID_FAQ_CONTENT);

    assert.doesNotThrow(() => {
      execFileSync('node', [SCRIPT_PATH, webFile, mobileFile], { stdio: 'pipe' });
    });
  });

  test('exit code diverso da 0 quando i due file divergono', () => {
    const webFile = writeTempFaqFile(tmpDir, 'web-faq.js', VALID_FAQ_CONTENT);
    const mobileFile = writeTempFaqFile(tmpDir, 'mobile-faq.js', MISMATCHED_FAQ_CONTENT);

    assert.throws(() => {
      execFileSync('node', [SCRIPT_PATH, webFile, mobileFile], { stdio: 'pipe' });
    });
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `node --test scripts/__tests__/check-faq-sync.test.js`
Expected: FAIL — `scripts/check-faq-sync.js` non esiste ancora (`execFileSync` fallisce con `ENOENT` o modulo non trovato, entrambi i test falliscono: il primo perché si aspettava di non lanciare, il secondo passa per il motivo sbagliato — lo script non esiste, non perché rilevi un mismatch).

- [ ] **Step 3: Implementare lo script**

```javascript
// scripts/check-faq-sync.js
//
// Verifica che i due file dati FAQ (web e mobile, duplicati
// intenzionalmente — vedi docs/superpowers/specs/2026-08-08-pdf-export-help-faq-design.md)
// contengano lo stesso blocco FAQ_ITEMS. Confronto testuale, non esecuzione
// dei moduli: frontend-web è ESM puro ("type": "module" in package.json),
// uno script CommonJS in scripts/ non può require()/import() quei file in
// modo affidabile senza allineare i sistemi di modulo tra progetti diversi.
//
// Uso:
//   node scripts/check-faq-sync.js [pathA] [pathB]
// Default (nessun argomento): confronta i percorsi reali del repo.

const fs = require('fs');
const path = require('path');

function extractFaqItemsBlock(fileContent) {
  const startMarker = 'FAQ_ITEMS = [';
  const startIndex = fileContent.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error(`Marker "${startMarker}" non trovato nel file`);
  }
  const arrayStart = startIndex + startMarker.length - 1; // include la '['
  const endIndex = fileContent.indexOf('\n];', arrayStart);
  if (endIndex === -1) {
    throw new Error('Chiusura "];" del blocco FAQ_ITEMS non trovata');
  }
  return fileContent.slice(arrayStart, endIndex + 2); // include ']'
}

function normalize(block) {
  return block.replace(/\s+/g, ' ').trim();
}

function main() {
  const args = process.argv.slice(2);
  const pathA = args[0] || path.join(__dirname, '..', 'frontend-web', 'src', 'data', 'faq.js');
  const pathB = args[1] || path.join(__dirname, '..', 'frontend-mobile', 'src', 'data', 'faq.js');

  let contentA;
  let contentB;
  try {
    contentA = fs.readFileSync(pathA, 'utf8');
    contentB = fs.readFileSync(pathB, 'utf8');
  } catch (err) {
    console.error(`❌ Impossibile leggere uno dei due file FAQ: ${err.message}`);
    process.exit(1);
  }

  let blockA;
  let blockB;
  try {
    blockA = normalize(extractFaqItemsBlock(contentA));
    blockB = normalize(extractFaqItemsBlock(contentB));
  } catch (err) {
    console.error(`❌ Impossibile estrarre il blocco FAQ_ITEMS: ${err.message}`);
    process.exit(1);
  }

  if (blockA !== blockB) {
    console.error(`❌ FAQ content mismatch tra:\n  ${pathA}\n  ${pathB}\n`);
    console.error('I due file devono avere lo stesso blocco FAQ_ITEMS. Aggiorna entrambi allo stesso contenuto.');
    process.exit(1);
  }

  console.log(`✅ FAQ content allineato tra:\n  ${pathA}\n  ${pathB}`);
  process.exit(0);
}

main();
```

- [ ] **Step 4: Rieseguire il test**

Run: `node --test scripts/__tests__/check-faq-sync.test.js`
Expected: PASS — entrambi i test passano (exit 0 su contenuto identico, exit ≠0 su contenuto divergente).

- [ ] **Step 5: Verifica manuale rosso→verde sui file reali (richiesta esplicitamente dalla spec)**

```bash
node scripts/check-faq-sync.js
```

Expected: `✅ FAQ content allineato` (i due file creati nei Task 2/3 sono identici).

Poi, per confermare che lo script rilevi davvero un disallineamento, introdurre temporaneamente una differenza:

```bash
sed -i.bak "s/Domanda A/Domanda A modificata/" frontend-mobile/src/data/faq.js 2>/dev/null || true
```

(Questo comando è illustrativo — se nessuna riga contiene "Domanda A" perché il contenuto reale usa altre stringhe, modificare manualmente e temporaneamente una `question:` in `frontend-mobile/src/data/faq.js`, es. aggiungere uno spazio extra dentro il testo, non solo whitespace tra token — la normalizzazione collassa gli spazi, quindi la modifica deve cambiare una lettera del contenuto per essere rilevata.)

```bash
node scripts/check-faq-sync.js
```

Expected: `❌ FAQ content mismatch`, exit code 1.

Ripristinare il file:

```bash
git checkout -- frontend-mobile/src/data/faq.js
node scripts/check-faq-sync.js
```

Expected: di nuovo `✅ FAQ content allineato`.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-faq-sync.js scripts/__tests__/check-faq-sync.test.js
git commit -m "feat: add CI-enforceable sync check between web/mobile FAQ data files"
```

---

## Task 5: Web — pagina `/help`

**Files:**
- Create: `frontend-web/src/pages/HelpPage.jsx`
- Modify: `frontend-web/src/App.jsx` (route)
- Test: Create `frontend-web/src/__tests__/HelpPage.test.jsx`

- [ ] **Step 1: Scrivere il test rosso**

```javascript
// frontend-web/src/__tests__/HelpPage.test.jsx
import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import HelpPage from '../pages/HelpPage';
import authService from '../services/authService';

vi.mock('../services/authService', () => ({
  default: { getUserRole: vi.fn(), logout: vi.fn(), isDemo: vi.fn().mockReturnValue(false), getDemoDaysRemaining: vi.fn().mockReturnValue(null) },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Test User', role: 'manager', email: 'test@example.com' }, loading: false }),
}));

describe('HelpPage — role-based FAQ visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('un employee vede le FAQ "employee" e "all", non quelle "staff"', () => {
    authService.getUserRole.mockReturnValue('employee');
    render(<Router><HelpPage /></Router>);

    expect(screen.getByText('Perché non riesco a timbrare (check-in rifiutato)?')).toBeInTheDocument();
    expect(screen.getByText('Come vengono protetti i dati dei dipendenti?')).toBeInTheDocument();
    expect(screen.queryByText('Come posso aggiungere un nuovo dipendente?')).not.toBeInTheDocument();
  });

  test('un admin vede le FAQ "staff" e "all", non quelle "employee"-only', () => {
    authService.getUserRole.mockReturnValue('admin');
    render(<Router><HelpPage /></Router>);

    expect(screen.getByText('Come posso aggiungere un nuovo dipendente?')).toBeInTheDocument();
    expect(screen.getByText('Come vengono protetti i dati dei dipendenti?')).toBeInTheDocument();
    expect(screen.queryByText('Perché non riesco a timbrare (check-in rifiutato)?')).not.toBeInTheDocument();
  });

  test('un manager vede le stesse FAQ "staff" di un admin', () => {
    authService.getUserRole.mockReturnValue('manager');
    render(<Router><HelpPage /></Router>);
    expect(screen.getByText('Quante sedi posso gestire con un unico account manager?')).toBeInTheDocument();
  });

  test('un viewer vede le FAQ "staff"', () => {
    authService.getUserRole.mockReturnValue('viewer');
    render(<Router><HelpPage /></Router>);
    expect(screen.getByText('Il dipendente ha scansionato il QR sbagliato (altra sede). Come si corregge?')).toBeInTheDocument();
  });

  test('ruolo non determinabile (null): solo le FAQ "all" sono visibili', () => {
    authService.getUserRole.mockReturnValue(null);
    render(<Router><HelpPage /></Router>);

    expect(screen.getByText('Come vengono protetti i dati dei dipendenti?')).toBeInTheDocument();
    expect(screen.queryByText('Come posso aggiungere un nuovo dipendente?')).not.toBeInTheDocument();
    expect(screen.queryByText('Perché non riesco a timbrare (check-in rifiutato)?')).not.toBeInTheDocument();
  });

  test('cliccare una domanda espande la risposta', () => {
    authService.getUserRole.mockReturnValue('employee');
    render(<Router><HelpPage /></Router>);

    expect(screen.queryByText(/interruttore/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Come attivo o disattivo il Face ID per il check-in?'));
    expect(screen.getByText(/interruttore/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-web && npx vitest run HelpPage`
Expected: FAIL — `frontend-web/src/pages/HelpPage.jsx` non esiste ancora.

- [ ] **Step 3: Implementare la pagina**

```jsx
// frontend-web/src/pages/HelpPage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Button, Typography,
  Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { NavBar } from '../components/NavBar';
import authService from '../services/authService';
import { FAQ_ITEMS, isVisible } from '../data/faq';

export default function HelpPage() {
  const navigate = useNavigate();
  const userRole = authService.getUserRole();
  const visibleItems = FAQ_ITEMS.filter((item) => isVisible(item, userRole));

  return (
    <div className="min-h-screen bg-linen">
      <NavBar title="Badge System">
        <Button color="inherit" onClick={() => navigate('/dashboard')} sx={{ textTransform: 'none', fontSize: '14px' }}>
          ← Dashboard
        </Button>
      </NavBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E3A5F', mb: 3 }}>
          ❓ Guida — Domande Frequenti
        </Typography>

        {visibleItems.map((item) => (
          <Accordion key={item.id} sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography sx={{ fontWeight: 600 }}>{item.question}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography sx={{ color: '#6B625A' }}>{item.answer}</Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Container>
    </div>
  );
}
```

- [ ] **Step 4: Registrare la route**

In `frontend-web/src/App.jsx`, aggiungere l'import accanto agli altri (dopo `import SummaryPage from './pages/SummaryPage';`):

```javascript
import HelpPage from './pages/HelpPage';
```

Aggiungere la route dopo il blocco `/summary` (righe 277-284):

```jsx
          {/* Help/FAQ: tutti i ruoli, il filtro è sul contenuto */}
          <Route
            path="/help"
            element={
              <ProtectedRoute requiredRoles={['admin', 'manager', 'employee', 'viewer']}>
                <HelpPage />
              </ProtectedRoute>
            }
          />
```

- [ ] **Step 5: Rieseguire il test**

Run: `cd frontend-web && npx vitest run HelpPage`
Expected: PASS.

- [ ] **Step 6: Suite completa frontend-web**

Run: `cd frontend-web && npm test`
Expected: tutti verdi.

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/pages/HelpPage.jsx frontend-web/src/App.jsx frontend-web/src/__tests__/HelpPage.test.jsx
git commit -m "feat(web): add /help page with role-filtered FAQ (backlog MVP #8)"
```

---

## Task 6: Web — voce "Guida" in NavBar

**Files:**
- Modify: `frontend-web/src/components/NavBar.jsx`
- Modify: `frontend-web/src/components/__tests__/NavBar.test.jsx`

- [ ] **Step 1: Scrivere il test rosso**

Aggiungere in `frontend-web/src/components/__tests__/NavBar.test.jsx`, dopo il test `'navigates to /change-password...'` (riga 75):

```javascript
  it('navigates to /help on "Guida"', async () => {
    renderNavBar();
    fireEvent.click(screen.getByText('MR'));
    fireEvent.click(screen.getByText(/Guida/i));
    expect(mockNavigate).toHaveBeenCalledWith('/help');
  });
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-web && npx vitest run NavBar`
Expected: FAIL — nessun testo "Guida" nel menu oggi.

- [ ] **Step 3: Implementare la voce di menu**

In `frontend-web/src/components/NavBar.jsx`, aggiungere un handler dopo `handleChangePassword` (righe 31-34):

```javascript
  const handleHelp = () => {
    handleClose();
    navigate('/help');
  };
```

Aggiungere la nuova `MenuItem` prima di "Cambia password" (riga 169-174), con un `Divider` dopo:

```jsx
          <MenuItem
            onClick={handleHelp}
            sx={{ py: 1.5, fontSize: '14px', color: '#1E3A5F', fontWeight: 500 }}
          >
            ❓&nbsp;&nbsp;Guida
          </MenuItem>

          <Divider />

          <MenuItem
            onClick={handleChangePassword}
            sx={{ py: 1.5, fontSize: '14px', color: '#1E3A5F', fontWeight: 500 }}
          >
            🔑&nbsp;&nbsp;Cambia password
          </MenuItem>
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-web && npx vitest run NavBar`
Expected: PASS (tutti i test del file, incluso quello nuovo).

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/components/NavBar.jsx frontend-web/src/components/__tests__/NavBar.test.jsx
git commit -m "feat(web): add Guida menu entry to NavBar, links to /help"
```

---

## Task 7: Mobile — `HelpScreen.jsx`

**Files:**
- Create: `frontend-mobile/src/screens/settings/HelpScreen.jsx`
- Modify: `frontend-mobile/src/navigation/RootNavigator.jsx` (registrazione)
- Test: Create `frontend-mobile/src/__tests__/HelpScreen.test.jsx`

- [ ] **Step 1: Scrivere il test rosso**

```javascript
// frontend-mobile/src/__tests__/HelpScreen.test.jsx
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('../services/authService', () => ({ getUser: jest.fn() }));

const { interopDefault } = require('./helpers/rntl');
const authService = interopDefault(require('../services/authService'));
const HelpScreen = interopDefault(require('../screens/settings/HelpScreen'));

describe('HelpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('un employee vede le FAQ "employee" e "all", non "staff"', async () => {
    authService.getUser.mockResolvedValue({ role: 'employee' });
    const { getByText, queryByText } = await render(<HelpScreen />);

    await waitFor(() => {
      expect(getByText('Perché non riesco a timbrare (check-in rifiutato)?')).toBeTruthy();
    });
    expect(getByText('Come vengono protetti i dati dei dipendenti?')).toBeTruthy();
    expect(queryByText('Come posso aggiungere un nuovo dipendente?')).toBeNull();
  });

  test('un manager vede le FAQ "staff", non quelle "employee"-only', async () => {
    authService.getUser.mockResolvedValue({ role: 'manager' });
    const { getByText, queryByText } = await render(<HelpScreen />);

    await waitFor(() => {
      expect(getByText('Come posso aggiungere un nuovo dipendente?')).toBeTruthy();
    });
    expect(queryByText('Perché non riesco a timbrare (check-in rifiutato)?')).toBeNull();
  });

  test('se authService.getUser() rigetta, mostra solo le FAQ "all" invece di crashare', async () => {
    authService.getUser.mockRejectedValue(new Error('secure storage unavailable'));
    const { getByText, queryByText } = await render(<HelpScreen />);

    await waitFor(() => {
      expect(getByText('Come vengono protetti i dati dei dipendenti?')).toBeTruthy();
    });
    expect(queryByText('Come posso aggiungere un nuovo dipendente?')).toBeNull();
    expect(queryByText('Perché non riesco a timbrare (check-in rifiutato)?')).toBeNull();
  });

  test('toccare una domanda espande la risposta', async () => {
    authService.getUser.mockResolvedValue({ role: 'employee' });
    const { getByText, queryByText } = await render(<HelpScreen />);

    await waitFor(() => {
      expect(getByText('Come attivo o disattivo il Face ID per il check-in?')).toBeTruthy();
    });
    expect(queryByText(/interruttore/)).toBeNull();

    await act(async () => {
      fireEvent.press(getByText('Come attivo o disattivo il Face ID per il check-in?'));
    });
    expect(getByText(/interruttore/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- HelpScreen`
Expected: FAIL — `frontend-mobile/src/screens/settings/HelpScreen.jsx` non esiste ancora.

- [ ] **Step 3: Implementare la schermata**

```jsx
// frontend-mobile/src/screens/settings/HelpScreen.jsx
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import authService from '../../services/authService';
import { COLORS, FONTS } from '../../config/theme';
import { FAQ_ITEMS, isVisible } from '../../data/faq';

export default function HelpScreen() {
  const [role, setRole] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    authService.getUser()
      .then((user) => setRole(user?.role ?? null))
      .catch((err) => {
        console.warn('HelpScreen: impossibile leggere il ruolo utente, mostro solo le FAQ pubbliche', err);
        setRole(null);
      });
  }, []);

  const visibleItems = FAQ_ITEMS.filter((item) => isVisible(item, role));

  const toggle = (id) => setExpandedId((current) => (current === id ? null : id));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Guida</Text>
      </View>
      <ScrollView>
        {visibleItems.map((item) => (
          <View key={item.id} style={styles.card}>
            <TouchableOpacity style={styles.questionRow} onPress={() => toggle(item.id)}>
              <Text style={styles.question}>{item.question}</Text>
              <Text style={styles.chevron}>{expandedId === item.id ? '︿' : '﹀'}</Text>
            </TouchableOpacity>
            {expandedId === item.id && (
              <Text style={styles.answer}>{item.answer}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.linen },
  header: { backgroundColor: COLORS.white, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.bone },
  title: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink },
  card: {
    backgroundColor: COLORS.white, marginHorizontal: 16, marginTop: 12,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.bone, overflow: 'hidden', padding: 16,
  },
  questionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  question: { flex: 1, fontFamily: FONTS.bodySemiBold, fontSize: 14, color: COLORS.ink, marginRight: 8 },
  chevron: { fontSize: 14, color: COLORS.dust },
  answer: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.stone, marginTop: 10, lineHeight: 19 },
});
```

- [ ] **Step 4: Registrare la schermata in `RootNavigator.jsx`**

Aggiungere l'import dopo `import ChangePasswordScreen from '../screens/settings/ChangePasswordScreen';` (riga 32):

```javascript
import HelpScreen from '../screens/settings/HelpScreen';
```

Aggiungere lo `Screen` in `SettingsStackNavigator` (righe 49-56):

```jsx
function SettingsStackNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="Settings" component={SettingsScreen} />
      <SettingsStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <SettingsStack.Screen name="Help" component={HelpScreen} />
    </SettingsStack.Navigator>
  );
}
```

- [ ] **Step 5: Rieseguire il test**

Run: `cd frontend-mobile && npm test -- HelpScreen`
Expected: PASS.

- [ ] **Step 6: Suite mobile completa**

Run: `cd frontend-mobile && npm test`
Expected: tutti verdi.

- [ ] **Step 7: Commit**

```bash
git add frontend-mobile/src/screens/settings/HelpScreen.jsx frontend-mobile/src/navigation/RootNavigator.jsx frontend-mobile/src/__tests__/HelpScreen.test.jsx
git commit -m "feat(mobile): add HelpScreen with role-filtered FAQ, safe fallback on getUser() rejection (backlog MVP #8)"
```

---

## Task 8: Mobile — voce "Guida" in SettingsScreen

**Files:**
- Modify: `frontend-mobile/src/screens/settings/SettingsScreen.jsx`
- Test: Create `frontend-mobile/src/__tests__/SettingsScreen.test.jsx` (non esiste oggi — nessun test copre questa schermata)

- [ ] **Step 1: Scrivere il test rosso**

```javascript
// frontend-mobile/src/__tests__/SettingsScreen.test.jsx
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('../services/authService', () => ({ getUser: jest.fn(), logout: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

const { interopDefault } = require('./helpers/rntl');
const authService = interopDefault(require('../services/authService'));
const AsyncStorage = interopDefault(require('@react-native-async-storage/async-storage'));
const SettingsScreen = interopDefault(require('../screens/settings/SettingsScreen'));

describe('SettingsScreen — Guida entry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService.getUser.mockResolvedValue({ name: 'Test User', email: 'test@example.com', role: 'employee' });
    AsyncStorage.getItem.mockResolvedValue(null);
  });

  test('naviga a Help quando si tocca "Guida"', async () => {
    const navigation = { navigate: jest.fn(), reset: jest.fn() };
    const { getByText } = await render(<SettingsScreen navigation={navigation} />);

    await waitFor(() => expect(getByText('Test User')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByText('Guida'));
    });

    expect(navigation.navigate).toHaveBeenCalledWith('Help');
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- SettingsScreen`
Expected: FAIL — nessun testo "Guida" oggi in `SettingsScreen.jsx`, `navigation.navigate` mai chiamato con `'Help'`.

- [ ] **Step 3: Aggiungere la voce**

In `frontend-mobile/src/screens/settings/SettingsScreen.jsx`, nella sezione "Account" (righe 76-85), aggiungere una riga dopo il bottone "Password e sicurezza":

```jsx
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabelDisabled}>Dati personali</Text>
        </View>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ChangePassword')}>
          <Text style={styles.rowLabel}>Password e sicurezza</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Help')}>
          <Text style={styles.rowLabel}>Guida</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-mobile && npm test -- SettingsScreen`
Expected: PASS.

- [ ] **Step 5: Suite mobile completa**

Run: `cd frontend-mobile && npm test`
Expected: tutti verdi.

- [ ] **Step 6: Commit**

```bash
git add frontend-mobile/src/screens/settings/SettingsScreen.jsx frontend-mobile/src/__tests__/SettingsScreen.test.jsx
git commit -m "feat(mobile): add Guida entry to SettingsScreen, navigates to HelpScreen"
```

---

## Task 9: CI — eseguire `check-faq-sync.js` sul job `backend`

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Leggere il job `backend` per intero**

Il job `backend` in `.github/workflows/ci.yml` ha già Node 20 configurato (step "Setup Node.js 20") — verificare il nome esatto dello step precedente eseguendo `grep -n "Run backend tests" .github/workflows/ci.yml` prima di inserire il nuovo step, per posizionarlo subito dopo senza spostare altri step.

- [ ] **Step 2: Aggiungere lo step**

Subito dopo lo step `- name: Run backend tests` (e prima di `- name: Upload coverage reports`), aggiungere:

```yaml
      - name: Check FAQ content sync (web/mobile)
        run: node scripts/check-faq-sync.js
```

- [ ] **Step 3: Verificare la sintassi YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML valido"`
Expected: `YAML valido`, nessun errore di parsing.

- [ ] **Step 4: Verificare che lo script giri correttamente nell'ambiente CI (Node 20, nessuna dipendenza da installare)**

Run: `node scripts/check-faq-sync.js`
Expected: `✅ FAQ content allineato` (stesso comando già verificato nel Task 4 Step 5 — qui si conferma solo che non servano dipendenze npm aggiuntive, lo script usa solo `fs`/`path` core).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enforce FAQ content sync check between web and mobile"
```

---

## Task 10: Gate finale

- [ ] **Step 1: Suite completa dei 2 progetti frontend**

Run: `cd frontend-web && npm test`
Run: `cd frontend-mobile && npm test`
Expected: tutti verdi, nessuna regressione rispetto al baseline pre-piano.

- [ ] **Step 2: Lint**

Run: `cd frontend-web && npm run lint` (se il progetto ha uno script lint — verificare con `cat frontend-web/package.json | grep lint`; se assente, skip)
Run: `cd frontend-mobile && npm run lint` (stessa verifica)
Expected: nessun errore.

- [ ] **Step 3: Verifica finale sync FAQ**

Run: `node scripts/check-faq-sync.js`
Expected: `✅ FAQ content allineato`.

- [ ] **Step 4: Riepilogo per l'utente**

Riportare: numero totale di commit del piano, risultato delle suite di test (numero test passati per progetto), conferma che nessuna build nativa mobile è richiesta per questo rilascio (feature pubblicabile via OTA — vedi spec, sezione Rollout).

---

## Note per l'implementer (subagent-driven-development / executing-plans)

- **Task 2 e Task 3 devono produrre contenuto byte-per-byte identico** (a meno di normalizzazione whitespace) nei due `faq.js` — copiare il testo esatto, non riscriverlo a memoria, altrimenti Task 4 (sync check) fallirà per un motivo sbagliato (drift accidentale introdotto durante l'implementazione stessa, non un vero bug applicativo).
- **`authService.getUser()` (mobile) è un passthrough di `secureAuthStorage.getUser()`** (verificato in `frontend-mobile/src/services/authService.js:52-54`) — stessa classe di fallimento (`SecureStorageError`), stesso motivo per cui `HelpScreen` ha bisogno del `.catch()` esplicito che `SettingsScreen.jsx` oggi non ha (gap pre-esistente in un file non toccato da questo piano — non replicarlo nel nuovo codice).
- **Il Task 9 (step CI) non può essere verificato end-to-end in locale** (nessun modo di eseguire l'intero workflow GitHub Actions da riga di comando) — la verifica locale dello script (Task 4 Step 5, Task 9 Step 4) è la miglior approssimazione disponibile. Il vero test è la prima esecuzione della pipeline dopo il push.
- Se un qualunque numero di riga citato in questo piano (es. `NavBar.jsx:169-174`, `App.jsx:277-284`) non corrisponde più al file reale al momento dell'implementazione, rileggere il file e adattare — i numeri di riga sono un riferimento del momento in cui è stato scritto questo piano, non una garanzia.
