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
  client_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_device_push_tokens_employee_id ON device_push_tokens(employee_id);
```

- **Multi-device per dipendente**: righe multiple con lo stesso `employee_id`, una per device — un invio push va a tutti i token registrati.
- **`client_id` denormalizzato**: coerente col pattern di isolamento tenant già usato ovunque nel progetto (`checkins`, `audit_log`, `notifications` stessa) — ogni query di invio filtra esplicitamente per `client_id`, non si affida solo al JOIN via `employee_id`.
- **`token` `UNIQUE` + registrazione come upsert** (`ON CONFLICT (token) DO UPDATE SET employee_id = ..., client_id = ..., updated_at = NOW()`): gestisce in modo pulito il caso di un device che cambia proprietario (es. un telefono aziendale ridato a un nuovo assunto) — il vecchio dipendente smette automaticamente di ricevere push su quel device, senza bisogno di un unregister esplicito al logout.

### 8. Nuovo endpoint di registrazione token

`POST /api/notifications/push-token` (auth richiesta), body `{ token: string, platform: 'ios'|'android' }`, upsert come sopra usando `req.user.employee_id`/`req.user.client_id`. Se `req.user.employee_id` è assente (account senza profilo dipendente collegato — stesso caso già gestito in `checkins.js` con `CHECKIN_NO_EMPLOYEE_PROFILE`), la registrazione va rifiutata con lo stesso pattern fail-closed, non ignorata silenziosamente. Nessun endpoint di rimozione esplicita in questo scope (l'upsert su riassegnazione copre il caso reale; un `DELETE` esplicito al logout non ha beneficio pratico dato che il device resta associato allo stesso dipendente nella stragrande maggioranza dei casi — smartphone personale, non condiviso).

### 9. Helper condiviso unico lato backend

Nuovo modulo `backend/src/utils/pushNotifications.js`, funzione `notifyEmployee(client, { employeeId, clientId, type, inAppMessage, pushTitle, pushBody, ...extra })` che fa, in un solo posto:
1. `INSERT INTO notifications` (stesso schema/comportamento di oggi — `inAppMessage` va nella colonna `message`).
2. Lookup dei token attivi per quell'`employee_id`+`client_id` in `device_push_tokens`.
3. Invio a Expo Push Service (via `expo-server-sdk`) per ciascun token trovato.

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

## Rischi noti / lavoro futuro (deliberatamente fuori scope, documentati non nascosti)

- **Nessun receipt-checking Expo**: un token invalido (app disinstallata) non viene mai ripulito automaticamente. Ogni evento tenterà comunque l'invio, fallendo silenziosamente nel `try/catch` best-effort — nessun impatto funzionale sull'operazione principale, ma la tabella `device_push_tokens` accumulerà righe morte nel tempo, e un fallimento **sistemico** (es. credenziali FCM sbagliate) sarebbe invisibile senza guardare i log applicativi. Da rivalutare con un job dedicato quando il volume di dipendenti reali lo giustifica.
- **Rollout non istantaneo**: a differenza di ogni feature mobile recente (tutte via OTA), questa richiede che ogni dipendente aggiorni manualmente l'app dallo store. Irrilevante oggi con soli device di test; da comunicare esplicitamente come aspettativa quando ci sarà un cliente pilota reale con i telefoni dei propri dipendenti — nessun meccanismo di force-update/version-check esiste nel codice mobile (verificato: nessun riferimento in tutto `frontend-mobile/src/`).
- **Nessuno strumento diagnostico admin**: quando un dipendente segnala "non mi arrivano le notifiche", oggi nessuno (Dataxiom o l'admin cliente) ha un modo rapido di verificare se esiste un token registrato per lui, se non con una query diretta sul DB. Da valutare un piccolo strumento (anche solo una voce nel runbook) quando servirà davvero.
- **Cronologia in-app assente**: una notifica ignorata/persa (es. telefono in tasca durante il turno) non è più recuperabile in app. Accettato per tenere lo scope snello; se un cliente reale segnala frizione su questo, è il candidato naturale per un secondo giro (riuso diretto di `GET /api/notifications`, già esistente).

## Compatibilità / rollback

Additiva al 100%: nuova tabella, nuovo endpoint, nuovo modulo backend, nessuna modifica di schema su tabelle esistenti. `shifts.js` continua a scrivere la stessa riga `notifications` di oggi (via il nuovo helper condiviso, comportamento in-app invariato) — l'unica differenza osservabile per chi non ha mai installato la nuova build mobile è l'assenza di push, esattamente il comportamento attuale. Un cliente che non aggiorna mai l'app non nota alcuna differenza né regressione.
