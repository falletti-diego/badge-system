# Backend API — Badge System

REST API per Badge System, sviluppata con **Node.js 20 + Express.js**.

---

## 🏗️ Architecture

```
Backend (Node.js + Express)
├── Auth (Auth0)
├── Check-in API
├── Reporting & Export
├── Admin Panel
└── Database (PostgreSQL)
```

---

## 🚀 Development Setup

### Prerequisites
- Node.js 20+ LTS
- PostgreSQL 14+
- Auth0 account (development)

### Installation
```bash
npm install
```

### Environment Variables
Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

### Run Development Server
```bash
npm run dev
```

Server runs on `http://localhost:3000`

---

## 📝 Project Structure

```
backend/
├── src/
│   ├── routes/          # API endpoints
│   │   ├── auth.js
│   │   ├── checkin.js
│   │   ├── reporting.js
│   │   └── admin.js
│   ├── middleware/      # Custom middleware
│   │   ├── auth.js      # Auth0 JWT validation
│   │   └── errorHandler.js
│   ├── models/          # Database queries
│   │   ├── Client.js
│   │   ├── Employee.js
│   │   └── CheckIn.js
│   ├── services/        # Business logic
│   │   ├── authService.js
│   │   └── checkinService.js
│   ├── db/              # Database config
│   │   └── connection.js
│   └── app.js           # Express app
├── tests/               # Jest tests
├── .env.example         # Environment variables template
├── package.json
└── README.md
```

---

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/login` — Login with email
- `POST /api/auth/refresh` — Refresh JWT token
- `POST /api/auth/logout` — Logout

### Check-ins
- `POST /api/checkin` — Register check-in (QR + Face ID)
- `GET /api/checkins` — List user's check-ins
- `PUT /api/checkins/:id` — Correct check-in

### Reporting
- `GET /api/presences` — Get presences for site/period
- `GET /api/export/csv` — Export as CSV

### Admin
- `POST /api/admin/clients` — Create client
- `POST /api/admin/sites` — Create site
- `POST /api/admin/employees` — Create employee

---

## 🧪 Testing

Run tests:
```bash
npm test
```

Run with coverage:
```bash
npm run test:coverage
```

---

## 🚢 Deployment

See [Deployment Guide](../docs/DEPLOYMENT.md)

---

**Status:** Development 🚧
