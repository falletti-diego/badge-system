# Onboarding Cliente Self-Service — Design

**Data:** 28 Luglio 2026
**Status:** Approvato — pronto per il piano di implementazione (`docs/superpowers/plans/2026-07-28-onboarding-self-service.md`)

---

## Contesto

Una valutazione critica dell'MVP (`/superpowers:brainstorming`, Session 84), condotta ora che l'app mobile è disponibile sia su iOS che su Android, ha identificato l'onboarding del cliente pagante come il gap commerciale più diretto ancora aperto — non l'ambiente demo self-service per i prospect (già live in produzione su `/prova-demo`, verificato), ma il passo successivo: **oggi, dopo che un cliente firma, ogni singolo onboarding richiede che Dataxiom esegua manualmente `backend/scripts/onboard-client.js` su un Excel compilato dal cliente**. È un processo "concierge" già semi-automatizzato (script idempotente, testato) ma non self-service — un collo di bottiglia che non scala oltre i primi clienti pilota.

## Decisioni di design

Prese tramite una serie di domande mirate con l'utente in questa sessione, ciascuna con la propria motivazione:

### 1. Perimetro: solo popolamento dati, non self-signup completo
La creazione del record `clients` (nome, email, piano) resta un'azione di Dataxiom — la vendita rimane B2B assistita (contratto, pricing negoziato). Il self-service copre solo ciò che oggi richiede l'esecuzione manuale dello script: popolare sedi, dipendenti e saldi. Un self-signup completo (pagamento, scelta piano senza intervento umano) è stato esplicitamente escluso — aggiungerebbe integrazione di fatturazione fuori perimetro per il valore atteso.

### 2. Primo accesso: invito via email con link one-time
Dopo che Dataxiom crea il record cliente, l'admin del cliente riceve un'email con un link di invito (token one-time, scadenza 7 giorni) per impostare la propria password e accedere direttamente al wizard — non una credenziale temporanea comunicata a mano come oggi.

### 3. Meccanismo dati: riuso dell'upload Excel esistente
Il wizard non è un form manuale voce-per-voce — riusa lo stesso template Excel (Azienda/Sedi/Dipendenti/Saldi) e la stessa logica già scritta e testata in `backend/scripts/onboarding/` (`parseWorkbook`, `validate`, `validateAgainstDb`, `apply`), esposta dietro un endpoint web con un passo di preview/diff prima dell'applicazione. Questo preserva l'investimento già fatto (moduli TDD, idempotenza già verificata) e resta praticabile per catene con molte sedi/dipendenti, dove un form manuale sarebbe impraticabile.

### 4. Distribuzione credenziali dipendenti: email diretta automatica
Ogni nuovo dipendente creato dal wizard riceve automaticamente un'email con le proprie credenziali iniziali, invece del CSV oggi scaricato e distribuito manualmente dall'admin.

**Scoperta chiave che semplifica questo punto** (esplorazione del codice, 3 agenti Explore): il sistema ha *già* un meccanismo "password temporanea + `must_change_password`", riusato identicamente per la creazione admin di un dipendente, il reset password (C.1, `backend/src/routes/admin/employees.js`) e l'import CSV. Per il welcome-email dei dipendenti **non serve quindi nuova infrastruttura di token** — basta inviare via email la password già generata da `apply()` invece di limitarsi a restituirla in un CSV. Il dipendente, al primo login, viene già forzato dal flusso esistente a impostarne una propria.

Un vero meccanismo di token one-time nuovo serve **solo** per il punto 2 (invito del primo admin di un client nuovo), perché lì non esiste ancora nessuna riga `employees` su cui applicare il flusso già esistente.

### 5. Riutilizzo: wizard sempre disponibile, non solo al primo onboarding
Lo stesso wizard resta accessibile in `/admin/onboarding` anche dopo l'onboarding iniziale, per bulk-import futuri (es. una nuova sede aperta mesi dopo). La logica sottostante (`apply()`) è già upsert-idempotente, quindi non richiede sforzo aggiuntivo rispetto a limitarlo a un solo uso.

## Dipendenza bloccante: SES fuori sandbox

I punti 2 e 4 richiedono l'invio di email verso domini reali dei clienti — impossibile finché l'account SES resta in sandbox (solo indirizzi pre-verificati). L'uscita dalla sandbox (`docs/superpowers/plans/2026-07-19-demo-funnel-screenshots-ses.md`, Parte B) è stata avviata in parallelo alla stesura di questa spec (Task 4 completato: identità dominio + record DKIM generati e consegnati all'utente per l'inserimento su register.it) — non ha costi AWS aggiuntivi (volume atteso ampiamente coperto dal free-tier EC2→SES). **L'implementazione di questo design non può essere completata end-to-end finché SES non è verificato in produzione** (Task 5-7 del piano SES).

## Architettura

Nessun nuovo sistema — estende quanto già esiste:

- La logica Excel→DB già in `backend/scripts/onboarding/*.js` (moduli CommonJS già isolati e testati: `parseWorkbook.js`, `validate.js`, `validateAgainstDb.js`, `apply.js`, `preview.js`) viene **spostata** (non duplicata) in `backend/src/services/onboarding/`, per essere richiamabile sia dal CLI esistente (`onboard-client.js`, aggiornato a puntare alla nuova posizione) sia da due nuovi endpoint HTTP autenticati.
- Un solo pezzo di infrastruttura nuova — un meccanismo di token invito one-time con scadenza (`invite_tokens`, nuova tabella) — copre l'unico caso che lo richiede davvero (invito primo admin). Il welcome-dipendenti riusa `must_change_password` già esistente, zero infrastruttura nuova lì.
- Il frontend introduce due pagine nuove: `AcceptInvitePage.jsx` (pubblica, redenzione token) e `OnboardingWizardPage.jsx` (autenticata, ruolo admin, upload→preview→apply).

## Componenti

| Componente | Tipo | Riuso / Nuovo |
|---|---|---|
| `backend/src/services/onboarding/*.js` | Backend | Spostato da `scripts/`, logica invariata + adattamento Buffer per upload |
| `backend/src/utils/inviteTokens.js` | Backend | Nuovo — generazione/verifica token, 7gg scadenza |
| `backend/src/routes/onboardingInvite.js` (`POST /invite/:token/accept`) | Backend | Nuovo — pubblico, rate-limited come `/demo/start` |
| `backend/src/routes/admin/onboarding.js` (`POST /preview`, `POST /apply`) | Backend | Nuovo — autenticato, ruolo admin |
| `backend/src/routes/admin/clients.js` | Backend | Modificato — invio invito dopo creazione client |
| `backend/src/utils/email.js` | Backend | Riuso di `sendEmail()` esistente, 2 nuovi template (invito admin, welcome dipendente) |
| `frontend-web/src/pages/AcceptInvitePage.jsx` | Frontend | Nuovo — pagina pubblica |
| `frontend-web/src/pages/OnboardingWizardPage.jsx` | Frontend | Nuovo — wizard MUI Stepper (primo uso nel codebase) |
| `/admin/sites` (QR download) | Frontend | Riuso invariato — link dal riepilogo del wizard |

## Data flow

1. Dataxiom crea il client (`POST /api/admin/clients`, invariato) → dopo il commit, genera un invite token per `client.email` e invia l'email di invito.
2. L'admin apre il link, imposta la password (`POST /invite/:token/accept`) → creata la riga `employees` (role=admin), token consumato, JWT emesso, redirect diretto al wizard.
3. L'admin carica l'Excel → `POST /preview` (transazione con `ROLLBACK` esplicito, mai scrive) → mostra diff creati/aggiornati/errori.
4. Conferma → `POST /apply` (transazione con `COMMIT`) → dopo il commit, invia email di welcome solo ai dipendenti **nuovi** (mai ri-notificare gli aggiornati).
5. Riepilogo finale con link a `/admin/sites` per scaricare i QR code (già esistenti, nessun lavoro nuovo).

## Gestione errori

- **Preview** mostra ogni riga che fallirebbe (sede non trovata, email duplicata, formato non valido) prima che qualunque dato venga scritto — stesso principio di `validateAgainstDb` già esistente, ora esposto via API invece che solo a un terminale.
- **Nessun invio email dentro una transazione DB**: un fallimento SES non deve mai far fallire o rollbackare la creazione del client o l'apply del wizard. Le email si inviano sempre *dopo* il commit, con `logger.warn` esplicito su fallimento (mai un errore silenzioso, coerente con CLAUDE.md Pattern 3) e restano un'azione ripetibile a parte (bottone "Reinvia" nel wizard/riepilogo per eventuali fallimenti segnalati).
- **Token invito**: scaduto, già usato, o inesistente → risposta di errore chiara lato `AcceptInvitePage`, nessuna riga creata.

## Testing

Livello di dettaglio completo nel piano di implementazione (Fase 2 del piano SES+Onboarding). In sintesi: TDD su ogni pezzo nuovo (token invito — 4 scenari: valido/scaduto/usato/inesistente; endpoint redemption — transazionalità; preview/apply — nessuna scrittura in preview, email solo ai nuovi dipendenti, resilienza a fallimenti SES; wizard frontend — stati preview/errori/successo/reinvio), riusando i pattern di mock già stabiliti nel repo (`admin-csv-import.test.js` per upload multipart, `email.test.js` per il mock di `SESClient`/`SendEmailCommand`, `AdminLeaveManagement.test.jsx` per il pattern di test frontend con hook dedicato).

## Fuori perimetro

- **Self-signup completo** (pagamento/piano scelti dal cliente senza alcun intervento umano) — la creazione del client resta un'azione di Dataxiom.
- **Rotazione/revoca di un invito già inviato prima della scadenza** — non richiesta, un invito scaduto richiede oggi di rigenerarne uno nuovo manualmente.
- **Implementazione del codice di questo design** — deliberatamente rinviata a dopo la verifica di SES in produzione (Task 5-7 del piano SES esistente); questa spec e il relativo piano di implementazione sono scritti ora per essere pronti a eseguire non appena SES è verificato.
