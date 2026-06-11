# Informativa Privacy — Badge System (GDPR Art. 13-14)

**Titolare del Trattamento (Data Controller):** [Cliente — azienda cliente che acquista Badge System]

**Responsabile del Trattamento (Data Processor):** Dataxiom S.r.l.  
**Rappresentante:** Diego Falletti  
**Contatto Privacy:** privacy@dataxiom.it

**Data Ultimo Aggiornamento:** 11 Giugno 2026  
**Versione:** 2.0 (inclusiva geolocalizzazione GPS)

---

## 1. Dati Personali Raccolti

Badge System raccoglie i seguenti dati personali dei dipendenti:

| Categoria | Descrizione | Base Legale | Retention |
|-----------|-------------|-------------|-----------|
| **Identificativi** | Nome, email, numero dipendente, telefono | Art. 6(1)(b) Contratto | Durata rapporto + 12 mesi |
| **Biometrici** | Face ID (autenticazione) | Art. 6(1)(b) Contratto + consenso Art. 9 | Durata rapporto + 12 mesi |
| **Localizzazione (GPS)** | Latitudine, longitudine (geofencing sede) | Art. 6(1)(f) Legittimo interesse OR Art. 6(1)(b) Contratto* | **90 giorni** (poi cancellazione automatica) |
| **Timbrature** | Data, ora, tipo (Entrata/Uscita), luogo | Art. 6(1)(b) Contratto | **24 mesi** (obblighi fiscali/previdenziali) |
| **Log di Audit** | Chi ha modificato quali dati, quando | Art. 6(1)(b) Contratto | **3 anni** (obblighi legali/compliance) |

*= La base legale per il geofencing dipende dalla legislazione nazionale. In Italia si ammette Art. 6(1)(f) (legittimo interesse alla sicurezza sede) con comunicazione preventiva, oppure Art. 6(1)(b) se il contratto di lavoro esplicitamente menziona il controllo della sede.

---

## 2. Finalità del Trattamento

Badge System elabora i dati personali esclusivamente per:

1. **Tracciamento Presenze** — registrare orari entrata/uscita dipendenti  
   Base Legale: Art. 6(1)(b) Contratto (obblighi di legge DLgs 81/08 sicurezza)

2. **Gestione Turni** — assegnazione e verifica orari di lavoro  
   Base Legale: Art. 6(1)(b) Contratto

3. **Verifica Geofencing (Sede)** — controllare che il dipendente sia fisicamente in sede prima di registrare la timbratura  
   Base Legale: Art. 6(1)(f) Legittimo interesse (sicurezza sede, frode) + consenso esplicito Art. 7  
   **Coordinamento:** se la base legale è Art. 6(1)(f), il dipendente può comunque rifiutare il geofencing (check-in senza GPS). Se base è contrattuale, il datore di lavoro ha discrezione nel renderla obbligatoria.

4. **Reporting Manageriale** — dashboard con presenze aggregate, esportazioni CSV per paghe/HR  
   Base Legale: Art. 6(1)(b) Contratto

5. **Conformità Legale** — conservazione dati per audit fiscali, INPS, ispezioni del lavoro  
   Base Legale: Art. 6(1)(c) Obbligo legale

---

## 3. Geolocalizzazione GPS — Dettagli e Diritti

### 3.1 Come Funziona il Geofencing

- **Tecnologia:** Haversine distance (formula matematica open-source)
- **Dati Raccolti:** Latitudine e longitudine del dispositivo al momento del check-in
- **Uso:** Verifica che il dipendente sia entro un raggio configurabile (default 150 metri dalla sede)
- **Conservazione:** **90 giorni** (pulizia automatica ogni notte via AWS Lambda/cron job)
- **Non Condivisi:** Le coordinate GPS non sono mai condivise con terzi (salvo sub-processori AWS sotto DPA)

### 3.2 Diritti del Dipendente (Art. 15-22 GDPR)

Il dipendente ha il diritto di:

- **Acceso (Art. 15):** Richiedere copia di tutte le coordinate GPS registrate per lui → scaricate via API privata o export CSV
- **Rettifica (Art. 16):** Se le coordinate sono errate (es. malfunzionamento GPS), richiedere la correzione → l'admin può regolare manualmente
- **Cancellazione (Art. 17):** Richiedere cancellazione anticipata delle coordinate GPS (oltre i 90 giorni automatici) → eliminazione garantita entro 7 giorni
- **Portabilità (Art. 20):** Ricevere i propri dati GPS in formato strutturato (CSV) per portarli ad altro provider
- **Limitazione (Art. 18):** Disabilitare geofencing per check-in senza GPS (se base legale non è obbligatoria)
- **Opposizione (Art. 21):** Rifiutare il geofencing basato su legittimo interesse → il datore di lavoro valuta se è possibile (es. ruoli di telelavoro)

### 3.3 Contatti per Esercitare i Diritti

- **Contatto Privacy Azienda:** [Cliente HR Manager — fornito al momento dell'onboarding]
- **Contatto Responsabile Dataxiom:** privacy@dataxiom.it
- **Ricorso Autorità:** Garante Privacy italiano (https://www.garanteprivacy.it) — reclamo gratuito

---

## 4. Sub-Processori e Trasferimenti Dati

### 4.1 Infrastruttura AWS (UE)

Dataxiom utilizza i seguenti servizi AWS per ospitare Badge System:

- **Amazon RDS PostgreSQL** (eu-west-1 Irlanda) — database persistente con encryption at rest
- **Amazon EC2** (eu-west-1 Irlanda) — API backend con TLS 1.3
- **Amazon S3** (opzionale, fase 2) — backup e audit log archive
- **AWS Secrets Manager** — chiavi crittografiche e credenziali (non memorizzate in codice)

**Garantie:** AWS è sottoposto al Data Processing Addendum (DPA) secondo Standard Contractual Clauses (SCC). Dataxiom ha eseguito Data Transfer Impact Assessment (DTIA) per il trasferimento in Irlanda (UE, high protection). Nessun trasferimento verso Paesi extra-UE.

### 4.2 Criptografia

- **In Transit:** TLS 1.3 (256-bit AES-GCM) per tutte le comunicazioni client-server
- **At Rest:** AWS RDS encryption (AES-256) per il database
- **API Keys & Secrets:** AWS Secrets Manager (hardware security module)

---

## 5. Sicurezza e Protezione dei Dati

Dataxiom ha implementato le seguenti misure di sicurezza:

- **Authentication:** JWT con chiave asimmetrica RSA-2048 (access token 15min, refresh token 7 giorni)
- **Authorization:** Role-based access control (RBAC) — dipendenti vedono solo propri dati, manager vedono solo sede, admin vedono tutto
- **Audit Logging:** Ogni modifica (correzione timbratura, cancellazione) è registrata con user ID, timestamp, old/new value → conservazione 3 anni
- **Monitoring:** CloudWatch alarms su accessi anomali, errori 5xx, spike traffic
- **Incident Response:** SLA 2 ore per security incident critici

---

## 6. Retention e Cancellazione

| Dati | Retention | Motivo | Cancellazione |
|------|-----------|--------|---------------|
| Coordinate GPS | **90 giorni** | Non necessarie per reporting, protezione privacy | Automatica every night |
| Check-in records | 24 mesi | Obblighi fiscali (Agenzia Entrate) + INPS | Richiesta dipendente = 7 giorni |
| Audit log | 3 anni | Obblighi legali (compliance, investigazione) | Automatica scadenza + GDPR Art. 17 |
| Face ID biometrico | Durata rapporto + 12 mesi | GDPR Art. 9 (consenso) | Cancellazione entro 7 giorni termine rapporto |

**Diritto all'Oblio (Art. 17 GDPR):** Un dipendente può chiedere cancellazione anticipata di qualsiasi dato. Dataxiom cancellerà entro 7 giorni, salvo obblighi legali che richiedono conservazione (es. documenti fiscali).

---

## 7. Consenso per la Biometrica (Face ID) e Geofencing

### 7.1 Face ID (Art. 9 GDPR — Dati Biometrici)

**Modalità di Consenso:**
- Al primo login su app mobile, il dipendente vede una dialog: *"Badge System usa Face ID per l'autenticazione. Il tuo volto non è mai trasmesso ai nostri server — only face match happens locally on your device. I dati di Face ID rimangono sempre sul telefono (Apple Secure Enclave / Android BiometricPrompt). Accetti?"*
- Bottone: `[Non ora]` (usa password) | `[Accetto Face ID]` (usa biometrica)
- Scelta reversibile: il dipendente può disabilitare Face ID dalle Impostazioni dell'app

### 7.2 Geofencing (Art. 6(1)(f) + Art. 7 GDPR — Consenso Supplementare)

**Modalità di Consenso:**
- Alla prima timbratura con GPS abilitato, il dipendente vede una dialog: *"Il datore di lavoro ha abilitato la verifica di sede (GPS). Badge System registra la tua posizione solo al momento del check-in per verificare sei in sede. Le coordinate sono cancellate dopo 90 giorni. Vedi la Privacy Policy: <link>. Accetti?"*
- Bottone: `[Rifiuto]` (check-in senza GPS, se è facoltativo) | `[Accetto]` (attiva geofencing)
- Scelta reversibile: l'admin può disabilitare geofencing per il dipendente dalle Impostazioni globali

---

## 8. Contatti e Reclami

**Per domande su questa Privacy Policy:**
- Email: privacy@dataxiom.it
- Response time: entro 5 giorni lavorativi

**Per reclami (Art. 77 GDPR):**
- Garante Privacy Italia: https://www.garanteprivacy.it/home/diritti/come-reclamo
- È possibile presentare un reclamo anche senza contattare Dataxiom direttamente

---

## 9. Versioni Precedenti

| Versione | Data | Cambio |
|----------|------|--------|
| 2.0 | 11 Giugno 2026 | Aggiunto geofencing GPS, consenso esplicito, Art. 7 GDPR |
| 1.0 | 1 Maggio 2026 | Versione iniziale (timbrature + Face ID) |

---

*Informativa Privacy © Dataxiom S.r.l. — Riproduzione vietata senza consenso.*
