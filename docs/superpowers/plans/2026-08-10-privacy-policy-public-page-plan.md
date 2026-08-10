# Pagina pubblica Privacy Policy GPS (S.24) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correggere le inesattezze nel contenuto di `docs/privacy-policy-IT.md`, pubblicarlo come pagina HTML pubblica (`frontend-web/public/privacy-policy-it.html`) e renderlo raggiungibile su `https://badge.dataxiom.it/privacy-policy-it` — l'URL già hardcoded in `GPSConsentDialog.jsx` (mobile) ma mai esistito finora. Chiude l'ultimo sotto-task residuo di S.24.

**Architecture:** Nessun codice applicativo. Un file markdown esistente viene corretto, poi convertito in HTML statico seguendo esattamente il pattern già in produzione per il DPA (`frontend-web/public/dpa-template-it.html` — stesso CSS, stessa struttura), servito da Netlify tramite una riga di redirect. Nessuna route React, nessuna dipendenza nuova.

**Tech Stack:** HTML/CSS statico, Netlify `_redirects`.

---

## File Structure (riepilogo di cosa viene toccato)

- `docs/privacy-policy-IT.md` — 3 correzioni di contenuto + bump versione 2.0→2.1
- `frontend-web/public/privacy-policy-it.html` (nuovo) — conversione HTML della versione corretta
- `frontend-web/public/_redirects` — nuova riga di redirect

---

## Task 1: Correggere `docs/privacy-policy-IT.md`

**Files:**
- Modify: `docs/privacy-policy-IT.md`

- [ ] **Step 1: Correggere la sezione 3.2 (diritti del dipendente) — Accesso, Revoca, Limitazione/Opposizione**

Sostituire il blocco esistente (righe 62-68 circa, da `### 3.2 Diritti del Dipendente` fino a prima di `### 3.3`):

```markdown
### 3.2 Diritti del Dipendente (Art. 15-22 GDPR)

Il dipendente ha il diritto di:

- **Acceso (Art. 15):** Richiedere copia di tutte le coordinate GPS registrate per lui → scaricate via API privata o export CSV
- **Rettifica (Art. 16):** Se le coordinate sono errate (es. malfunzionamento GPS), richiedere la correzione → l'admin può regolare manualmente
- **Cancellazione (Art. 17):** Richiedere cancellazione anticipata delle coordinate GPS (oltre i 90 giorni automatici) → eliminazione garantita entro 7 giorni
- **Portabilità (Art. 20):** Ricevere i propri dati GPS in formato strutturato (CSV) per portarli ad altro provider
- **Limitazione (Art. 18):** Disabilitare geofencing per check-in senza GPS (se base legale non è obbligatoria)
- **Opposizione (Art. 21):** Rifiutare il geofencing basato su legittimo interesse → il datore di lavoro valuta se è possibile (es. ruoli di telelavoro)
```

con:

```markdown
### 3.2 Diritti del Dipendente (Art. 15-22 GDPR)

Il dipendente ha il diritto di:

- **Accesso (Art. 15):** Richiedere copia di tutte le coordinate GPS registrate per lui → richiesta da inviare a privacy@dataxiom.it, evasa dal Titolare entro i termini di legge (non è oggi un self-service via app o dashboard)
- **Rettifica (Art. 16):** Se le coordinate sono errate (es. malfunzionamento GPS), richiedere la correzione → l'admin può regolare manualmente
- **Cancellazione (Art. 17):** Richiedere cancellazione anticipata delle coordinate GPS (oltre i 90 giorni automatici) → eliminazione garantita entro 7 giorni
- **Portabilità (Art. 20):** Ricevere i propri dati GPS in formato strutturato (CSV) per portarli ad altro provider
- **Revoca del consenso (Art. 7(3)):** Revocare il consenso alla geolocalizzazione in qualsiasi momento dalla sezione Impostazioni dell'app mobile. Dopo la revoca, il check-in resta bloccato sulle sedi con verifica GPS attiva finché il consenso non viene ridato.
- **Limitazione/Opposizione (Art. 18, 21):** Quando una sede ha la verifica GPS attiva, fornire le coordinate è condizione necessaria per registrare il check-in in quella sede — non esiste oggi una modalità di check-in senza GPS su una sede con geofencing attivo. Il dipendente può sempre opporsi non prestando il consenso, con l'effetto di non poter timbrare su quella sede finché non lo fa.
```

- [ ] **Step 2: Correggere la sezione 7.2 (testo del dialog di consenso)**

Sostituire il blocco esistente (sotto `### 7.2 Geofencing`):

```markdown
### 7.2 Geofencing (Art. 6(1)(f) + Art. 7 GDPR — Consenso Supplementare)

**Modalità di Consenso:**
- Alla prima timbratura con GPS abilitato, il dipendente vede una dialog: *"Il datore di lavoro ha abilitato la verifica di sede (GPS). Badge System registra la tua posizione solo al momento del check-in per verificare sei in sede. Le coordinate sono cancellate dopo 90 giorni. Vedi la Privacy Policy: <link>. Accetti?"*
- Bottone: `[Rifiuto]` (check-in senza GPS, se è facoltativo) | `[Accetto]` (attiva geofencing)
- Scelta reversibile: l'admin può disabilitare geofencing per il dipendente dalle Impostazioni globali
```

con:

```markdown
### 7.2 Geofencing (Art. 6(1)(f) + Art. 7 GDPR — Consenso Supplementare)

**Modalità di Consenso:**
- Alla prima timbratura su una sede con verifica GPS attiva, il dipendente vede una dialog che spiega i dati raccolti, la finalità, la conservazione (90 giorni) e i diritti — inclusa la possibilità di revocare il consenso in qualsiasi momento da Impostazioni — con link a questa Privacy Policy.
- Bottone: `[Rifiuto]` (il check-in su quella sede resta bloccato finché non si presta il consenso) | `[Accetto]` (procede con l'acquisizione GPS e il check-in)
- Scelta reversibile in entrambe le direzioni: il dipendente può revocare il consenso in qualsiasi momento da Impostazioni (dopo la revoca, il check-in torna bloccato su sedi con verifica GPS attiva finché non riconsente); l'admin può disattivare la verifica GPS per l'intera sede dalle Impostazioni amministrative.
```

- [ ] **Step 3: Aggiungere Sentry alla sezione 4 (Sub-Processori)**

Dopo il paragrafo che termina con `Nessun trasferimento verso Paesi extra-UE.` (fine di `### 4.1 Infrastruttura AWS (UE)`), inserire una nuova sottosezione e rinumerare `### 4.2 Criptografia` in `### 4.3 Criptografia`:

```markdown
### 4.2 Sentry (Error Monitoring, UE)

Dataxiom utilizza **Sentry.io** per il monitoraggio degli errori applicativi. Sentry riceve un identificativo utente pseudonimizzato (UUID interno) e il ruolo (dipendente/manager/admin) associati a ogni richiesta autenticata — mai il nome, l'email o le coordinate GPS. Organizzazione Sentry configurata su regione UE, stesso sub-processore già dichiarato nel DPA (`dpa-template-it.html`, sezione "Sub-Processori").
```

- [ ] **Step 4: Bump versione e data**

In cima al file, sostituire:

```markdown
**Data Ultimo Aggiornamento:** 11 Giugno 2026  
**Versione:** 2.0 (inclusiva geolocalizzazione GPS)
```

con:

```markdown
**Data Ultimo Aggiornamento:** 10 Agosto 2026  
**Versione:** 2.1 (corretto comportamento GPS post-enforcement reale, diritto di revoca, sub-processori)
```

In fondo al file, nella tabella `## 9. Versioni Precedenti`, aggiungere una riga sopra quella della versione 2.0:

```markdown
| 2.1 | 10 Agosto 2026 | Corretto: GPS obbligatorio senza bypass su sedi con verifica attiva (non più facoltativo); aggiunto diritto di revoca consenso; corretto meccanismo di accesso Art. 15 (richiesta manuale, non self-service); aggiunto Sentry come sub-processore |
```

- [ ] **Step 5: Verifica manuale**

Rileggere l'intero file corretto e confermare: nessun riferimento residuo a "check-in senza GPS, se facoltativo" o simili (`grep -n "facoltativ\|senza GPS" docs/privacy-policy-IT.md` deve restituire zero righe con questo significato), la sezione 4 ora elenca 2 sub-processori (AWS + Sentry), la versione in testa e nella tabella finale coincidono (2.1).

- [ ] **Step 6: Commit**

```bash
git add docs/privacy-policy-IT.md
git commit -m "fix(docs): correct GPS privacy policy to match real Fase C enforcement (S.24)"
```

---

## Task 2: Creare `frontend-web/public/privacy-policy-it.html`

**Files:**
- Create: `frontend-web/public/privacy-policy-it.html`

- [ ] **Step 1: Scrivere la pagina HTML**

Stesso foglio di stile inline di `frontend-web/public/dpa-template-it.html` (copiare il blocco `<style>` da quel file senza modifiche — palette `#1E3A5F`, font Georgia/serif per il corpo, Arial per gli elementi UI — garantisce coerenza visiva tra le due pagine legali pubbliche), ma senza le classi `.parties`/`.signatures` (non usate: la privacy policy non è un documento da firmare in due). Contenuto tradotto 1:1 dalla versione 2.1 di `docs/privacy-policy-IT.md` (Task 1).

```html
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Informativa Privacy — GPS e Geolocalizzazione | Badge System</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; background: #fff; }
    .wrapper { max-width: 860px; margin: 0 auto; padding: 40px 32px 80px; }
    .header { border-bottom: 3px solid #1E3A5F; padding-bottom: 24px; margin-bottom: 32px; }
    .header h1 { font-size: 1.6rem; color: #1E3A5F; font-weight: 700; }
    .header p { margin-top: 8px; color: #666; font-size: 0.9rem; font-family: Arial, sans-serif; }
    .badge { display: inline-block; background: #1E3A5F; color: #fff; font-size: 0.75rem;
             font-family: Arial, sans-serif; padding: 3px 10px; border-radius: 3px; margin-top: 6px; }
    .download-bar { background: #F0F4F8; border: 1px solid #CBD5E0; border-radius: 6px;
                    padding: 16px 20px; margin-bottom: 32px; display: flex;
                    align-items: center; gap: 16px; font-family: Arial, sans-serif; flex-wrap: wrap; }
    .download-bar span { flex: 1; min-width: 200px; font-size: 0.9rem; color: #444; }
    .btn-print { background: #1E3A5F; color: #fff; border: none; padding: 10px 20px;
                 border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-family: Arial, sans-serif; }
    .btn-print:hover { background: #162D47; }
    h2 { font-size: 1.15rem; color: #1E3A5F; margin: 36px 0 12px; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; }
    h3 { font-size: 1rem; color: #1E3A5F; margin: 20px 0 8px; }
    p { line-height: 1.7; margin-bottom: 12px; font-size: 0.95rem; }
    ul, ol { padding-left: 24px; margin-bottom: 12px; }
    li { line-height: 1.7; font-size: 0.95rem; margin-bottom: 4px; }
    strong { color: #1E3A5F; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0 20px; font-size: 0.88rem; font-family: Arial, sans-serif; }
    th { background: #1E3A5F; color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; }
    td { padding: 9px 12px; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
    tr:hover td { background: #F7FAFC; }
    .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #E2E8F0;
              font-family: Arial, sans-serif; font-size: 0.8rem; color: #888; text-align: center; }
    @media print {
      .download-bar { display: none !important; }
      body { font-size: 11pt; }
      h2 { page-break-before: auto; }
      .wrapper { max-width: 100%; padding: 20px; }
    }
  </style>
</head>
<body>
<div class="wrapper">

  <div class="header">
    <h1>Informativa Privacy — Badge System</h1>
    <p>GDPR Art. 13-14 — Geolocalizzazione GPS e trattamento dati dipendenti</p>
    <span class="badge">Versione 2.1 · 10 Agosto 2026</span>
  </div>

  <div class="download-bar">
    <span>📄 Puoi stampare questa informativa per affiggerla in bacheca aziendale.</span>
    <button class="btn-print" onclick="window.print()">🖨️ Stampa / Salva PDF</button>
  </div>

  <p><strong>Titolare del Trattamento (Data Controller):</strong> [Cliente — azienda cliente che acquista Badge System]</p>
  <p><strong>Responsabile del Trattamento (Data Processor):</strong> Dataxiom S.r.l.<br>
     <strong>Rappresentante:</strong> Diego Falletti<br>
     <strong>Contatto Privacy:</strong> privacy@dataxiom.it</p>

  <h2>1. Dati Personali Raccolti</h2>
  <table>
    <thead>
      <tr><th>Categoria</th><th>Descrizione</th><th>Base Legale</th><th>Retention</th></tr>
    </thead>
    <tbody>
      <tr><td><strong>Identificativi</strong></td><td>Nome, email, numero dipendente, telefono</td><td>Art. 6(1)(b) Contratto</td><td>Durata rapporto + 12 mesi</td></tr>
      <tr><td><strong>Biometrici</strong></td><td>Face ID (autenticazione)</td><td>Art. 6(1)(b) Contratto + consenso Art. 9</td><td>Durata rapporto + 12 mesi</td></tr>
      <tr><td><strong>Localizzazione (GPS)</strong></td><td>Latitudine, longitudine (geofencing sede)</td><td>Art. 6(1)(f) Legittimo interesse OR Art. 6(1)(b) Contratto*</td><td><strong>90 giorni</strong> (poi cancellazione automatica)</td></tr>
      <tr><td><strong>Timbrature</strong></td><td>Data, ora, tipo (Entrata/Uscita), luogo</td><td>Art. 6(1)(b) Contratto</td><td><strong>24 mesi</strong> (obblighi fiscali/previdenziali)</td></tr>
      <tr><td><strong>Log di Audit</strong></td><td>Chi ha modificato quali dati, quando</td><td>Art. 6(1)(b) Contratto</td><td><strong>3 anni</strong> (obblighi legali/compliance)</td></tr>
    </tbody>
  </table>
  <p><em>*= La base legale per il geofencing dipende dalla legislazione nazionale. In Italia si ammette Art. 6(1)(f) (legittimo interesse alla sicurezza sede) con comunicazione preventiva, oppure Art. 6(1)(b) se il contratto di lavoro esplicitamente menziona il controllo della sede.</em></p>

  <h2>2. Finalità del Trattamento</h2>
  <ol>
    <li><strong>Tracciamento Presenze</strong> — registrare orari entrata/uscita dipendenti (Art. 6(1)(b) Contratto)</li>
    <li><strong>Gestione Turni</strong> — assegnazione e verifica orari di lavoro (Art. 6(1)(b) Contratto)</li>
    <li><strong>Verifica Geofencing (Sede)</strong> — controllare che il dipendente sia fisicamente in sede prima di registrare la timbratura (Art. 6(1)(f) Legittimo interesse + consenso esplicito Art. 7)</li>
    <li><strong>Reporting Manageriale</strong> — dashboard con presenze aggregate, esportazioni CSV per paghe/HR (Art. 6(1)(b) Contratto)</li>
    <li><strong>Conformità Legale</strong> — conservazione dati per audit fiscali, INPS, ispezioni del lavoro (Art. 6(1)(c) Obbligo legale)</li>
  </ol>

  <h2>3. Geolocalizzazione GPS — Dettagli e Diritti</h2>
  <h3>3.1 Come Funziona il Geofencing</h3>
  <ul>
    <li><strong>Tecnologia:</strong> Haversine distance (formula matematica open-source)</li>
    <li><strong>Dati Raccolti:</strong> Latitudine e longitudine del dispositivo solo al momento del check-in (nessun tracciamento continuo in background)</li>
    <li><strong>Uso:</strong> Verifica che il dipendente sia entro un raggio configurabile (default 150 metri dalla sede)</li>
    <li><strong>Conservazione:</strong> <strong>90 giorni</strong> (pulizia automatica ogni notte)</li>
    <li><strong>Non Condivisi:</strong> Le coordinate GPS non sono mai condivise con terzi (salvo sub-processori sotto DPA)</li>
  </ul>

  <h3>3.2 Diritti del Dipendente (Art. 15-22 GDPR)</h3>
  <p>Il dipendente ha il diritto di:</p>
  <ul>
    <li><strong>Accesso (Art. 15):</strong> Richiedere copia di tutte le coordinate GPS registrate per lui → richiesta da inviare a privacy@dataxiom.it, evasa dal Titolare entro i termini di legge (non è oggi un self-service via app o dashboard)</li>
    <li><strong>Rettifica (Art. 16):</strong> Se le coordinate sono errate (es. malfunzionamento GPS), richiedere la correzione → l'admin può regolare manualmente</li>
    <li><strong>Cancellazione (Art. 17):</strong> Richiedere cancellazione anticipata delle coordinate GPS (oltre i 90 giorni automatici) → eliminazione garantita entro 7 giorni</li>
    <li><strong>Portabilità (Art. 20):</strong> Ricevere i propri dati GPS in formato strutturato (CSV) per portarli ad altro provider</li>
    <li><strong>Revoca del consenso (Art. 7(3)):</strong> Revocare il consenso alla geolocalizzazione in qualsiasi momento dalla sezione Impostazioni dell'app mobile. Dopo la revoca, il check-in resta bloccato sulle sedi con verifica GPS attiva finché il consenso non viene ridato.</li>
    <li><strong>Limitazione/Opposizione (Art. 18, 21):</strong> Quando una sede ha la verifica GPS attiva, fornire le coordinate è condizione necessaria per registrare il check-in in quella sede — non esiste oggi una modalità di check-in senza GPS su una sede con geofencing attivo. Il dipendente può sempre opporsi non prestando il consenso, con l'effetto di non poter timbrare su quella sede finché non lo fa.</li>
  </ul>

  <h3>3.3 Contatti per Esercitare i Diritti</h3>
  <ul>
    <li><strong>Contatto Privacy Azienda:</strong> [Cliente HR Manager — fornito al momento dell'onboarding]</li>
    <li><strong>Contatto Responsabile Dataxiom:</strong> privacy@dataxiom.it</li>
    <li><strong>Ricorso Autorità:</strong> Garante Privacy italiano (garanteprivacy.it) — reclamo gratuito</li>
  </ul>

  <h2>4. Sub-Processori e Trasferimenti Dati</h2>
  <h3>4.1 Infrastruttura AWS (UE)</h3>
  <ul>
    <li><strong>Amazon RDS PostgreSQL</strong> (eu-west-1 Irlanda) — database persistente con encryption at rest</li>
    <li><strong>Amazon EC2</strong> (eu-west-1 Irlanda) — API backend con TLS 1.3</li>
    <li><strong>AWS Secrets Manager</strong> — chiavi crittografiche e credenziali</li>
  </ul>
  <p><strong>Garanzie:</strong> AWS è sottoposto a Standard Contractual Clauses (SCC). Nessun trasferimento verso Paesi extra-UE.</p>

  <h3>4.2 Sentry (Error Monitoring, UE)</h3>
  <p>Dataxiom utilizza <strong>Sentry.io</strong> per il monitoraggio degli errori applicativi. Sentry riceve un identificativo utente pseudonimizzato (UUID interno) e il ruolo (dipendente/manager/admin) associati a ogni richiesta autenticata — mai il nome, l'email o le coordinate GPS. Organizzazione Sentry configurata su regione UE.</p>

  <h3>4.3 Crittografia</h3>
  <ul>
    <li><strong>In Transit:</strong> TLS 1.3 (256-bit AES-GCM)</li>
    <li><strong>At Rest:</strong> AWS RDS encryption (AES-256)</li>
    <li><strong>API Keys & Secrets:</strong> AWS Secrets Manager</li>
  </ul>

  <h2>5. Sicurezza e Protezione dei Dati</h2>
  <ul>
    <li><strong>Authentication:</strong> JWT con chiave asimmetrica RSA-2048 (access token 15min, refresh token 7 giorni)</li>
    <li><strong>Authorization:</strong> Role-based access control (RBAC)</li>
    <li><strong>Audit Logging:</strong> Ogni modifica registrata con user ID, timestamp, old/new value → conservazione 3 anni</li>
    <li><strong>Monitoring:</strong> CloudWatch alarms su accessi anomali, errori 5xx</li>
    <li><strong>Incident Response:</strong> SLA 2 ore per security incident critici</li>
  </ul>

  <h2>6. Retention e Cancellazione</h2>
  <table>
    <thead><tr><th>Dati</th><th>Retention</th><th>Cancellazione</th></tr></thead>
    <tbody>
      <tr><td>Coordinate GPS</td><td><strong>90 giorni</strong></td><td>Automatica ogni notte</td></tr>
      <tr><td>Check-in records</td><td>24 mesi</td><td>Richiesta dipendente = 7 giorni</td></tr>
      <tr><td>Audit log</td><td>3 anni</td><td>Automatica scadenza + GDPR Art. 17</td></tr>
      <tr><td>Face ID biometrico</td><td>Durata rapporto + 12 mesi</td><td>Cancellazione entro 7 giorni termine rapporto</td></tr>
    </tbody>
  </table>

  <h2>7. Consenso per la Biometrica (Face ID) e Geofencing</h2>
  <h3>7.1 Face ID (Art. 9 GDPR — Dati Biometrici)</h3>
  <p>Al primo login su app mobile, il dipendente vede una dialog di consenso: il volto non è mai trasmesso ai server, il match avviene localmente sul dispositivo (Apple Secure Enclave / Android BiometricPrompt). Scelta reversibile dalle Impostazioni dell'app.</p>

  <h3>7.2 Geofencing (Art. 6(1)(f) + Art. 7 GDPR — Consenso Supplementare)</h3>
  <p><strong>Modalità di Consenso:</strong></p>
  <ul>
    <li>Alla prima timbratura su una sede con verifica GPS attiva, il dipendente vede una dialog che spiega i dati raccolti, la finalità, la conservazione (90 giorni) e i diritti — inclusa la possibilità di revocare il consenso in qualsiasi momento da Impostazioni — con link a questa Privacy Policy.</li>
    <li>Bottone: <strong>[Rifiuto]</strong> (il check-in su quella sede resta bloccato finché non si presta il consenso) | <strong>[Accetto]</strong> (procede con l'acquisizione GPS e il check-in)</li>
    <li>Scelta reversibile in entrambe le direzioni: il dipendente può revocare il consenso in qualsiasi momento da Impostazioni; l'admin può disattivare la verifica GPS per l'intera sede dalle Impostazioni amministrative.</li>
  </ul>

  <h2>8. Contatti e Reclami</h2>
  <p><strong>Per domande su questa Privacy Policy:</strong> privacy@dataxiom.it — risposta entro 5 giorni lavorativi</p>
  <p><strong>Per reclami (Art. 77 GDPR):</strong> Garante Privacy Italia (garanteprivacy.it/home/diritti/come-reclamo) — è possibile presentare un reclamo anche senza contattare Dataxiom direttamente</p>

  <h2>9. Versioni Precedenti</h2>
  <table>
    <thead><tr><th>Versione</th><th>Data</th><th>Cambio</th></tr></thead>
    <tbody>
      <tr><td>2.1</td><td>10 Agosto 2026</td><td>Corretto: GPS obbligatorio senza bypass su sedi con verifica attiva (non più facoltativo); aggiunto diritto di revoca consenso; corretto meccanismo di accesso Art. 15; aggiunto Sentry come sub-processore</td></tr>
      <tr><td>2.0</td><td>11 Giugno 2026</td><td>Aggiunto geofencing GPS, consenso esplicito, Art. 7 GDPR</td></tr>
      <tr><td>1.0</td><td>1 Maggio 2026</td><td>Versione iniziale (timbrature + Face ID)</td></tr>
    </tbody>
  </table>

  <div class="footer">
    <p>Informativa Privacy © Dataxiom S.r.l. — Riproduzione vietata senza consenso.</p>
    <p>privacy@dataxiom.it — https://www.dataxiom.it</p>
  </div>

</div>
</body>
</html>
```

- [ ] **Step 2: Verifica visiva locale**

Run: `cd frontend-web && npx vite preview --outDir public 2>/dev/null || python3 -m http.server 8123 --directory public`
Aprire `http://localhost:8123/privacy-policy-it.html` nel browser (o semplicemente aprire il file `frontend-web/public/privacy-policy-it.html` direttamente da filesystem). Verificare: nessun elemento visivo rotto, tabelle leggibili, bottone Stampa funzionante, nessun placeholder tipo `undefined` o tag HTML malformato.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/public/privacy-policy-it.html
git commit -m "feat(web): publish GPS privacy policy public page (S.24)"
```

---

## Task 3: Redirect Netlify + verifica post-deploy

**Files:**
- Modify: `frontend-web/public/_redirects`

- [ ] **Step 1: Aggiungere la riga di redirect**

In `frontend-web/public/_redirects`, subito dopo la riga esistente `/dpa-template-it  /dpa-template-it.html  200` (stessa sezione "Static legal pages — must come before SPA catch-all"):

```
/privacy-policy-it  /privacy-policy-it.html  200
```

Il file risultante (sezione rilevante):

```
# Static legal pages — must come before SPA catch-all
/dpa-template-it  /dpa-template-it.html  200
/privacy-policy-it  /privacy-policy-it.html  200
```

- [ ] **Step 2: Build locale di verifica (nessuna regressione al build esistente)**

Run: `cd frontend-web && npm run build`
Expected: build completata senza errori, `dist/privacy-policy-it.html` e `dist/_redirects` presenti nell'output (verificare con `ls dist/*.html dist/_redirects`).

- [ ] **Step 3: Commit**

```bash
git add frontend-web/public/_redirects
git commit -m "feat(web): add Netlify redirect for /privacy-policy-it (S.24)"
```

- [ ] **Step 4: Push e verifica post-deploy**

```bash
git push origin main
```

Attendere il deploy Netlify (auto-trigger su push, stesso meccanismo già in uso per il resto di `frontend-web`). Poi verificare dal vivo:

```bash
curl -sI https://badge.dataxiom.it/privacy-policy-it
```

Expected: `HTTP/2 200`, `content-type: text/html`. Aprire l'URL anche da browser per un controllo visivo finale (stesso identico controllo già fatto per `dpa-template-it` quando fu pubblicato).

---

## Task 4: Aggiornare backlog (`TASKS.md`) — S.24 chiuso, 3 nuove voci GDPR

**Files:**
- Modify: `TASKS.md`

- [ ] **Step 1: Marcare S.24 come completato**

Nella sezione `### 🚨 GDPR/Privacy Findings from Session 31 Security Review`, sostituire la riga S.24 (quella con `🟡 3/4 sotto-task chiusi come effetto collaterale di Fase C`) aggiornando lo stato a `[x]` e il testo del sotto-punto 2 da "MAI FATTA" a completato, con riferimento a questo piano e al commit finale.

- [ ] **Step 2: Aggiungere 3 nuove voci GDPR (dal backlog "fuori scope" della spec)**

Subito dopo la riga S.26, aggiungere 3 nuove voci `S.27`, `S.28`, `S.29` (basi legali/citazioni riprese da `docs/superpowers/specs/2026-08-10-privacy-policy-public-page-design.md`, sezione "Fuori scope"):

```markdown
- [ ] **S.27** Base giuridica del consenso GPS potenzialmente invalida (HIGH) — Con Fase C il GPS è obbligatorio (rifiuto → check-in bloccato, nessun bypass). EDPB Guidelines 05/2020 on consent, §21-22 ca.: il consenso in un rapporto di lavoro non è "liberamente prestato" quando il rifiuto ha conseguenze negative. Serve probabilmente Art. 6(1)(b) contratto o 6(1)(f) legittimo interesse con bilanciamento documentato, non Art. 7 consenso. Trigger: sessione dedicata con `/grilling` prima del primo cliente reale con geofencing attivo.
- [ ] **S.28** Statuto dei Lavoratori Art. 4 (L. 300/1970) — autorizzazione ITL/accordo sindacale mancante nell'onboarding cliente (HIGH) — Obbligo del cliente (datore di lavoro), non coperto da GDPR/privacy-policy. Confermato da Garante Privacy, Provvedimento n. 7 del 16 gennaio 2025 (sanzione per geolocalizzazione difforme da autorizzazione ITL). Trigger: prima che un cliente reale attivi `geofence_enabled=true` in produzione — aggiungere avviso esplicito nel runbook onboarding (`docs/runbook.md`).
- [ ] **S.29** DPIA (Art. 35 GDPR) mai eseguita per il geofencing — obbligatoria, non facoltativa (HIGH) — Garante Privacy, Delibera n. 467/2018: il geofencing dei dipendenti rientra esplicitamente nell'elenco vincolante dei trattamenti soggetti a DPIA. Obbligo del Titolare (cliente), ma probabilmente serve un template DPIA precompilato fornito da Dataxiom (stesso pattern del DPA, S.25). Trigger: stessa sessione di S.27/S.28.
```

- [ ] **Step 3: Commit**

```bash
git add TASKS.md
git commit -m "docs: close S.24 (privacy policy public page), open S.27/S.28/S.29 GDPR backlog"
```

---

## Note per l'implementer

- Nessun task di questo piano richiede TDD — è contenuto statico (markdown + HTML), stesso trattamento già riservato al DPA (`dpa-template-it.html`), che non ha test automatici nel repo.
- Task 1 e 2 sono indipendenti (Task 2 embeds già il contenuto corretto, non serve aspettare il commit di Task 1 per scrivere l'HTML) ma vanno comunque eseguiti in ordine per mantenere `docs/privacy-policy-IT.md` e la pagina pubblica sincronizzati in un singolo diff logico.
- Il placeholder `[Cliente — azienda cliente che acquista Badge System]` nell'HTML resta intenzionalmente tra parentesi quadre — non è un bug, è lo stesso pattern del DPA (`[RAGIONE SOCIALE CLIENTE]`), compilato a mano per cliente specifico.
- Task 4 (backlog) tocca solo `TASKS.md` — se il numero di riga esatto delle sezioni S.24/S.26 fosse cambiato rispetto a quanto letto in fase di analisi (2026-08-10), rileggere il file prima di applicare il diff.
