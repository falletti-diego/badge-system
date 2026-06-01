# Badge System — Web Dashboard

**Componente:** React + Vite dashboard  
**Target Users:** Manager, HR (reporting & corrections)  
**Hosting:** Netlify (auto-deploy)  
**Status:** Development Ready

---

## 📋 Quick Description

Web dashboard per manager e HR per visualizzare presenze, esportare dati, e correggere check-in.

**Architecture:** React 18 + Redux Toolkit + Feature-Based Organization

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ LTS
- npm or yarn

### Setup (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Setup environment variables
cp .env.example .env
# Edit .env:
# VITE_API_URL=http://localhost:3000
# VITE_AUTH0_DOMAIN=your-domain.auth0.com
# VITE_AUTH0_CLIENT_ID=your_client_id

# 3. Start development server
npm run dev
# Dashboard will be on http://localhost:5173
```

---

## 📂 Project Structure (Feature-Based)

```
src/
├── components/          # Shared UI components (reusable across features)
│   ├── Button.jsx
│   ├── Table.jsx
│   ├── Card.jsx
│   ├── Layout.jsx
│   ├── Navbar.jsx
│   └── Modal.jsx
│
├── hooks/               # Custom React hooks
│   ├── useAuth.js       # Auth state & operations
│   ├── usePresences.js  # Fetch & cache presences
│   ├── useFetch.js      # Generic API hook
│   └── usePermissions.js # Role-based access
│
├── services/            # API calls & utilities
│   ├── apiClient.js     # Axios configured instance
│   ├── authService.js   # Auth API calls
│   ├── presenceService.js # Presence endpoints
│   ├── correctionService.js # Correction endpoints
│   └── exportService.js # CSV export
│
├── store/               # Redux state management
│   ├── store.js         # Redux store config
│   ├── selectors.js     # Reusable selectors
│   └── slices/
│       ├── authSlice.js     # Auth state (user, token)
│       ├── presenceSlice.js # Presences list
│       └── uiSlice.js       # UI state (modals, filters)
│
├── styles/              # Global CSS & Tailwind
│   ├── globals.css      # Global styles
│   └── theme.js         # Tailwind customization
│
├── lib/                 # 3rd party utilities
│   ├── axios.js         # Axios instance
│   ├── constants.js     # App constants
│   └── validators.js    # Form validation schemas
│
├── features/            # Feature modules (grouped by business domain)
│   │
│   ├── auth/            # LOGIN FEATURE
│   │   ├── pages/
│   │   │   └── LoginPage.jsx        # Full login page
│   │   ├── components/
│   │   │   ├── LoginForm.jsx        # Email + password form
│   │   │   └── ForgotPasswordForm.jsx
│   │   └── auth.routes.js           # Route definitions
│   │
│   ├── dashboard/       # DASHBOARD FEATURE (main view)
│   │   ├── pages/
│   │   │   └── DashboardPage.jsx    # Dashboard home
│   │   ├── components/
│   │   │   ├── PresenceTable.jsx    # Main presences table
│   │   │   ├── FilterBar.jsx        # Date, site, employee filters
│   │   │   ├── StatsCard.jsx        # Summary cards (today's check-ins, etc)
│   │   │   └── PresenceRow.jsx      # Table row component
│   │   └── dashboard.routes.js
│   │
│   ├── corrections/     # CORRECTIONS FEATURE
│   │   ├── pages/
│   │   │   └── CorrectionsPage.jsx  # Corrections view
│   │   ├── components/
│   │   │   ├── CorrectForm.jsx      # Edit check-in form
│   │   │   ├── ApprovalModal.jsx    # Confirm corrections
│   │   │   └── HistoryTimeline.jsx  # Change history
│   │   └── corrections.routes.js
│   │
│   └── export/          # EXPORT FEATURE
│       ├── components/
│       │   ├── ExportButton.jsx     # CSV export button
│       │   └── ExportModal.jsx      # Download options
│       └── export.routes.js
│
├── App.jsx              # Main app component
├── index.jsx            # React entry point
└── main.jsx             # Vite entry point

public/                  # Static assets
│   ├── favicon.ico
│   ├── logo.png
│   └── manifest.json
```

---

## 🎨 UI/UX Pages

### 1. **Login Page** (`/login`)
- Email + password form
- Remember me checkbox
- Forgot password link
- Redirect to dashboard on success

### 2. **Dashboard Home** (`/dashboard`)
- Real-time presences table
- Filters: date, site, employee
- Stats cards: today's check-ins, pending corrections
- Export CSV button

### 3. **Corrections** (`/corrections`)
- List pending corrections
- Edit check-in time
- Approve/reject changes
- Audit trail of all changes

### 4. **Export** (modal in dashboard)
- Select date range
- Select site (if multi-site)
- Download CSV

---

## 🔌 API Integration

### useAuth Hook
```javascript
const { user, login, logout, isLoading } = useAuth();
```

### usePresences Hook
```javascript
const { presences, filters, setFilters, export } = usePresences();
```

### Complete API flow:
1. User logs in → AuthService.login() → JWT token stored
2. Dashboard loads → PresenceService.getPresences() → Redux store updated
3. Filter applied → PresenceService.getPresences(filters) → Table updates
4. Export clicked → ExportService.generateCSV() → File downloaded

---

## 🧪 Testing

### Run tests
```bash
npm run test
```

### Run with coverage
```bash
npm run test:coverage
```

### Run specific test
```bash
npm run test -- PresenceTable.test.jsx
```

**Testing Stack:** Vitest + React Testing Library

---

## 📦 Build & Deploy

### Build for production
```bash
npm run build
# Output: dist/ folder ready for deployment
```

### Preview production build locally
```bash
npm run preview
```

### Deploy to Netlify
```bash
# Automatic: Git push → GitHub → Netlify auto-deploys
git push origin main

# Or manual:
npm run build
netlify deploy --prod --dir=dist
```

---

## 📦 Environment Variables

```bash
# API
VITE_API_URL=http://localhost:3000
VITE_API_TIMEOUT=30000

# Auth0
VITE_AUTH0_DOMAIN=your-domain.auth0.com
VITE_AUTH0_CLIENT_ID=your_client_id
VITE_AUTH0_REDIRECT_URI=http://localhost:5173/dashboard

# App
VITE_APP_NAME=Badge System
VITE_LOG_LEVEL=debug
```

See `.env.example`.

---

## 🎨 Styling

### Tailwind CSS
- Utility-first CSS framework
- Global styles: `src/styles/globals.css`
- Custom theme: `src/styles/theme.js`

### Material-UI (MUI) Components
- Pre-built components: Button, Modal, Table, etc.
- Docs: https://mui.com

### Component Example
```jsx
import { Button, Card } from '@mui/material';

export function PresenceCard({ presence }) {
  return (
    <Card className="p-4 rounded-lg shadow-md">
      <h3 className="text-lg font-bold">{presence.employee}</h3>
      <p className="text-gray-600">{presence.timestamp}</p>
      <Button variant="contained">Correggi</Button>
    </Card>
  );
}
```

---

## 🔐 Security

- ✅ **Auth0 integration:** Secure login, token management
- ✅ **JWT validation:** All API calls include Bearer token
- ✅ **HTTPS enforced** in production
- ✅ **XSS protection:** React auto-escapes content
- ✅ **CSRF protection:** Auth0 manages CSRF tokens
- ✅ **Sensitive data:** Tokens stored in memory (not localStorage)

---

## 📚 Dependencies

Key packages:
- **react** (18+) — UI framework
- **react-redux** — State management
- **@reduxjs/toolkit** — Redux utilities
- **axios** — HTTP client
- **@auth0/auth0-react** — Auth0 integration
- **@mui/material** — UI components
- **recharts** — Charts & graphs
- **tailwindcss** — Utility CSS
- **zod** — Form validation
- **react-router-dom** — Routing

---

## 🤝 Contributing

### Code Style
- ESLint + Prettier (auto-format)
- camelCase for variables, PascalCase for components

### Component Example
```jsx
function PresenceTable({ presences, onFilter }) {
  const [sortBy, setSortBy] = useState('timestamp');
  
  return (
    <div className="presences-table">
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Check-in</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {presences.map(p => (
            <tr key={p.id}>
              <td>{p.employee}</td>
              <td>{p.timestamp}</td>
              <td><Button>Correggi</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PresenceTable;
```

---

## 🐛 Troubleshooting

### API connection refused
```bash
# Check if backend is running on port 3000
curl http://localhost:3000/api/health

# If not, start backend:
cd ../backend && npm run dev
```

### Auth0 login fails
```bash
# Verify .env AUTH0 settings
cat .env | grep AUTH0

# Check Auth0 dashboard for correct client credentials
```

### Build fails
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## 📞 Support

**Questions?** Check:
1. `.env.example` for required variables
2. `/docs/DEPLOYMENT.md`
3. GitHub Issues

---

**Last Updated:** 28 Maggio 2026  
**Created By:** Claude Code  
**Status:** Development Ready ✅
