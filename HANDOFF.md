# Badge System — Session 56 Handoff

**Date:** 2026-07-12
**Session:** 56 — Vibrazione al check-in QR riuscito (Build 26)
**Status:** ✅ **Build 26 APPROVATA su TestFlight/produzione — commit `a90bd62` pushato su main**

---

## Goal

Richiesta puntuale dell'utente: quando il QR code viene scannerizzato correttamente e il check-in
registrato con successo, far vibrare il telefono per 500ms come feedback aptico.

---

## Stato del codice (tutto su main, commit `a90bd62`)

| Componente | Stato |
|-----------|-------|
| `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx` | ✅ `Vibration.vibrate(500)` aggiunto subito dopo la risposta 201 del check-in, prima del flash verde dei corner |
| Nuove dipendenze native | ✅ Nessuna — `Vibration` è API core di `react-native` |
| Mobile `app.json` buildNumber | ✅ 26 |
| Mobile test | ✅ 25/25 pass |
| Bundle export | ✅ pulito |
| Test manuale utente (TestFlight) | ✅ **confermato funzionante** |

---

## What Worked

- **Nessuna nuova dipendenza per una richiesta di feedback aptico**: `Vibration` core di
  React Native copre il caso d'uso senza toccare la configurazione nativa né serve un nuovo
  pod/gradle setup — solo bump di `buildNumber` per distribuire il nuovo bundle JS via
  Codemagic/TestFlight.
- **Verifica preventiva onesta di un limite di piattaforma**: prima di implementare, segnalato
  all'utente che iOS ignora il parametro di durata di `Vibration.vibrate()` (a differenza di
  Android) — l'utente ha confermato di voler procedere comunque con la soluzione semplice,
  evitando di introdurre una libreria haptic di terze parti per un guadagno marginale.

## What Didn't Work

- Nessun problema riscontrato in questa sessione — modifica piccola, mirata, un solo file
  toccato, nessun edge case di sicurezza/RBAC coinvolto.

---

## Prossimi step

### Backlog pre-esistente (invariato, vedi TASKS.md/PROJECT_DECISIONS.md per dettaglio)
- Staging environment obbligatorio prima del primo cliente reale (STG.1-STG.6)
- ONB.2 — Saldi ferie NUMERIC per mezze giornate (3-5h)
- EU trader status su App Store Connect
- S.26 — Consenso GPS esplicito
- Verificare se altre route col pattern `SELECT date_column` (non castato `::text`) esistono nel
  backend, per prevenire lo stesso bug di shift di un giorno scoperto in Session 55
- Se in futuro serve un controllo preciso della durata di vibrazione su iOS, valutare
  `react-native-haptic-feedback` (nuova dipendenza nativa, richiede nuovo build Codemagic)

---

## Note operative

Invariate rispetto a Session 55 — vedi `PROJECT_DECISIONS.md` per: pattern colonne DATE via API,
build iOS locali su path pulito (rsync, non symlink), regola account demo `@badge.local` vs
account locali (`alice@store.local` non esiste in produzione).

### Come avviare nuova build Codemagic
1. Incrementa `buildNumber` in `frontend-mobile/app.json`
2. `git add . && git commit -m "..." && git push`
3. Codemagic parte automaticamente (webhook su push a `main`) → ~35-45 min → TestFlight

### Dati tecnici Codemagic
| Dato | Valore |
|------|--------|
| Bundle identifier | `it.dataxiom.badge` |
| Apple Team ID | `UKZ95L3FHH` |
| App Store Connect App ID | `6777934529` |
| API Key in Codemagic | `Badge System (Key: 58VXN7ATGV)` |
| Workflow | `badge-ios-testflight` |
| Branch | `main` |
| buildNumber attuale | `26` |

---

Per riprendere: leggi `TASKS.md` + `PROJECT_DECISIONS.md` (Session 56) + `git log --oneline -10`.
