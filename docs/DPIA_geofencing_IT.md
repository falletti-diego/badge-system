# Valutazione d'Impatto sulla Protezione dei Dati (DPIA) — Geolocalizzazione Dipendenti

> **⚠️ BOZZA — da validare con un legale prima dell'uso vincolante con un cliente reale.**
> Questo documento è una bozza precompilata da Dataxiom per assistere il cliente
> (Titolare del Trattamento) nell'adempimento del proprio obbligo di DPIA secondo
> l'Art. 35 GDPR e la Delibera del Garante Privacy n. 467/2018 (che elenca
> esplicitamente la geolocalizzazione dei dipendenti tra i trattamenti soggetti
> a DPIA obbligatoria). Dataxiom fornisce lo strumento e le informazioni tecniche
> di sua competenza come Responsabile del Trattamento; la DPIA resta un obbligo
> del Titolare (cliente), che deve validarla con un proprio consulente legale/DPO
> prima di attivare il geofencing.

---

## 1. Descrizione sistematica del trattamento

**Compilato da Dataxiom (Responsabile del Trattamento):**

- **Natura del trattamento:** raccolta di coordinate GPS (latitudine/longitudine) del dispositivo del dipendente al momento del check-in, per verificare la prossimità fisica alla sede di lavoro (geofencing).
- **Ambito:** limitato al momento del check-in/check-out; nessun tracciamento continuo o in background.
- **Finalità dichiarata:** prevenzione frode (check-in da postazione non autorizzata), sicurezza della sede.
- **Base giuridica:** Art. 6(1)(f) GDPR (legittimo interesse) + consenso esplicito Art. 7 come layer di trasparenza aggiuntivo (vedi `docs/privacy-policy-IT.md` §1).
- **Categorie di dati:** coordinate GPS, timestamp, identificativo dipendente.
- **Conservazione:** 90 giorni, cancellazione automatica (cron notturno, verificato in produzione).
- **Destinatari:** nessuna condivisione con terzi salvo sub-processori infrastrutturali (AWS, elencati nel DPA).

**Da compilare dal Titolare (cliente):**

- **Ragione sociale e settore:** [RAGIONE SOCIALE CLIENTE]
- **Numero di dipendenti soggetti a geolocalizzazione:** [X]
- **Sedi interessate:** [ELENCO SEDI]
- **Contesto organizzativo/sindacale:** [descrivere se è presente una RSU/RSA e lo stato dell'accordo Art. 4 Statuto Lavoratori — vedi la conferma richiesta in fase di attivazione del geofencing nel pannello amministrativo]

## 2. Valutazione di necessità e proporzionalità

**Compilato da Dataxiom:**

- Il geofencing è **opzionale e disattivabile** per l'intero cliente (`geofencing_feature_enabled`) e per singola sede — non è una funzione always-on non disattivabile.
- Alternativa meno invasiva valutata: QR code/Face ID senza GPS (disponibile come modalità di default; il geofencing è un livello aggiuntivo opt-in per il cliente, non il meccanismo base di check-in).
- Il dato GPS non è mai usato per finalità diverse dalla verifica di prossimità (nessun tracciamento comportamentale, nessuna profilazione).

**Da compilare dal Titolare:**

- [ ] Motivazione specifica per cui il QR/Face ID senza GPS non è sufficiente per questa sede/azienda: [DA COMPILARE]

## 3. Valutazione dei rischi per i diritti e le libertà degli interessati

| Rischio | Probabilità | Gravità | Misura di mitigazione (già in essere) |
|---|---|---|---|
| Accesso non autorizzato ai dati GPS | Bassa | Media | Cifratura a riposo (AWS RDS), RBAC multi-tenant, audit log completo |
| Uso del dato oltre la finalità dichiarata (function creep) | Bassa | Alta | Nessun endpoint di reporting aggregato su GPS oltre la verifica check-in; cancellazione automatica 90gg |
| Consenso non genuinamente libero (squilibrio datore/dipendente) | Media | Media | Base giuridica primaria = legittimo interesse Art. 6(1)(f), non solo consenso; diritto di revoca sempre disponibile da Impostazioni |
| Assenza di autorizzazione sindacale/ITL (Art. 4 Statuto Lavoratori) | **Da valutare dal Titolare** | Alta | Gate tecnico che impedisce l'attivazione senza conferma esplicita del cliente nel pannello amministrativo |

## 4. Misure per affrontare i rischi

**Già in essere (Dataxiom):**
- Retention automatica 90 giorni
- Diritto di revoca self-service (app mobile, Impostazioni)
- Toggle di disattivazione a livello cliente e per singola sede
- Audit log di ogni modifica (chi/quando/cosa)
- Gate tecnico di conferma Art. 4 prima dell'attivazione del geofencing

**Responsabilità del Titolare:**
- [ ] Ottenere l'accordo sindacale o l'autorizzazione ITL prima di confermare l'attivazione (Art. 4 Statuto Lavoratori)
- [ ] Informare i dipendenti tramite l'informativa privacy interna aziendale, oltre alla Privacy Policy di Badge System
- [ ] Consultare il proprio DPO/legale su questa DPIA prima della firma

## 5. Consultazione e parere

- [ ] Data consultazione DPO/legale del Titolare: [DATA]
- [ ] Esito: [APPROVATO / APPROVATO CON RISERVE / RESPINTO]
- [ ] Firma Titolare: [NOME, RUOLO, DATA]

---

*Documento bozza Dataxiom S.r.l. — v1.0, 23 Agosto 2026. Non sostituisce una consulenza legale.*
