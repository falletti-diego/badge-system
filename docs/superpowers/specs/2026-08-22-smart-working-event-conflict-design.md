# Mutua Esclusione Eventi/Training ↔ Smart Working — Design Spec

**Data:** 22 Agosto 2026
**Status:** Approvato (via `/superpowers:brainstorming` + `/grilling`, 4 domande chiuse)

---

## Contesto e problema

L'utente ha testato manualmente con l'account demo Maria: un dipendente con una richiesta Eventi/Training **PENDING o APPROVED** per oggi può comunque dichiarare Smart Working per lo stesso giorno, senza alcun blocco. Simmetricamente, un manager può approvare un evento per un giorno in cui il dipendente ha già dichiarato Smart Working.

Questo è già risolto per il check-in QR (`docs/superpowers/specs/2026-08-21-event-checkin-mutual-exclusion-design.md`, PR #7, mergiata su `main` il 22/08): un evento PENDING/APPROVED blocca il check-in, e un check-in esistente blocca l'approvazione dell'evento. Lo stesso pattern manca per Smart Working.

**Gap esatto individuato leggendo il codice** (non assunto):
- `backend/src/routes/events.js` POST `/request` (righe 44-67) **già** blocca una nuova richiesta evento se esiste un giorno di Smart Working per quella data (query UNION alle righe 48-58, include `SELECT 1 FROM smart_working_days ...`). Questa direzione è già coperta.
- `backend/src/routes/smartWorking.js` POST `/` (righe 26-91) **non** controlla mai `event_requests` — un evento PENDING/APPROVED non impedisce la dichiarazione di Smart Working.
- `backend/src/routes/events.js` PUT `/:id/approve` (righe ~214-230) controlla solo `findConflictingCheckin` — non controlla mai `smart_working_days`.

## Problema collaterale scoperto durante l'analisi (timezone)

`smartWorking.js` calcola "oggi" con `CURRENT_DATE` di Postgres (riga 47 dell'INSERT), che sul server di produzione (AWS RDS) valuta in **UTC**. Tutto il resto del sistema (`checkins.js`, `events.js`) calcola "oggi" in JS con `todayInTimeZone()`/`dateInTimeZone()` (Europe/Rome) — la stessa classe di bug già corretta due volte nel codebase (`hiring_date`, commit `615fcbf`; `eventConflict.js` timestamp cast, commit `89986b3`; documentata come Pattern 6 in `CLAUDE.md`).

Poiché il controllo di conflitto che sto per introdurre deve confrontare la stessa identica data che viene salvata in `smart_working_days`, questo disallineamento diventa direttamente rilevante: se il controllo usa una data e l'INSERT un'altra, il controllo è inutile nella finestra 00:00–02:00 Europe/Rome. **Decisione (via `/grilling`): allineare Smart Working a Europe/Rome**, eliminando il disallineamento alla radice invece di lavorarci attorno.

## Decisioni di design (via `/grilling`)

1. **Stati bloccanti**: un evento **PENDING o APPROVED** blocca la dichiarazione di Smart Working (stessa soglia già usata da `findConflictingEvent` per il check-in QR, e coerente con la UNION già esistente in `events.js` POST `/request`).
2. **Approvazione evento**: se il dipendente ha già dichiarato Smart Working per quella data, l'approvazione dell'evento viene **bloccata** (stessa simmetria già usata per `findConflictingCheckin`).
3. **UX mobile**: `SmartWorkingScreen.jsx` riceve lo stesso pre-check visivo già presente in `QRScannerScreen.jsx` (spinner mentre il controllo è in corso, schermata di blocco con il dettaglio dell'evento se c'è conflitto, fail-open su errore di rete — il controllo server-side resta comunque l'autorità finale).
4. **Race condition**: riuso di `lockEventConflictScope` (stesso lock advisory transazionale già usato per checkin↔evento) anche per Smart Working, stessa chiave `client:employee:date`.
5. **Timezone**: Smart Working allineato a Europe/Rome (vedi sopra) — cambio di comportamento minimo ma deliberato, giustificato dalla necessità di coerenza col controllo di conflitto.

## Architettura

Riuso quasi totale delle utility esistenti in `backend/src/utils/eventConflict.js`, nessuna nuova tabella, nessun nuovo endpoint.

```
smartWorking.js POST /           events.js PUT /:id/approve
        │                                  │
        ├─ lockEventConflictScope          ├─ lockEventConflictScope (già presente)
        ├─ findConflictingEvent  (riuso)   ├─ findConflictingCheckin (già presente)
        │                                  ├─ findConflictingSmartWorking (NUOVO)
        └─ INSERT (date = todayInTimeZone) └─ UPDATE status='APPROVED'
```

## Modifiche

### 1. `backend/src/utils/eventConflict.js` — nuova funzione

Aggiungere, seguendo esattamente lo stile di `findConflictingCheckin`:

```js
/** Returns the conflicting smart_working_days row for a date, or null. */
async function findConflictingSmartWorking(client, { clientId, employeeId, date }) {
  const result = await client.query(
    `SELECT id, date::text AS date
     FROM smart_working_days
     WHERE client_id = $1::uuid AND employee_id = $2::uuid AND date = $3::date
     LIMIT 1`,
    [clientId, employeeId, date]
  );
  return result.rows[0] || null;
}
```

Aggiungere `findConflictingSmartWorking` a `module.exports`.

Nessuna gestione timezone speciale qui a differenza di `findConflictingCheckin`: `smart_working_days.date` è già un `DATE` puro (non `TIMESTAMPTZ`), non un timestamp — non c'è cast `::date` da un valore con componente ora, quindi nessun rischio di mismatch di sessione. Il rischio timezone di questa feature è tutto nel punto 2 (calcolo di "oggi" per l'INSERT).

### 2. `backend/src/routes/smartWorking.js` — POST `/`

Import aggiuntivi in testa al file:
```js
const { lockEventConflictScope, findConflictingEvent } = require('../utils/eventConflict');
const { todayInTimeZone } = require('../utils/date');
```

Dentro `withTransaction`, prima dell'`INSERT` esistente (righe 44-50):
```js
const today = todayInTimeZone();

await lockEventConflictScope(client, { clientId, employeeId, date: today });
const conflictingEvent = await findConflictingEvent(client, { clientId, employeeId, date: today });
if (conflictingEvent) {
  throw new ConflictError(
    `Esiste già un evento (${conflictingEvent.description}) programmato per oggi — impossibile dichiarare Smart Working`,
    'EVENT_DATE_CONFLICT'
  );
}
```

L'`INSERT` esistente cambia da `VALUES ($1::uuid, $2::uuid, CURRENT_DATE, $2::uuid)` a `VALUES ($1::uuid, $2::uuid, $3::date, $2::uuid)` con `today` come terzo parametro. Il blocco `catch` esistente per `err.code === '23505'` (già dichiarato oggi) resta invariato — l'unique constraint su `(employee_id, date)` funziona identicamente con una data esplicita.

`ConflictError` è già importato in questo file (riga 16); nessun nuovo import per quello.

### 3. `backend/src/routes/events.js` — PUT `/:id/approve`

Import aggiuntivo:
```js
const { lockEventConflictScope, findConflictingCheckin, findConflictingSmartWorking } = require('../utils/eventConflict');
```

Dentro il blocco `if (status === 'APPROVED') { ... }` esistente (righe ~216-230), subito dopo il controllo `findConflictingCheckin` esistente (che usa già `lockEventConflictScope` sulla stessa chiave — nessun lock aggiuntivo necessario):

```js
const conflictingSmartWorking = await findConflictingSmartWorking(client, { clientId, employeeId: eventRequest.user_id, date: eventRequest.event_date });
if (conflictingSmartWorking) {
  throw new ConflictError(
    'Impossibile approvare: il dipendente ha già dichiarato Smart Working per questa data',
    'EVENT_DATE_CONFLICT',
    { conflicting_smart_working_id: conflictingSmartWorking.id }
  );
}
```

### 4. `frontend-mobile/src/screens/checkin/SmartWorkingScreen.jsx`

`SmartWorkingScreen.jsx` importa già `useState`/`useEffect` (riga 1) e `apiClient`/`ENDPOINTS`. Import aggiuntivi da inserire:
```js
import { today, toISO } from '../../utils/dateUtils'; // stesso helper usato da QRScannerScreen.jsx:12
import LoadingSpinner from '../../components/LoadingSpinner'; // stesso componente usato da QRScannerScreen.jsx:13
```
`ENDPOINTS.EVENTS_LIST` risolve a `/api/v1/events/my-requests` (`frontend-mobile/src/config/endpoints.js:38`) — endpoint già usato identicamente da `QRScannerScreen.jsx`, nessuna modifica lato endpoint necessaria.

Nuovo stato e pre-check, identico pattern di `QRScannerScreen.jsx` righe 76-93 (stesso helper `today()`/`toISO()`, non un calcolo ad-hoc):
```js
const [todayEvent, setTodayEvent] = useState(undefined);

useEffect(() => {
  let cancelled = false;
  const todayStr = toISO(today());
  apiClient.get(ENDPOINTS.EVENTS_LIST, { params: { date_from: todayStr, date_to: todayStr } })
    .then((response) => {
      if (cancelled) return;
      const rows = response.data?.data || [];
      const conflict = rows.find((r) => r.status === 'PENDING' || r.status === 'APPROVED');
      setTodayEvent(conflict || null);
    })
    .catch(() => {
      if (!cancelled) setTodayEvent(null); // fail-open
    });
  return () => { cancelled = true; };
}, []);
```

Nel render, prima del contenuto principale della schermata (bottone "Conferma Smart Working"):
```jsx
if (todayEvent === undefined) {
  return (
    <View style={styles.centered}>
      <LoadingSpinner color={COLORS.navy500} />
      <Text style={styles.text}>Verifica eventi in corso...</Text>
    </View>
  );
}

if (todayEvent) {
  return (
    <SafeAreaView style={styles.centered}>
      <Text style={styles.errorText}>Smart Working non disponibile oggi</Text>
      <Text style={styles.text}>
        Hai un evento programmato: {todayEvent.description} ({todayEvent.start_time?.slice(0, 5)}–{todayEvent.end_time?.slice(0, 5)}).
      </Text>
      <TouchableOpacity style={[styles.button, { marginTop: 12, backgroundColor: COLORS.stone }]} onPress={() => navigation.goBack()}>
        <Text style={styles.buttonText}>Torna indietro</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
```

`SmartWorkingScreen.jsx` non ha attualmente questi 5 stili (verificato — solo gli `Alert.alert` esistenti, nessuna schermata di blocco). Vanno aggiunti al suo `StyleSheet`, copiati identici da `QRScannerScreen.jsx` righe 521, 568-571:
```js
centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: COLORS.linen },
text: { fontFamily: FONTS.body, color: COLORS.stone, fontSize: 15, textAlign: 'center', marginTop: 12 },
errorText: { fontFamily: FONTS.bodySemiBold, color: COLORS.error, fontSize: 18, marginBottom: 8 },
button: { backgroundColor: COLORS.navy500, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 24 },
buttonText: { fontFamily: FONTS.bodyMedium, color: COLORS.white, fontSize: 16 },
```
`SmartWorkingScreen.jsx` già importa `COLORS`/`FONTS` da `../../config/theme` (riga 8) — nessun nuovo import di stile necessario, solo le nuove chiavi nello `StyleSheet.create({...})` esistente.

## Piano di test (TDD)

### Backend — unit mockati
- `backend/src/__tests__/eventConflict.test.js`: nuovo `describe('findConflictingSmartWorking')` — mirror esatto dei test esistenti per `findConflictingCheckin` (query corretta, `null` quando nessuna riga).
- `backend/src/__tests__/smart-working.test.js`: nuovi test in `describe('POST /api/v1/smart-working')` — blocco con `EVENT_DATE_CONFLICT` quando `findConflictingEvent` mockato ritorna una riga (sia PENDING che APPROVED), nessun blocco quando ritorna `null`, il caso `ALREADY_DECLARED_TODAY` esistente resta verde.
- `backend/src/__tests__/events.test.js`, dentro `describe('PUT /api/v1/events/:id/approve')` (righe 268+): nuovo test — approvazione bloccata con `EVENT_DATE_CONFLICT` quando `findConflictingSmartWorking` mockato ritorna una riga; i test esistenti (righe 318, 350, 390, 445 — `mockResolvedValueOnce({ rows: [] })` per `findConflictingCheckin`) vanno estesi con un ulteriore `mockResolvedValueOnce({ rows: [] })` per la nuova query `findConflictingSmartWorking`, altrimenti il mock del pool si disallinea e questi test falliscono per una ragione spuria (numero di query aumentato, non per una regressione reale — attenzione in fase di implementazione).

### Backend — integrazione reale-Postgres
- Nuovo file `backend/src/__tests__/smartWorking-event-conflict.test.js`, mirror di `checkins-event-conflict.test.js`: crea client/employee/evento reali, verifica che la POST `/api/v1/smart-working` sia bloccata (409, `EVENT_DATE_CONFLICT`) con un evento PENDING e con un evento APPROVED, e che vada a buon fine senza eventi. Segue le convenzioni di `CLAUDE.md` Pattern 5 (cleanup in `finally`, fixture con `Math.random()` oltre a `Date.now()`).
- Estendere/nuovo test per la direzione opposta: approvazione di un evento bloccata quando esiste già uno Smart Working per quella data (verificare se un file esistente per l'approve reale-Postgres già esiste, altrimenti aggiungere al file sopra o crearne uno dedicato durante l'implementazione).
- Test di timezone dedicato (mirror di `eventConflict-timezone.test.js`): `SET timezone = 'UTC'` sulla connessione di test, verificare che un evento Europe/Rome "oggi" blocchi comunque correttamente la dichiarazione Smart Working anche quando la sessione DB è in UTC — questo è il test che prova concretamente il fix del punto "Problema collaterale" sopra.

### Mobile
- Nuovo file `frontend-mobile/src/__tests__/SmartWorkingScreen.test.jsx`, mirror della sezione "event pre-check" di `QRScannerScreen.test.jsx` (6 casi: spinner durante il pre-check, blocco su PENDING, blocco su APPROVED, nessun blocco su REJECTED, fail-open su errore di rete, nessun blocco quando non c'è alcun evento).

## File toccati (riepilogo)

- Modifica: `backend/src/utils/eventConflict.js`
- Modifica: `backend/src/routes/smartWorking.js`
- Modifica: `backend/src/routes/events.js`
- Modifica: `frontend-mobile/src/screens/checkin/SmartWorkingScreen.jsx`
- Modifica: `backend/src/__tests__/eventConflict.test.js`
- Modifica: `backend/src/__tests__/smart-working.test.js`
- Modifica: `backend/src/__tests__/events.test.js`
- Nuovo: `backend/src/__tests__/smartWorking-event-conflict.test.js`
- Nuovo: `frontend-mobile/src/__tests__/SmartWorkingScreen.test.jsx`

## Fuori scope

- Nessuna modifica a `checkins.js`/QR scanner (mutua esclusione già presente e corretta).
- Nessuna modifica al flusso Ferie/Malattia — la UNION di `events.js` POST `/request` già li considera, e non è stato segnalato alcun gap lì.
- Nessuna build mobile nativa necessaria: il cambio è puramente JS (`SmartWorkingScreen.jsx`), stesso path già verificato per la mutua esclusione check-in — un OTA sarà sufficiente a distribuzione completata (non incluso in questo piano, da valutare a parte come per la feature gemella).
- Nessun backfill dei dati storici: la mutua esclusione si applica solo a nuove dichiarazioni/approvazioni da questo punto in poi.
