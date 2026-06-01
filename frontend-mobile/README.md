# Badge System — Mobile App

**Componente:** React Native app (iOS + Android)  
**Target Users:** Dipendenti (check-in)  
**Platform:** Expo (EAS Build)  
**Status:** Development Ready

---

## 📋 Quick Description

App mobile per dipendenti per registrare check-in via QR code + Face ID nativo.

**Core Flow:**
1. Login con Face ID
2. Scannerizza QR code della sede
3. Check-in registrato ✅
4. Visualizza storico presenze

**Architecture:** React Native + Redux Toolkit + Expo

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ LTS
- npm or yarn
- Expo Go app (iOS/Android) for testing

### Setup (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Setup environment variables
cp .env.example .env
# Edit .env:
# EXPO_PUBLIC_API_URL=http://localhost:3000
# EXPO_PUBLIC_AUTH0_DOMAIN=your-domain.auth0.com
# EXPO_PUBLIC_AUTH0_CLIENT_ID=your_client_id

# 3. Start Expo development server
npx expo start

# 4. Open on device
# iOS: Press 'i' in terminal → opens Simulator
# Android: Press 'a' in terminal → opens Emulator
# Or: Scan QR code with Expo Go app (physical device)
```

---

## 📂 Project Structure (Feature-Based)

```
src/
├── components/          # Shared UI components
│   ├── Button.jsx
│   ├── Input.jsx
│   ├── Card.jsx
│   ├── Loader.jsx
│   └── ErrorBoundary.jsx
│
├── screens/             # Full-screen features (Expo pages)
│   │
│   ├── auth/            # AUTHENTICATION
│   │   ├── LoginScreen.jsx         # Email + password form
│   │   ├── FaceIdSetupScreen.jsx   # Enroll Face ID (first time)
│   │   └── SplashScreen.jsx        # Loading screen
│   │
│   ├── checkin/         # CHECK-IN FEATURE
│   │   ├── CheckInScreen.jsx       # Main check-in interface
│   │   ├── QRScannerScreen.jsx     # QR code scanner
│   │   ├── SuccessScreen.jsx       # Check-in confirmed
│   │   └── ErrorScreen.jsx         # Error handling
│   │
│   └── history/         # CHECK-IN HISTORY
│       ├── HistoryScreen.jsx       # List past check-ins
│       ├── DetailsScreen.jsx       # Single check-in details
│       └── CorrectScreen.jsx       # Correct check-in (within 2h)
│
├── navigation/          # React Navigation setup
│   ├── RootNavigator.js    # Top-level navigation (Auth vs App)
│   ├── AuthNavigator.js    # Auth stack (login, Face ID setup)
│   └── AppNavigator.js     # App stack (check-in, history)
│
├── services/            # API calls & utilities
│   ├── apiClient.js        # Axios configured instance
│   ├── authService.js      # Login, Face ID auth
│   ├── checkInService.js   # Register check-in
│   ├── historyService.js   # Fetch check-in history
│   └── storageService.js   # AsyncStorage (offline caching)
│
├── store/               # Redux state management
│   ├── store.js         # Redux store config
│   ├── selectors.js     # Reusable selectors
│   └── slices/
│       ├── authSlice.js       # Auth state (user, token, Face ID enrolled)
│       ├── checkInSlice.js    # Current check-in session
│       ├── historySlice.js    # Check-in history
│       └── uiSlice.js         # UI state (loading, errors)
│
├── hooks/               # Custom React Native hooks
│   ├── useAuth.js       # Auth operations
│   ├── useFaceId.js     # Face ID enrollment & verification
│   ├── useFetch.js      # Generic API hook with error handling
│   ├── useQRScanner.js  # QR scanner operations
│   └── useStorage.js    # AsyncStorage wrapper
│
├── utils/               # Helper functions
│   ├── validation.js    # Form validation (Zod)
│   ├── formatters.js    # Date, time formatting
│   ├── errors.js        # Error handling
│   └── constants.js     # App constants (timeouts, limits)
│
├── App.jsx              # Root component
└── index.js             # Expo entry point
```

---

## 🎬 Main Screens

### 1. **Login Screen** (`AuthNavigator`)
- Email input
- Password input
- "Login" button
- "Forgot password?" link
- Redirect to Face ID setup on first login

### 2. **Face ID Setup** (First time)
- Instructions: "Place your face in the frame"
- Camera preview with face detection
- "Enroll Face ID" button
- Confirmation: Face ID saved ✅

### 3. **Check-In Screen** (Main)
- Welcome message: "Ciao, Mario!"
- "Scannerizza QR Code" button
- Timestamp display
- Recent check-in history (last 3)

### 4. **QR Scanner**
- Full-screen camera
- QR detection overlay
- Vibration on successful scan
- Cancel button

### 5. **Check-In Success**
- ✅ "Check-in Registrato!"
- Time display (09:15 AM)
- "Torna al dashboard" button
- Confetti animation (optional)

### 6. **History Screen**
- List of check-ins (today + last 7 days)
- Filter: date, status
- Edit button (if within 2 hours)
- Swipe to delete (admin only)

### 7. **Edit Check-In** (within 2 hours)
- Current time display
- Time picker (new time)
- Reason field
- "Salva Correzione" button

---

## 🔌 API Integration

### useAuth Hook
```javascript
const { user, login, logout, isFaceIdEnrolled } = useAuth();
```

### useFaceId Hook
```javascript
const { enrollFaceId, verifyFaceId, isEnrolled } = useFaceId();
```

### useCheckIn Hook
```javascript
const { registerCheckIn, getHistory, correct } = useCheckIn();
```

### Typical Check-In Flow
```javascript
// 1. User presses "Scannerizza QR"
const qrCode = await scanQRCode(); // "site_milano_001"

// 2. Verify Face ID
const faceIdValid = await verifyFaceId();

// 3. Register check-in
const result = await registerCheckIn({
  qr_code: qrCode,
  timestamp: new Date().toISOString(),
  type: 'IN'
});

// 4. Show success or error
if (result.success) {
  navigation.navigate('Success');
} else {
  showError(result.message);
}
```

---

## 📦 Native Modules

### React Native APIs (built-in)
- **Face ID:** `react-native-face-api` (iOS) + `react-native-biometrics` (Android)
- **Camera:** `expo-camera` (QR scanning)
- **Local Storage:** `@react-native-async-storage/async-storage`
- **Notifications:** `expo-notifications`

### Key Dependencies
```json
{
  "react-native": "0.73+",
  "react": "18+",
  "expo": "50+",
  "react-redux": "8+",
  "@reduxjs/toolkit": "1.9+",
  "axios": "1.6+",
  "expo-camera": "latest",
  "react-native-qrcode-scanner": "latest",
  "@react-native-async-storage/async-storage": "latest"
}
```

---

## 🧪 Testing

### Run tests
```bash
npm run test
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Manual testing on device
```bash
# Start Expo
npx expo start

# Scan QR code with Expo Go app
# Test on real phone: iPhone/Android
```

---

## 📦 Build & Deployment

### Build for iOS (TestFlight)
```bash
eas build --platform ios --profile preview
# Outputs .ipa file for TestFlight upload
```

### Build for Android (Google Play)
```bash
eas build --platform android --profile production
# Outputs .aab file for Google Play upload
```

### Promote to Production
```bash
# After testing on TestFlight/internal testing:
eas submit --platform ios --latest
eas submit --platform android --latest
```

**EAS Documentation:** https://docs.expo.dev/build/introduction/

---

## 📦 Environment Variables

```bash
# API
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_API_TIMEOUT=30000

# Auth0
EXPO_PUBLIC_AUTH0_DOMAIN=your-domain.auth0.com
EXPO_PUBLIC_AUTH0_CLIENT_ID=your_client_id
EXPO_PUBLIC_AUTH0_AUDIENCE=https://api.badge.dataxiom.it

# App
EXPO_PUBLIC_APP_NAME=Badge System
EXPO_PUBLIC_LOG_LEVEL=debug
```

See `.env.example`.

---

## 🔐 Security

- ✅ **Face ID biometric:** Encrypted by OS
- ✅ **Auth0 integration:** Secure login + PKCE flow
- ✅ **JWT tokens:** Stored in secure storage (encrypted)
- ✅ **HTTPS enforced:** All API calls over TLS
- ✅ **Certificate pinning:** Optional for high-security apps
- ✅ **Offline caching:** AsyncStorage encrypted by OS

---

## 🎨 UI/UX Design System

### Colors
- **Primary:** #2563EB (Blue)
- **Success:** #10B981 (Green)
- **Error:** #EF4444 (Red)
- **Background:** #F9FAFB (Light Gray)

### Typography
- **Heading:** +28px, Bold (Poppins)
- **Body:** 16px, Regular (Poppins)
- **Small:** 12px, Regular (Poppins)

### Components
- **Button:** 48px tall (thumb-friendly)
- **Input:** 56px tall (touch-friendly)
- **Card:** Rounded corners (8px), subtle shadow

---

## 🤝 Contributing

### Component Example
```jsx
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useDispatch } from 'react-redux';

export function CheckInButton({ onPress }) {
  return (
    <TouchableOpacity 
      onPress={onPress}
      className="bg-blue-600 rounded-lg p-4 mb-4"
    >
      <Text className="text-white text-center text-lg font-bold">
        Scannerizza QR Code
      </Text>
    </TouchableOpacity>
  );
}
```

---

## 🐛 Troubleshooting

### Expo development server won't start
```bash
# Clear Expo cache
npx expo start -c

# Or restart with fresh URL
npx expo start --tunnel
```

### Face ID not working on Android
```bash
# Requires Android 9+ with biometric support
# Check device capabilities:
adb shell getprop android.os.version
```

### QR scanner not detecting code
- Ensure good lighting
- Try different distance (10-30cm)
- Check QR code quality (high contrast)

### API calls failing
```bash
# Check if backend is running
curl http://localhost:3000/api/health

# Check network request in Expo logs
npx expo start --verbose
```

---

## 📞 Support

**Issues?** Check:
1. `.env.example` for required variables
2. Expo docs: https://docs.expo.dev/
3. React Native docs: https://reactnative.dev/

---

**Last Updated:** 28 Maggio 2026  
**Created By:** Claude Code  
**Status:** Development Ready ✅
