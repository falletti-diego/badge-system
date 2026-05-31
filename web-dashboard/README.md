# Web Dashboard — Badge System

Dashboard web per Badge System, sviluppata con **React 18 + Vite + Material-UI**.

---

## 🏗️ Features

- ✅ Real-time presence tracking
- ✅ Employee check-in history
- ✅ CSV export
- ✅ Role-based access (Manager, HR, Admin)
- ✅ Responsive design

---

## 🚀 Development Setup

### Prerequisites
- Node.js 20+ LTS

### Installation
```bash
npm install
```

### Environment Variables
```bash
cp .env.example .env
```

### Run Development Server
```bash
npm run dev
```

Dashboard runs on `http://localhost:5173`

---

## 📝 Project Structure

```
web-dashboard/
├── src/
│   ├── pages/           # Page components
│   │   ├── LoginPage.js
│   │   ├── DashboardPage.js
│   │   ├── PresencesPage.js
│   │   └── SettingsPage.js
│   ├── components/      # Reusable components
│   │   ├── Navbar.js
│   │   ├── Table.js
│   │   └── Charts.js
│   ├── services/        # API calls
│   │   └── api.js
│   ├── redux/           # Redux store
│   │   ├── store.js
│   │   └── slices/
│   ├── styles/          # Global styles
│   │   └── theme.js
│   └── App.jsx          # Root component
├── public/              # Static assets
├── .env.example
├── vite.config.js
├── package.json
└── README.md
```

---

## 🎨 Key Libraries

- **React 18** — UI library
- **Vite** — Fast bundler
- **Material-UI (MUI) 5** — Component library
- **Recharts** — Charts and graphs
- **TanStack Table** — Advanced tables
- **Tailwind CSS** — Styling
- **Redux Toolkit** — State management
- **Axios** — HTTP client

---

## 🏗️ Build for Production

```bash
npm run build
```

Output goes to `dist/`

---

## 🚀 Deployment

Dashboard is deployed automatically to **Netlify** on git push.

See [Deployment Guide](../docs/DEPLOYMENT.md)

---

**Status:** Development 🚧
