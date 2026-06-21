# Badge System — Session 48 Handoff

**Date:** 2026-06-21  
**Session:** 48 — Mobile Tab Bar + LeaveRequestScreen + IllnessReportScreen (Build 17)  
**Status:** ✅ **Tutto il codice committato su main** — Mancano solo i passi manuali del Task 6 (test Expo Go) e Task 7C (account Codemagic + App Store Connect API Key)

---

## Goal

Aggiungere tab bar di navigazione a 5 tab (Badge, Ferie, Malattia, Turni, Presenze) all'app mobile Expo SDK 54, con schermate `LeaveRequestScreen` e `IllnessReportScreen`, poi preparare la build iOS su Codemagic per TestFlight (Build 17).

---

## Cosa è stato fatto

### 1. Piano v2 creato con 12 correzioni rispetto alla v1

- File: `docs/superpowers/plans/2026-06-21-mobile-leave-illness-step1.md`
- Correzioni critiche incorporate: timezone bug (`toISO()` UTC→locale), `TODAY` stale a livello di modulo, crash `StorePresencesScreen` in contesto tab.

### 2. Task 0 — Dipendenze installate (Commit: 91af9cf)

- `@react-navigation/bottom-tabs@^7.18.2`
- `@react-native-community/datetimepicker@8.4.4`
- `jest@29` + `babel-jest@29` + `@babel/preset-env` (dev)
- Jest config in `package.json`: `testEnvironment: node`, inline babel transform (non modifica babel.config.js di Expo)

### 3. Task 1 — `dateUtils.js` + 13 test TDD (Commit: 61e6768) 🔴 Fix critica timezone

**Fix critica:** `new Date().toISOString().split('T')[0]` restituisce UTC. In Italia (UTC+2), alle 00:30 del 21 giugno restituisce `2026-06-20` (sbagliato di un giorno). Fix: getter locali.

- `frontend-mobile/src/utils/dateUtils.js`: `toISO(d)`, `formatDateIT(str)`, `today()`
- `frontend-mobile/src/__tests__/dateUtils.test.js`: 13 test — 13/13 ✅
- Test eseguibili con: `cd frontend-mobile && npm test`

### 4. Task 2 — `endpoints.js` aggiornato (Commit: 219fec7)

- Aggiunti: `LEAVES_LIST`, `LEAVES_CREATE`, `LEAVES_BALANCE`, `ILLNESS_REPORT`, `ILLNESS_LIST`
- Aggiunti: `LEAVE_TYPES` (FERIE_1, FERIE_2, FERIE_3)
- Fix `DEMO_ACCOUNTS`: `maria@badge.local` (employee), `pino@badge.local` (manager), `pippo@badge.local` (admin)

### 5. Task 3 — Tab bar + fix schermate esistenti (Commit: b4651ae)

- **`RootNavigator.jsx`**: completamente riscritto — 5 tab (Badge/Ferie/Malattia/Turni/Presenze), Stack annidato nella tab Badge per QRScanner+Success, `initialRoute: 'Main'` (era `'CheckIn'`)
- **`PresenzaTabScreen.jsx`** creato: legge ruolo da `authService.getUser()`, monta `StorePresencesScreen` (manager/admin) o `MyPresencesScreen` (employee)
- **`LoginScreen.jsx`**: `navigation.navigate('CheckIn')` → `navigation.navigate('Main')`
- **`CheckInScreen.jsx`**: rimosso blocco `secondaryButtons` (bottoni I Miei Turni / Presenze — ora ci sono le tab)
- **`MyScheduleScreen.jsx`**, **`MyPresencesScreen.jsx`**, **`StorePresencesScreen.jsx`**: back button rimossi, header centrato
- **`StorePresencesScreen.jsx`**: rimosso `useEffect` che faceva `navigation.replace('CheckIn')` — causava crash dentro il tab navigator

### 6. Task 4 — `LeaveRequestScreen.jsx` (Commit: f091aab)

- `frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx`
- Usa `toISO()`/`formatDateIT()`/`today()` da `dateUtils.js`
- Saldo per tipo (cards), chip tipo ferie, date picker spinner iOS, motivazione, bottone invia, storico ultime 5 richieste con status badge

### 7. Task 5 — `IllnessReportScreen.jsx` (Commit: bb65870)

- `frontend-mobile/src/screens/illness/IllnessReportScreen.jsx`
- Stessa architettura: usa `dateUtils.js`, date picker, note, storico 3 mesi

### 8. Task 7 (parti automatizzabili) — `codemagic.yaml` + buildNumber 17 (Commit: 87fb53a)

- `codemagic.yaml` creato nella root del repo
- `frontend-mobile/app.json`: `buildNumber` "16" → "17"
- Tutto pushato su main

---

## Cosa NON è ancora stato fatto (passi manuali per l'utente)

### Task 6 — Test con Expo Go (30 min)

```bash
cd frontend-mobile
npx expo start
```

Scansiona QR con Expo Go sul telefono.

**Test employee (maria@badge.local):**
- Login → 5 tab (Badge, Ferie, Malattia, Turni, Presenze) ✅
- Tab Badge: solo orologio + bottone QR (no bottoni secondari) ✅
- Tab Ferie: saldo → chip tipo → date picker mostra data locale (NON ieri!) ✅
- Tab Ferie: invia richiesta → Alert ✅
- Tab Malattia: date picker, invia → Alert ✅
- Tab Turni: lista turni, nessun back button ✅
- Tab Presenze: presenze di Maria ✅

**Test manager (pino@badge.local):**
- Tab Presenze → StorePresences (presenze sede) SENZA redirect/crash ✅ (questo era il bug critico)
- Tab Ferie e Malattia funzionano come employee ✅

### Task 7C — Codemagic setup (1h, richiede browser + Apple Developer account)

**Step 1: App Store Connect API Key**
1. https://appstoreconnect.apple.com → Users and Access → Integrations → App Store Connect API
2. `+` → nome `Codemagic` → Role: Developer → Generate
3. Scarica il `.p8` (UNA SOLA VOLTA) — annota **Key ID** e **Issuer ID**

**Step 2: Account Codemagic**
1. https://codemagic.io/signup → Sign up with GitHub
2. Add application → GitHub → repository `badge` → Framework: React Native

**Step 3: Carica API Key in Codemagic**
1. Account icon → Teams → il tuo team → Integrations → App Store Connect
2. Add API key → nome `Badge Production`, inserisci Issuer ID, Key ID, carica il `.p8`

**Step 4: Avvia build**
1. Codemagic → la tua app → Start new build → branch `main` → workflow `badge-ios-testflight`
2. Attendi 35-45 minuti
3. Verifica su TestFlight app sul telefono: "Badge System — Build 17"

**Se la build fallisce per nome workspace:**
```bash
cd frontend-mobile
npx expo prebuild --platform ios --clean
ls ios/*.xcworkspace
```
Aggiorna `codemagic.yaml` con il nome esatto trovato, push, riavvia.

---

## Stato tecnico

| Componente | Stato |
|-----------|-------|
| `dateUtils.js` + 13 unit test | ✅ 13/13 verde |
| `@react-navigation/bottom-tabs` | ✅ installato |
| `@react-native-community/datetimepicker` | ✅ installato |
| 5 tab (Badge/Ferie/Malattia/Turni/Presenze) | ✅ codice pronto |
| `LeaveRequestScreen.jsx` | ✅ codice pronto |
| `IllnessReportScreen.jsx` | ✅ codice pronto |
| Fix timezone `toISO()` | ✅ |
| Fix `TODAY` stale reference | ✅ |
| Fix `StorePresencesScreen` crash | ✅ rimosso role redirect |
| Back button rimossi da 3 schermate | ✅ |
| `codemagic.yaml` | ✅ |
| `app.json` buildNumber 17 | ✅ |
| Push su main | ✅ (commit 87fb53a) |
| Test Expo Go | ⏳ da fare manualmente |
| Codemagic account + ASC API Key | ⏳ da fare manualmente |
| Build 17 su TestFlight | ⏳ dipende dai passi sopra |

---

## Commit questa sessione

```
91af9cf chore(mobile): add bottom-tabs, datetimepicker, jest dev setup
61e6768 feat(mobile): dateUtils.js — toISO/formatDateIT/today with timezone fix + 13 unit tests
219fec7 feat(mobile): endpoints.js — add leave/illness endpoints, LEAVE_TYPES, fix demo accounts
b4651ae feat(mobile): bottom tab bar — Badge/Ferie/Malattia/Turni/Presenze + screen cleanup
f091aab feat(mobile): LeaveRequestScreen — ferie con saldo, date picker, storico
bb65870 feat(mobile): IllnessReportScreen — malattia con date picker e storico
87fb53a feat(ci): codemagic.yaml iOS TestFlight + build 17
```

---

## Next Steps (dalla sessione corrente + backlog TASKS.md)

1. **Test Expo Go + fix eventuali bug** → poi `git push origin main`
2. **Codemagic setup** → Build 17 → TestFlight
3. **Staging environment** — Obbligatorio prima del lancio con primo cliente (decisione Session 45)
4. **ONB.2** — Saldi NUMERIC per mezze giornate leave management
5. **S.26** — GPS explicit consent mechanism

Per riprendere: leggi `TASKS.md` + `git log --oneline -10`.
