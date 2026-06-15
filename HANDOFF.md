# Badge System — S.32.8 Split Monoliti Handoff

**Date:** 2026-06-15  
**Features:** S.32.8 ✅ | Task 11 Phase 3 🟡  
**Status:** ✅ **S.32.8 COMPLETE** — AdminPage.jsx 1455→50 righe, admin.js 959→241 righe | 🟡 **Task 11.13 rimasto (role-based visibility manual test)**  
**Recent Work:** Session 39 — S.32.8 split file monolitici frontend + backend, 4 code review findings fixati  
**Commits:** `4304966`→`e0f9c91` (frontend tabs), `794ba3a` (backend sub-router)

---

## Goals

1. **S.32.8: Split file monolitici** — AdminPage.jsx + admin.js suddivisi in componenti focalizzati
   - **STATUS:** ✅ **COMPLETE** — Zero regressioni test

2. **Task 11.13: Role-based visibility test** — Verifica manuale RBAC su localhost
   - **STATUS:** 🟡 **1 test rimasto** — Employee/Manager/Admin/Viewer visibility

3. **S.32.9: GPS spoofing mitigations** — Prossimo step post Task 11
   - **STATUS:** 🔵 **NOT STARTED** — Sforzo stimato 3-4h

---

## S.32.8 — COMPLETE (Session 39)

### Frontend (Commits 4304966 → e0f9c91)

**Struttura creata:**
```
frontend-web/src/features/admin/
├── pages/AdminPage.jsx          ← 50 righe (thin shell, era 1455)
├── components/
│   ├── useFetch.js              ← hook condiviso (useState+useEffect+AbortController)
│   ├── ConfirmDeleteDialog.jsx  ← dialog riutilizzabile
│   ├── ConfirmSaveDialog.jsx    ← dialog riutilizzabile
│   ├── CopyButton.jsx           ← clipboard copy con tooltip
│   └── ResetPasswordDialog.jsx  ← mostra temp password + copia
└── tabs/
    ├── ConsentTab.jsx           ← 156 righe
    ├── ClientsTab.jsx           ← 144 righe
    ├── SitesTab.jsx             ← 345 righe (include GeofenceDialog privato)
    ├── EmployeesTab.jsx         ← 325 righe
    ├── ViewersTab.jsx           ← 185 righe
    └── SettingsTab.jsx          ← 148 righe
```

**4 Code Review Findings fixati:**
1. `EmployeeIllnessReport.jsx` — migrata da `apiClient.post` diretto a `useIllness()` hook
2. `EmployeeIllnessReport.jsx` — `disabled={loading}` aggiunto al bottone Dashboard
3. `EmployeeLeaveRequest.jsx` — `disabled={loading}` aggiunto al bottone Dashboard
4. `ManagerLeaveRequest.jsx` — `disabled={loading}` aggiunto al bottone Dashboard

### Backend (Commit 794ba3a)

**Struttura creata:**
```
backend/src/routes/admin/
├── clients.js    ← POST/GET/DELETE /clients (95 righe)
├── sites.js      ← POST/GET/DELETE/PUT /sites (146 righe)
├── employees.js  ← POST/GET/DELETE + /import + /reset-password (341 righe)
├── viewers.js    ← POST/GET /viewers (88 righe)
└── settings.js   ← PUT /settings (59 righe)

backend/src/routes/admin.js  ← thin assembler (241 righe, era 959)
  - Mantiene: requireAuth, debug route, admin-only middleware, DPA routes inline
  - Monta: clientsRouter, sitesRouter, employeesRouter, viewersRouter, settingsRouter
```

**Decisioni architetturali:**
- DPA routes (`/dpa-acknowledgement`, `/dpa-acknowledgements`) restano inline in `admin.js` — path con trattino non montabile come sub-router prefix
- `/import` registrato PRIMA di `/:id` in `employees.js` — evita che Express faccia match di "import" come UUID
- `generateTempPassword()` duplicata in `employees.js` e `viewers.js` (YAGNI — 5 righe, non vale un utils)

**Test aggiornato:**
- `__tests__/s326-csv-temp-password.test.js` — percorso aggiornato da `admin.js` a `admin/employees.js` (8/8 ✅)
- Zero nuove regressioni: stesso set di PASS/FAIL pre e post refactor

---

## Task 11.13 — Prossimo Step

**Obiettivo:** Verifica manuale role-based visibility su `localhost:5173`

**Setup:**
```bash
# Backend
cd backend && npm run dev  # DISABLE_AUTH=true in .env.development

# Frontend
cd frontend-web && npm run dev
```

**Test da eseguire (4 scenari):**

| Account | URL | Expected |
|---------|-----|----------|
| `maria@badge.local` / `Maria1975` | `/leave/request` | Vede SOLO le proprie richieste |
| `pino@badge.local` / `Pino1975` | `/manager/leaves` | Vede SOLO richieste sede Milano |
| `pippo@badge.local` / `pippo01` | `/admin/leaves` | Vede TUTTE le richieste |
| `viewer@badge.local` / `Viewer1975` | `/leave/request` | 403 accesso negato |

**Criterio Done:** Nessun dato cross-tenant visibile, tutti e 4 gli scenari confermati.

---

## Prossimi Step (in ordine)

1. **Task 11.13** — 20 min — verifica manuale RBAC leave/malattia
2. **Aggiornare TASKS.md** — marcare Task 11 ✅ COMPLETE
3. **S.32.9** — 3-4h — GPS spoofing mitigations (mobile `isFromMockProvider` + server velocity check)
4. **Deploy produzione** — post S.32.9 sistema è sicuro per prima demo cliente

---

## File Chiave Modificati Questa Sessione

| File | Modifica |
|------|---------|
| `frontend-web/src/features/admin/pages/AdminPage.jsx` | 1455→50 righe (thin shell) |
| `frontend-web/src/features/admin/tabs/*.jsx` | 6 nuovi file (tab components) |
| `frontend-web/src/features/admin/components/*.jsx` | 5 nuovi file (shared components) |
| `frontend-web/src/features/illness/pages/EmployeeIllnessReport.jsx` | useIllness hook + disabled={loading} |
| `frontend-web/src/features/leave/pages/EmployeeLeaveRequest.jsx` | disabled={loading} |
| `frontend-web/src/features/leave/pages/ManagerLeaveRequest.jsx` | disabled={loading} |
| `backend/src/routes/admin.js` | 959→241 righe (thin assembler) |
| `backend/src/routes/admin/*.js` | 5 nuovi sub-router |
| `backend/__tests__/s326-csv-temp-password.test.js` | percorso CSV import aggiornato |
