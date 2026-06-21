# Badge System — Session 49 Handoff

**Date:** 2026-06-21  
**Session:** 49 — Codemagic iOS Build 17 Setup (bloccato su code signing)  
**Status:** ⏳ **Codemagic build non ancora avviata** — bloccata su provisioning profile. Da completare domani.

---

## Goal

Avviare Build 17 su Codemagic per distribuire l'app mobile (con tab bar + LeaveRequestScreen + IllnessReportScreen) su TestFlight.

---

## Stato del codice (tutto pronto, su main)

| Componente | Stato |
|-----------|-------|
| `dateUtils.js` + 13 unit test TDD | ✅ 13/13 verde |
| 5 tab (Badge/Ferie/Malattia/Turni/Presenze) | ✅ su main |
| `LeaveRequestScreen.jsx` | ✅ su main |
| `IllnessReportScreen.jsx` | ✅ su main |
| Fix timezone `toISO()` | ✅ |
| Fix crash `StorePresencesScreen` in tab context | ✅ |
| `codemagic.yaml` | ✅ su main (3 fix applicati) |
| `app.json` buildNumber 17 | ✅ |

---

## Problema bloccante: Codemagic code signing

### Errore attuale
```
No matching profiles found for bundle identifier "it.dataxiom.badge" and distribution type "app_store"
```

### Causa
Codemagic tenta il **signing automatico** via App Store Connect API key (`G3WX4C3UAU`, ruolo App Manager), ma non trova un provisioning profile perché quelli creati da EAS sono gestiti internamente da EAS e non sono visibili all'API key.

Un profilo App Store Distribution **è già stato creato** nel portale Apple Developer in questa sessione, ma il signing automatico di Codemagic continua a non trovarlo (motivo sconosciuto — potrebbe essere caching o un problema di matching del certificato).

### Soluzione: switching a signing manuale

Il `codemagic.yaml` attuale (commit `1d98d2b`) contiene già `xcode-project use-profiles` che supporta sia signing automatico che manuale. Codemagic usa i file caricati manualmente se disponibili.

---

## Next Steps — Da fare domani

### Step 1: Esporta il certificato .p12 da Keychain (5 min)

1. Apri **Keychain Access** sul Mac (Spotlight: `Cmd+Spazio` → "Keychain Access")
2. Nella barra di ricerca cerca `Apple Distribution`
3. Se trovi un certificato:
   - Right-click → **"Export"**
   - Formato: `.p12`
   - Salva come `badge_distribution.p12`
   - Scegli una password e annotala
4. Se NON trovi nulla: vai allo Step 1B

### Step 1B (solo se non c'è in Keychain): Crea nuovo certificato

1. Keychain Access → menu **"Keychain Access"** → **"Certificate Assistant"** → **"Request a Certificate from a Certificate Authority..."**
   - Email: `falletti.diego2533@gmail.com`
   - Common Name: `Diego Falletti`
   - Seleziona **"Saved to disk"** → salva `CertificateSigningRequest.certSigningRequest`
2. Vai su [developer.apple.com](https://developer.apple.com/account) → Certificates → **"+"**
3. Seleziona **"Apple Distribution"** → Continue
4. Carica il file `.certSigningRequest` → Continue → Download il `.cer`
5. Doppio click sul `.cer` per importarlo in Keychain
6. Ora torna allo Step 1 (Export come .p12)

### Step 2: Recupera il provisioning profile (2 min)

Il file `.mobileprovision` è già stato scaricato dal portale Apple in questa sessione.

Se non lo trovi, scaricalo di nuovo:
1. [developer.apple.com](https://developer.apple.com/account) → Certificates, Identifiers & Profiles → **Profiles**
2. Cerca `Badge System App Store` → Download

### Step 3: Carica in Codemagic (5 min)

1. [codemagic.io](https://codemagic.io) → clicca icona utente in basso a sinistra → **"Personal Account"**
2. Nel menu laterale clicca **"Settings"**
3. Cerca la sezione **"Code signing identities"** (o "iOS code signing")
4. Carica:
   - Il file `badge_distribution.p12` + inserisci la password
   - Il file `.mobileprovision` (`Badge System App Store`)

### Step 4: Avvia build (2 min)

1. Torna sulla pagina dell'app `badge` in Codemagic
2. Clicca **"Start new build"**
3. Branch: `main` → Workflow: `badge-ios-testflight` → **"Start"**
4. Attendi ~35-45 minuti
5. Verifica su TestFlight: **Build 17**

---

## Dati tecnici utili

| Dato | Valore |
|------|--------|
| Bundle identifier | `it.dataxiom.badge` |
| Apple Team ID | `UKZ95L3FHH` |
| App Store Connect App ID | `6777934529` |
| API Key name in Codemagic | `Badge Production` |
| API Key ID | `G3WX4C3UAU` |
| Email Apple ID | `falletti.diego2533@gmail.com` |
| Workflow Codemagic | `badge-ios-testflight` |
| Branch | `main` |
| buildNumber | `17` |

---

## codemagic.yaml attuale (commit 1d98d2b)

```yaml
workflows:
  badge-ios-testflight:
    name: Badge System iOS — TestFlight
    max_build_duration: 60
    instance_type: mac_mini_m1
    integrations:
      app_store_connect: Badge Production
    environment:
      ios_signing:
        distribution_type: app_store
        bundle_identifier: it.dataxiom.badge
      node: v20.x
      xcode: latest
      cocoapods: default
    working_directory: frontend-mobile
    scripts:
      - npm ci
      - npx expo prebuild --platform ios --clean
      - cd ios && pod install
      - xcode-project use-profiles
      - xcode-project build-ipa --workspace "ios/Badge System.xcworkspace" --scheme "Badge System"
    artifacts:
      - build/ios/ipa/*.ipa
      - /tmp/xcodebuild_logs/*.log
    publishing:
      app_store_connect:
        auth: integration
        submit_to_testflight: true
        beta_groups:
          - App Store Connect Users
```

---

## Errori già risolti (non ripetere)

| Errore | Fix applicato | Commit |
|--------|--------------|--------|
| `instance_type: mac_mini_m2` (a pagamento) | → `mac_mini_m1` | 3a45a90 |
| `ios_signing → api_key` campo non valido | Rimosso | 074401b |
| `auth: integration` senza `integrations` al livello workflow | Aggiunto `integrations:` sotto il workflow | 074401b |
| `xcode-project build-ipa` senza use-profiles | Aggiunto `xcode-project use-profiles` prima del build | 1d98d2b |

---

## Dopo la build: test Expo Go (da fare ancora)

Prima della build Codemagic, idealmente fare anche:
```bash
cd frontend-mobile && npx expo start
```
Testare con Expo Go:
- `maria@badge.local` → 5 tab visibili, Tab Ferie funziona, date picker mostra data corretta
- `pino@badge.local` → Tab Presenze apre StorePresences senza crash (fix critico sessione 48)

---

## Backlog post-Build 17

1. **Staging environment** — obbligatorio prima del lancio con primo cliente reale (decisione Session 45)
2. **ONB.2** — Saldi NUMERIC per mezze giornate leave management
3. **S.26** — GPS explicit consent mechanism

Per riprendere: leggi `TASKS.md` + `git log --oneline -10`.
