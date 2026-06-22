# Badge System — Session 50 Handoff

**Date:** 2026-06-22  
**Session:** 50 — Codemagic Build 18 — Pipeline iOS CI/CD completata ✅  
**Status:** ✅ **Build 18 su App Store Connect (Processing → TestFlight a breve)**

---

## Goal raggiunto

Sbloccare la pipeline Codemagic per la distribuzione iOS automatica su TestFlight.  
Build 18 caricata su App Store Connect alle 22:42 del 22/06/2026. Status: "Processing".

---

## Stato del codice (tutto su main)

| Componente | Stato |
|-----------|-------|
| `dateUtils.js` + 13 unit test TDD | ✅ su main |
| 5 tab (Badge/Ferie/Malattia/Turni/Presenze) | ✅ su main |
| `LeaveRequestScreen.jsx` | ✅ su main |
| `IllnessReportScreen.jsx` | ✅ su main |
| `codemagic.yaml` | ✅ pipeline funzionante |
| `ExportOptions.plist` | ✅ committato in `frontend-mobile/` |
| `app.json` buildNumber | ✅ 18 |
| Backend produzione | ✅ api.dataxiom.it (23/23 api-test) |
| Frontend produzione | ✅ badge.dataxiom.it |

---

## Codemagic — Configurazione attuale funzionante

### codemagic.yaml (commit 8cbb995 + 5d9f36d)
```yaml
workflows:
  badge-ios-testflight:
    name: Badge System iOS — TestFlight
    max_build_duration: 60
    instance_type: mac_mini_m1
    integrations:
      app_store_connect: Badge System
    environment:
      groups:
        - default
      ios_signing:
        distribution_type: app_store
        bundle_identifier: it.dataxiom.badge
      node: 20.17.0
      xcode: latest
      cocoapods: default
    working_directory: frontend-mobile
    scripts:
      - npm ci
      - npx expo prebuild --platform ios --clean
      - cd ios && pod install
      - xcode-project use-profiles
      - xcode-project build-ipa
          --workspace "ios/BadgeSystem.xcworkspace"
          --scheme "BadgeSystem"
          --export-options-plist "ExportOptions.plist"
    artifacts:
      - build/ios/ipa/*.ipa
      - /tmp/xcodebuild_logs/*.log
    publishing:
      app_store_connect:
        auth: integration
        submit_to_testflight: true
```

### Dati tecnici Codemagic
| Dato | Valore |
|------|--------|
| Bundle identifier | `it.dataxiom.badge` |
| Apple Team ID | `UKZ95L3FHH` |
| App Store Connect App ID | `6777934529` |
| API Key in Codemagic | `Badge System (Key: 58VXN7ATGV)` |
| Issuer ID | `9d2161b8-5317-4aca-8d53-64dc7b2cc48a` |
| Workflow | `badge-ios-testflight` |
| Branch | `main` |
| buildNumber attuale | `18` |
| Env group | `default` (contiene `SENTRY_DISABLE_AUTO_UPLOAD=true`) |

### Certificati in Codemagic (Settings → Code signing identities)
- **iOS certificate:** `Apple Distribution: Diego Falletti (UKZ95L3FHH)` → file `badge_distribution.p12`
- **Provisioning profile:** `Badge System App Store` → file `.mobileprovision`
- ⚠️ Entrambi creati il 22/06/2026 — il certificato scade nel 2027

---

## 7 errori risolti in cascata (Session 49-50)

| # | Errore | Fix | Commit |
|---|--------|-----|--------|
| 1 | `No matching profiles found` (signing automatico) | Switching a signing manuale: .p12 + .mobileprovision caricati in Codemagic | — |
| 2 | `Unable to install Node version v20.x` | `node: v20.x` → `node: 20.17.0` | db8c94c |
| 3 | `Path "ios/Badge System.xcworkspace" does not exist` | Workspace reale è `BadgeSystem` (no spazio) — verificato con prebuild locale | b9e71c4 |
| 4 | `export_options.plist does not exist` | Creato `frontend-mobile/ExportOptions.plist` committato nel repo | 5d6cd76 |
| 5 | `sentry-cli: Auth token required` | `SENTRY_DISABLE_AUTO_UPLOAD=true` in env group `default` su Codemagic | 2933581 |
| 6 | `App Store Connect 401 NOT_AUTHORIZED` | Nuova API key `Badge System (58VXN7ATGV)` — la vecchia falliva | 6858fa8 |
| 7 | `bundle version must be higher than previously uploaded: 17` | `buildNumber` 17 → 18 in `app.json` | 5d9f36d |

---

## Prossimi step

### Immediato (oggi/domani)
1. **Aspetta che Build 18 passi da "Processing" a "Ready"** su App Store Connect → TestFlight (10-30 min da ora)
2. **Installa Build 18 su iPhone** via app TestFlight → testa i 5 tab (Badge/Ferie/Malattia/Turni/Presenze)
3. **Test Expo Go** (se non già fatto):
   ```bash
   cd frontend-mobile && npx expo start
   ```
   - `maria@badge.local` → 5 tab visibili, Tab Ferie funziona
   - `pino@badge.local` → Tab Presenze apre StorePresences senza crash

### Per la prossima build (quando si fa una modifica)
- Incrementa `buildNumber` in `frontend-mobile/app.json` (18 → 19, poi 20, ecc.)
- `git push` su `main` → Codemagic parte automaticamente → ~35-45 min → TestFlight

### Backlog post-Build 18
1. **Staging environment** — obbligatorio prima del lancio con primo cliente reale (decisione Session 45)
2. **ONB.2** — Saldi NUMERIC per mezze giornate leave management (3-5h)
3. **S.26** — GPS explicit consent mechanism
4. **EU trader status** — completare su App Store Connect (richiesto da Apple per distribuzione EU)

---

## Note operative

### Come avviare la prossima build Codemagic
1. Modifica codice + incrementa `buildNumber` in `app.json`
2. `git add . && git commit -m "..." && git push`
3. Codemagic parte automaticamente (webhook su push a `main`)
4. Oppure: [codemagic.io](https://codemagic.io) → `badge-system` → **Start new build** → `main` → `badge-ios-testflight`

### Se "post-processing failed" con "Fetching logs..." bloccato
- È un **bug UI di Codemagic** — non un errore reale
- Controlla **App Store Connect → My Apps → Badge System → TestFlight → Build Uploads**
- Se la build è lì (anche in "Processing"), l'upload è riuscito

### Se serve rinnovare il certificato (scade 2027)
- Rieseguire Step 1C: Keychain → "I miei certificati" → `Apple Distribution: Diego Falletti` → Esporta .p12
- Ricaricare in Codemagic → Settings → Code signing identities

---

Per riprendere: leggi `TASKS.md` + `git log --oneline -10`.
