# Badge System — Session 54 Handoff

**Date:** 2026-07-11
**Session:** 54 — Redesign mobile QR Scanner → Face ID → Conferma check-in (Build 24)
**Status:** ✅ **Codice pushato su main, Build 24 in corso su Codemagic — testato dall'utente in locale, funzionante**

---

## Goal

Primo step di un redesign completo dell'app mobile Badge System, seguendo il mockup
`frontend-mobile/mockups/badge-mobile-mockups.html` (font Cormorant/DM Sans, palette
linen/navy/stone, stile "editorial luxury"). Questa sessione copre 3 schermate:
01 QR Scanner, 02 Face ID, 03 Conferma Check-in — più la home (`CheckInScreen`) per coerenza.

Piano completo con tutte le decisioni di grilling: `~/.claude/plans/adesso-entra-nella-cartella-purring-toast.md`

---

## Stato del codice (tutto su main, commit `b48b026`)

| Componente | Stato |
|-----------|-------|
| Backend produzione | ✅ api.dataxiom.it (invariato, nessun deploy backend fatto in questa sessione) |
| Frontend produzione | ✅ badge.dataxiom.it (invariato) |
| Mobile `app.json` buildNumber | ✅ 24 |
| `frontend-mobile/src/config/theme.js` | ✅ NUOVO — design token condivisi (colori/font) |
| `frontend-mobile/src/components/StepIndicator.jsx` | ✅ NUOVO — progresso a 3 step |
| `frontend-mobile/src/screens/checkin/FaceIDScreen.jsx` | ✅ NUOVO — schermata Face ID custom |
| `CheckInScreen.jsx` | ✅ restyle + naviga a `FaceID` (o bypass a `QRScanner` se no hardware biometrico) |
| `QRScannerScreen.jsx` | ✅ restyle overlay + feedback verde su scan riuscito |
| `SuccessScreen.jsx` | ✅ restyle completo con dati reali (sede, ruolo, employee ID) |
| `RootNavigator.jsx` | ✅ stack aggiornato: `CheckInMain → FaceID → QRScanner → Success` |
| `backend/src/routes/checkins.js` | ✅ `POST /checkins` ora ritorna `site_name` |
| `backend/src/routes/auth.js` | ✅ login ora ritorna `external_employee_id` quando presente |
| Backend test | ✅ 466/466 pass (14 skipped intenzionali) |
| Mobile test | ✅ 15/15 pass |
| Test manuale utente | ✅ **confermato funzionante** — QR scan, presenze, invio ferie tutti OK |

---

## What Worked

- **Grilling esteso prima di implementare**: il mockup assumeva ordine flusso, dati e feature che
  non esistevano nel codice reale (ordine QR→FaceID invertito, mansione testuale, nome sede,
  turno del giorno, PIN di backup, check-in manuale). Risolvere ogni gap esplicitamente con
  l'utente PRIMA di scrivere codice ha evitato di dover rifare lavoro a metà implementazione.
- **Checkpoint intermedi con criteri di stop espliciti** (uno per fase, "non procedere se X fallisce")
  hanno permesso di individuare il bug `top` non supportato da `Animated` nativo subito durante
  il primo test reale, invece che a fine sessione.
- **Bundle export (`npx expo export`) come proxy di verifica statica**: senza un simulatore iOS
  disponibile in questo ambiente, esportare il bundle ad ogni fase ha comunque permesso di
  catturare errori di import/sintassi prima del test manuale dell'utente.
- **Riuso di dati già letti in query esistenti** per aggiungere `site_name` alla response di
  `POST /checkins` (nessuna query aggiuntiva, solo estensione del SELECT già presente).

## What Didn't Work / Attenzione per il prossimo redesign

- **`Animated` con `useNativeDriver: true` NON supporta proprietà di layout** (`top`, `left`, ecc.),
  solo `transform`/`opacity`. Errore: `"Style property 'top' is not supported by native animated
  module"`. Fix: sempre `transform: [{ translateY }]` invece di animare `top` direttamente
  (vedi `QRScannerScreen.jsx`, scan-line).
- **Cartella `frontend-mobile/ios/` stale bloccava `expo start` locale**: un prebuild nativo locale
  di un mese prima (Session 49-50, mai committato) faceva sì che Expo trattasse il progetto come
  "bare workflow" invece di "managed", causando errori di runtimeVersion. Rimossa — se ricompare
  un errore simile, controllare prima se esiste una cartella `ios/`/`android/` non tracciata.
- **Account demo `@badge.local` bypassano completamente il DB**: aggiornare `password_hash` nel
  DB per un'email `@badge.local` non ha alcun effetto sul login — quelle email passano SOLO dal
  fixture in-memory `DEMO_USERS` (`backend/src/__fixtures__/demo-users.js`). Per un nuovo account
  demo con password nota, va aggiunto lì (+ variabile `DEMO_*_PASSWORD` in `.env.development`),
  non nel DB.
- **`external_employee_id` mancava dalla response di login**: esisteva nello schema DB ma non
  veniva mai selezionato/restituito da `POST /auth/login` — scoperto solo durante l'implementazione
  della schermata Face ID (non un gap noto in anticipo). Ora aggiunto.
- **Nessun simulatore iOS/Xcode disponibile in questo ambiente**: i checkpoint di verifica
  interattiva (prompt Face ID reale, scansione camera dal vivo) sono stati demandati all'utente,
  che li ha confermati funzionanti solo dopo un fix (vedi sopra) trovato al primo test reale.

---

## Credenziali locali per test

| Email | Password | Ruolo | Sede | Note |
|---|---|---|---|---|
| `maria@badge.local` | `maria01` | employee | Milano Store | da `.env.development` |
| `pino@badge.local` | `pino01` | manager | Milano Store | da `.env.development` |
| `pippo@badge.local` | `pippo01` | admin | tutte | da `.env.development` |

Per Torino Store esistono dipendenti reali (`carlo@badge.local`, `giovanni@badge.local`,
`lucia@badge.local`, `sofia@badge.local`) ma **nessuno con password nota** — le password bcrypt
originali sono state generate da uno script di seed e mai salvate in chiaro. Per testare Torino,
serve aggiungere temporaneamente un account al fixture `DEMO_USERS` (pattern usato e poi rimosso
in questa sessione, vedi commit history locale non pushata) oppure crearne uno nuovo permanente.

---

## Prossimi step

### Immediato
1. **Attendere build Codemagic** (workflow `badge-ios-testflight`, ~35-45 min da push) e verificare
   che compili — `react-native-svg` è il punto più a rischio (nuova dipendenza nativa).
2. **Test finale su TestFlight** (Face ID reale, non simulato) — utente Maria (Milano); idealmente
   anche un account Torino se ne viene creato uno stabile.

### Redesign mobile — schermate rimanenti (vedi TASKS.md §"Redesign Mobile Completo")
- 04 Storico Presenze (mockup pronto, screen 4 in `badge-mobile-mockups.html`)
- 05 Settings (mockup pronto, screen 5)
- 06 Smart Working (mockup pronto, screen 6)
- Valutare se includere anche Ferie/Malattia/Turni nel redesign (non hanno mockup dedicato oggi)

Tutte riusano `theme.js` + `StepIndicator` + il pattern `Animated`/`react-native-svg` già stabiliti.

### Backlog pre-esistente (invariato, vedi TASKS.md/PROJECT_DECISIONS.md per dettaglio)
- Staging environment obbligatorio prima del primo cliente reale (STG.1-STG.6)
- ONB.2 — Saldi ferie NUMERIC per mezze giornate (3-5h)
- EU trader status su App Store Connect
- S.26 — Consenso GPS esplicito

---

## Note operative

### Come avviare in locale
```bash
# Backend
cd backend && DISABLE_AUTH=true npm run dev

# Mobile
cd frontend-mobile && npx expo start --clear
```
Se appare l'errore "bare workflow"/runtimeVersion, controllare che non esista una cartella
`frontend-mobile/ios/` non tracciata da git (vedi "What Didn't Work" sopra).

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
| buildNumber attuale | `24` |

---

Per riprendere: leggi `TASKS.md` + `PROJECT_DECISIONS.md` §3.7 + `git log --oneline -10`.
