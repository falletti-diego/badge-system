# Accordo di Trattamento dei Dati (DPA) — GDPR Art. 28

**ALLEGATO 1: DESCRIZIONE DEL TRATTAMENTO**

---

## 1. PARTI

**Data Controller (Titolare del Trattamento):**
- Nome Legale: [RAGIONE SOCIALE CLIENTE]
- Forma Giuridica: [SRL/SPA/ALTRO]
- Indirizzo: [SEDE LEGALE CLIENTE]
- Contatto Privacy: [EMAIL CLIENTE HR/LEGAL]
- Rappresentante: [NOME DIRETTORE/LEGALE RAPPRESENTANTE]

**Data Processor (Responsabile del Trattamento):**
- Nome Legale: Dataxiom S.r.l.
- Forma Giuridica: Società a Responsabilità Limitata (SRL)
- Indirizzo: [SEDE DATAXIOM]
- Contatto Privacy: privacy@dataxiom.it
- Rappresentante: Diego Falletti (Amministratore)
- Website: https://www.dataxiom.it

**Data Subjects (Interessati):**
- Dipendenti della Cliente (dipendenti, dirigenti, collaboratori autorizzati)
- Numero stimato: [X dipendenti]
- Paesi di residenza: Italia, UE (se applicabile)

---

## 2. NATURA, DURATA, FINALITÀ DEL TRATTAMENTO

### 2.1 Descrizione del Trattamento

Dataxiom fornisce il servizio **Badge System** — piattaforma cloud di tracciamento presenze e gestione turni per dipendenti retail.

Il Trattamento include:

| Categoria Dati | Finalità | Durata | Volume | Frequenza |
|---|---|---|---|---|
| **Identificativi** (nome, email, numero dipendente, telefono) | Autenticazione, reporting presenze | Durata rapporto + 12 mesi | All employees | Real-time |
| **Biometrici** (Face ID) | Autenticazione sicura, verifica identità | Durata rapporto + 12 mesi | Dipendenti che usano Face ID | Per login |
| **Geolocalizzazione** (latitude, longitude GPS) | Verifica presenza fisica in sede (geofencing) | 90 giorni poi cancellazione automatica | Check-in con GPS | Per check-in |
| **Timbrature** (data, ora, tipo IN/OUT, sede) | Registro presenze, calcolo ore lavorate, paghe | 24 mesi (obbligo fiscale) | Tutti i check-in | Per check-in |
| **Log di Audit** (modifiche, correzioni, chi ha fatto cosa) | Traccia compliance, investigazioni, sicurezza | 3 anni (obbligo legale) | Tutte le modifiche | Per ogni azione |

### 2.2 Durata del Trattamento

Questo DPA è valido per la durata dell'accordo di fornitura del servizio Badge System tra Cliente e Dataxiom, fino alla risoluzione del contratto.

**Dopo risoluzione del contratto:**
- Dataxiom cancella tutti i dati personali entro **30 giorni** (salvo obblighi legali di conservazione)
- Cliente può richiedere esportazione dati in formato strutturato (GDPR Art. 20 — data portability)
- Audit log conservato solo per 7 giorni post-risoluzione (per compliance finale)

### 2.3 Finalità

Il Trattamento è finalizzato esclusivamente a:
1. Tracciamento automatico delle presenze/assenze (timbrature)
2. Gestione turni di lavoro (shift planning)
3. Verifica geofencing (controllo che dipendente sia in sede)
4. Calcolo ore lavorate, straordinari, buoni pasto
5. Generazione report CSV per HR, paghe, audit fiscale
6. Conformità normativa (DLgs 81/08, obblighi previdenziali INPS/Agenzia Entrate)
7. Sicurezza e investigazione anomalie (fraud detection)
8. Manutenzione del servizio (backup, disaster recovery)

---

## 3. NATURA DEL TRATTAMENTO

- **Automatizzato:** Sì (check-in automatici, calcoli ore, export CSV)
- **Organizzazione:** Sistema cloud centralizzato (database + API)
- **Ambito:** Ambito lavorativo (sede dipendente)
- **Soggetti Coinvolti:** Dipendenti, manager, admin/HR
- **Categorie Speciali:** Sì — Face ID (Art. 9 dati biometrici)

---

## 4. LOCALIZZAZIONE E INFRASTRUTTURA DATI

### 4.1 Paesi di Trattamento

**Primario:** Italia / UE (Irlanda — eu-west-1)

**Nessun trasferimento extra-UE.** Tutti i dati sono conservati su infrastruttura AWS nella regione **eu-west-1 (Irlanda)**, che garantisce protezione dati equivalente all'UE.

### 4.2 Ubicazione Fisica Servizi

- **Database:** Amazon RDS PostgreSQL (Irlanda, eu-west-1) — encryption at rest AES-256
- **API Backend:** Amazon EC2 (Irlanda, eu-west-1) — HTTPS TLS 1.3
- **Backup:** Amazon S3 (Irlanda, eu-west-1) — replicazione automatica
- **Certificati:** AWS Secrets Manager (Irlanda)

### 4.3 Sub-Processori

Dataxiom utilizza i seguenti sub-processori per il Trattamento dati:

| Sub-Processore | Servizio | Dati Elaborati | Ubicazione | Accordo |
|---|---|---|---|---|
| **Amazon Web Services (AWS)** | RDS, EC2, S3, Secrets Manager | Tutti | UE (Irlanda) | [AWS Data Processing Addendum](https://aws.amazon.com/legal/aws-dpa/) |
| **Sentry.io** (fase 2) | Error tracking, log aggregation | Log di errore (no PII) | UE | [Sentry DPA](https://sentry.io/legal/dpa/) |

**Cliente autorizza esplicitamente il ricorso a questi sub-processori. Dataxiom notificherà per iscritto (email) eventuali nuovi sub-processori.**

---

## 5. DIRITTI E OBBLIGHI DEL PROCESSOR (DATAXIOM)

Dataxiom si impegna a:

### 5.1 Sicurezza dei Dati (Art. 32 GDPR)

Implementare e mantenere misure tecniche e organizzative appropriate:

- **Controllo d'accesso:** Autenticazione multi-fattore (MFA) per admin Dataxiom; accesso logs registrati
- **Crittografia:** TLS 1.3 in transit (256-bit), AES-256 at rest; chiavi in AWS Secrets Manager (non hardcoded)
- **Pseudonimizzazione:** Face ID memorizzato localmente su dispositivo (non su server); coordinate GPS cancellate dopo 90 giorni
- **Availability:** Backup automatici giornalieri (7 giorni di retention), disaster recovery setup RTO=2h
- **Incident Response:** SLA 2 ore per segnalazione breach (notifica Cliente + autorità se > 10 interessati)
- **Monitoraggio:** CloudWatch alarms, Sentry error tracking, audit logging di tutte le modifiche
- **Secure Development:** OWASP Top 10 code review pre-deployment, dependency scanning (npm audit)

### 5.2 Assistenza al Controller (Art. 28(3) GDPR)

Dataxiom assisterà Cliente nell'esercizio dei diritti degli interessati:

- **Richieste di Acceso (Art. 15):** Dataxiom fornisce export CSV dati personali dipendente entro 10 giorni
- **Richieste di Cancellazione (Art. 17):** Dataxiom cancella record entro 7 giorni (salvo retention obbligatoria)
- **Richieste di Rettifica (Art. 16):** Dataxiom consente Manager/Admin correggere dati via dashboard entro 2 gg
- **Data Portability (Art. 20):** Dataxiom esporta dati in CSV/JSON entro 10 giorni
- **Audit & Controllo:** Dataxiom consente audit su richiesta (audit log disponibile in dashboard); accesso fisico infrastruttura su richiesta (previa NDA)

### 5.3 Comunicazione Autorità

Se la Garante Privacy italiana invia richiesta ufficiale:
- Dataxiom comunica a Cliente entro 2 giorni (salvo ordine segreto della Garante)
- Dataxiom non adempie richieste della Garante senza approvazione Cliente (salvo obbligo legale diretto)

### 5.4 Divieto di Utilizzo Dati

Dataxiom si impegna a **NON:**
- Condividere dati con terzi salvo sub-processori autorizzati nel DPA
- Utilizzare dati per scopi propri (marketing, profilazione, sviluppo prodotti senza consenso)
- Trasferire dati in Paesi extra-UE
- Utilizzare dati per training AI/ML senza esplicito consenso Cliente

### 5.5 Formazione Staff

Dataxiom assicura che:
- Tutti i dipendenti che accedono ai dati ricevono formazione GDPR annuale
- NDA (Non-Disclosure Agreement) sottoscritto da tutti gli accessi
- Accesso dati limitato a "need to know" basis

---

## 6. DIRITTI E OBBLIGHI DEL CONTROLLER (CLIENTE)

Cliente è responsabile di:

- **Base Legale:** Garantire che il Trattamento ha base legale (contratto di lavoro, consenso dipendente, obbligo legale) secondo Art. 6 GDPR
- **Informativa:** Fornire Privacy Policy ai dipendenti PRIMA di usare Badge System; informare su geofencing GPS, biometrica Face ID, retention policy
- **Consenso Biometrica:** Raccogliere consenso esplicito (Art. 9) per Face ID dai dipendenti (Dataxiom fornisce template)
- **Consenso Geofencing:** Raccogliere consenso (Art. 7) per geofencing GPS (la app mostra dialog automatico)
- **Notifica Breach:** Entro 24h da scoperta, notificare Dataxiom di qualsiasi breach (es. credenziali compromesse) per coordinamento notifica Garante
- **Audit:** Cooperare con audit Dataxiom su richiesta (es. verificare compliance uso dati)
- **Pagamento:** Pagare tempestivamente secondo fatture Dataxiom

---

## 7. CANALE DI COMUNICAZIONE BREACH / INCIDENT

**In caso di sospetto breach/anomalia dati:**

1. **Dipendente/Manager:**  Contatta privacy@dataxiom.it con soggetto `[CLIENTE] Data Breach Report`

2. **Dataxiom Risponde:** Entro 2 ore, conferma ricezione e inizia investigazione

3. **Investigazione:** Dataxiom verifica incidente usando log di audit cloud, database encryption status, access logs

4. **Notifica Cliente:** Entro 24 ore, Dataxiom invia report scritto a Cliente con:
   - Descrizione incidente
   - Dati coinvolti (n° dipendenti, categorie dati)
   - Impatto potenziale
   - Azioni correttive implementate
   - Raccomandazione: notificare Garante Privacy se impatto significativo (>10 interessati)

5. **Notifica Autorità:** Cliente e Dataxiom coordinano notifica Garante (Cliente ha obbligo legale, Dataxiom fornisce dati tecnici)

---

## 8. DURATA, RISOLUZIONE, RESTITUZIONE DATI

### 8.1 Inizio e Fine

- **Inizio:** Data di firma/data ultimo accesso al servizio
- **Fine:** Data di risoluzione contratto di fornitura

### 8.2 Post-Risoluzione

Entro **30 giorni** dalla risoluzione, Dataxiom:
- Esporta tutti i dati personali di Cliente in formato CSV/JSON per portabilità (Art. 20)
- Cancella tutti i dati dal database di produzione (soft delete + hard delete archivio)
- Conserva **audit log per 7 giorni ulteriori** (compliance finale e troubleshooting)
- Fornisce certificato di cancellazione sottoscritto dal CTO Dataxiom

Se Cliente richiede estensione retention (es. per scopi fiscali), Dataxiom quotizzerà servizio di data archival a parte.

---

## 9. VALIDITÀ E FIRME

Questo DPA è allegato al Contratto di Fornitura Badge System tra Cliente e Dataxiom e ha la medesima durata e termini di modifica.

**Versione DPA:** 2.0  
**Data:** 11 Giugno 2026  
**Valida da:** [Data firma]  
**Valida fino a:** [Data termine contratto o 31 Dicembre dell'anno di scadenza annuale]

---

## FIRME DIGITALI

**Per conto di CLIENTE:**

Nome Legale Cliente: _______________________  
Firma Rappresentante Legale: _______________________  
Nome e Titolo: _______________________  
Data: _______________________  

**Per conto di DATAXIOM:**

Firma Amministratore: _______________________  
Nome (Diego Falletti): _______________________  
Data: _______________________  

---

**Note Legali:**
- Questo DPA è redatto secondo GDPR (Regolamento UE 2016/679) e conformità italiana
- Qualsiasi modifica al DPA richiede approvazione scritta di entrambe le parti
- In caso di conflitto, la versione italiana prevale su traduzioni

---

*DPA © Dataxiom S.r.l. — Riproduzione vietata senza consenso.*
