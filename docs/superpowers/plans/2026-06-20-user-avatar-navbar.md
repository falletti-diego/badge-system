# User Avatar + Dropdown Navbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere un avatar con iniziali utente (Soluzione 2 "Anello") in top-right di tutte le navbar, con dropdown che mostra nome/ruolo + "Cambia password" + "Esci", sostituendo il pulsante Logout esistente e creando un componente NavBar condiviso.

**Architecture:** Creiamo un componente `NavBar` condiviso che accetta `title` e `children` (per i bottoni di navigazione specifici di ogni pagina). L'avatar e il dropdown sono interni al NavBar e usano `useAuth()`. Rimuoviamo il codice AppBar duplicato da 6 pagine e lo sostituiamo con `<NavBar>`. ChangePasswordPage acquisisce un parametro opzionale (via router state) per distinguere il flusso volontario da quello forzato.

**Tech Stack:** React 18, MUI 5.x (Avatar, Popover, Box, Typography, MenuItem, Divider, IconButton), useAuth hook, useNavigate, authService

---

## File Map

| File | Azione | Responsabilità |
|------|--------|----------------|
| `src/utils/getInitials.js` | **Crea** | Utility pura: `name → "MR"` |
| `src/utils/__tests__/getInitials.test.js` | **Crea** | Test unitari getInitials |
| `src/components/NavBar.jsx` | **Crea** | Shared navbar: AppBar + avatar + dropdown |
| `src/components/__tests__/NavBar.test.jsx` | **Crea** | Test render + dropdown + logout |
| `src/features/dashboard/pages/DashboardPage.jsx` | **Modifica** | Sostituisce AppBar inline con `<NavBar>` |
| `src/features/planning/pages/PlanningPage.jsx` | **Modifica** | Sostituisce AppBar inline con `<NavBar>` |
| `src/features/planning/pages/EmployeeShiftsPage.jsx` | **Modifica** | Sostituisce AppBar inline con `<NavBar>` (mantiene NotificationBell come children) |
| `src/features/corrections/pages/CorrectionsPage.jsx` | **Modifica** | Sostituisce AppBar inline con `<NavBar>` |
| `src/features/sites/pages/SitesPage.jsx` | **Modifica** | Sostituisce AppBar inline con `<NavBar>` |
| `src/pages/SummaryPage.jsx` | **Modifica** | Sostituisce AppBar inline con `<NavBar>` |
| `src/pages/ChangePasswordPage.jsx` | **Modifica** | Subtitle contestuale (forced vs voluntary) |

---

## Task 1 — Utility `getInitials`

**Files:**
- Crea: `frontend-web/src/utils/getInitials.js`
- Crea: `frontend-web/src/utils/__tests__/getInitials.test.js`

- [ ] **Step 1.1: Scrivi i test**

```js
// frontend-web/src/utils/__tests__/getInitials.test.js
import { describe, it, expect } from 'vitest';
import { getInitials } from '../getInitials';

describe('getInitials', () => {
  it('returns first + last initial for full name', () => {
    expect(getInitials('Maria Rossi')).toBe('MR');
  });

  it('returns single initial for first-name-only', () => {
    expect(getInitials('Diego')).toBe('D');
  });

  it('uses first and last word for multi-word names', () => {
    expect(getInitials('Maria Lucia Rossi')).toBe('MR');
  });

  it('returns ? for empty string', () => {
    expect(getInitials('')).toBe('?');
  });

  it('returns ? for null', () => {
    expect(getInitials(null)).toBe('?');
  });

  it('returns ? for undefined', () => {
    expect(getInitials(undefined)).toBe('?');
  });

  it('uppercases initials', () => {
    expect(getInitials('alice bianchi')).toBe('AB');
  });

  it('trims leading/trailing whitespace', () => {
    expect(getInitials('  Maria Rossi  ')).toBe('MR');
  });
});
```

- [ ] **Step 1.2: Verifica che i test falliscano**

```bash
cd frontend-web && npm run test -- --run src/utils/__tests__/getInitials.test.js 2>&1
```
Atteso: FAIL con "Cannot find module '../getInitials'"

- [ ] **Step 1.3: Implementa la utility**

```js
// frontend-web/src/utils/getInitials.js
/**
 * Returns up to 2 initials from a full name.
 * 'Maria Rossi' → 'MR', 'Maria' → 'M', '' → '?'
 */
export const getInitials = (name) => {
  if (!name || typeof name !== 'string') return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};
```

- [ ] **Step 1.4: Verifica che i test passino**

```bash
cd frontend-web && npm run test -- --run src/utils/__tests__/getInitials.test.js 2>&1
```
Atteso: 8/8 PASS

- [ ] **Step 1.5: Commit**

```bash
git add frontend-web/src/utils/getInitials.js frontend-web/src/utils/__tests__/getInitials.test.js
git commit -m "feat(navbar): add getInitials utility"
```

---

## Task 2 — Componente `NavBar`

**Files:**
- Crea: `frontend-web/src/components/NavBar.jsx`
- Crea: `frontend-web/src/components/__tests__/NavBar.test.jsx`

**Specifiche visive Soluzione 2 "Anello":**
```
Avatar:
  - shape: cerchio 36px
  - bg: transparent
  - border: 2px solid rgba(255,255,255,0.75)
  - text: white, font-weight 600, font-size 13px
  - hover: border opacity 1.0, transform scale(1.05)

Dropdown:
  - width: 240px
  - border-radius: 12px
  - shadow: 0 12px 40px rgba(30,58,95,0.22)
  - Header area: 64px, bg #1E3A5F (navy)
    - avatar grande 40px
    - nome completo bianco
  - Body: bg white
    - ruolo in #64748B
    - Divider
    - 🔑 Cambia password → navigate('/change-password', { state: { voluntary: true } })
    - Divider
    - 🚪 Esci → authService.logout() + navigate('/login')
```

- [ ] **Step 2.1: Scrivi i test**

```jsx
// frontend-web/src/components/__tests__/NavBar.test.jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { NavBar } from '../NavBar';

// Mock useAuth
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { name: 'Maria Rossi', role: 'employee', email: 'maria@torino.it' },
    loading: false,
  }),
}));

// Mock authService
vi.mock('../../services/authService', () => ({
  default: { logout: vi.fn().mockResolvedValue(undefined) },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderNavBar = (props = {}) =>
  render(
    <BrowserRouter>
      <NavBar title="Badge System" {...props} />
    </BrowserRouter>
  );

describe('NavBar', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders title', () => {
    renderNavBar({ title: 'Badge System' });
    expect(screen.getByText('Badge System')).toBeInTheDocument();
  });

  it('renders avatar with initials MR for Maria Rossi', () => {
    renderNavBar();
    expect(screen.getByText('MR')).toBeInTheDocument();
  });

  it('renders children as nav actions', () => {
    renderNavBar({
      title: 'Test',
      children: <button>← Dashboard</button>,
    });
    expect(screen.getByText('← Dashboard')).toBeInTheDocument();
  });

  it('opens dropdown on avatar click', () => {
    renderNavBar();
    fireEvent.click(screen.getByText('MR'));
    expect(screen.getByText('Maria Rossi')).toBeInTheDocument();
    expect(screen.getByText('employee')).toBeInTheDocument();
  });

  it('navigates to /change-password with voluntary state on "Cambia password"', async () => {
    renderNavBar();
    fireEvent.click(screen.getByText('MR'));
    fireEvent.click(screen.getByText(/Cambia password/i));
    expect(mockNavigate).toHaveBeenCalledWith('/change-password', {
      state: { voluntary: true },
    });
  });

  it('calls logout and navigates to /login on "Esci"', async () => {
    const authService = (await import('../../services/authService')).default;
    renderNavBar();
    fireEvent.click(screen.getByText('MR'));
    fireEvent.click(screen.getByText(/Esci/i));
    await waitFor(() => {
      expect(authService.logout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('does not render Logout button (removed from navbar)', () => {
    renderNavBar();
    expect(screen.queryByText('Logout')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2.2: Verifica che i test falliscano**

```bash
cd frontend-web && npm run test -- --run src/components/__tests__/NavBar.test.jsx 2>&1
```
Atteso: FAIL con "Cannot find module '../NavBar'"

- [ ] **Step 2.3: Implementa NavBar**

```jsx
// frontend-web/src/components/NavBar.jsx
import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Box,
  Typography,
  Popover,
  MenuItem,
  Divider,
  IconButton,
  Avatar,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import authService from '../services/authService';
import { getInitials } from '../utils/getInitials';

/**
 * NavBar — shared navbar for all pages.
 *
 * Props:
 *   title    {string}    Page title shown on the left
 *   children {ReactNode} Nav action buttons (optional), rendered in the middle-right
 *
 * Internally handles:
 *   - User avatar (ring style, Solution 2 "Anello")
 *   - Dropdown: full name, role, Cambia password, Esci
 */
export const NavBar = ({ title, children }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [anchorEl, setAnchorEl] = useState(null);

  const initials = getInitials(user?.name);
  const open = Boolean(anchorEl);

  const handleAvatarClick = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleChangePassword = () => {
    handleClose();
    navigate('/change-password', { state: { voluntary: true } });
  };

  const handleLogout = async () => {
    handleClose();
    try {
      await authService.logout();
    } catch (_) { /* ignore */ }
    navigate('/login');
  };

  return (
    <>
      <AppBar position="static" sx={{ backgroundColor: '#1E3A5F' }} className="no-print">
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Left: page title */}
          <Typography
            component="h1"
            sx={{ color: 'white', fontSize: '20px', fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            {title}
          </Typography>

          {/* Middle + Right: children actions + avatar */}
          <Box sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {children}

            {/* Avatar — Solution 2 "Anello" */}
            <IconButton
              onClick={handleAvatarClick}
              size="small"
              aria-label="Apri menu utente"
              sx={{ p: 0 }}
            >
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  bgcolor: 'transparent',
                  border: '2px solid rgba(255,255,255,0.75)',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 600,
                  fontFamily: '"Inter", "DM Sans", sans-serif',
                  letterSpacing: '0.5px',
                  transition: 'border-color 0.15s ease, transform 0.15s ease',
                  '&:hover': {
                    borderColor: 'rgba(255,255,255,1)',
                    transform: 'scale(1.05)',
                  },
                }}
              >
                {initials}
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Dropdown Popover */}
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            width: 240,
            borderRadius: '12px',
            boxShadow: '0 12px 40px rgba(30,58,95,0.22)',
            overflow: 'hidden',
            mt: 0.5,
          },
        }}
      >
        {/* Header: navy strip con avatar + nome */}
        <Box
          sx={{
            backgroundColor: '#1E3A5F',
            height: 72,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
          }}
        >
          <Avatar
            sx={{
              width: 40,
              height: 40,
              bgcolor: 'transparent',
              border: '2px solid rgba(255,255,255,0.75)',
              color: 'white',
              fontSize: '15px',
              fontWeight: 600,
              fontFamily: '"Inter", "DM Sans", sans-serif',
              flexShrink: 0,
            }}
          >
            {initials}
          </Avatar>
          <Box sx={{ overflow: 'hidden' }}>
            <Typography
              sx={{
                color: 'white',
                fontSize: '14px',
                fontWeight: 600,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.name || '—'}
            </Typography>
            <Typography
              sx={{
                color: 'rgba(255,255,255,0.6)',
                fontSize: '11px',
                textTransform: 'capitalize',
              }}
            >
              {user?.email || ''}
            </Typography>
          </Box>
        </Box>

        {/* Body: white */}
        <Box sx={{ backgroundColor: 'white' }}>
          <Box sx={{ px: 2, py: 1 }}>
            <Typography sx={{ fontSize: '11px', color: '#64748B', textTransform: 'capitalize' }}>
              {user?.role || ''}
            </Typography>
          </Box>

          <Divider />

          <MenuItem
            onClick={handleChangePassword}
            sx={{ py: 1.5, fontSize: '14px', color: '#1E3A5F', fontWeight: 500 }}
          >
            🔑&nbsp;&nbsp;Cambia password
          </MenuItem>

          <Divider />

          <MenuItem
            onClick={handleLogout}
            sx={{ py: 1.5, fontSize: '14px', color: '#DC2626', fontWeight: 500 }}
          >
            🚪&nbsp;&nbsp;Esci
          </MenuItem>
        </Box>
      </Popover>
    </>
  );
};
```

- [ ] **Step 2.4: Verifica che i test passino**

```bash
cd frontend-web && npm run test -- --run src/components/__tests__/NavBar.test.jsx 2>&1
```
Atteso: 7/7 PASS

- [ ] **Step 2.5: Commit**

```bash
git add frontend-web/src/components/NavBar.jsx frontend-web/src/components/__tests__/NavBar.test.jsx
git commit -m "feat(navbar): add shared NavBar with avatar ring + dropdown (Solution 2)"
```

---

## Task 3 — Migra DashboardPage

**Files:**
- Modifica: `frontend-web/src/features/dashboard/pages/DashboardPage.jsx`

DashboardPage ha il navbar più complesso (molti bottoni role-based). Tutti i bottoni di navigazione diventano `children` di `<NavBar>`. Il pulsante Logout viene rimosso.

- [ ] **Step 3.1: Aggiorna imports**

In `DashboardPage.jsx`, sostituisci:
```jsx
import { Container, Box, Alert, AppBar, Toolbar, Button } from '@mui/material';
```
con:
```jsx
import { Container, Box, Alert, Button } from '@mui/material';
import { NavBar } from '../../../components/NavBar';
```

- [ ] **Step 3.2: Rimuovi `handleLogout` e sostituisci il blocco AppBar**

Rimuovi la funzione `handleLogout` (ora gestita internamente da NavBar).

Trova e sostituisci l'intero blocco `<AppBar>...</AppBar>` con:

```jsx
<NavBar title="Badge System">
  {(userRole === 'manager' || userRole === 'admin') && (
    <Button color="inherit" onClick={() => navigate('/planning')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
      📅 Planning
    </Button>
  )}
  {(userRole === 'manager' || userRole === 'admin') && (
    <Button color="inherit" onClick={() => navigate('/corrections')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
      ✏️ Correzioni
    </Button>
  )}
  {userRole === 'manager' && (
    <Button color="inherit" onClick={() => navigate('/leave/my-request')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
      📋 Le Mie Ferie
    </Button>
  )}
  {userRole === 'manager' && (
    <Button color="inherit" onClick={() => navigate('/illnesses/manager-report')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
      🏥 Malattia
    </Button>
  )}
  {userRole === 'admin' && (
    <Button color="inherit" onClick={() => navigate('/admin/sites')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
      🏪 Sedi & QR
    </Button>
  )}
  {userRole === 'admin' && (
    <Button color="inherit" onClick={() => navigate('/admin')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
      ⚙️ Admin
    </Button>
  )}
  {userRole === 'admin' && (
    <Button color="inherit" onClick={() => navigate('/admin/leave')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
      📋 Ferie Admin
    </Button>
  )}
  {(userRole === 'admin' || userRole === 'manager' || userRole === 'viewer') && (
    <Button color="inherit" onClick={() => navigate('/summary')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
      📊 Riepilogo
    </Button>
  )}
  {userRole === 'employee' && (
    <Button color="inherit" onClick={() => navigate('/planning/my-schedule')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
      📆 I Miei Turni
    </Button>
  )}
  {userRole === 'employee' && (
    <Button color="inherit" onClick={() => navigate('/leave/request')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
      📋 Ferie
    </Button>
  )}
  {userRole === 'employee' && (
    <Button color="inherit" onClick={() => navigate('/illnesses/report')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
      🏥 Malattia
    </Button>
  )}
  {userRole === 'admin' && (
    <Button color="inherit" onClick={() => navigate('/admin/illnesses')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
      🏥 Malattie
    </Button>
  )}
</NavBar>
```

- [ ] **Step 3.3: Build check**

```bash
cd frontend-web && npm run build 2>&1 | tail -5
```
Atteso: `✓ built in X.XXs` senza errori

- [ ] **Step 3.4: Commit**

```bash
git add frontend-web/src/features/dashboard/pages/DashboardPage.jsx
git commit -m "refactor(dashboard): migrate to shared NavBar"
```

---

## Task 4 — Migra PlanningPage

**Files:**
- Modifica: `frontend-web/src/features/planning/pages/PlanningPage.jsx`

PlanningPage ha `className="no-print"` sull'AppBar — il NavBar include già `className="no-print"`.

- [ ] **Step 4.1: Aggiorna imports**

Sostituisci in `PlanningPage.jsx`:
```jsx
import {
  ..., AppBar, Toolbar, Button, ...
} from '@mui/material';
```
Rimuovi `AppBar` e `Toolbar` dall'import MUI. Aggiungi:
```jsx
import { NavBar } from '../../../components/NavBar';
```

- [ ] **Step 4.2: Sostituisci il blocco AppBar**

Trova (circa riga 362):
```jsx
<AppBar position="static" sx={{ backgroundColor: '#1E3A5F' }} className="no-print">
  <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <h1 style={{ color: 'white', fontSize: '20px', fontWeight: 600 }}>📅 Planning Turni</h1>
    <Box sx={{ display: 'flex', gap: '12px' }}>
      <Button color="inherit" onClick={() => navigate('/dashboard')} sx={{ textTransform: 'none', fontSize: '14px' }}>
        ← Dashboard
      </Button>
      <Button color="inherit" onClick={async () => {
        try { await authService.logout(); } catch (e) { console.error('Logout error:', e); }
        navigate('/login');
      }} sx={{ textTransform: 'none', fontSize: '14px' }}>
        Logout
      </Button>
    </Box>
  </Toolbar>
</AppBar>
```

Sostituisci con:
```jsx
<NavBar title="📅 Planning Turni">
  <Button color="inherit" onClick={() => navigate('/dashboard')} sx={{ textTransform: 'none', fontSize: '14px' }}>
    ← Dashboard
  </Button>
</NavBar>
```

- [ ] **Step 4.3: Rimuovi import di `authService`** se non è più usato altrove nella pagina (cerca altri usi di `authService` nel file prima di rimuoverlo).

- [ ] **Step 4.4: Build check**

```bash
cd frontend-web && npm run build 2>&1 | tail -5
```
Atteso: `✓ built in X.XXs`

- [ ] **Step 4.5: Commit**

```bash
git add frontend-web/src/features/planning/pages/PlanningPage.jsx
git commit -m "refactor(planning): migrate to shared NavBar"
```

---

## Task 5 — Migra EmployeeShiftsPage

**Files:**
- Modifica: `frontend-web/src/features/planning/pages/EmployeeShiftsPage.jsx`

Questa pagina ha anche la `NotificationBell` nella navbar — va preservata come children di NavBar.

- [ ] **Step 5.1: Aggiorna imports**

Rimuovi `AppBar`, `Toolbar` dagli import MUI. Aggiungi:
```jsx
import { NavBar } from '../../../components/NavBar';
```

- [ ] **Step 5.2: Sostituisci il blocco AppBar**

Trova (circa riga 131):
```jsx
<AppBar position="static" sx={{ backgroundColor: '#1E3A5F' }}>
  <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
    <h1 style={{ color: 'white', fontSize: '20px', fontWeight: 600 }}>📆 I Miei Turni</h1>
    <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <NotificationBell enabled={true} />
      <Button color="inherit" onClick={() => navigate('/dashboard')} sx={{ textTransform: 'none', fontSize: '14px' }}>
        ← Dashboard
      </Button>
      <Button color="inherit" onClick={handleLogout} sx={{ textTransform: 'none', fontSize: '14px' }}>
        Logout
      </Button>
    </Box>
  </Toolbar>
</AppBar>
```

Sostituisci con:
```jsx
<NavBar title="📆 I Miei Turni">
  <NotificationBell enabled={true} />
  <Button color="inherit" onClick={() => navigate('/dashboard')} sx={{ textTransform: 'none', fontSize: '14px' }}>
    ← Dashboard
  </Button>
</NavBar>
```

- [ ] **Step 5.3: Rimuovi `handleLogout`** (funzione che chiama `authService.logout()` + navigate).

- [ ] **Step 5.4: Build check**

```bash
cd frontend-web && npm run build 2>&1 | tail -5
```

- [ ] **Step 5.5: Commit**

```bash
git add frontend-web/src/features/planning/pages/EmployeeShiftsPage.jsx
git commit -m "refactor(employee-shifts): migrate to shared NavBar"
```

---

## Task 6 — Migra CorrectionsPage, SitesPage, SummaryPage

**Files:**
- Modifica: `frontend-web/src/features/corrections/pages/CorrectionsPage.jsx`
- Modifica: `frontend-web/src/features/sites/pages/SitesPage.jsx`
- Modifica: `frontend-web/src/pages/SummaryPage.jsx`

Tutte e tre seguono lo stesso pattern: titolo a sinistra + "← Dashboard" + "Logout". Stesso refactor in sequenza.

- [ ] **Step 6.1: CorrectionsPage**

Rimuovi `AppBar`, `Toolbar` da MUI imports. Aggiungi `import { NavBar } from '../../../components/NavBar';`

Sostituisci il blocco AppBar con:
```jsx
<NavBar title="✏️ Correzioni">
  <Button color="inherit" onClick={() => navigate('/dashboard')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
    ← Dashboard
  </Button>
</NavBar>
```
Rimuovi `handleLogout`.

- [ ] **Step 6.2: SitesPage**

Rimuovi `AppBar`, `Toolbar` da MUI imports. Aggiungi `import { NavBar } from '../../../components/NavBar';`

Sostituisci il blocco AppBar con:
```jsx
<NavBar title="🏪 Sedi & QR Code">
  <Button color="inherit" onClick={() => navigate('/dashboard')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
    ← Dashboard
  </Button>
</NavBar>
```
Rimuovi `handleLogout`.

- [ ] **Step 6.3: SummaryPage**

Rimuovi `AppBar`, `Toolbar` da MUI imports. Aggiungi `import { NavBar } from '../../components/NavBar';` (path diverso — SummaryPage è in `src/pages/`).

SummaryPage ha una navbar con bottoni role-based (simile a DashboardPage). Guarda i bottoni esistenti e passali come children:
```jsx
<NavBar title="Badge System">
  <Button color="inherit" onClick={() => navigate('/dashboard')} sx={{ textTransform: 'none', fontSize: '14px', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
    ← Dashboard
  </Button>
  {/* includi eventuali altri bottoni role-based già presenti */}
</NavBar>
```
Rimuovi `handleLogout` / inline logout.

- [ ] **Step 6.4: Build check**

```bash
cd frontend-web && npm run build 2>&1 | tail -5
```
Atteso: `✓ built in X.XXs` senza errori

- [ ] **Step 6.5: Commit**

```bash
git add frontend-web/src/features/corrections/pages/CorrectionsPage.jsx \
        frontend-web/src/features/sites/pages/SitesPage.jsx \
        frontend-web/src/pages/SummaryPage.jsx
git commit -m "refactor(pages): migrate CorrectionsPage, SitesPage, SummaryPage to shared NavBar"
```

---

## Task 7 — ChangePasswordPage: supporto flusso volontario

**Files:**
- Modifica: `frontend-web/src/pages/ChangePasswordPage.jsx`

La pagina usa il router state `{ voluntary: true }` per distinguere il contesto. Il flusso (validazione, chiamata API, logout + redirect /login) rimane identico — cambia solo il testo del subtitle.

- [ ] **Step 7.1: Aggiungi `useLocation` e leggi `state.voluntary`**

In `ChangePasswordPage.jsx`, aggiungi l'import:
```jsx
import { useNavigate, useLocation } from 'react-router-dom';
```

All'interno del componente, aggiungi subito dopo `const navigate = useNavigate();`:
```jsx
const location = useLocation();
const isVoluntary = location.state?.voluntary === true;
```

- [ ] **Step 7.2: Aggiorna title e subtitle**

Trova il blocco Typography title e subtitle:
```jsx
<Typography variant="h4" component="h1" sx={{ mb: 1, fontWeight: 'bold', textAlign: 'center', color: '#1a237e' }}>
  Change Password
</Typography>

<Typography variant="body2" sx={{ mb: 3, textAlign: 'center', color: '#666' }}>
  For security reasons, you must change your password before you can continue.
</Typography>
```

Sostituisci con:
```jsx
<Typography variant="h4" component="h1" sx={{ mb: 1, fontWeight: 'bold', textAlign: 'center', color: '#1a237e' }}>
  {isVoluntary ? 'Cambia password' : 'Cambio password obbligatorio'}
</Typography>

<Typography variant="body2" sx={{ mb: 3, textAlign: 'center', color: '#666' }}>
  {isVoluntary
    ? 'Inserisci la password attuale e scegli una nuova password.'
    : 'Per motivi di sicurezza, devi cambiare la password prima di continuare.'}
</Typography>
```

- [ ] **Step 7.3: Aggiorna messaggio di successo**

Trova:
```jsx
setApiSuccess('Password changed successfully! Please log in with your new password.');
```

Sostituisci con:
```jsx
setApiSuccess('Password cambiata. Effettua di nuovo l\'accesso con la nuova password.');
```

- [ ] **Step 7.4: Build check**

```bash
cd frontend-web && npm run build 2>&1 | tail -5
```

- [ ] **Step 7.5: Commit**

```bash
git add frontend-web/src/pages/ChangePasswordPage.jsx
git commit -m "feat(change-password): support voluntary flow with context-aware subtitle"
```

---

## Task 8 — Test suite finale + push

- [ ] **Step 8.1: Esegui tutta la suite frontend**

```bash
cd frontend-web && npm run test -- --run 2>&1 | tail -20
```
Atteso: tutti i test esistenti verdi + i nuovi test NavBar (7) + getInitials (8) passati.

- [ ] **Step 8.2: Esegui build finale**

```bash
cd frontend-web && npm run build 2>&1 | tail -5
```
Atteso: `✓ built in X.XXs` senza errori o warning nuovi.

- [ ] **Step 8.3: Push**

```bash
git push origin main
```
CI GitHub Actions avvia build ECR + deploy EC2 automaticamente. Attendi ~3 minuti poi verifica su https://badge.dataxiom.it.

---

## Self-Review

**Spec coverage:**
- ✅ Avatar cerchio con iniziali (soluzione 2 "Anello") → Task 2
- ✅ Top-right su tutte le pagine → Task 2 (NavBar), Task 3-6 (migrazione)
- ✅ Dropdown con nome, ruolo, Cambia password, Esci → Task 2
- ✅ Logout rimosso dalla navbar → Task 3-6 (non più nei children)
- ✅ Navigate('/change-password', { state: { voluntary: true } }) → Task 2 + Task 7
- ✅ Logout automatico dopo cambio password → ChangePasswordPage non toccato in quel flusso (già presente)
- ✅ Initials utility testata → Task 1
- ✅ NotificationBell preservata come children → Task 5

**Placeholder scan:** nessun TBD, TODO, o "implement later".

**Type consistency:** `getInitials(name: string | null | undefined): string` usata in NavBar.jsx Task 2 — firma coerente con i test Task 1.
