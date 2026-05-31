# Mobile App — Badge System

Mobile app per Badge System, sviluppata con **React Native** per iOS e Android.

---

## 🏗️ Features

- ✅ Face ID / Touch ID nativo
- ✅ QR Code scanning
- ✅ Check-in registration
- ✅ Personal check-in history
- ✅ Offline support (Phase 2)

---

## 🚀 Development Setup

### Prerequisites
- Node.js 20+ LTS
- Xcode (per iOS) o Android Studio (per Android)
- React Native CLI

### Installation
```bash
npm install
```

### Environment Variables
```bash
cp .env.example .env
```

### Run on iOS
```bash
npm run ios
```

### Run on Android
```bash
npm run android
```

---

## 📝 Project Structure

```
mobile/
├── src/
│   ├── screens/         # Screen components
│   │   ├── LoginScreen.js
│   │   ├── CheckinScreen.js
│   │   └── HistoryScreen.js
│   ├── components/      # Reusable components
│   │   ├── QRScanner.js
│   │   └── CheckinCard.js
│   ├── services/        # API calls
│   │   └── api.js
│   ├── redux/           # Redux store
│   │   ├── store.js
│   │   └── slices/
│   └── App.js           # Root component
├── assets/              # Images, fonts
├── .env.example
├── package.json
└── README.md
```

---

## 🔑 Key Libraries

- **React Native** — Cross-platform UI
- **React Native Face API** — Biometric authentication
- **react-native-camera** — QR scanning
- **Redux Toolkit** — State management
- **Axios** — HTTP client

---

## 🚢 Building for Production

### iOS
```bash
npm run build:ios
```

### Android
```bash
npm run build:android
```

See [Deployment Guide](../docs/DEPLOYMENT.md) for App Store/Play Store submission.

---

**Status:** Development 🚧
