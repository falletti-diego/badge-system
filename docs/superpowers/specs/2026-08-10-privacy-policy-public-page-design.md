# Pagina pubblica Privacy Policy GPS (S.24) — Design

**Data:** 10 Agosto 2026
**Status:** Approvato
**Chiude:** S.24 (`TASKS.md`) — ultimo sotto-task residuo dopo Fase C (Session 99)

---

## Contesto

`findings2agosto2016.md` finding #2 (geofencing) è stato chiuso in Fase C (Session 99), rendendo il GPS realmente enforced server-side. Questo ha completato 3 dei 4 sotto-task del piano originale S.24 (`docs/superpowers/plans/2026-06-20-s24-gdpr-gps-disclosure.md`): fix `GPSConsentDialog`, script+cron retention 90gg, test coverage `/admin/employee-consents`. Resta solo il quarto: pubblicare una pagina informativa GDPR (Art. 13-14) accessibile pubblicamente, referenziata dal link `https://badge.dataxiom.it/privacy-policy-it` già hardcoded in `GPSConsentDialog.jsx` (mai raggiungibile finché la pagina non esiste).

Il contenuto sorgente esiste già (`docs/privacy-policy-IT.md`, scritto Session 33, versione 2.0 dell'11 Giugno 2026) ma non è mai stato reso pubblico. Un'analisi critica condotta durante il brainstorming di questo piano ha trovato che il testo è **factually stale** rispetto al comportamento reale introdotto da Fase C, su più punti — dettagliati sotto.

## Scope

**Dentro lo scope:**
- Correggere 4 inesattezze nel contenuto di `docs/privacy-policy-IT.md` (elencate sotto)
- Convertire il markdown in una pagina HTML statica pubblica, stesso pattern già collaudato per il DPA (`frontend-web/public/dpa-template-it.html`)
- Aggiungere il redirect Netlify che la rende raggiungibile su `/privacy-policy-it`

**Fuori scope (backlog separato, non affrontato qui):**
Durante l'analisi critica sono emersi 2 gap più profondi, non risolvibili con una correzione di testo:
1. **Base giuridica del consenso GPS potenzialmente invalida.** Con Fase C il GPS è obbligatorio (rifiuto → check-in bloccato, nessun bypass). Le Linee Guida EDPB 05/2020 sul consenso presumono che il consenso in un rapporto di lavoro non sia "liberamente prestato" quando il rifiuto ha conseguenze negative — l'attuale architettura (dialog "Accetto/Rifiuto" su base Art. 7) potrebbe richiedere una base giuridica diversa (Art. 6(1)(b) contratto o 6(1)(f) legittimo interesse con bilanciamento documentato).
2. **Statuto dei Lavoratori Art. 4 (L. 300/1970)** — uno strumento capace di tracciare la posizione di un dipendente richiede accordo sindacale aziendale o autorizzazione dell'Ispettorato Territoriale del Lavoro prima dell'attivazione, obbligo del cliente (datore di lavoro), non coperto da GDPR/privacy-policy e oggi non comunicato in nessun punto dell'onboarding cliente.

Entrambi vanno registrati come nuove voci nel backlog GDPR di `TASKS.md` (sezione "GDPR/Privacy Findings"), da affrontare in una sessione dedicata con `/grilling` — non in questo piano.

## Contenuto — 4 correzioni a `docs/privacy-policy-IT.md`

1. **Sezioni 3.2 ("Limitazione", "Opposizione") e 7.2 (testo del dialog di consenso).** Rimuovere ogni riferimento a "check-in senza GPS, se facoltativo" / "il datore di lavoro valuta se è possibile" — verificato in `QRScannerScreen.jsx:336-343` (`handleConsentDeclined`): il rifiuto blocca il check-in su quella sede, punto, nessun fallback. Riformulare come vincolo assoluto quando il geofencing è attivo sulla sede.
2. **Sezione 3.2.** Aggiungere il diritto di revoca del consenso in qualsiasi momento da Impostazioni app (endpoint reale `POST /api/v1/consent/gps-revoke`, aggiunto in Fase C), con nota esplicita che dopo la revoca il check-in resta bloccato sulle sedi geofenced finché non si riconsente.
3. **Sezione 3.2, "Accesso (Art. 15)".** Correggere: non esiste un self-service via "API privata o export CSV" — verificato nel codice (`backend/src/routes/checkins.js`, `backend/src/routes/export.js`): `checkin_latitude`/`checkin_longitude` non sono mai restituite da nessun endpoint GET né incluse in nessuna colonna CSV. Riformulare come richiesta manuale a `privacy@dataxiom.it`, evasa dal titolare entro i termini di legge.
4. **Sezione 4, "Sub-Processori".** Aggiungere Sentry (error monitoring) alla lista — riceve `user_id` + `role` pseudonimizzati ad ogni richiesta autenticata (`backend/src/middleware/auth.js:119`, `Sentry.setUser({ id, role })`). Includere una nota "da verificare: pinning region EU dell'organizzazione Sentry" — se l'org non è pinnata su EU, si tratta di un trasferimento extra-UE oggi non valutato.

Il resto del documento (basi legali per le altre categorie di dati, retention 90gg — verificata coerente col cron reale `0 2 * * *` UTC in produzione, sub-processore AWS eu-west-1, misure di sicurezza) resta invariato, già accurato.

## Pagina HTML — `frontend-web/public/privacy-policy-it.html`

Stessa struttura CSS/branding di `dpa-template-it.html` (stesso foglio di stile inline, palette `#1E3A5F`, font Georgia/serif per il corpo, Arial per gli elementi UI) ma senza le sezioni specifiche al DPA (`.parties`, `.signatures`) — non è un documento bilaterale da firmare. Include un bottone "Stampa" (per HR che vuole affiggerla in bacheca aziendale), stesso pattern del `.download-bar`/`.btn-print` del DPA.

Il placeholder `[Cliente — azienda cliente che acquista Badge System]` per il Titolare del Trattamento resta visibile tra parentesi quadre — stesso pattern già in uso nel DPA (`[RAGIONE SOCIALE CLIENTE]`), compilato a mano dal cliente/Dataxiom per iscrizione specifica: è una pagina statica generica, non ha un backend multi-tenant per popolarlo automaticamente.

## Routing

Una riga in `frontend-web/public/_redirects`, prima del catch-all SPA (`/* /index.html 200`), identica al pattern DPA già esistente:

```
/privacy-policy-it  /privacy-policy-it.html  200
```

Nessuna modifica a `App.jsx` / React Router.

## Testing

Nessun test automatico: è una pagina HTML statica, stesso trattamento del DPA (che non ha test). Verifica manuale post-deploy: build/deploy preview Netlify, controllo visivo della pagina, `curl -I https://badge.dataxiom.it/privacy-policy-it` per confermare che il redirect risolva con `200` e serva l'HTML (non il fallback SPA).

## Rischi residui accettati

- I 2 gap fuori scope (base giuridica consenso, Statuto Lavoratori) restano aperti come backlog — la pagina descrive accuratamente lo stato attuale del sistema, ma lo stato attuale del sistema ha questi 2 problemi irrisolti a monte.
- Il placeholder `[Cliente]` richiede un passo manuale (compilazione) prima di essere davvero utilizzabile da un cliente reale — accettabile per una pagina di riferimento generica, coerente con come il DPA è già gestito oggi.
