# Fase C — Geofencing GPS reale + invalidazione QR (finding #2 + #5) — Design Spec

**Data:** 9 Agosto 2026
**Finding di riferimento:** `findings2agosto2016.md` #2 (HIGH — geofencing costruito ma mai applicato) e #5 (MEDIUM — QR statico riutilizzabile, nessuna rotazione/binding)
**Status:** Design approvato, in attesa di scrittura piano di implementazione

---

## Contesto

Il backend ha già un'infrastruttura di geofencing haversine completa (migration 010, `backend/src/utils/geo.js`, validazione in `checkins.js`), ma è dietro un flag globale `process.env.GEOFENCING_ENABLED` oggi spento in produzione, e il mobile non invia mai `latitude`/`longitude` nel payload di check-in — la feature è codice morto lato client (finding #2). Il QR code di ogni sede è una stringa statica generata una volta alla creazione (`badge://checkin?site_id=...&client_id=...&v=1`), mai invalidabile: un poster fotografato/rubato resta valido per sempre (finding #5).

Esiste già infrastruttura di consenso GPS lato server (migration 012, `consent.js`, `employees.gps_consent_given`), ma il componente mobile `GPSConsentDialog.jsx` non è mai collegato a nulla — e importa `AlertDialog` da `react-native`, un'API che **non esiste** in quel pacchetto: è codice non solo mai eseguito, ma non eseguibile.

Il posizionamento commerciale del prodotto è esplicitamente "zero hardware" (CLAUDE.md) — nessuna soluzione di questo design introduce hardware in sede (niente display/tablet per QR rotanti in tempo reale).

## Obiettivo

1. Rendere effettivo il geofencing GPS già costruito: mobile acquisisce e invia la posizione, consenso GDPR reale, blocco rigido fuori raggio o senza consenso.
2. Rendere il QR invalidabile su richiesta admin, senza rompere i QR esistenti né richiedere hardware in sede.
3. Farlo senza rompere la modalità offline esistente né richiedere un aggiornamento coordinato istantaneo di tutti i client mobile.

## Fuori scope

- Rotazione QR automatica/temporale (richiederebbe un display in sede — esplicitamente rifiutato, resta "zero hardware").
- Rendere `qr_content` obbligatorio nel payload di check-in (rimandato a un piano successivo, dopo aver verificato che tutti gli utenti reali sono su una build aggiornata).
- Qualunque modifica al flusso Face ID (finding #4, già chiuso in Fase A).

---

## Decisioni chiave

| Decisione | Scelta | Motivazione |
|---|---|---|
| Enforcement fuori raggio | Blocco rigido (403) | Coerente con l'obiettivo anti-frode; nessun override manager in questa fase |
| GPS non ottenibile | Blocco rigido | Un GPS assente non deve diventare una scappatoia per aggirare il controllo |
| Consenso GPS | Obbligatorio prima del check-in, bloccante se rifiutato | GDPR Art. 7, coerente col blocco rigido |
| Attivazione feature | Rimozione del gate globale `GEOFENCING_ENABLED`; controllo solo via toggle già esistenti (`clients.geofencing_feature_enabled`, `sites.geofence_enabled`, entrambi admin-controllati) | L'admin del cliente decide da solo, nessun intervento Dataxiom via SSM richiesto |
| Timing acquisizione GPS | One-shot al momento del check-in (non tracking continuo) | Minimo impatto batteria/privacy |
| Mitigazione QR statico | Invalidazione manuale su richiesta admin ("Rigenera QR"), nessuna rotazione automatica | Zero hardware; il GPS geofencing (punto precedente) copre già la maggior parte dello scenario di frode remota |
| Formato validazione QR | Confronto stringa raw scansionata contro `sites.qr_code_content` corrente (nessun campo "token" separato) | Zero rottura per i QR esistenti — coincidono già col valore in DB finché nessuno rigenera |
| Rollout campo `qr_content` | Opzionale in questa fase (validato solo se presente) | Backend e mobile si deployano a velocità diverse (CI/CD vs TestFlight); un campo obbligatorio romperebbe i check-in di chi non ha ancora aggiornato l'app |
| Scoperta lato mobile del geofencing | Tenta il check-in senza GPS; se il backend risponde `GEOFENCE_COORDINATES_REQUIRED`, chiede consenso+posizione e ripete | Nessun endpoint nuovo, un solo retry mirato e trasparente per l'utente |
| Offline + sede geofenced nota | Accodamento bloccato, messaggio esplicito | Un check-in offline accodato non può mai ricevere l'errore che innesca la richiesta GPS — accodarlo comunque produrrebbe un fallimento silenzioso solo al momento del flush |
| Offline + sede mai vista in cache | Bloccato per default (fail-safe) | Stato sconosciuto trattato come "potenzialmente geofenced" — coerente col blocco rigido applicato ovunque in questo design |
| Retry dopo timeout GPS | Ritenta solo l'acquisizione posizione, non richiede una nuova scansione QR | Il QR già scansionato resta valido |

---

## Architettura

### Backend

**Rimozione del gate globale.** In `backend/src/routes/checkins.js`, la condizione:

```js
const geofencingEnabled = process.env.GEOFENCING_ENABLED === 'true';
if (geofencingEnabled && (site.geofencing_feature_enabled !== false) && site.geofence_enabled) { ... }
```

diventa:

```js
if ((site.geofencing_feature_enabled !== false) && site.geofence_enabled) { ... }
```

La logica haversine interna resta invariata. `checkins-geofence.test.js` va riscritto (non solo esteso) per non manipolare più `process.env.GEOFENCING_ENABLED`.

**Validazione `qr_content`.** Nuovo campo opzionale nello schema Zod di `POST /checkins` (`middleware/validation.js`), stringa con `max(500)` (il formato reale `badge://checkin?site_id=<uuid>&client_id=<uuid>&v=<n>` è ~100 caratteri — il limite lascia margine senza aprire un vettore di abuso). Se presente, `checkins.js` confronta il valore **esatto** (nessun trim/normalizzazione — è generato macchina, deve combaciare byte-per-byte) contro `site.qr_code_content` (già disponibile nella query esistente che carica la sede) tramite query parametrizzata (mai concatenazione stringa — regressione esplicita da testare, stessa classe di bug del finding CSV import di Session 25). Mismatch → nuovo errore `QR_CODE_INVALID` (403), loggato a livello `warn` (stesso standard già richiesto da CLAUDE.md per gli altri middleware — tentativi ripetuti sono un segnale di frode in corso). Se il campo è assente, nessuna validazione (retrocompatibilità con client non ancora aggiornati).

**Nuovo endpoint di rigenerazione QR.** `POST /api/admin/sites/:id/regenerate-qr` in `backend/src/routes/admin/sites.js`, stessa catena di middleware RBAC/tenant-scoping già usata dagli altri endpoint admin su `sites`. Genera un nuovo `qr_code_content` sostituendo `v=1` con `v=<crypto.randomUUID()>` (stessa utility già in uso nel resto del backend dalla Session 21, nessuna nuova dipendenza) — un valore imprevedibile, non un semplice contatore incrementale che un attaccante potrebbe indovinare. UPDATE su `sites.qr_code_content`, scrittura in `audit_log` (con `client_id` popolato, pattern già stabilito in Fase A finding #6) con old/new value. **Deve avere un test RBAC esplicito e dedicato** che verifica che un admin del Cliente A non possa rigenerare il QR di una sede del Cliente B — dato lo storico di leak cross-tenant reali in questo progetto (Session 71), questo non è un "probabilmente coperto dal middleware generico", è un requisito esplicito.

### Mobile

**`GPSConsentDialog.jsx` — riscrittura completa.** Il file attuale importa `AlertDialog` da `react-native` (API inesistente, componente mai eseguibile). Riscritto con `Modal` nativo + `View`/`Text`/`TouchableOpacity`, stesso contenuto testuale **tranne** la frase "puoi rifiutare (check-in senza GPS, se disponibile)" — rimossa, perché contraddice il blocco rigido di questo design. Su "Accetto": chiama `POST /api/consent/gps-acceptance` (endpoint già esistente e testato) e, in caso di successo, aggiorna **immediatamente** la copia locale dell'utente via `secureAuthStorage.setUser()` (merge di `gps_consent_given: true`) — senza questo aggiornamento locale, il prossimo check-in nella stessa sessione rileggerebbe la cache stale e ripresenterebbe il dialog inutilmente. Su "Rifiuto": il check-in resta bloccato, nessun cooldown — ridomanda ad ogni scansione finché non accetta.

**`QRScannerScreen.jsx` — flusso a due tentativi.**
1. Al momento dello scan, oltre ai campi già estratti (`site_id`, `client_id`, ecc.), la stringa raw scansionata viene salvata e inclusa **sempre** nel payload come `qr_content` (indipendentemente dal geofencing — protegge anche le sedi senza GPS).
2. Il check-in parte come oggi, senza GPS.
3. Se il backend risponde `403 GEOFENCE_COORDINATES_REQUIRED`: se `gps_consent_given` (letto da `authService.getUser()`) non è vero, mostra `GPSConsentDialog`; se rifiutato, mostra errore bloccante finale. Se consenso presente (o appena dato), acquisisce la posizione one-shot via `expo-location.getCurrentPositionAsync` con timeout 10s.
4. Timeout/permesso negato → messaggio dedicato ("Attiva la posizione per timbrare qui") con bottone "Riprova" che ritenta **solo** l'acquisizione posizione (il QR resta valido, nessuna nuova scansione).
5. Posizione ottenuta → ripete la POST **con lo stesso `client_uuid`** del primo tentativo (sfrutta la dedup esistente `ON CONFLICT (client_id, client_uuid) ... DO NOTHING`, sicuro anche in caso di doppio tap) più `latitude`/`longitude`.
6. Un secondo rifiuto (`403 OUTSIDE_GEOFENCE`) è un errore finale, **non** viene ritentato automaticamente — mostrato così com'è all'utente.

Nuova dipendenza: `expo-location` (era stata rimossa in Session 83 come inutilizzata — reintrodotta ora con uso reale). Richiede una nuova build nativa (non è OTA-deployabile), a differenza del Gruppo 1 (PDF/FAQ).

**Cache locale per lo stato geofencing (per l'offline).** Stesso pattern di cache già usato da `MyScheduleScreen.jsx`/`MyPresencesScreen.jsx`: dopo ogni check-in online riuscito (o tentativo che rivela lo stato via `GEOFENCE_COORDINATES_REQUIRED`), l'app salva localmente se quella sede è geofenced. Quando l'app rileva assenza di rete (pattern già esistente, `isInternetReachable`, Session 83 Rischio 2) prima di accodare un check-in:
- sede nota in cache come geofenced → accodamento **bloccato**, messaggio esplicito ("Connessione richiesta per timbrare in questa sede").
- sede nota in cache come non-geofenced → accodamento invariato (comportamento attuale).
- sede mai vista in cache → accodamento **bloccato per default** (fail-safe, stato sconosciuto trattato come potenzialmente geofenced).

Stessa finestra di staleness già accettata altrove nell'app per i dati offline (se l'admin cambia il toggle mentre il dipendente è offline da giorni, l'app userà l'ultimo stato noto).

### Admin Web

**`SitesPage.jsx` — bottone "Rigenera QR".** Accanto al download PNG esistente, apre un dialog di conferma (pattern `ConfirmDeleteDialog` già usato altrove) con testo esplicito: il poster stampato smette immediatamente di funzionare. Su conferma: `POST /api/admin/sites/:id/regenerate-qr`, poi il nuovo PNG viene mostrato/scaricabile subito (riusa `downloadQRPng` esistente).

---

## Nuovi codici di errore

| Codice | HTTP | Quando |
|---|---|---|
| `QR_CODE_INVALID` | 403 | `qr_content` presente nel payload ma non corrisponde a `sites.qr_code_content` corrente |
| `GEOFENCE_COORDINATES_REQUIRED` | 403 | già esistente, invariato |
| `OUTSIDE_GEOFENCE` | 403 | già esistente, invariato |

---

## Testing

**Backend:**
- `checkins-geofence.test.js` riscritto senza manipolazione di `process.env.GEOFENCING_ENABLED`; copre: `qr_content` assente (retrocompat, comportamento invariato), `qr_content` corretto, `qr_content` non corrispondente (`QR_CODE_INVALID`), combinazioni dentro/fuori raggio invariate.
- Nuovo test: query di confronto `qr_content` è parametrizzata, non concatenata (regressione esplicita, stessa classe di bug del CSV import Session 25).
- Nuovo test: `qr_content` oltre 500 caratteri → rifiutato dallo schema Zod.
- Nuovo test: retry con lo stesso `client_uuid` (primo tentativo 403, secondo 201) → una sola riga in `checkins`, nessun duplicato.
- Nuovo `admin-sites-regenerate-qr.test.js`: RBAC (employee/manager → 403), tenant-scoping esplicito (admin Cliente A non può rigenerare QR di una sede Cliente B), audit log popolato con `client_id`, vecchio `qr_code_content` smette di validare dopo la rigenerazione.

**Mobile:**
- `GPSConsentDialog.test.jsx` nuovo: visibilità, accetta (chiama l'endpoint + aggiorna cache locale), rifiuta (nessuna chiamata, check-in resta bloccato).
- `QRScannerScreen.test.jsx` esteso: scenario `GEOFENCE_COORDINATES_REQUIRED` → consenso → retry con lat/lng e stesso `client_uuid`; timeout GPS → messaggio + retry solo-posizione; secondo rifiuto (`OUTSIDE_GEOFENCE`) → nessun retry automatico.
- Nuovo test cache offline-geofencing: sede nota geofenced → accodamento bloccato; sede nota non-geofenced → invariato; sede mai vista → bloccato per default.

**Web:**
- `SitesPage.test.jsx` esteso: flusso "Rigenera QR" (conferma, chiamata API, nuovo PNG mostrato).

---

## Rischi residui accettati

- Il campo `qr_content` resta opzionale in questa fase — la protezione anti-QR-rubato non è attiva finché un client non aggiorna l'app. Un piano successivo lo renderà obbligatorio dopo aver verificato che tutti gli utenti reali sono su una build aggiornata.
- La cache locale dello stato geofencing può essere stale (stessa finestra già accettata altrove nell'app per i dati offline).
- Nessun override manager per check-in fuori raggio o senza consenso in questa fase — un dipendente realmente fuori sede non ha alcuna via di eccezione, deve avvicinarsi fisicamente.
