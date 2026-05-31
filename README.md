# Badge System 🏪

**Badge System** è una soluzione SaaS multi-tenant per il tracciamento delle presenze nel retail italiano/europeo.

- **QR Code statico** + **Face ID nativo** per check-in semplice
- **Dashboard web** per manager con reporting real-time
- **Mobile app** (iOS/Android) con React Native
- **Zero hardware** — dipendenti usano smartphone personale

---

## 📁 Struttura Progetto (Monorepo)

```
badge-system/
├── backend/              # API Node.js + Express
│   ├── src/
│   ├── tests/
│   ├── .env.example
│   └── package.json
│
├── mobile/               # App React Native
│   ├── src/
│   ├── assets/
│   ├── .env.example
│   └── package.json
│
├── web-dashboard/        # Dashboard React + Vite
│   ├── src/
│   ├── public/
│   ├── .env.example
│   └── package.json
│
├── docs/                 # Documentazione
│   ├── API.md
│   ├── ARCHITECTURE.md
│   └── DEPLOYMENT.md
│
├── .github/
│   └── workflows/        # CI/CD pipelines
│       └── ci.yml
│
├── .gitignore
├── README.md             # Questo file
└── CLAUDE.md             # Project context
```

---

## 🚀 Quick Start

### Backend
```bash
cd backend
npm install
npm run dev
```

### Mobile
```bash
cd mobile
npm install
npm start
```

### Web Dashboard
```bash
cd web-dashboard
npm install
npm run dev
```

---

## 📅 Timeline

- **Sprint 1 (Weeks 1-2):** Foundation — AWS, Docker, Database schema, Backend scaffold
- **Sprint 2 (Weeks 3-4):** Core Features — Auth, Check-in API, Mobile app, Dashboard
- **Sprint 3 (Weeks 5-6):** Polish & Testing — Security, Load testing, Documentation
- **Sprint 4 (Weeks 7-8):** Demo Ready — Deployment, Customer docs

**Target MVP Launch:** September 2026

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Mobile** | React Native |
| **Dashboard** | React 18 + Vite + MUI |
| **Backend** | Node.js 20 + Express.js |
| **Database** | PostgreSQL 14+ (AWS RDS) |
| **Auth** | Auth0 |
| **Hosting** | AWS (EC2 + RDS) |
| **Frontend Hosting** | Netlify |
| **CI/CD** | GitHub Actions |

---

## 📚 Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [API Endpoints](./docs/API.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)

---

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -m "Add feature"`
3. Push to GitHub: `git push origin feature/your-feature`
4. Create a Pull Request

---

## 📝 License

Private project — Dataxiom SRL

---

**Last Updated:** 29 Maggio 2026  
**Status:** Development 🚧
