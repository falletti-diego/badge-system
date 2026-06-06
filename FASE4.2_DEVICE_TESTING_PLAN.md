# FASE 4.2 — Mobile App Device Testing Plan

**Date:** 6 Giugno 2026  
**Target:** Comprehensive device testing on iOS & Android  
**Status:** Ready for Testing  
**Devices Required:** iPhone (iOS 15+), Android phone (API 28+)

---

## 📋 PRE-TESTING CHECKLIST

### Environment Setup
- [ ] Expo SDK 54 installed locally (`npm install -g expo-cli`)
- [ ] iOS: Xcode 14+ with simulator installed
- [ ] Android: Android Studio with emulator or physical device
- [ ] .env file configured with `EXPO_PUBLIC_API_URL=https://api.dataxiom.it`
- [ ] Backend API running and accessible at https://api.dataxiom.it
- [ ] Network connectivity verified (curl https://api.dataxiom.it/health)

### Build & Deploy
- [ ] Run `npm install` in frontend-mobile/
- [ ] No TypeScript/Lint errors: `npm run lint` (if configured)
- [ ] Build succeeds: `expo build:ios` or `eas build --platform ios` (for TestFlight)
- [ ] APK/AAB generated for Android (via Expo or EAS)

---

## 🎯 TEST SCENARIOS

### 1. LOGIN FLOW (Critical Path)

#### 1.1 Successful Login with Demo Credentials
**Test:** alice.neri@employee.it / Alice1975
- [ ] Email field accepts input
- [ ] Password field is masked (•••)
- [ ] "Accedi" button submits form
- [ ] LoadingSpinner shows during submission
- [ ] Navigate to CheckInScreen on success
- [ ] JWT token stored in AsyncStorage
- [ ] No sensitive data logged to console

**Expected:** CheckInScreen appears within 2 seconds

#### 1.2 Login Error Handling
**Test:** Wrong password (alice.neri@employee.it / WrongPassword)
- [ ] Error alert: "Accesso negato: Email o password non corretti"
- [ ] Loading state clears
- [ ] Retry login is possible (form still filled, password not stored)

**Expected:** Error alert, form recovers

#### 1.3 Empty Fields Validation
**Test:** Submit form with empty email or password
- [ ] Alert: "Inserisci email e password"
- [ ] Form not submitted
- [ ] LoadingSpinner does not appear

**Expected:** Validation error, no API call

#### 1.4 Demo Credentials Display
**Test:** Check demo hint text on login screen
- [ ] Demo email visible: alice.neri@employee.it
- [ ] Demo password visible: Alice1975
- [ ] Text color is light blue (#93C5FD)

**Expected:** Credentials clearly visible for testing

---

### 2. CHECK-IN FLOW (Critical Path)

#### 2.1 Check-In Button & Face ID Prompt
**Test:** Tap "Scannerizza QR Code" button on CheckInScreen
- [ ] Face ID prompt appears (on iPhone) or fingerprint prompt (on Android)
- [ ] Prompt text: "Autenticati per il check-in"
- [ ] Cancel button available
- [ ] Fallback to passcode option available

**Expected:** Biometric auth dialog appears

#### 2.2 Face ID Success Flow
**Test:** Complete Face ID authentication
- [ ] Face/fingerprint recognized
- [ ] Navigate to QRScannerScreen
- [ ] Camera viewfinder opens
- [ ] Loading overlay shows scan progress

**Expected:** Camera opens, QR scanning ready

#### 2.3 Face ID Failure Handling
**Test:** Cancel Face ID or fail authentication
- [ ] Stay on CheckInScreen
- [ ] No error shown (graceful handling)
- [ ] Can retry Face ID by tapping button again

**Expected:** Cancel doesn't crash, retry works

#### 2.4 Offline Check-in Detection
**Test:** Disconnect WiFi/cellular, tap "Scannerizza QR Code"
- [ ] Alert: "Nessuna connessione: Verifica la connessione internet e riprova."
- [ ] Navigation to QRScanner does NOT occur
- [ ] Can retry after reconnecting

**Expected:** Offline error, no broken state

---

### 3. QR SCANNER FLOW (Critical Path)

#### 3.1 Camera Permissions
**Test:** First time opening QRScannerScreen
- [ ] Permission prompt: "App Badge System wants to access your camera"
- [ ] Grant permission
- [ ] Camera viewfinder opens
- [ ] No delay or jank

**Expected:** Camera opens immediately after permission grant

#### 3.2 Camera Denial Handling
**Test:** Deny camera permission
- [ ] Error message: "Permesso fotocamera negato"
- [ ] If "Don't Ask Again" available: "Vai in Impostazioni → Badge System → Fotocamera per abilitarla"
- [ ] "Torna indietro" button works

**Expected:** User-friendly error, can retry after permission grant

#### 3.3 Valid QR Code Scan
**Test:** Scan valid QR code with format `badge://checkin?site_id=<uuid>&client_id=<uuid>`
- [ ] QR detected immediately (< 2 seconds)
- [ ] Loading state shows: "Registrazione check-in..."
- [ ] Corner markers stay visible during loading
- [ ] Navigate to SuccessScreen on success
- [ ] Success shows check-in timestamp

**Expected:** Check-in registered, success screen appears

#### 3.4 Invalid QR Code Handling
**Test:** Scan QR that doesn't start with `badge://checkin`
- [ ] Alert: "QR non valido: Questo QR code non appartiene a Badge System"
- [ ] "Riprova" button allows rescanning
- [ ] Back to scanning state

**Expected:** Invalid QR rejected gracefully

#### 3.5 QR with Missing Parameters
**Test:** Scan QR with incomplete params (missing site_id or client_id)
- [ ] Alert: "Errore check-in: QR incompleto"
- [ ] Retry option available
- [ ] Back to scanning

**Expected:** Validation error, retry works

#### 3.6 Back Button During Scan
**Test:** Press back button on QRScannerScreen
- [ ] Navigate back to CheckInScreen
- [ ] Camera stops (no resource leak)
- [ ] CheckInScreen renders cleanly

**Expected:** Clean navigation, no leftover camera access

---

### 4. SUCCESS SCREEN (Critical Path)

#### 4.1 Success Display
**Test:** After successful check-in
- [ ] Green checkmark (✅) displayed prominently
- [ ] Title: "Check-in Registrato!"
- [ ] Timestamp shows correct time (±1 second from actual)
- [ ] Message: "La tua presenza è stata registrata con successo."
- [ ] "Torna alla home" button visible

**Expected:** Success screen shows all details

#### 4.2 Auto-Return Timer
**Test:** Wait on success screen
- [ ] Text shows: "Ritorno automatico tra 5 secondi..."
- [ ] After 5 seconds, auto-navigate to CheckInScreen
- [ ] Timer accurate (not 4s, not 6s)

**Expected:** Auto-return happens at 5 seconds

#### 4.3 Manual Return Button
**Test:** Tap "Torna alla home" button before timer
- [ ] Navigate immediately to CheckInScreen
- [ ] Don't wait for 5 second timer
- [ ] State is clean (can check in again)

**Expected:** Immediate navigation, no timer interference

---

### 5. MY SCHEDULE SCREEN

#### 5.1 Screen Load & Display
**Test:** Navigate to "📅 I Miei Turni" from CheckInScreen
- [ ] Screen title: "I Miei Turni"
- [ ] Back button appears (← Indietro)
- [ ] Month/year displayed (e.g., "giugno 2026")
- [ ] Navigation arrows: < (prev month), > (next month)
- [ ] KPI cards show: shifts assigned, days in month

**Expected:** Screen loads within 1 second, all elements visible

#### 5.2 Loading State
**Test:** First load of My Schedule
- [ ] LoadingSpinner appears while fetching
- [ ] Spinner is not full-screen (allows back navigation)
- [ ] Spinner color is navy (#1E3A5F)
- [ ] No "Jump to bottom" or scroll jank

**Expected:** Smooth loading UI

#### 5.3 Schedule Display
**Test:** Shifts loaded and displayed
- [ ] Each day shows: date, day name, shift (if assigned)
- [ ] Shift colors: m=Navy, p=Orange, s=Purple, R=Gray
- [ ] Shift icons: m=🌅, p=☀️, s=🌙, R=❌
- [ ] Today's date highlighted with blue left border
- [ ] Weekend dates grayed out
- [ ] Unassigned days show: "—"

**Expected:** Schedule displays correctly with color coding

#### 5.4 Month Navigation
**Test:** Change month using < > buttons
- [ ] Navigate to previous month
- [ ] KPI count updates
- [ ] Navigate to next month
- [ ] No blank state or error
- [ ] Can navigate past current month

**Expected:** Month changes smoothly, data updates

#### 5.5 Error Handling
**Test:** Simulate API error (disable network before load)
- [ ] Error message shows: "Errore caricamento turni"
- [ ] "Riprova" button appears
- [ ] Tap "Riprova" to retry fetch
- [ ] After reconnect, retry succeeds

**Expected:** Error state is recoverable

---

### 6. MY PRESENCES SCREEN

#### 6.1 Screen Load & Display
**Test:** Navigate to "📋 Le Mie Presenze" from CheckInScreen
- [ ] Screen title: "Le Mie Presenze"
- [ ] Back button appears
- [ ] SkeletonLoader shows 5 placeholder rows while loading
- [ ] Each placeholder matches actual row height and styling

**Expected:** Progressive loading feedback (skeleton, then data)

#### 6.2 Presences List
**Test:** After load completes
- [ ] List shows all check-ins (limit 50)
- [ ] Each row displays:
  - Type badge (IN=green arrow →, OUT=purple arrow ←)
  - Time (24-hour format, e.g., "14:32")
  - Date (e.g., "mar 03 giu")
  - Site name with 📍 emoji (if available)
  - If corrected: ✏️ emoji in badge

**Expected:** All check-in data visible with proper icons

#### 6.3 Empty State
**Test:** User with no check-ins (if available)
- [ ] Message: "Nessuna presenza registrata."
- [ ] No loading spinner
- [ ] No error state
- [ ] Displayed centrally

**Expected:** Empty state message shown gracefully

#### 6.4 Pagination
**Test:** List has more than 50 items
- [ ] Show first 50 items
- [ ] No "Load More" button (MVP only shows first 50)
- [ ] Scrolling works smoothly
- [ ] No jank or lag on FlatList

**Expected:** Scrolling is smooth, pagination works

#### 6.5 Error Handling
**Test:** Simulate API error
- [ ] Error message shows: "Errore caricamento presenze"
- [ ] "Riprova" button appears
- [ ] Tap "Riprova" to retry
- [ ] After reconnect, retry succeeds

**Expected:** Error recoverable with retry

---

### 7. CLOCK & TIME ACCURACY

#### 7.1 Clock Display on CheckInScreen
**Test:** Observe clock on CheckInScreen
- [ ] Large time display shows current time (64pt, ultra-light font)
- [ ] Date shows below clock (e.g., "lunedì 3 giugno")
- [ ] Time updates every 1 second
- [ ] No jitter (time doesn't jump back/forward)
- [ ] Timezone correct for user's device

**Expected:** Clock updates smoothly every 1 second

#### 7.2 Check-in Timestamp Accuracy
**Test:** During check-in, verify timestamp
- [ ] Success screen shows timestamp matching actual time
- [ ] Timestamp is within ±1 second of actual check-in time
- [ ] Format: 24-hour time (e.g., "14:32:45")

**Expected:** Timestamp accurate to ±1 second

---

### 8. LOGOUT FLOW

#### 8.1 Logout Button
**Test:** Tap "Esci" button on CheckInScreen
- [ ] Confirmation alert: "Logout - Sei sicuro di voler uscire?"
- [ ] Two buttons: "Annulla" (cancel), "Esci" (red/destructive)

**Expected:** Logout confirmation shown

#### 8.2 Logout Confirmation
**Test:** Confirm logout by tapping "Esci"
- [ ] AsyncStorage cleared (JWT token, user data)
- [ ] Navigate back to LoginScreen
- [ ] Form fields empty (no sensitive data retained)
- [ ] API called: `POST /api/auth/logout` (best-effort)

**Expected:** User logged out, redirected to login

#### 8.3 Logout Cancellation
**Test:** Tap "Annulla" on confirmation dialog
- [ ] Dialog closes
- [ ] Stay on CheckInScreen
- [ ] CheckInScreen still functional

**Expected:** Logout cancelled, no side effects

#### 8.4 Logout During Network Failure
**Test:** Logout with no network connection
- [ ] Logout still proceeds (POST request is best-effort)
- [ ] AsyncStorage still cleared
- [ ] Navigate to LoginScreen
- [ ] No error shown to user

**Expected:** Logout succeeds despite network

---

### 9. NAVIGATION & FLOW

#### 9.1 Tab Navigation from CheckInScreen
**Test:** Tap secondary buttons
- [ ] 📅 "I Miei Turni" → MyScheduleScreen
- [ ] 📋 "Le Mie Presenze" → MyPresencesScreen
- [ ] Both screens have back button to return to CheckInScreen

**Expected:** Navigation works both directions

#### 9.2 Back Button Behavior
**Test:** Back button on all screens
- [ ] MyScheduleScreen: back → CheckInScreen
- [ ] MyPresencesScreen: back → CheckInScreen
- [ ] QRScannerScreen: back → CheckInScreen
- [ ] No dead ends or broken navigation

**Expected:** Back always returns to previous screen

#### 9.3 App Startup Flow
**Test:** Kill app and restart
- [ ] If logged in (token in AsyncStorage) → CheckInScreen
- [ ] If not logged in → LoginScreen
- [ ] LoadingSpinner shows briefly while checking auth

**Expected:** App resumes in correct state

---

### 10. PERFORMANCE & BATTERY

#### 10.1 App Launch Time
**Test:** Cold start the app
- [ ] App appears on screen within 3 seconds
- [ ] No white/blank screen for > 2 seconds
- [ ] No jank during startup

**Expected:** < 3 second startup time

#### 10.2 Screen Transition Smoothness
**Test:** Navigate between screens
- [ ] Transitions smooth (no frame drops)
- [ ] No loading spinners blocking transitions
- [ ] Animations are fluid (> 60 FPS on modern devices)

**Expected:** 60 FPS transitions

#### 10.3 Scrolling Performance
**Test:** Scroll through My Presences list (50+ items)
- [ ] FlatList scrolls smoothly
- [ ] No jank or dropped frames
- [ ] Skeleton loader appears instantly
- [ ] Data loads without blocking scroll

**Expected:** Smooth scrolling at 60 FPS

#### 10.4 Memory Leaks
**Test:** Navigate in/out of screens 10+ times
- [ ] No memory growth (device doesn't slow down)
- [ ] App remains responsive
- [ ] No crashes after 5+ minutes of use

**Expected:** No memory leaks, stable performance

#### 10.5 Battery Drain
**Test:** Run app for 30 minutes
- [ ] Clock updates every 1 second (not excessive)
- [ ] No background polling (presences/schedule only fetch on demand)
- [ ] Camera properly released after QR scan
- [ ] No network requests while idle

**Expected:** < 5% battery drain per 30 minutes

---

### 11. ERROR SCENARIOS

#### 11.1 Network Timeout (API > 15 seconds)
**Test:** Simulate slow network on login or check-in
- [ ] API request times out after 15 seconds
- [ ] Loading spinner disappears
- [ ] Error alert shown: "API timeout" (or appropriate message)
- [ ] Retry button available

**Expected:** Graceful timeout handling

#### 11.2 API 401 Unauthorized
**Test:** Manually modify token in AsyncStorage to invalid value
**Then:** Tap a button that makes an API call (e.g., check-in)
- [ ] Error response: 401
- [ ] User auto-logged out (token cleared)
- [ ] Redirect to LoginScreen
- [ ] No error shown to user (graceful)

**Expected:** 401 triggers logout, no error alert

#### 11.3 API 5xx Server Error
**Test:** Kill backend container, then try check-in
- [ ] Error alert: "Errore check-in: <server error message>"
- [ ] "Riprova" button available
- [ ] Restart backend
- [ ] Retry succeeds

**Expected:** Server errors shown, retry works

#### 11.4 Corrupted AsyncStorage Data
**Test:** Manually corrupt user data in AsyncStorage (invalid JSON)
**Then:** Navigate to My Presences screen
- [ ] Screen loads (doesn't crash)
- [ ] No error shown to user (silent recovery)
- [ ] Corrupted data is removed from storage
- [ ] App functions normally

**Expected:** Graceful recovery from corrupted data

---

### 12. ACCESSIBILITY

#### 12.1 Text Sizes
**Test:** Enable large text in device settings (150%)
- [ ] All text readable (not cut off)
- [ ] Buttons still tappable
- [ ] Layout doesn't break

**Expected:** Responsive text scaling

#### 12.2 Color Contrast
**Test:** Check all text/button colors in bright sunlight
- [ ] Text on background is readable
- [ ] Shift colors are distinguishable
- [ ] No hard-to-see text

**Expected:** Good contrast ratios

#### 12.3 Touch Targets
**Test:** Tap all buttons (back, "Esci", navigation)
- [ ] All buttons are large enough (> 44pt × 44pt recommended)
- [ ] No overlapping touch targets
- [ ] Easy to tap without missing

**Expected:** All buttons easily tappable

---

### 13. LOCALIZATION (Future/Phase 2)

#### 13.1 Date/Time Formatting
**Test:** Check Italian locale
- [ ] Dates: "lunedì 3 giugno" (not Monday 3rd June)
- [ ] Time: 24-hour format (14:32, not 2:32 PM)
- [ ] Month names: Italian (giugno, not June)

**Expected:** Italian locale used correctly

---

## 📊 TESTING RESULTS TEMPLATE

```
Device: [iPhone 14 / Pixel 7 / etc.]
iOS/Android Version: [15.5 / 13.0 / etc.]
Expo Version: [SDK 54]
Date: [6 Giugno 2026]

TEST RESULTS:
- LOGIN FLOW: ✅ PASS / ⚠️ ISSUE / ❌ FAIL
  Notes: [any observations]
  
- CHECK-IN FLOW: ✅ PASS / ⚠️ ISSUE / ❌ FAIL
  Notes: [any observations]

- QR SCANNER: ✅ PASS / ⚠️ ISSUE / ❌ FAIL
  Notes: [any observations]

- SUCCESS SCREEN: ✅ PASS / ⚠️ ISSUE / ❌ FAIL
  Notes: [any observations]

... [rest of sections]

OVERALL: ✅ PRODUCTION READY / ⚠️ ISSUES FOUND / ❌ BLOCKING ISSUES

Issues Found:
1. [Issue description]
2. [Issue description]

Recommendations:
- [Fix priority 1]
- [Fix priority 2]
```

---

## 🚀 NEXT STEPS AFTER TESTING

1. **If All Pass (✅ PRODUCTION READY):**
   - Proceed to FASE 4.3: Integration Testing (full E2E flow)
   - Build APK/IPA for TestFlight & Play Store internal track

2. **If Issues Found (⚠️ ISSUES FOUND):**
   - Document each issue with device/iOS/Android version
   - Create bug fixes in branch `bugfix/fase4-device-issues`
   - Re-test after fixes

3. **If Blocking Issues (❌ BLOCKING):**
   - Halt deployment
   - Fix critical issues immediately
   - Re-test all critical paths
   - Escalate to prioritize fixes

---

**Testing Owner:** Diego Falletti  
**Target Completion:** 6 Giugno 2026 (Today)  
**Status:** 🚧 IN PROGRESS
