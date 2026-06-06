# FASE 4.2 — Mobile App Build Instructions

**Date:** 6 Giugno 2026  
**Target:** Build APK for Android & IPA for iOS testing  
**Method:** Expo EAS Build (recommended) or Local Build  

---

## 📋 PRE-BUILD CHECKLIST

### Environment Verification
```bash
# Check Node.js version (16+ required)
node --version
# Expected: v18.x.x or v20.x.x

# Check Expo CLI installed globally
expo --version
# Expected: 50.x.x+

# Check npm packages installed locally
cd frontend-mobile
npm install
# Should complete without errors

# Verify .env file exists with API URL
cat .env
# Should contain: EXPO_PUBLIC_API_URL=https://api.dataxiom.it
```

### API Connectivity Test
```bash
# Test backend API is reachable
curl -I https://api.dataxiom.it/health
# Expected: HTTP/1.1 200 OK

# Test login endpoint responds
curl -X POST https://api.dataxiom.it/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}' 2>/dev/null | head -20
# Expected: Response (even if 401 Unauthorized)
```

### Code Quality Check
```bash
# Run linter (if configured)
cd frontend-mobile
npm run lint
# Expected: No errors (warnings OK for MVP)

# Check for console.log statements that should be removed
grep -r "console\.log" src/ --include="*.jsx" --include="*.js"
# Expected: Only expected debug logs (console.warn is OK)
```

---

## 🏗️ BUILD OPTIONS

### Option 1: Expo EAS Build (Recommended for Teams)

**Pros:**
- Managed build service (no local setup needed)
- Supports TestFlight & Play Store submission
- Automatic code signing
- Available worldwide with fast build times

**Cons:**
- Requires EAS account (free tier available)
- Requires project to be connected to EAS

#### Setup (One-time)
```bash
cd frontend-mobile

# Install EAS CLI
npm install -g eas-cli

# Login to Expo account (or create one)
eas login

# Configure EAS for project
eas build:configure
# Select platforms: ios, android
# Choose build profiles: preview (for testing)
```

#### Build for Testing
```bash
# Build APK for Android testing (runs on device or emulator)
eas build --platform android --profile preview
# Takes ~10-15 minutes
# Output: APK file (download link provided)

# Build IPA for iOS testing (runs on device, not simulator)
eas build --platform ios --profile preview
# Takes ~15-20 minutes
# Output: IPA file + TestFlight link
```

#### Install & Run
```bash
# Android: APK can be installed directly
adb install path/to/badge-app.apk
# Or: drag APK into Android emulator

# iOS: Use TestFlight (simplest method)
# 1. Go to link provided by EAS
# 2. Add tester's email
# 3. Open link on iPhone → TestFlight → Install
```

---

### Option 2: Local Expo Build

**Pros:**
- No external dependencies
- Fast iteration
- Full control over build

**Cons:**
- Requires Xcode (Mac only) for iOS
- Requires Android SDK for Android
- Longer setup time

#### Setup (One-time)
```bash
# Install Expo CLI locally
npm install -g expo-cli

# For iOS: Install Xcode (from App Store)
# For Android: Install Android Studio + SDK

# Verify setup
expo diagnostics
```

#### Build for Testing
```bash
cd frontend-mobile

# Start Expo development server
expo start

# In another terminal, build for devices:

# Android: build APK
expo build:android
# or (faster, local build)
expo run:android

# iOS: build IPA
expo build:ios
# or (faster, local build, Mac only)
expo run:ios
```

---

### Option 3: Android Emulator & iOS Simulator (Fast, Local Testing Only)

**Pros:**
- Instant feedback
- No build waiting time
- Good for development

**Cons:**
- Not real devices
- No Face ID / biometric testing possible
- Some performance differences

#### Setup
```bash
# Android Studio emulator
# 1. Open Android Studio
# 2. Device Manager → Create Virtual Device
# 3. Select latest API level (e.g., API 34)
# 4. Start emulator

# iOS Simulator (Mac only)
# 1. Open Xcode
# 2. Window → Devices & Simulators
# 3. Simulators tab
# 4. Create new simulator (e.g., iPhone 15)
# 5. Boot simulator
```

#### Run App
```bash
cd frontend-mobile
expo start

# In Expo terminal:
# Press 'a' for Android (if emulator running)
# Press 'i' for iOS (if simulator running on Mac)
```

---

## ✅ VERIFICATION BEFORE DEPLOYMENT

### Code Review Pre-Checks
```bash
# 1. No hardcoded URLs (should use ENDPOINTS)
grep -r "https://api\." src/ --include="*.jsx" --include="*.js"
# Expected: Only in endpoints.js

# 2. No hardcoded storage keys
grep -r "badge_auth_token\|badge_user" src/ --include="*.jsx" --include="*.js" | grep -v STORAGE_KEYS
# Expected: Empty (all should use STORAGE_KEYS)

# 3. No hardcoded timing values
grep -r "15000\|5000\|1000" src/screens --include="*.jsx" | grep -v "TIMING\|params\|API"
# Expected: Only TIMING constants, not raw numbers

# 4. All loading states present
grep -rn "loading &&" src/screens --include="*.jsx" | wc -l
# Expected: > 5 (each screen has loading feedback)
```

### API Connectivity Verification
```bash
# Test demo account
curl -X POST https://api.dataxiom.it/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice.neri@employee.it","password":"Alice1975"}' \
  2>/dev/null | jq '.data.token'
# Expected: JWT token string

# Test check-ins endpoint (using token from above)
TOKEN="<paste-token-here>"
curl -X GET "https://api.dataxiom.it/api/checkins?limit=5" \
  -H "Authorization: Bearer $TOKEN" \
  2>/dev/null | jq '.data | length'
# Expected: Number (5 or less)
```

### Performance Check
```bash
# Bundle size analysis (if supported)
expo-cli bundle-analyze

# Should show bundle is < 5MB uncompressed
# (typical for React Native Expo app)
```

---

## 🚀 BUILD DEPLOYMENT STEPS

### For Android (APK)
```bash
# 1. Create EAS build
eas build --platform android --profile preview

# 2. Download APK
# Link provided in terminal output
# Download to: ~/Downloads/badge-app.apk

# 3. Install on real device (USB connected)
adb install ~/Downloads/badge-app.apk

# 4. Or install on emulator
adb install -r ~/Downloads/badge-app.apk
# (In Android Studio, select your emulator first)
```

### For iOS (IPA via TestFlight)
```bash
# 1. Create EAS build
eas build --platform ios --profile preview

# 2. Get TestFlight link
# Provided in terminal output
# Example: https://testflight.apple.com/join/abcd1234

# 3. Share link with testers
# Send link to iOS tester's email

# 4. Tester opens link on iPhone
# → TestFlight app → "Accept" → "Install"

# 5. App appears on home screen (can take 5-10 minutes to compile for device)
```

### For Local Testing (Simulator/Emulator)
```bash
# 1. Start development server
cd frontend-mobile
expo start

# 2. Start simulator/emulator first
# Android: Android Studio → Device Manager → Start Emulator
# iOS: Open Xcode → Simulator menu → Select Device → Boot

# 3. In Expo terminal, press:
# 'a' for Android
# 'i' for iOS (Mac only)

# 4. App installs and launches automatically
```

---

## 📋 TESTING READINESS CHECKLIST

Before starting device testing, verify all items:

### Code Level
- [ ] No TypeScript/ESLint errors (`npm run lint`)
- [ ] No hardcoded URLs (all use ENDPOINTS config)
- [ ] No hardcoded storage keys (all use STORAGE_KEYS)
- [ ] All async operations have loading feedback
- [ ] No console.log statements left (only console.warn for errors)
- [ ] All error paths handled with try-catch

### API Level
- [ ] Backend is running: `curl https://api.dataxiom.it/health` → 200 OK
- [ ] Demo account works: Login with alice.neri@employee.it / Alice1975
- [ ] Check-ins endpoint responds: `GET /api/checkins` returns data
- [ ] Shifts endpoint responds: `GET /api/shifts/my-schedule` returns data

### Build Level
- [ ] Dependencies installed: `npm install` completes without errors
- [ ] Environment configured: `.env` has `EXPO_PUBLIC_API_URL=https://api.dataxiom.it`
- [ ] Signed .env file exists (for EAS builds)

### Device Level
- [ ] Device or emulator available (iOS & Android, if possible)
- [ ] Device is connected via USB (for APK installation)
- [ ] TestFlight account setup (for iOS IPA testing)

---

## 🔧 TROUBLESHOOTING

### Build Fails: "Module not found: expo-camera"
```bash
# Solution: Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
eas build --platform android --profile preview
```

### Build Fails: "EXPO_PUBLIC_API_URL is undefined"
```bash
# Solution: .env file not found or not loaded
# Verify .env exists in frontend-mobile/
cat frontend-mobile/.env
# Should show: EXPO_PUBLIC_API_URL=https://api.dataxiom.it

# For EAS builds, use eas.json:
# Add to frontend-mobile/eas.json:
{
  "build": {
    "preview": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.dataxiom.it"
      }
    }
  }
}
```

### App Crashes on Startup
```bash
# Check device logs:
# Android:
adb logcat | grep "FATAL\|ERROR\|Badge"

# iOS (via Xcode):
# Xcode → Window → Devices & Simulators → select device → View Device Logs
```

### Camera Permission Denied
```bash
# Android emulator: Settings → Apps → Badge System → Permissions → Camera → Allow

# iOS simulator: Settings → Privacy → Camera → Badge System → Allow
```

### API Timeout (15 seconds)
```bash
# Check network connectivity:
ping api.dataxiom.it

# If backend down:
ssh ec2-user@<EC2_IP>
docker ps
docker logs badge-system-backend
```

---

## 📱 DEVICE REQUIREMENTS

### Minimum Specifications
| OS | Version | Device Example |
|---|---------|---|
| iOS | 15.0+ | iPhone 13 or newer |
| Android | 10 (API 29)+ | Samsung Galaxy A50 or equivalent |

### Recommended for Testing
| OS | Version | Device Example |
|---|---------|---|
| iOS | 16.0+ | iPhone 14 Pro |
| Android | 13+ (API 33) | Pixel 7 or newer |

### Features Required
- ✅ Biometric auth (Face ID on iOS, Fingerprint on Android)
- ✅ Camera (for QR scanning)
- ✅ Network connectivity (WiFi or 4G LTE)
- ✅ GPS (optional, for future location tracking)

---

## 🎯 NEXT STEPS AFTER BUILD

1. **Install on Device/Emulator** (see above)
2. **Run Through Test Scenarios** (see FASE4.2_DEVICE_TESTING_PLAN.md)
3. **Record Results** using provided template
4. **Document Issues** (if any found)
5. **Fix & Re-test** (if issues found)
6. **Proceed to FASE 4.3** (Integration Testing, once all tests pass)

---

**Created By:** Claude Code Session 8  
**Status:** Ready for Build  
**Last Updated:** 6 Giugno 2026
