# Badge System — SLA e Condizioni di Servizio

**Versione:** 1.0  
**Data:** 2026-06-10  
**Fornitore:** Dataxiom — Diego Falletti (falletti.diego2533@gmail.com)

Questo documento definisce i livelli di servizio, le condizioni di supporto e le garanzie relative al servizio Badge System fornito da Dataxiom al Cliente.

---

## 1. Definizioni

| Termine | Significato |
|---------|-------------|
| **Servizio** | La piattaforma Badge System (app mobile + dashboard web + API backend) |
| **Downtime** | Periodo in cui il Servizio non è raggiungibile o non registra correttamente i check-in |
| **Orario lavorativo** | Lunedì–Venerdì 09:00–18:00 CET, esclusi festivi nazionali italiani |
| **Manutenzione programmata** | Finestre di aggiornamento pianificate e notificate preventivamente (vedere §5) |
| **Incidente** | Malfunzionamento che richiede intervento tecnico |

---

## 2. Livello di Servizio (Uptime)

### Target di disponibilità

| Periodo | Uptime target | Max downtime consentito |
|---------|--------------|------------------------|
| Mensile | **99%** | ~7 ore e 12 minuti |
| Annuale | 99% | ~87 ore |

Il calcolo esclude le finestre di manutenzione programmata (§5) e i downtime causati da forza maggiore o da fattori fuori dal controllo di Dataxiom (§6).

### Misurazione

La disponibilità è misurata tramite il health check endpoint `https://api.dataxiom.it/health`. Un periodo è considerato "down" quando l'endpoint restituisce errore (5xx o timeout) per più di 5 minuti consecutivi.

---

## 3. Orari di Supporto

| Giorno | Orario | Canale |
|--------|--------|--------|
| Lunedì–Venerdì | 09:00–18:00 CET | Email |
| Sabato | 10:00–14:00 CET | Email |
| Domenica / Festivi | — | Solo emergenze CRITICO via email con oggetto URGENTE |

**Contatto:** falletti.diego2533@gmail.com  
**Emergenze:** Stesso indirizzo — scrivere **URGENTE** nell'oggetto dell'email.

---

## 4. Severity e Tempi di Risposta

### Definizioni di severity

| Severity | Definizione | Esempi |
|----------|-------------|--------|
| **CRITICO** | Il Servizio è completamente non disponibile — 0 check-in possibili, tutti gli utenti bloccati | API down, database non raggiungibile, app mobile non riesce ad autenticarsi |
| **ALTO** | Feature principale non funzionante, ma è disponibile un workaround | QR scan non funziona ma check-in manuale disponibile via dashboard, export CSV non funziona |
| **MEDIO** | Feature secondaria non funzionante, nessun impatto sui check-in | Notifiche non arrivano, planning non si salva, report lento |
| **BASSO** | Bug UI, lentezza non critica, problema non bloccante | Testo errato, colore sbagliato, tabella lenta su dataset grande |

### Tempi di risposta e risoluzione

| Severity | Prima risposta | Target risoluzione |
|----------|---------------|-------------------|
| **CRITICO** | 2 ore (orario lavorativo) / 4 ore (fuori orario) | 2 ore dalla prima risposta |
| **ALTO** | 4 ore (orario lavorativo) | 8 ore |
| **MEDIO** | 8 ore (orario lavorativo) | 24 ore |
| **BASSO** | Next business day | 72 ore |

> I tempi di risoluzione sono target, non garanzie assolute. Per incidenti CRITICO e ALTO, Dataxiom fornisce aggiornamenti di stato ogni 2 ore fino alla risoluzione.

---

## 5. Manutenzione Programmata

### Finestra standard

**Domenica 02:00–04:00 UTC** (04:00–06:00 CET / 06:00–08:00 ora legale)

Durante questa finestra possono essere eseguiti: deploy di nuove versioni, migrazioni database, aggiornamenti certificati TLS, ottimizzazioni infrastruttura.

### Notifica preventiva

- **Manutenzione ordinaria** (aggiornamenti minori, nessun impatto atteso): nessuna notifica richiesta se eseguita nella finestra standard.
- **Manutenzione straordinaria** (migrazione database con downtime atteso, cambio architettura): notifica al Cliente almeno **48 ore** prima via email.

### Esclusione dal calcolo uptime

Il downtime durante la finestra di manutenzione programmata (fino a 2 ore/settimana) non viene conteggiato nel calcolo dell'uptime mensile, a condizione che la notifica sia stata inviata nei termini indicati.

---

## 6. Esclusioni

I seguenti casi non sono coperti da questo SLA:

- **Forza maggiore:** eventi fuori dal controllo di Dataxiom (guasti AWS, blackout reti, calamità naturali)
- **Connettività del Cliente:** problemi di rete lato Cliente (Wi-Fi negozio, connessione mobile dipendenti)
- **Uso scorretto:** malfunzionamenti causati da uso non conforme alle istruzioni (guida utente)
- **Dispositivi del Cliente:** app mobile non funzionante per sistema operativo non supportato (iOS < 14, Android < 10), spazio di archiviazione esaurito, permessi fotocamera non concessi
- **Interventi di emergenza:** downtime necessario per rispondere a vulnerabilità di sicurezza critiche (notifica successiva all'intervento)
- **Piano free o demo:** questo SLA si applica solo a contratti attivi a pagamento

---

## 7. Protezione Dati (GDPR)

### Base giuridica

Dataxiom agisce come **Responsabile del Trattamento** (Data Processor) per conto del Cliente, che è il **Titolare del Trattamento** (Data Controller) ai sensi del GDPR (Regolamento UE 2016/679).

### Misure tecniche adottate

| Misura | Dettaglio |
|--------|-----------|
| **Crittografia in transito** | HTTPS/TLS su tutti i componenti (API, dashboard, comunicazioni DB) |
| **Crittografia a riposo** | Database AWS RDS con encryption at rest abilitata |
| **Residenza dati** | Tutti i dati sono archiviati in AWS eu-west-1 (Irlanda) — territorio UE |
| **Accesso RBAC** | Ruoli distinti (admin, manager, employee) con accesso ai soli dati necessari |
| **Audit log** | Ogni modifica tracciata con: chi, quando, cosa |
| **Backup** | Backup automatico giornaliero RDS con retention 1 giorno (ripristino point-in-time) |
| **Retention automatica** | Check-in più vecchi di 12 mesi eliminati automaticamente (script notturno) |

### Diritto all'oblio (Art. 17 GDPR)

Il Cliente può richiedere in qualsiasi momento la cancellazione dei dati di un dipendente specifico (inclusi tutti i check-in, presenze e turni associati). La richiesta va inviata via email a falletti.diego2533@gmail.com — Dataxiom esegue la cancellazione entro **72 ore**.

---

## 8. Disdetta e Cancellazione Dati

### Procedura di disdetta

Il Cliente può disdire il servizio con **30 giorni di preavviso** via email.

### Export dati prima della disdetta

Entro la data di disdetta, il Cliente può:
- Scaricare tutti i check-in come CSV dalla dashboard (`GET /api/export/csv`)
- Richiedere un dump completo del database in formato SQL via email

### Cancellazione dati post-disdetta

Entro **30 giorni** dalla data di disdetta effettiva:

1. Tutti i dati del Cliente vengono eliminati dal database di produzione (dipendenti, sedi, check-in, turni, audit log)
2. I backup automatici vengono eliminati al termine della loro retention naturale (entro 1 giorno aggiuntivo)
3. Dataxiom invia conferma scritta dell'avvenuta cancellazione via email

> Questo adempie all'obbligo GDPR Art. 17 (diritto alla cancellazione) nei rapporti B2B con il Cliente.

### Dati anonimi / aggregati

Dataxiom si riserva di conservare statistiche aggregate e anonime (es. numero medio di check-in per tipologia di cliente) per finalità di miglioramento del servizio, senza possibilità di risalire a individui o clienti specifici.

---

## 9. Limitazione di Responsabilità

La responsabilità di Dataxiom per danni derivanti da downtime o malfunzionamenti del Servizio è limitata al **rimborso proporzionale del canone mensile** per il periodo di indisponibilità effettiva (calcolato come: canone_mensile × ore_downtime / 720).

Dataxiom non è responsabile per:
- Perdita di fatturato o danni indiretti derivanti dal downtime
- Dati persi a causa di errori del Cliente (es. dipendente che non effettua check-in)
- Malfunzionamenti fuori dalle esclusioni di §6

---

## 10. Modifiche a questo SLA

Dataxiom si riserva di aggiornare questo documento con preavviso di **30 giorni** via email. Le modifiche non si applicano retroattivamente ai periodi già fatturati.

---

*Ultima modifica: 2026-06-10*  
*Per accettazione, firmare il contratto di servizio che richiama questo documento.*
