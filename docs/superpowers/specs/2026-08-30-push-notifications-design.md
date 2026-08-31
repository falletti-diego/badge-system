# Notifiche push (mobile) — Design Spec

**Data:** 2026-08-30
**Status:** Approvato via `/superpowers:brainstorming` + `/grilling` + analisi critica esplicita, pronto per il piano di implementazione

## Problema

Oggi il sistema di notifiche del Badge System è incompleto su due assi:

1. **Copertura eventi**: solo il cambio turno (`backend/src/routes/shifts.js`) scrive una riga nella tabella `notifications`. L'approvazione/rifiuto di una richiesta di ferie o di un evento/training non genera **nessuna** notifica, nemmeno in-app.
2. **Canale**: l'unico consumatore di `notifications` è `frontend-web`'s `NotificationBell.jsx` (polling ogni 30s). `frontend-mobile` — dove lavora il dipendente comune, per design del prodotto ("zero hardware, dipendenti usano smartphone personale") — non ha **nessun** meccanismo di notifica: né polling, né push. Un dipendente scopre un cambio turno o l'esito di una richiesta solo aprendo manualmente l'app.

Obiettivo di questa spec: introdurre la notifica push mobile per colmare il gap più visibile, con uno scope deliberatamente stretto per l'MVP.

## Non-Goals (esplicitamente fuori scope)

- **Notifiche al manager/senior_manager/director** sulle richieste dei propri dipendenti (es. una malattia comunicata last-minute). Solo il dipendente che ha fatto la richiesta riceve una notifica sul suo stesso esito — mai un terzo.
- **Web Push** (notifica di sistema su browser). Il dashboard web resta col polling `NotificationBell` esistente, invariato.
- **Cronologia notifiche in-app su mobile** (l'equivalente della campanella web). Il push è un banner di sistema transitorio — se il dipendente lo ignora/perde, non c'è modo di rivederlo in app. Scelta deliberata per tenere lo scope snello; il gap è accettato consapevolmente (vedi "Rischi noti").
- **Badge numerico sull'icona dell'app.** Nessuna azione in-app lo azzererebbe in modo naturale, dato che non c'è una cronologia.
- **Deep link al tap sulla notifica.** Toccarla apre semplicemente l'app; nessuna navigazione mirata alla schermata pertinente.
- **Notifica per la comunicazione di Malattia.** È auto-approvata (nessuna decisione di terzi da notificare al dipendente stesso).
- **Notifica per la correzione gerarchica del cartellino** (feature Session 116 — un senior_manager che corregge il cartellino di un manager). Resta fuori da questo scope; se richiesta in futuro, è un piano a parte.
- **Receipt-checking di Expo Push** (il meccanismo che rileva un token non più valido, es. app disinstallata). Vedi "Rischi noti" — decisione esplicita di rimandarlo, non un'omissione.
- **Strumento diagnostico admin** ("questo dipendente ha un token push registrato?"). Rimandato a un follow-up.
- **Meccanismo di force-update/version-check dell'app.** Vedi "Rischi noti".
- **`backend/src/utils/demoSeed.js`**: nessuna modifica. Verificato che è già sicuro by construction — un dipendente demo non installa mai l'app reale, quindi non avrà mai una riga in `device_push_tokens`; l'helper di invio trova una lista vuota e non effettua alcuna chiamata esterna.

## Decisioni di design

### 1. Eventi che generano una notifica push

| Evento | Notifica? | Motivazione |
|---|---|---|
| Cambio turno (`shifts.js`) | ✅ | Già scrive una riga oggi — solo aggiungere la delivery push |
| Approvazione/rifiuto Ferie (`leaves.js`) | ✅ | Nuovo punto di scrittura |
| Approvazione/rifiuto Evento/Training (`events.js`) | ✅ | Nuovo punto di scrittura |
| Comunicazione Malattia (`illnesses.js`) | ❌ | Auto-approvata, nessuna decisione da notificare |

Target sempre e solo il dipendente stesso (`employee_id` della richiesta/del turno) — mai il manager/superiore che approva.

### 2. Piattaforma: solo mobile

Nessuna Web Push. Il dashboard web è usato prevalentemente da manager/admin che lo tengono aperto per lavoro — il polling a 30s è già adeguato lì. Il push reale ha valore dove oggi non esiste alcun meccanismo di notifica: il telefono del dipendente.

### 3. UX mobile: banner di sistema puro, nessuna cronologia

Nessuna nuova schermata "storico notifiche" su mobile, nessun badge, nessun deep link. Scelta deliberatamente snella — vedi "Rischi noti" per il trade-off accettato (una notifica ignorata è persa).

### 4. Permessi: dialog esplicativo prima del prompt di sistema

Stesso pattern già in uso nel progetto per Face ID (`FaceIDScreen.jsx`) e GPS (`GPSConsentDialog.jsx`): un dialog con un bottone "Attiva" che spiega il beneficio ("Ricevi un avviso immediato per cambi turno e approvazioni") **prima** di invocare il prompt di sistema — mai un prompt a freddo al primo avvio. Mostrato una sola volta, alla prima apertura dopo l'aggiornamento (flag persistito in `AsyncStorage`), non ripetuto ad ogni login.

### 5. Permesso negato: comportamento silenzioso + via di recupero in Impostazioni

Se il dipendente nega (o ignora) il dialog, l'app continua a funzionare normalmente, senza notifiche, senza ripetere il prompt. **Via di recupero esplicita**: una riga "Notifiche" in `SettingsScreen.jsx` che mostra lo stato (attive/disattivate) e, se disattivate, un bottone "Apri Impostazioni" (`Linking.openSettings()`) — stesso pattern già usato in `QRScannerScreen.jsx` per il permesso fotocamera negato permanentemente. Senza questa riga, un dipendente che ha detto "no" per sbaglio resterebbe escluso per sempre senza sapere come tornare indietro.

### 6. Delivery: Expo Push Service

Il progetto è interamente Expo managed workflow (EAS Build, EAS Update/OTA, `expo-camera`, `expo-location`, `expo-local-authentication` — mai un modulo nativo bare). Uscire da quell'ecosistema per introdurre APNs/FCM diretti aggiungerebbe una seconda pipeline di credenziali senza beneficio per un singolo cliente pilota. Uso della libreria ufficiale `expo-server-sdk` lato backend (non chiamate HTTP grezze) — lascia aperta la porta a un futuro receipt-checking senza cambiare libreria.

**Prerequisito operativo non di codice, da inserire come task esplicito nel piano di implementazione**: il push Android su build EAS richiede un progetto Firebase proprio con una chiave di servizio FCM caricata sulle credenziali EAS (Expo non offre più un FCM condiviso per le build custom). Nessun riferimento a Firebase/FCM esiste oggi nel repo — è un nuovo account/servizio esterno da creare, non solo una libreria da installare. **Da verificare contro la documentazione Expo corrente prima di iniziare l'implementazione** (informazione soggetta a cambiare). Per iOS, la chiave APNs push è invece gestita automaticamente da EAS insieme alle credenziali di distribuzione già esistenti.

### 7. Storage token: nuova tabella `device_push_tokens`

```sql
CREATE TABLE device_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_device_push_tokens_employee_id ON device_push_tokens(employee_id);
```

`client_id` con FK esplicita verso `clients(id)`, non un `UUID NOT NULL` nudo come `audit_log.client_id`/`notifications.client_id` (entrambi senza FK). Segue invece il precedente più recente e più rigoroso `checkins.client_id REFERENCES clients(id) ON DELETE CASCADE` (migration 030, introdotta esplicitamente come isolamento tenant "mandatory") — nessuna ragione per introdurre una tabella nuova sul precedente più debole quando quello più stretto esiste già nel repo.

- **Multi-device per dipendente**: righe multiple con lo stesso `employee_id`, una per device — un invio push va a tutti i token registrati.
- **`client_id` denormalizzato**: coerente col pattern di isolamento tenant già usato ovunque nel progetto (`checkins`, `audit_log`, `notifications` stessa) — ogni query di invio filtra esplicitamente per `client_id`, non si affida solo al JOIN via `employee_id`.
- **`token` `UNIQUE` + registrazione come upsert** (`ON CONFLICT (token) DO UPDATE SET employee_id = ..., client_id = ..., updated_at = NOW()`): gestisce in modo pulito il caso di un device che cambia proprietario (es. un telefono aziendale ridato a un nuovo assunto) — il vecchio dipendente smette automaticamente di ricevere push su quel device, senza bisogno di un unregister esplicito al logout.

### 8. Nuovo endpoint di registrazione token

`POST /api/notifications/push-token` (auth richiesta), body `{ token: string, platform: 'ios'|'android' }`, upsert come sopra usando `req.user.employee_id`/`req.user.client_id`. Se `req.user.employee_id` è assente (account senza profilo dipendente collegato — stesso caso già gestito in `checkins.js` con `CHECKIN_NO_EMPLOYEE_PROFILE`), la registrazione va rifiutata con lo stesso pattern fail-closed, non ignorata silenziosamente. Nessun endpoint di rimozione esplicita in questo scope (l'upsert su riassegnazione copre il caso reale; un `DELETE` esplicito al logout non ha beneficio pratico dato che il device resta associato allo stesso dipendente nella stragrande maggioranza dei casi — smartphone personale, non condiviso).

**Pulizia alla disattivazione del dipendente**: `DELETE FROM device_push_tokens WHERE employee_id = $1` aggiunto a `DELETE /api/admin/employees/:id` (`admin/employees.js` — oggi fa solo `UPDATE employees SET active = false, exit_date = ...`, un soft-delete che non tocca nient'altro, coerente col comportamento già noto per `manager_id`/`reports_to_id` di altri dipendenti che restano appesi a un manager disattivato). Un token push è dato personale legato a un device fisico di un individuo — a differenza di un FK interno come `manager_id`, ha un profilo GDPR più diretto (minimizzazione dati); costa una riga di codice in più e chiude un gap reale invece di lasciarlo silenzioso. Nessun impatto pratico nell'immediato (un dipendente disattivato non genera più eventi che chiamano `notifyEmployee`), ma il token resterebbe altrimenti in tabella indefinitamente senza motivo.

### 9. Helper condiviso unico lato backend

Nuovo modulo `backend/src/utils/pushNotifications.js`, funzione `notifyEmployee({ employeeId, clientId, type, inAppMessage, pushTitle, pushBody, ...extra })` — **nessun parametro `client`/connessione**: il modulo importa `pool` direttamente (stesso pattern di `utils/email.js`), sempre eseguito **fuori** da qualunque transazione, chiamato dalle tre route solo **dopo** che `withTransaction(...)` è già tornato con successo (stesso punto esatto in cui `shifts.js` scrive oggi la sua notifica — "outside transaction" — quindi `leaves.js`/`events.js` allineano la loro chiamata subito dopo `const result = await withTransaction(...)`, non dentro il callback). Questo evita un'ambiguità reale: un `client` transazionale passato per errore avrebbe fatto sì che un fallimento della *sola* parte di invio potesse propagarsi come eccezione non gestita dentro il callback di `withTransaction`, causando un `ROLLBACK` dell'intera approvazione per colpa di un problema di rete verso Expo — esattamente il tipo di accoppiamento che la spec vuole escludere.

`notifyEmployee` fa, in un solo posto:
1. `INSERT INTO notifications` (stesso schema/comportamento di oggi — `inAppMessage` va nella colonna `message`) — **awaited**, per garantire che la riga in-app sia scritta in modo affidabile prima di rispondere.
2. Lookup dei token attivi per quell'`employee_id`+`client_id` in `device_push_tokens`.
3. Invio a Expo Push Service (via `expo-server-sdk`) per ciascun token trovato — **non awaited** dal chiamante (vedi punto 12 sotto per il motivo).

Tutto dentro lo stesso `try/catch` best-effort già collaudato in `shifts.js` — un fallimento di invio push (o l'assenza di token) non deve mai far fallire un salvataggio turno o un'approvazione ferie/evento. Le tre route (`shifts.js`, `leaves.js`, `events.js`) chiamano solo questa funzione — zero duplicazione della logica di invio.

**Testabilità**: la chiamata a Expo Push va isolata dietro un modulo sottile (stesso pattern di `utils/email.js` per SES) così da essere mockabile nei test Jest, invece di essere l'unico punto del codebase che chiama un servizio esterno senza un modo pulito di simularlo.

### 10. Contenuto del messaggio: generico su lock screen per ferie/eventi, dettagliato per turno

Il messaggio **in-app** (colonna `notifications.message`, visibile anche sulla campanella web se il dipendente/manager la usa) resta sempre dettagliato. Il **corpo del push** (visibile sul lock screen, potenzialmente a chiunque guardi il telefono) è invece:

| Tipo | Titolo push | Corpo push (lock screen) | Messaggio in-app (dettagliato) |
|---|---|---|---|
| `shift_updated` | "Turno aggiornato" | Stesso testo dettagliato di oggi (es. "Turno aggiornato: martedì 3 settembre → Mattino") — non sensibile, valore immediato | Identico al corpo push |
| `leave_approved` | "Richiesta ferie" | "La tua richiesta è stata approvata. Apri l'app per i dettagli." | "Richiesta ferie dal {start} al {end} approvata." |
| `leave_rejected` | "Richiesta ferie" | "La tua richiesta è stata rifiutata. Apri l'app per i dettagli." | "Richiesta ferie dal {start} al {end} rifiutata{motivo}." |
| `event_approved` | "Richiesta evento" | "La tua richiesta è stata approvata. Apri l'app per i dettagli." | "Richiesta evento del {data} approvata." |
| `event_rejected` | "Richiesta evento" | "La tua richiesta è stata rifiutata. Apri l'app per i dettagli." | "Richiesta evento del {data} rifiutata{motivo}." |

Il cambio turno resta specifico perché l'informazione ("nuovo turno assegnato") non è sensibile ed è lo standard di mercato mostrarla per intero; ferie/eventi restano generici perché possono rivelare dati potenzialmente sensibili (es. un evento collegato a un motivo di salute) a chiunque guardi un telefono bloccato.

### 11. Mobile: nuova dipendenza nativa, build non-OTA

`expo-notifications` è un modulo nativo (plugin `app.json`, entitlement push iOS, config Android). A differenza di ogni feature mobile recente di questo progetto (tutte spedite via OTA `expo-updates`), questa richiede:
- Un nuovo binario (nuova build EAS)
- Una nuova submission TestFlight prima della produzione
- Reinstallazione sui device di test — non applicabile via OTA a un'app già installata

### 12. Il salvataggio turni non deve rallentare per colpa dell'invio push

`shifts.js` scrive oggi una notifica per **ogni cella turno cambiata** dentro un doppio `for...of` con `await pool.query(...)` sequenziale, PRIMA di rispondere al manager (verificato leggendo il codice reale, righe 347-368) — accettabile oggi perché ogni iterazione è un semplice INSERT locale (pochi millisecondi). Se `notifyEmployee` aggiungesse lì dentro una chiamata HTTPS *awaited* verso Expo per ogni cella, un salvataggio di un piano turni per un negozio con 15-20 dipendenti (facilmente 30-50 celle cambiate in un mese) potrebbe far salire il tempo di risposta da pochi millisecondi a diversi secondi, sequenzialmente — una regressione di prestazioni reale su una feature già in produzione, introdotta da una feature che nominalmente non la riguarda.

**Decisione:** la parte 3 di `notifyEmployee` (invio Expo) **non viene mai attesa (`await`) dal chiamante** — viene avviata e lasciata risolvere in background, con un `.catch()` interno che logga senza propagare mai un unhandled rejection. La parte 1 (insert `notifications`) resta invece sincrona/awaited, perché economica e perché è quella che garantisce la consistenza immediata già richiesta oggi. Il tempo di risposta di `POST /shifts` (e delle approvazioni ferie/eventi) resta quindi invariato rispetto a oggi, indipendentemente da quanti dipendenti hanno un push da ricevere.

## Rischi noti / lavoro futuro

### Risolti in questa revisione (analisi critica pre-piano)

Questi 4 punti erano gap reali nella prima stesura della spec, corretti qui direttamente invece di essere solo documentati:

| # | Gap trovato | Correzione applicata |
|---|---|---|
| — | `notifyEmployee(client, {...})` — un client transazionale passato per errore avrebbe potuto far fallire (ROLLBACK) un'intera approvazione per un problema di rete verso Expo | Decisione 9: nessun parametro `client`, sempre fuori transazione, chiamato dopo `withTransaction()` |
| — | `device_push_tokens.client_id UUID NOT NULL` senza FK, sul precedente più debole (`audit_log`/`notifications`) invece di quello più rigoroso già nel repo (`checkins`) | Decisione 7: `REFERENCES clients(id) ON DELETE CASCADE`, come `checkins.client_id` |
| — | Nessuna pulizia di `device_push_tokens` alla disattivazione di un dipendente — dato personale legato a un device fisico lasciato indefinitamente in tabella | Decisione 8: `DELETE FROM device_push_tokens` aggiunto a `DELETE /api/admin/employees/:id` |
| — | Invio push *awaited* dentro il loop sequenziale già esistente di `shifts.js` — rischio concreto di rallentare di diversi secondi il salvataggio di un piano turni ampio | Decisione 12: l'invio Expo non viene mai atteso dal chiamante (fire-and-forget con log interno) |

### Residui, deliberatamente fuori scope — per gravità

Nessuno di questi blocca l'inizio del piano; il primo (🟠) va verificato **prima** di scrivere il codice, non durante.

| Gravità | Rischio | Impatto se si manifesta | Mitigazione / trigger per riaffrontarlo |
|---|---|---|---|
| 🟠 **Medio** | Prerequisito Firebase/FCM (+ eventuale Expo access token) non ancora verificato contro la documentazione Expo corrente, né creato | Se scoperto a metà piano, blocca l'implementazione del Task Android a metà lavoro invece che all'inizio | Verificarlo come primo task del piano di implementazione, prima di scrivere qualunque codice — non assunto, controllato |
| 🟠 **Medio** | Nessun receipt-checking Expo: token invalidi non vengono mai ripuliti; un fallimento **sistemico** (es. credenziali FCM sbagliate) resta visibile solo nei log applicativi, non in un segnale esplicito | Le notifiche potrebbero smettere di funzionare del tutto per un cliente reale senza che nessuno se ne accorga finché un dipendente non si lamenta | Job di receipt-checking dedicato, quando il volume di dipendenti reali lo giustifica |
| 🟡 **Basso** | Nessuno strumento diagnostico admin ("questo dipendente ha un token registrato?") | Supporto più lento quando un cliente segnala "non ricevo notifiche" — richiede una query diretta sul DB | Piccolo strumento (anche solo una voce nel runbook) quando servirà davvero |
| 🟡 **Basso** | Cronologia in-app assente — una notifica ignorata/persa (telefono in tasca durante il turno) non è più recuperabile | Frizione per il dipendente in scenari di bassa attenzione al telefono — nessuna perdita di dati, solo di visibilità | Riuso diretto di `GET /api/notifications`, già esistente, se un cliente reale lo richiede esplicitamente |
| 🟢 **Molto basso** | Rollout non istantaneo: nessun meccanismo di force-update/version-check nel codice mobile (verificato: nessun riferimento in `frontend-mobile/src/`) | Irrilevante oggi (solo device di test); il giorno di un cliente pilota reale, l'adozione della feature dipenderà da quanti dipendenti hanno aggiornato l'app dallo store | Comunicare esplicitamente come aspettativa al primo cliente pilota, non un fix di codice |

## Compatibilità / rollback

Additiva al 100%: nuova tabella, nuovo endpoint, nuovo modulo backend, nessuna modifica di schema su tabelle esistenti. `shifts.js` continua a scrivere la stessa riga `notifications` di oggi (via il nuovo helper condiviso, comportamento in-app invariato) — l'unica differenza osservabile per chi non ha mai installato la nuova build mobile è l'assenza di push, esattamente il comportamento attuale. Un cliente che non aggiorna mai l'app non nota alcuna differenza né regressione.
