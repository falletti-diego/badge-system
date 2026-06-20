# S.24 — GDPR GPS Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere il trattamento GPS di Badge System conforme a GDPR Art. 13-14: pagina Privacy Policy pubblica accessibile, dialog in-app funzionante (fix bug fatale), e cancellazione automatica coordinate GPS dopo 90 giorni.

**Architecture:** L'infrastruttura backend è già completa (migration 012, consent.js, consent.test.js). Mancano tre pezzi: (1) GPSConsentDialog usa `AlertDialog` inesistente in React Native — crash certo al build; (2) la Privacy Policy non ha una pagina HTML pubblica accessibile via browser (il dialog linka `badge.dataxiom.it/privacy-policy-it` → 404); (3) la Privacy Policy promette cancellazione GPS automatica a 90 giorni ma non esiste nessuno script/cron. Il piano corregge questi tre gap nell'ordine: fix bug → pagina pubblica → retention → test mancante.

**Tech Stack:** React Native (Expo SDK 54, Modal nativo), React 18 + Vite (HTML statico in `public/`), Node.js/Express (script retention), PostgreSQL (UPDATE SET NULL su checkin_latitude/longitude), Netlify `_redirects`, EC2 crontab.

---

## Analisi Critica: Stato Attuale

### Già completo (NON ripetere)
| Componente | File | Status |
|---|---|---|
| Schema DB GPS consent | `backend/migrations/012_add_consent_tracking.sql` | ✅ Applicato |
| Backend consent API | `backend/src/routes/consent.js` | ✅ Completo (3 endpoint) |
| Router montato | `backend/src/app.js:181` | ✅ `/api/v1/consent` |
| Test POST/GET my-consents | `backend/src/__tests__/consent.test.js` | ✅ 7 test |
| QRScannerScreen integrazione | `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx` | ✅ Logica completa |
| Privacy Policy contenuto | `docs/privacy-policy-IT.md` | ✅ v2.0, copre GPS |
| Endpoint CONSENT_GPS_ACCEPTANCE | `frontend-mobile/src/config/endpoints.js:19` | ✅ Definito |

### Gap da risolvere (questo piano)
| Gap | Impatto | Task |
|---|---|---|
| `AlertDialog` non esiste in React Native | **CRASH BUILD** — il dialog non funziona mai | Task 1 |
| `badge.dataxiom.it/privacy-policy-it` → 404 | Link nel dialog è rotto — violazione Art. 13 | Task 2 |
| Nessuno script cancella GPS dopo 90gg | Privacy Policy falsa — violazione Art. 5(1)(e) | Task 3 |
| `GET /admin/employee-consents` senza test | Coverage gap su endpoint admin | Task 4 |

---

## File Structure

```
frontend-mobile/src/components/
  GPSConsentDialog.jsx          ← MODIFY: fix AlertDialog → Modal nativo

frontend-web/public/
  privacy-policy-it.html        ← CREATE: pagina HTML standalone (no React)
  _redirects                    ← MODIFY: aggiungi /privacy-policy-it route

backend/scripts/
  gps-retention.js              ← CREATE: NULL-ifica coordinate GPS >90gg

backend/src/__tests__/
  consent.test.js               ← MODIFY: aggiungi test GET /admin/employee-consents
  gps-retention.test.js         ← CREATE: unit test script retention
```

---

## Task 1: Fix GPSConsentDialog — React Native Modal

**Problema:** `GPSConsentDialog.jsx` importa `AlertDialog` da `'react-native'` (non esiste in React Native core né in Expo). Il componente non può essere mai stato testato su device. Provoca un runtime error immediato.

**Soluzione:** Riscrivere con `Modal` nativo di React Native. Design: modale su sfondo scuro semitrasparente, scrollable per testi lunghi, due bottoni non-dismissable (utente deve scegliere).

**Files:**
- Modify: `frontend-mobile/src/components/GPSConsentDialog.jsx`

- [ ] **Step 1: Leggi il file corrente per verificare il bug**

```bash
grep -n "AlertDialog\|import" frontend-mobile/src/components/GPSConsentDialog.jsx
```

Expected output: `import { AlertDialog, Button, View, Text, Linking, StyleSheet } from 'react-native';`
Confermato: `AlertDialog` non esiste in React Native.

- [ ] **Step 2: Riscrivi GPSConsentDialog con Modal nativo**

Sostituisci l'intero contenuto di `frontend-mobile/src/components/GPSConsentDialog.jsx` con:

```jsx
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
  StyleSheet,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

/**
 * GPSConsentDialog — GDPR Art. 7 explicit consent for geofencing
 * Shown once per employee before first GPS check-in.
 * Non-dismissable (user must choose Accetto or Rifiuto).
 * Uses React Native Modal — no third-party UI library dependency.
 */
export default function GPSConsentDialog({ visible, onConsent, onDecline }) {
  const handlePrivacyLink = () => {
    Linking.openURL('https://badge.dataxiom.it/privacy-policy-it').catch(() => {
      // Fail silently — link is informational
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Android back button — do nothing, user must choose explicitly
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>📍 Verifica di Sede</Text>

            <Text style={styles.body}>
              Il datore di lavoro ha abilitato la verifica di sede (GPS). Badge System
              registra la tua posizione <Text style={styles.bold}>solo al momento del
              check-in</Text> per verificare che tu sia fisicamente in sede.
            </Text>

            <Text style={styles.sectionLabel}>Dati raccolti:</Text>
            <Text style={styles.bullet}>• Latitudine e longitudine al momento del check-in</Text>

            <Text style={styles.sectionLabel}>Conservazione:</Text>
            <Text style={styles.bullet}>• Le coordinate sono cancellate automaticamente dopo <Text style={styles.bold}>90 giorni</Text></Text>

            <Text style={styles.sectionLabel}>I tuoi diritti:</Text>
            <Text style={styles.bullet}>• Puoi rifiutare (check-in senza GPS, se disponibile)</Text>
            <Text style={styles.bullet}>• Puoi richiedere cancellazione anticipata</Text>
            <Text style={styles.bullet}>• Puoi consultare le coordinate registrate</Text>

            <Text style={styles.linkRow}>
              Per dettagli:{' '}
              <Text style={styles.link} onPress={handlePrivacyLink}>
                Privacy Policy
              </Text>
            </Text>
          </ScrollView>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnDecline]}
              onPress={onDecline}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnText, styles.btnTextDecline]}>Rifiuto</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnAccept]}
              onPress={onConsent}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnText, styles.btnTextAccept]}>Accetto</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: Math.min(width - 40, 400),
    maxHeight: '80%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E3A5F',
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    color: '#2A2520',
    lineHeight: 22,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E3A5F',
    marginTop: 8,
    marginBottom: 4,
  },
  bullet: {
    fontSize: 13,
    color: '#4A4540',
    lineHeight: 20,
    paddingLeft: 4,
  },
  bold: {
    fontWeight: '700',
  },
  linkRow: {
    fontSize: 13,
    color: '#4A4540',
    marginTop: 16,
    marginBottom: 4,
  },
  link: {
    color: '#1E6FB5',
    textDecorationLine: 'underline',
  },
  buttonRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    padding: 16,
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDecline: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  btnAccept: {
    backgroundColor: '#1E3A5F',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  btnTextDecline: {
    color: '#B91C1C',
  },
  btnTextAccept: {
    color: '#FFFFFF',
  },
});
```

- [ ] **Step 3: Verifica che il file sia stato salvato correttamente**

```bash
head -5 frontend-mobile/src/components/GPSConsentDialog.jsx
```

Expected: `import React from 'react';` (nessun AlertDialog)

- [ ] **Step 4: Verifica che QRScannerScreen importi correttamente**

```bash
grep -n "GPSConsentDialog" frontend-mobile/src/screens/checkin/QRScannerScreen.jsx
```

Expected: `import GPSConsentDialog from '../../components/GPSConsentDialog';` — già corretto.

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/src/components/GPSConsentDialog.jsx
git commit -m "fix(mobile): rewrite GPSConsentDialog with React Native Modal (AlertDialog non esiste in RN)"
```

---

## Task 2: Pagina Privacy Policy HTML pubblica

**Problema:** `badge.dataxiom.it/privacy-policy-it` restituisce 404 perché la SPA catch-all (`/* /index.html 200`) intercetta tutte le route. Il dialog GPS linka questa URL — il link è rotto, violazione Art. 13 GDPR.

**Soluzione:** Creare `frontend-web/public/privacy-policy-it.html` (file statico HTML, nessun React) e aggiungere un redirect in `_redirects` prima del catch-all SPA.

**Files:**
- Create: `frontend-web/public/privacy-policy-it.html`
- Modify: `frontend-web/public/_redirects`

- [ ] **Step 1: Verifica che la pagina non esista già**

```bash
ls frontend-web/public/
```

Expected: `_headers _redirects config.js examples/` — nessun `privacy-policy-it.html`.

- [ ] **Step 2: Crea `frontend-web/public/privacy-policy-it.html`**

Crea il file con questo contenuto (HTML standalone, nessuna dipendenza da React):

```html
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Informativa Privacy — Badge System</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1a1a1a;
      background: #f9fafb;
      margin: 0;
      padding: 0;
    }

    .header {
      background: #1E3A5F;
      color: #fff;
      padding: 24px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 4px;
      font-size: 22px;
      font-weight: 700;
    }
    .header p {
      margin: 0;
      font-size: 13px;
      opacity: 0.8;
    }

    .container {
      max-width: 760px;
      margin: 0 auto;
      padding: 32px 20px 64px;
    }

    .version-badge {
      display: inline-block;
      background: #EFF6FF;
      color: #1E3A5F;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 20px;
      margin-bottom: 24px;
    }

    h2 {
      font-size: 18px;
      font-weight: 700;
      color: #1E3A5F;
      margin: 32px 0 12px;
      padding-bottom: 6px;
      border-bottom: 2px solid #DBEAFE;
    }
    h3 {
      font-size: 15px;
      font-weight: 600;
      color: #374151;
      margin: 20px 0 8px;
    }

    p { margin: 0 0 12px; }

    .highlight-box {
      background: #FEF9C3;
      border: 1px solid #FDE68A;
      border-left: 4px solid #F59E0B;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 20px 0;
    }
    .highlight-box strong { color: #92400E; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      margin: 16px 0;
    }
    th {
      background: #1E3A5F;
      color: #fff;
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #E5E7EB;
      vertical-align: top;
    }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #F9FAFB; }

    ul { margin: 8px 0; padding-left: 20px; }
    li { margin-bottom: 6px; }

    .rights-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
      margin: 16px 0;
    }
    .right-card {
      background: #fff;
      border: 1px solid #E5E7EB;
      border-radius: 10px;
      padding: 14px 16px;
    }
    .right-card .right-title {
      font-size: 13px;
      font-weight: 700;
      color: #1E3A5F;
      margin-bottom: 4px;
    }
    .right-card p {
      font-size: 13px;
      color: #6B7280;
      margin: 0;
    }

    .contact-box {
      background: #EFF6FF;
      border: 1px solid #BFDBFE;
      border-radius: 10px;
      padding: 20px;
      margin: 16px 0;
    }
    .contact-box a { color: #1E3A5F; }

    .footer {
      text-align: center;
      padding: 32px 20px;
      font-size: 12px;
      color: #9CA3AF;
      border-top: 1px solid #E5E7EB;
    }
    .back-link {
      display: inline-block;
      margin-top: 24px;
      color: #1E3A5F;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
    }
    .back-link:hover { text-decoration: underline; }

    @media (max-width: 600px) {
      .rights-grid { grid-template-columns: 1fr; }
      table { font-size: 13px; }
      th, td { padding: 8px 10px; }
    }
  </style>
</head>
<body>

<div class="header">
  <h1>Informativa Privacy</h1>
  <p>Badge System · GDPR Art. 13-14</p>
</div>

<div class="container">
  <span class="version-badge">Versione 2.0 · Aggiornata 11 Giugno 2026</span>

  <p><strong>Titolare del Trattamento (Data Controller):</strong> Il datore di lavoro (azienda cliente che utilizza Badge System).</p>
  <p><strong>Responsabile del Trattamento (Data Processor):</strong> Dataxiom S.r.l. · Rappresentante: Diego Falletti · <a href="mailto:privacy@dataxiom.it">privacy@dataxiom.it</a></p>

  <h2>1. Dati Personali Raccolti</h2>
  <table>
    <thead>
      <tr>
        <th>Categoria</th>
        <th>Descrizione</th>
        <th>Base Legale</th>
        <th>Retention</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Identificativi</strong></td>
        <td>Nome, email, numero dipendente</td>
        <td>Art. 6(1)(b) Contratto</td>
        <td>Durata rapporto + 12 mesi</td>
      </tr>
      <tr>
        <td><strong>Localizzazione GPS</strong></td>
        <td>Latitudine, longitudine (solo al check-in, solo se geofencing abilitato)</td>
        <td>Art. 6(1)(f) Legittimo interesse + Art. 7 Consenso</td>
        <td><strong>90 giorni</strong> (poi cancellazione automatica)</td>
      </tr>
      <tr>
        <td><strong>Timbrature</strong></td>
        <td>Data, ora, tipo (Entrata/Uscita)</td>
        <td>Art. 6(1)(b) Contratto</td>
        <td>24 mesi</td>
      </tr>
      <tr>
        <td><strong>Log di Audit</strong></td>
        <td>Modifiche ai dati, chi ha modificato e quando</td>
        <td>Art. 6(1)(c) Obbligo legale</td>
        <td>3 anni</td>
      </tr>
    </tbody>
  </table>

  <h2>2. Geolocalizzazione GPS — Dettagli</h2>

  <div class="highlight-box">
    <strong>Importante:</strong> Badge System registra la tua posizione GPS <strong>solo al momento del check-in</strong> e <strong>solo se il tuo datore di lavoro ha abilitato il geofencing</strong> per la tua sede. La posizione non viene mai monitorata in modo continuo.
  </div>

  <h3>Come funziona</h3>
  <ul>
    <li>Al check-in, l'app richiede la tua posizione GPS per verificare che tu sia entro un raggio configurabile dalla sede (default: 150 metri)</li>
    <li>La verifica utilizza la formula matematica Haversine (open-source, no black box)</li>
    <li>Le coordinate sono salvate nel database per 90 giorni, poi cancellate automaticamente</li>
    <li>Le coordinate non sono mai condivise con terzi al di fuori dell'infrastruttura AWS eu-west-1</li>
  </ul>

  <h3>Diritti del Dipendente (Art. 15-22 GDPR)</h3>
  <div class="rights-grid">
    <div class="right-card">
      <div class="right-title">Accesso (Art. 15)</div>
      <p>Richiedere copia di tutte le coordinate GPS registrate per te</p>
    </div>
    <div class="right-card">
      <div class="right-title">Rettifica (Art. 16)</div>
      <p>Se le coordinate sono errate, richiedere la correzione</p>
    </div>
    <div class="right-card">
      <div class="right-title">Cancellazione (Art. 17)</div>
      <p>Richiedere cancellazione anticipata (garantita entro 7 giorni)</p>
    </div>
    <div class="right-card">
      <div class="right-title">Limitazione (Art. 18)</div>
      <p>Disabilitare il geofencing per check-in senza GPS, se la base legale lo permette</p>
    </div>
    <div class="right-card">
      <div class="right-title">Opposizione (Art. 21)</div>
      <p>Rifiutare il geofencing basato su legittimo interesse</p>
    </div>
    <div class="right-card">
      <div class="right-title">Portabilità (Art. 20)</div>
      <p>Ricevere i tuoi dati in formato strutturato (CSV)</p>
    </div>
  </div>

  <h2>3. Finalità del Trattamento</h2>
  <ul>
    <li><strong>Tracciamento Presenze</strong> — registrare orari entrata/uscita (Base: Art. 6(1)(b))</li>
    <li><strong>Verifica Geofencing</strong> — confermare presenza fisica in sede (Base: Art. 6(1)(f) + consenso)</li>
    <li><strong>Gestione Turni</strong> — assegnazione e verifica orari (Base: Art. 6(1)(b))</li>
    <li><strong>Reporting HR</strong> — dashboard e export CSV per paghe (Base: Art. 6(1)(b))</li>
    <li><strong>Conformità Legale</strong> — conservazione per audit fiscali, INPS (Base: Art. 6(1)(c))</li>
  </ul>

  <h2>4. Sub-Processori e Trasferimenti Dati</h2>
  <p>Dataxiom utilizza i seguenti servizi AWS, tutti localizzati in <strong>eu-west-1 (Irlanda, UE)</strong>:</p>
  <ul>
    <li><strong>Amazon RDS PostgreSQL</strong> — database con encryption at rest (AES-256)</li>
    <li><strong>Amazon EC2</strong> — API backend con TLS 1.3</li>
    <li><strong>AWS Secrets Manager</strong> — chiavi crittografiche</li>
  </ul>
  <p>Nessun trasferimento verso Paesi extra-UE. AWS è sottoposto a Data Processing Addendum (DPA) con Standard Contractual Clauses (SCC).</p>

  <h2>5. Contatti e Reclami</h2>
  <div class="contact-box">
    <p><strong>Dataxiom (Data Processor):</strong> <a href="mailto:privacy@dataxiom.it">privacy@dataxiom.it</a> — risposta entro 5 giorni lavorativi</p>
    <p><strong>Datore di lavoro (Data Controller):</strong> contatta il tuo HR Manager</p>
    <p style="margin:0"><strong>Garante Privacy Italiano:</strong> <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener">garanteprivacy.it</a> — reclamo gratuito</p>
  </div>

  <a href="javascript:history.back()" class="back-link">← Torna all'app</a>
</div>

<div class="footer">
  Informativa Privacy v2.0 · Badge System · © Dataxiom S.r.l. · <a href="mailto:privacy@dataxiom.it">privacy@dataxiom.it</a>
</div>

</body>
</html>
```

- [ ] **Step 3: Aggiungi redirect in `_redirects` per `/privacy-policy-it` senza estensione**

Modifica `frontend-web/public/_redirects`. Aggiungi prima del catch-all SPA:

```
# Static pages — must come before the SPA catch-all
/privacy-policy-it  /privacy-policy-it.html  200

# API proxy: forward /api/* to EC2 backend (fallback; config.js normally sets URL directly)
# Must come before the SPA catch-all
/api/*  https://api.dataxiom.it/api/:splat  200

# SPA catch-all: all other routes → React app
/*  /index.html  200
```

- [ ] **Step 4: Verifica build Vite locale**

```bash
cd frontend-web && npm run build 2>&1 | tail -5
```

Expected: `✓ built in X.XXs` — nessun errore.

- [ ] **Step 5: Verifica che il file sia copiato nella dist**

```bash
ls frontend-web/dist/privacy-policy-it.html
```

Expected: file presente.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/public/privacy-policy-it.html frontend-web/public/_redirects
git commit -m "feat(web): add public Privacy Policy HTML page (GDPR Art. 13-14, GPS disclosure)"
```

---

## Task 3: GPS Coordinate Auto-Deletion Script (90 giorni)

**Problema:** La Privacy Policy afferma "coordinate cancellate automaticamente dopo 90 giorni" ma non esiste nessuno script né cron. È una promessa GDPR non mantenuta (Art. 5(1)(e) — limitazione della conservazione).

**Soluzione:** Creare `backend/scripts/gps-retention.js` che esegue `UPDATE checkins SET checkin_latitude = NULL, checkin_longitude = NULL WHERE timestamp < NOW() - INTERVAL '90 days' AND (checkin_latitude IS NOT NULL OR checkin_longitude IS NOT NULL)`. Non elimina il check-in (necessario per paghe/compliance) — solo annulla le coordinate GPS.

**Files:**
- Create: `backend/scripts/gps-retention.js`
- Create: `backend/src/__tests__/gps-retention.test.js`

- [ ] **Step 1: Scrivi il test prima (TDD)**

Crea `backend/src/__tests__/gps-retention.test.js`:

```js
'use strict';

/**
 * Unit tests: GPS Retention Script (GDPR Art. 5(1)(e) — storage limitation)
 * Tests that gps-retention.js correctly nullifies checkin coordinates older than 90 days.
 * DB is mocked — no real connection needed.
 */

const { Pool } = require('pg');

jest.mock('pg', () => {
  const mockQuery = jest.fn();
  const mockEnd = jest.fn().mockResolvedValue(undefined);
  return {
    Pool: jest.fn().mockImplementation(() => ({
      query: mockQuery,
      end: mockEnd,
    })),
    __mockQuery: mockQuery,
    __mockEnd: mockEnd,
  };
});

// Import AFTER mock is set up
let run;
beforeEach(() => {
  jest.resetModules();
  // Reset argv to remove any --dry-run from previous test
  process.argv = ['node', 'gps-retention.js'];
  const pg = require('pg');
  pg.__mockQuery.mockReset();
  pg.__mockEnd.mockReset().mockResolvedValue(undefined);
  run = require('../../scripts/gps-retention').run;
});

describe('GPS Retention Script', () => {
  test('should count affected rows and return summary in dry-run mode', async () => {
    process.argv.push('--dry-run');
    jest.resetModules();
    run = require('../../scripts/gps-retention').run;

    const pg = require('pg');
    pg.__mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '42' }] }) // COUNT query
      .mockResolvedValueOnce({ rowCount: 0 }); // pool.end doesn't need this

    const result = await run();

    expect(result.dryRun).toBe(true);
    expect(result.affectedRows).toBe(42);
    expect(result.nullified).toBe(0);
    // COUNT query should have been called
    expect(pg.__mockQuery).toHaveBeenCalledTimes(1);
    const countSql = pg.__mockQuery.mock.calls[0][0];
    expect(countSql).toContain('COUNT(*)');
    expect(countSql).toContain('checkin_latitude IS NOT NULL');
  });

  test('should nullify coordinates in live mode and return count', async () => {
    const pg = require('pg');
    pg.__mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '15' }] }) // COUNT
      .mockResolvedValueOnce({ rowCount: 15 });            // UPDATE

    const result = await run();

    expect(result.dryRun).toBe(false);
    expect(result.nullified).toBe(15);

    const updateSql = pg.__mockQuery.mock.calls[1][0];
    expect(updateSql).toContain('UPDATE checkins');
    expect(updateSql).toContain('checkin_latitude = NULL');
    expect(updateSql).toContain('checkin_longitude = NULL');
    expect(updateSql).toContain("INTERVAL '90 days'");
  });

  test('should skip UPDATE when count is 0', async () => {
    const pg = require('pg');
    pg.__mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // COUNT = 0

    const result = await run();

    expect(result.nullified).toBe(0);
    // Only 1 query (COUNT) — UPDATE skipped
    expect(pg.__mockQuery).toHaveBeenCalledTimes(1);
  });

  test('should respect GPS_RETENTION_DAYS env var', async () => {
    process.env.GPS_RETENTION_DAYS = '30';
    jest.resetModules();
    run = require('../../scripts/gps-retention').run;

    const pg = require('pg');
    pg.__mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      .mockResolvedValueOnce({ rowCount: 5 });

    await run();

    const countSql = pg.__mockQuery.mock.calls[0][0];
    expect(countSql).toContain("INTERVAL '30 days'");

    delete process.env.GPS_RETENTION_DAYS;
  });

  test('should default to 90 days when GPS_RETENTION_DAYS not set', async () => {
    delete process.env.GPS_RETENTION_DAYS;
    jest.resetModules();
    run = require('../../scripts/gps-retention').run;

    const pg = require('pg');
    pg.__mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    await run();

    const countSql = pg.__mockQuery.mock.calls[0][0];
    expect(countSql).toContain("INTERVAL '90 days'");
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisce (TDD red)**

```bash
cd backend && npm test -- --testPathPattern="gps-retention" --no-coverage 2>&1 | tail -10
```

Expected: `FAIL src/__tests__/gps-retention.test.js` con `Cannot find module '../../scripts/gps-retention'`

- [ ] **Step 3: Crea `backend/scripts/gps-retention.js`**

```js
#!/usr/bin/env node
/**
 * gps-retention.js — GDPR Art. 5(1)(e) Storage Limitation
 *
 * Nullifies GPS coordinates (checkin_latitude, checkin_longitude) from check-in
 * records older than GPS_RETENTION_DAYS (default: 90 days).
 *
 * Rows are NOT deleted — the check-in timestamp and type are retained for payroll
 * and compliance (DLgs 81/08, 24-month retention). Only the GPS fields are cleared.
 *
 * Usage:
 *   node scripts/gps-retention.js [--dry-run]
 *
 * Env vars required: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 * Optional: GPS_RETENTION_DAYS (default: 90)
 *
 * Schedule: daily at 02:30 UTC via EC2 crontab (see docs/runbook.md §GPS)
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const GPS_RETENTION_DAYS = parseInt(process.env.GPS_RETENTION_DAYS || '90', 10);
const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  });

  try {
    const interval = `${GPS_RETENTION_DAYS} days`;

    // Count rows affected
    const countResult = await pool.query(
      `SELECT COUNT(*)
       FROM checkins
       WHERE timestamp < NOW() - INTERVAL '${interval}'
         AND (checkin_latitude IS NOT NULL OR checkin_longitude IS NOT NULL)`,
    );
    const affectedRows = parseInt(countResult.rows[0].count, 10);

    if (DRY_RUN) {
      console.log(`[DRY RUN] GPS retention (${GPS_RETENTION_DAYS} days): would nullify ${affectedRows} check-in coordinate pairs`);
      return { dryRun: true, affectedRows, nullified: 0 };
    }

    if (affectedRows === 0) {
      console.log(`GPS retention: no coordinates older than ${GPS_RETENTION_DAYS} days. Nothing to do.`);
      await pool.end();
      return { dryRun: false, nullified: 0 };
    }

    // Nullify GPS fields — keep the check-in row intact
    const updateResult = await pool.query(
      `UPDATE checkins
       SET checkin_latitude = NULL, checkin_longitude = NULL
       WHERE timestamp < NOW() - INTERVAL '${interval}'
         AND (checkin_latitude IS NOT NULL OR checkin_longitude IS NOT NULL)`,
    );
    const nullified = updateResult.rowCount;

    console.log(`GPS retention: nullified ${nullified} coordinate pairs older than ${GPS_RETENTION_DAYS} days (GDPR Art. 5(1)(e))`);
    await pool.end();
    return { dryRun: false, nullified };
  } catch (err) {
    console.error('GPS retention failed:', err.message);
    await pool.end();
    throw err;
  }
}

// Only execute when run directly (not when required by tests)
if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
```

- [ ] **Step 4: Esegui i test per verificare che passano (TDD green)**

```bash
cd backend && npm test -- --testPathPattern="gps-retention" --no-coverage 2>&1 | tail -15
```

Expected:
```
PASS src/__tests__/gps-retention.test.js
  GPS Retention Script
    ✓ should count affected rows and return summary in dry-run mode
    ✓ should nullify coordinates in live mode and return count
    ✓ should skip UPDATE when count is 0
    ✓ should respect GPS_RETENTION_DAYS env var
    ✓ should default to 90 days when GPS_RETENTION_DAYS not set
Test Suites: 1 passed, 1 passed
Tests: 5 passed, 5 passed
```

- [ ] **Step 5: Aggiungi EC2 crontab per esecuzione giornaliera**

Connettiti all'EC2 e aggiungi il cron (esegui via Bash o SSH manuale):

```bash
# Visualizza crontab corrente (per confronto)
ssh -i ~/.ssh/badge-key.pem ubuntu@$(cat ~/.ssh/badge-ec2-ip) 'crontab -l'
```

Aggiungi la riga (dopo il cron di audit-log-retention esistente):

```bash
ssh -i ~/.ssh/badge-key.pem ubuntu@$(cat ~/.ssh/badge-ec2-ip) \
  'crontab -l 2>/dev/null; echo "30 2 * * * docker exec badge-system-api node scripts/gps-retention.js >> /var/log/badge-gps-retention.log 2>&1"' \
  | ssh -i ~/.ssh/badge-key.pem ubuntu@$(cat ~/.ssh/badge-ec2-ip) 'crontab -'
```

Verifica installazione:

```bash
ssh -i ~/.ssh/badge-key.pem ubuntu@$(cat ~/.ssh/badge-ec2-ip) 'crontab -l | grep gps'
```

Expected: `30 2 * * * docker exec badge-system-api node scripts/gps-retention.js >> /var/log/badge-gps-retention.log 2>&1`

- [ ] **Step 6: Test dry-run manuale in container**

```bash
ssh -i ~/.ssh/badge-key.pem ubuntu@$(cat ~/.ssh/badge-ec2-ip) \
  'docker exec badge-system-api node scripts/gps-retention.js --dry-run'
```

Expected: `[DRY RUN] GPS retention (90 days): would nullify 0 check-in coordinate pairs` (0 perché il seed data è recente)

- [ ] **Step 7: Commit**

```bash
git add backend/scripts/gps-retention.js backend/src/__tests__/gps-retention.test.js
git commit -m "feat(backend): GPS coordinate auto-deletion after 90 days (GDPR Art. 5(1)(e))"
```

---

## Task 4: Test per GET /admin/employee-consents (coverage gap)

**Problema:** `GET /api/v1/consent/admin/employee-consents` esiste in `consent.js:130` ma non ha test in `consent.test.js`. È l'unico endpoint del file senza copertura — un admin RBAC bypass qui non verrebbe rilevato.

**Files:**
- Modify: `backend/src/__tests__/consent.test.js`

- [ ] **Step 1: Esegui la suite esistente per baseline**

```bash
cd backend && npm test -- --testPathPattern="consent" --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 7 passed` — solo 2 describe block (POST e GET my-consents).

- [ ] **Step 2: Aggiungi i test per admin/employee-consents**

Apri `backend/src/__tests__/consent.test.js` e aggiungi alla fine del `describe` principale (prima della chiusura `}`):

```js
  // =====================================================
  // GET /api/v1/consent/admin/employee-consents
  // =====================================================

  describe('GET /api/v1/consent/admin/employee-consents', () => {
    const adminToken = jwt.sign(
      { user_id: employeeId, client_id: clientId, role: 'admin', employee_id: employeeId },
      process.env.JWT_PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: '1h' }
    );

    test('should return all employee consent statuses for admin', async () => {
      const employees = [
        {
          id: employeeId,
          email: 'alice@test.com',
          name: 'Alice',
          gps_consent_given: true,
          gps_consent_given_at: '2026-06-11T10:30:00Z',
          latest_gps_consent: true,
          privacy_policy_version: '2.0',
          consent_accepted_at: '2026-06-11T10:30:00Z',
        },
        {
          id: otherEmployeeId,
          email: 'bob@test.com',
          name: 'Bob',
          gps_consent_given: false,
          gps_consent_given_at: null,
          latest_gps_consent: null,
          privacy_policy_version: null,
          consent_accepted_at: null,
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: employees });

      const res = await request(app)
        .get('/api/v1/consent/admin/employee-consents')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.summary.total_employees).toBe(2);
      expect(res.body.summary.consented).toBe(1);
      expect(res.body.summary.pending).toBe(1);
      expect(res.body.summary.consent_rate_percent).toBe(50);
    });

    test('should return 403 for non-admin users (employee role)', async () => {
      const res = await request(app)
        .get('/api/v1/consent/admin/employee-consents')
        .set('Authorization', `Bearer ${validToken}`); // employee token

      expect(res.status).toBe(403);
    });

    test('should return 403 for manager role', async () => {
      const managerToken = jwt.sign(
        { user_id: employeeId, client_id: clientId, role: 'manager', employee_id: employeeId },
        process.env.JWT_PRIVATE_KEY,
        { algorithm: 'RS256', expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/v1/consent/admin/employee-consents')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(403);
    });

    test('should return correct consent_rate_percent when all have consented', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: employeeId, gps_consent_given: true, name: 'Alice', email: 'a@t.com', gps_consent_given_at: '2026-06-11T10:00:00Z', latest_gps_consent: true, privacy_policy_version: '2.0', consent_accepted_at: '2026-06-11T10:00:00Z' },
          { id: otherEmployeeId, gps_consent_given: true, name: 'Bob', email: 'b@t.com', gps_consent_given_at: '2026-06-11T11:00:00Z', latest_gps_consent: true, privacy_policy_version: '2.0', consent_accepted_at: '2026-06-11T11:00:00Z' },
        ],
      });

      const res = await request(app)
        .get('/api/v1/consent/admin/employee-consents')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.consent_rate_percent).toBe(100);
    });

    test('should return consent_rate_percent 0 when no employees', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/consent/admin/employee-consents')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.total_employees).toBe(0);
      expect(res.body.summary.consent_rate_percent).toBe(0);
    });
  });
```

- [ ] **Step 3: Esegui la suite aggiornata**

```bash
cd backend && npm test -- --testPathPattern="consent" --no-coverage 2>&1 | tail -15
```

Expected:
```
PASS src/__tests__/consent.test.js
  Consent API — GDPR Art. 7 GPS consent tracking
    POST /api/v1/consent/gps-acceptance
      ✓ should accept GPS consent ...
      ✓ should reject GPS consent ...
      ✓ should validate consent_given is boolean
      ✓ should provide default privacy_policy_version ...
      ✓ should return 400 if employee not found
      ✓ should create audit log entry ...
    GET /api/v1/consent/my-consents
      ✓ should retrieve employee own consent history
      ✓ should return empty array if no consent history
      ✓ should return consents ordered by accepted_at DESC ...
      ✓ should return max 20 entries
      ✓ should query with employee_id and client_id filters
    GET /api/v1/consent/admin/employee-consents
      ✓ should return all employee consent statuses for admin
      ✓ should return 403 for non-admin users (employee role)
      ✓ should return 403 for manager role
      ✓ should return correct consent_rate_percent when all have consented
      ✓ should return consent_rate_percent 0 when no employees
Tests: 16 passed, 16 passed
```

- [ ] **Step 4: Esegui suite completa backend per verificare zero regressioni**

```bash
cd backend && npm test -- --no-coverage 2>&1 | tail -5
```

Expected: `Tests: 455+ passed` (numero esatto dipende da eventuali test aggiunti prima)

- [ ] **Step 5: Commit**

```bash
git add backend/src/__tests__/consent.test.js
git commit -m "test(backend): add 5 tests for GET /admin/employee-consents (coverage gap)"
```

---

## Self-Review

### 1. Spec Coverage

| Requisito S.24 | Task che lo implementa |
|---|---|
| Privacy Policy pubblica con sezione GPS (Art. 13-14) | Task 2 (HTML page + redirect) |
| URL accessibile da browser (`badge.dataxiom.it/privacy-policy-it`) | Task 2 (_redirects) |
| In-app disclosure funzionante (dialog che si apre) | Task 1 (fix AlertDialog → Modal) |
| Link nel dialog funzionante → Privacy Policy | Task 2 (URL esiste) |
| Cancellazione automatica GPS dopo 90 giorni | Task 3 (script + cron) |
| Audit trail consenso GPS | Già completo (consent.js + migration 012) |
| Test coverage su consent admin endpoint | Task 4 |

### 2. Placeholder Scan

Nessun placeholder trovato. Ogni step ha codice completo.

### 3. Type Consistency

- `run()` esportato da `gps-retention.js` — usato nei test come `require('../../scripts/gps-retention').run`  ✅
- `result.dryRun`, `result.affectedRows`, `result.nullified` — coerenti tra test e implementazione ✅
- Token JWT nei test usa `JWT_PRIVATE_KEY` dal `jest.setup.js` — stesso pattern di `consent.test.js` esistente ✅

### 4. Gap identificati

- **Migration 012 su produzione:** Il migration runner idempotente la applica automaticamente a startup — non serve azione manuale. Ma se il container è in produzione da prima che il runner fosse introdotto, potrebbe essere già stata applicata manualmente. L'`IF NOT EXISTS` nelle migration la rende sicura da riapplicare.
- **Build mobile:** `GPSConsentDialog` fixato in Task 1 non richiede nuova build EAS — il fix entra nel prossimo build programmato (10.9). Non blocca il deploy web.

---

**Piano completo: 4 task, ~3-4h stimate.**
