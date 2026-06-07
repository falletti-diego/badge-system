---
name: build-mobile
description: Build Badge System mobile app with EAS (iOS preview or Android) with pre-flight checks
disable-model-invocation: true
---

# /build-mobile — Build App Mobile

Prepara e avvia la build dell'app Badge System con Expo EAS Build.

## Usage

```
/build-mobile [ios|android|local]
```

- `/build-mobile ios` — EAS build iOS (profilo preview, richiede Apple Developer account)
- `/build-mobile android` — EAS build Android APK (profilo preview, non richiede account)
- `/build-mobile local` — Expo export locale (Web bundle, per testing browser)
- `/build-mobile` — Default: local export

---

## Step 1 — Pre-flight checks

```bash
cd frontend-mobile

# Verifica versioni tools
node --version && npx eas --version 2>/dev/null || echo "EAS CLI non installato"

# Verifica dipendenze installate
ls node_modules/ > /dev/null 2>&1 && echo "✅ node_modules OK" || echo "❌ Esegui: npm install"

# Verifica configurazione app.json
python3 -c "import json; d=json.load(open('app.json')); print('slug:', d['expo']['slug'], '| version:', d['expo']['version'])"

# Verifica .env o variabili API
grep -r "EXPO_PUBLIC_API_URL\|API_BASE_URL" . --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" 2>/dev/null | head -5
```

Controlla:
- [ ] Node.js >= 18
- [ ] `node_modules/` esiste (se no: `npm install`)
- [ ] `app.json` ha `slug`, `version`, `bundleIdentifier` (iOS) / `package` (Android)
- [ ] L'URL API punta a `https://api.dataxiom.it` (non localhost)

---

## Step 2a — EAS Build iOS (preview)

**Requisito:** Account Apple Developer ($99/anno) + EAS account Expo

```bash
cd frontend-mobile

# Verifica login EAS
npx eas whoami || echo "❌ Esegui: npx eas login"

# Verifica progetto configurato
npx eas build:configure 2>/dev/null || true

# Avvia build
npx eas build --platform ios --profile preview
```

Output atteso: Link al build su expo.dev (`https://expo.dev/accounts/...`)

**Se errore "Apple Developer account not found":** L'utente deve registrarsi su developer.apple.com ($99/anno). Senza account Apple Developer non è possibile fare build iOS.

---

## Step 2b — EAS Build Android (preview APK)

**Non richiede account Google.** Genera un APK installabile direttamente.

```bash
cd frontend-mobile

# Verifica login EAS
npx eas whoami || echo "❌ Esegui: npx eas login"

# Avvia build APK
npx eas build --platform android --profile preview
```

Output: Link al download dell'APK su expo.dev.

Per installare l'APK su un dispositivo Android:
1. Scarica il file `.apk` dal link
2. Su Android: Impostazioni → Sicurezza → Consenti origini sconosciute
3. Installa l'APK

---

## Step 2c — Expo Local Export (nessun account richiesto)

Per testare il bundle in locale senza build nativa:

```bash
cd frontend-mobile

# Export come web bundle
npx expo export --platform web 2>&1 | tail -20

# Oppure avvia il dev server
npx expo start --tunnel
```

`--tunnel` genera un URL pubblico (ngrok) accessibile dall'iPhone tramite Expo Go.

**Per usare Expo Go:**
1. Installa "Expo Go" dall'App Store (gratuito)
2. Esegui `npx expo start --tunnel`
3. Scansiona il QR code con la fotocamera iPhone
4. L'app si apre in Expo Go (nessuna build richiesta)

---

## Step 3 — Verifica post-build

Dopo una EAS build completata:

```bash
# Lista ultime build
npx eas build:list --limit 5
```

Verifica:
- [ ] Build status: `finished` (non `errored`)
- [ ] Platform corretta (ios/android)
- [ ] Bundle size ragionevole (< 50MB per MVP)

---

## Step 4 — Riporta risultato

```
╔══════════════════════════════════════════════════╗
║  BUILD MOBILE — BADGE SYSTEM                     ║
╠══════════════╦═══════════════════════════════════╣
║  Platform    ║  iOS preview                      ║
║  Status      ║  ✅ Finished                      ║
║  Bundle ID   ║  com.dataxiom.badge               ║
║  Version     ║  1.0.0 (build 1)                  ║
╠══════════════╩═══════════════════════════════════╣
║  Download:   ║  https://expo.dev/...             ║
╚══════════════════════════════════════════════════╝

Per TestFlight: carica l'IPA su App Store Connect
Per test diretto: installa il profilo di provisioning e l'IPA
```

---

## Note importanti

| Situazione | Soluzione |
|-----------|-----------|
| No Apple Developer account | Usa `/build-mobile android` o `local` |
| EAS build lenta (15-30 min) | Normale per prima build — queue EAS |
| "EAS project not configured" | Esegui `npx eas init` nella dir frontend-mobile |
| Errore "Non-exempt encryption" | Già noto: aggiungere `ITSAppUsesNonExemptEncryption: false` in `app.json` sotto `ios.infoPlist` |
| API non raggiungibile in app | Verifica che `API_BASE_URL` punti a `https://api.dataxiom.it` non a `localhost` |
