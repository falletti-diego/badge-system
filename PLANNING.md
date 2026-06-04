# Planning Page — Architecture & Design Document

**Date:** 4 Giugno 2026 (Updated)  
**Component:** Planning (Shift Management Dashboard)  
**Status:** ✅ **FRONTEND IMPLEMENTED & PRODUCTION READY** | Backend API (Phase 2)

---

## 📋 Executive Summary

**Planning** è una pagina di gestione turni per manager di store. Permette di visualizzare e pianificare turni di venditori usando tre viste (Giornaliera, Settimanale, Mensile) con un sistema semplificato di 4 tipi di turno (M/P/S/R).

**Key Design Decisions (MVP):**
- ✅ **Monthly View** (matrice semplice: dipendenti × giorni del mese)
- ✅ 4 template di turno fissi (m=Mattina, p=Pomeriggio, s=Sera, R=Riposo, —=Vuoto)
- ✅ Editable cells: inline dropdown per turno selection
- ✅ No modal dialogs (simpler UX for MVP)
- ✅ Real-time counters: Turni assegnati per dipendente (N/30)
- ✅ Save/Reset/Export CSV functionality
- ✅ Responsive: Desktop + mobile-friendly
- ⏸️ Phase 2: 3 viste (Giorno, Settimana, Mese), Copy Week, Double Shift Warning

---

## 🎉 IMPLEMENTATION SUMMARY (Commit 33a7a72)

**What was built (2026-06-04):**

### ✅ Frontend Complete (Production Ready)

**PlanningPage.jsx** (Manager View)
- Editable shift matrix: dipendenti (rows) × giorni del mese (columns)
- Dropdown per cell: [m, p, s, R, —] con colori per shift type
- Real-time KPI cards: Dipendenti, Turni Assegnati (X/Y), Giorni del Mese
- Per-employee counter: N/30 format with green badge when complete
- Change detection: Red badges on modified cells
- Save button: Appears only when changes exist, counts modified cells
- Reset button: Discards unsaved changes, returns to lastSavedShifts
- CSV export: Dynamic filename (planning_giugno_2026.csv)
- Month/Year selector: Switch between months, auto-regenerates data
- Navigation: Back to Dashboard + Logout buttons

**EmployeeShiftsPage.jsx** (Employee View)
- Read-only schedule: Employee sees only own assigned shifts
- Month/Year selector: View shifts for any month
- KPI cards: Turni Assegnati (N/30), Giorni Liberi
- Shifts list: Date + Turno badge with color-coding
- Empty state: "Nessun turno assegnato per {month}"
- Legend: Shift types with colors

### ✅ All 8 Code Review Findings Fixed

| Finding | Root Cause | Fix | Impact |
|---------|-----------|-----|--------|
| Date format bug | Month not padded (Nov-Dec) | `padStart(2, '0')` | Date parsing works all year |
| Shallow copy trap | Shared reference in mock data | `structuredClone()` | Safe state mutations |
| useShifts static | Data generated only once | Added useEffect `[month, year]` | Month switch works |
| ProtectedRoute bypass | No user validation | Added `!user` check | Auth is fail-closed |
| EmployeeShiftsPage static | Hardcoded June data | useEffect respects month/year | Dynamic employee schedule |
| useShiftUpdate unclear | No migration path docs | Added Phase 2 guide comments | Backend integration ready |
| CSV filename static | Hardcoded filename | Use selected month/year | Export naming works |
| Change detection missed removals | Only checked value changes | Check key additions/removals | Empty shifts detected |

### 📊 State Management Pattern (Correct)

```javascript
// Deep copy prevents reference sharing
const deepCopy = structuredClone(data.shifts_data);
setShifts(deepCopy);
setLastSavedShifts(deepCopy);

// Change detection: includes key additions/removals
const isShiftChanged = (empId, date) => {
  const saved = lastSavedShifts?.[empId]?.[date];
  const current = shifts?.[empId]?.[date];
  if ((saved === undefined) !== (current === undefined)) return true;
  return saved !== current;
};

// Count changes by iterating all days (not just existing keys)
const changedCount = (() => {
  let count = 0;
  Object.keys(shifts || {}).forEach(empId => {
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (isShiftChanged(empId, dateStr)) count++;
    }
  });
  return count;
})();
```

### 🧪 Manual Testing Results

✅ **Manager (Diego@Torino):**
- Edit matrix, change dropdown for any cell
- Red badges appear on changes, disappear on save
- Count updates correctly as shifts change
- Month selector switches between months
- Save/Reset buttons work as expected
- Empty shifts (— Vuoto) remove from counters
- CSV export with dynamic filename

✅ **Employee (Luca Verdi):**
- View own schedule (read-only)
- Month selector works
- KPI cards show correct counts
- Empty months show empty state

✅ **Navigation:**
- Dashboard ↔ Planning ↔ Login working
- Back buttons work
- Logout works

---

### 🚀 Next Phase: Backend API (Phase 2)

**Currently:** Shifts saved to **local state only** (refresh = data lost)

**Todo:**
1. Create `shifts` table in PostgreSQL (JSONB shifts_data)
2. API endpoints:
   - `GET /api/shifts/:siteId?month=6&year=2026` — Load shifts
   - `POST /api/shifts/:siteId` — Save shifts
   - `GET /api/shifts/my-schedule` — Employee view
3. Replace mock data with real API calls
4. Deploy to EC2 + test

**Time estimate:** 7-8 hours (backend) + 2-3 hours (hook updates)

**Ready for:** Docker rebuild + RDS migration

---

## 🎯 User Story

**Persona:** Marco (Manager Store)  
**Goal:** Pianificare turni settimanali per 5 dipendenti della sua store  
**Context:** Lunedì mattina, planning per la settimana prossima

**Scenario Primario:**
1. Marco apre Planning page
2. Naviga a "Settimana prossima" (Lun 3 — Dom 9 Giugno)
3. Vede tabella: 5 dipendenti × 7 giorni
4. Clicca su cella vuota (es: Marco Rossi, Martedì) → modal
5. Seleziona "Mattina (M)" → turno salvato nella cella
6. Ripete per altri giorni
7. Al termine: clicca "Copia Settimana" → copia planning alle 4 settimane successive
8. Done! Pianificazione completa per il mese

**Scenario Secondario (Giornaliero):**
1. Marco vuole vedere il dettaglio di **oggi** (orari esatti, blocchi visivi)
2. Clicca tab "GIORNO"
3. Vede griglia oraria (08:00-23:00) con dipendenti in colonne
4. Ogni turno è un blocco colorato con durata proporzionale (M=5h, P=8h, S=5h)

---

## 🏗️ Architecture Overview

### Tipi di Turno (Fixed Templates)

```
┌─────────┬──────────────────┬───────────┐
│ Symbol  │ Name (IT)        │ Hours     │
├─────────┼──────────────────┼───────────┤
│    M    │ Mattino          │ 08:00-13:00 (5h) │
│    P    │ Pomeriggio       │ 13:00-21:00 (8h) │
│    S    │ Sera             │ 18:00-23:00 (5h) │
│    R    │ Riposo           │ N/A       │
└─────────┴──────────────────┴───────────┘
```

### Data Model

```javascript
Shift {
  id: UUID,
  employee_id: UUID,
  site_id: UUID,
  date: YYYY-MM-DD,
  type: "M" | "P" | "S" | "R",
  created_at: timestamp,
  modified_at: timestamp,
  modified_by: user_id
}

Employee {
  id: UUID,
  name: string,
  role: string (optional),
  site_id: UUID
}
```

---

## 📱 Three Views Design

### View 1: GIORNO (Daily View)

**Use Case:** See hourly breakdown + visual shift blocks

**Layout:**
```
┌────────────────────────────────────────────────────────────┐
│ Shift Management — Store: "Centro Commerciale"             │
├────────────────────────────────────────────────────────────┤
│ Lunedì, 27 Maggio 2026                                     │
│ [GIORNO] [SETTIMANA] [MESE]                                │
├────────────────────────────────────────────────────────────┤
│
│  Time       │  Marco     │   Anna    │   Luigi   │   ...
│  ────────────────────────────────────────────────────────
│  08:00-09:00│  [M block..................]
│  09:00-10:00│  [M block..................]
│  10:00-11:00│  [M block..................]
│  11:00-12:00│  [M block..................]
│  12:00-13:00│  [M block..................]
│  13:00-14:00│  [P block..............................]
│  14:00-15:00│  [P block..............................]
│             │                    [P block............]
│  ...
│  21:00-22:00│                    [P block............]
│  22:00-23:00│                    [S block.....]
│
└────────────────────────────────────────────────────────────┘
```

**Features:**
- Griglia oraria: 08:00 → 23:00 (16 fasce di 1h)
- Dipendenti in colonne
- Blocchi turno con altezza proporzionale
- Click su blocco → modifica
- Click su cella vuota → crea nuovo

**Colors:**
- M (Mattina): blu (#4A90E2)
- P (Pomeriggio): arancio (#F5A623)
- S (Sera): viola (#9B59B6)
- R (Riposo): grigio (#E8E8E8)

---

### View 2: SETTIMANA (Weekly View) — PRIMARY VIEW

**Use Case:** Pianificazione settimanale (view default)

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│ Planning — Store: "Centro Commerciale"                   │
├──────────────────────────────────────────────────────────┤
│ [◀ Settimana 22] Lun 27 Maggio — Dom 2 Giugno [▶]        │
│ [GIORNO] [SETTIMANA] [MESE]                              │
├──────────────────────────────────────────────────────────┤
│
│  ┌──────┬───────┬───────┬───────┬───────┬───────┬───────┐
│  │      │  Lun  │  Mar  │  Mer  │  Gio  │  Ven  │  Sab  │
│  │      │  27   │  28   │  29   │  30   │   1   │   2   │
│  ├──────┼───────┼───────┼───────┼───────┼───────┼───────┤
│  │Marco │  [M]  │  [P]  │  [R]  │  [S]  │  [P]  │  [R]  │
│  ├──────┼───────┼───────┼───────┼───────┼───────┼───────┤
│  │Anna  │  [P]  │  [S]  │  [P]  │  [R]  │  [M]  │  [M]  │
│  ├──────┼───────┼───────┼───────┼───────┼───────┼───────┤
│  │Luigi │  [R]  │  [M]  │  [P]  │  [P]  │  [S]  │  [P]  │
│  ├──────┼───────┼───────┼───────┼───────┼───────┼───────┤
│  │Sara  │  [M]  │  [R]  │  [S]  │  [P]  │  [P]  │  [M]  │
│  ├──────┼───────┼───────┼───────┼───────┼───────┼───────┤
│  │Luca  │  [P]  │  [P]  │  [M]  │  [S]  │  [R]  │  [P]  │
│  └──────┴───────┴───────┴───────┴───────┴───────┴───────┘
│
│  [+ Crea Turno Nuovo]  [📋 Copia Settimana ▼]
│
└──────────────────────────────────────────────────────────┘
```

**Features:**
- Tabella: Dipendenti (righe) × 7 giorni (colonne)
- Ogni cella mostra il simbolo del turno (M/P/S/R) o è vuota
- Click cella → modal per creare/modificare/eliminare
- Navigator: Frecce per navigare settimane
- Button "Copia Settimana": copia planning della settimana corrente alla prossima

**Mobile Responsiveness:**
- Su desktop: 7 colonne complete
- Su tablet (< 1024px): **Switch automatico a questa vista** (no mensile)

---

### View 3: MESE (Monthly View)

**Use Case:** Panoramica del mese intero

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│ Planning — Store: "Centro Commerciale"                           │
├──────────────────────────────────────────────────────────────────┤
│ [◀ Giugno 2026 ▶]                                                │
│ [GIORNO] [SETTIMANA] [MESE]                                      │
├──────────────────────────────────────────────────────────────────┤
│ DESKTOP VIEW: Tabella 30 colonne (giorni) + scroll orizzontale
│
│  ┌──────┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
│  │      │1 │2 │3 │4 │5 │6 │7 │8 │9 │10│11│12│13│14│15│16│17│
│  ├──────┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┤
│  │Marco │M │P │R │S │P │ │M │P │R │S │P │ │M │P │R │S │P │
│  ├──────┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┤
│  │Anna  │P │S │P │R │M │M │P │S │P │R │M │M │P │S │P │R │M │
│  ├──────┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┤
│  │Luigi │R │M │P │P │S │P │R │M │P │P │S │P │R │M │P │P │S │
│  │Sara  │M │R │S │P │P │M │M │R │S │P │P │M │M │R │S │P │P │
│  │Luca  │P │P │M │S │R │P │P │P │M │S │R │P │P │P │M │S │R │
│  └──────┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
│              (scroll right →)
│
│ TABLET VIEW (< 1024px): Automatically switches to SETTIMANA view
│
└──────────────────────────────────────────────────────────────────┘
```

**Features:**
- Tabella compatta: dipendenti × 30/31 giorni
- Celle minuscole, solo simbolo (M/P/S/R)
- Scroll orizzontale aggressivo
- Click cella → modal (stesso di settimanale)
- Desktop only (auto-switch a Settimanale su tablet)

---

## 🎨 Component Details

### 1. Modal: Create/Edit/Delete Shift

```
┌──────────────────────────────────────┐
│ Modifica Turno                       │
├──────────────────────────────────────┤
│                                      │
│  Dipendente:  [Marco ▼]              │
│  Data:        [27 Maggio 2026 ▼]     │
│  Tipo Turno:                         │
│    [ M ] [ P ] [ S ] [ R ]           │
│                                      │
│  ℹ️ M = Mattina (08:00-13:00)         │
│  ℹ️ P = Pomeriggio (13:00-21:00)      │
│  ℹ️ S = Sera (18:00-23:00)            │
│  ℹ️ R = Riposo (nessun turno)         │
│                                      │
│  ⚠️ Marco ha già [P] il 27 Maggio    │
│     (warning, non blocca)            │
│                                      │
│  [Salva] [Annulla] [Elimina]        │
│                                      │
└──────────────────────────────────────┘
```

**Interaction:**
- Click su cella vuota → Modal aperto in "Create" mode
- Click su cella con turno → Modal aperto in "Edit" mode (con pulsante Elimina visibile)
- Select dipendente, data, tipo turno
- If tipo = R (Riposo), elimina turno (non crea entry R)
- Submit → salva nel database, refresha grid

---

### 2. Navigation & Header

```
┌────────────────────────────────────────┐
│ Badge System  🏪 Shift Management      │
├────────────────────────────────────────┤
│ Store: Centro Commerciale              │
│                                        │
│ [◀] Lun 27 Maggio — Dom 2 Giugno [▶]  │
│                                        │
│ [GIORNO]  [SETTIMANA]  [MESE]          │
└────────────────────────────────────────┘
```

**Features:**
- Tab switches between 3 views
- Date range dynamically updates based on view
- Navigation arrows for prev/next week/month

---

### 3. Action Buttons

```
[+ Crea Turno Nuovo]     — Opens modal with empty state
[📋 Copia Settimana ▼]   — Dropdown: copy to next week, next 2 weeks, next month
```

---

## 🎨 Color Palette

| Shift Type | Color       | Hex     | Background |
|-----------|------------|---------|-----------|
| M (Mattina) | Blue       | #4A90E2 | #E8F1FF |
| P (Pomeriggio) | Orange   | #F5A623 | #FFF0E6 |
| S (Sera)   | Purple     | #9B59B6 | #F3E8FF |
| R (Riposo) | Gray       | #999999 | #F5F5F5 |

---

## 📱 Responsive Design Strategy

| Screen Size | View | Behavior |
|-----------|------|----------|
| **Desktop (≥ 1024px)** | Giorno | Full hourly grid, 16 rows × N cols |
| | Settimana | Full table, 7 days visible |
| | Mese | Full table, 30 days visible with scroll |
| **Tablet (768px - 1023px)** | Giorno | Same, maybe reduce font size |
| | Settimana | Same, maybe reduce font size |
| | Mese | ❌ AUTO-SWITCH to Settimana view |
| **Mobile (< 768px)** | All | Switch to Settimana view, minimal layout |

**CSS Approach:**
```css
@media (max-width: 1024px) {
  .view-mensile { display: none; }
  .tab-mese { pointer-events: none; opacity: 0.5; }
}
```

---

## ⚠️ Critical UX Considerations (NOT YET IMPLEMENTED)

1. **Double Shift Warning** ✅
   - If manager assigns M + P same day → warning in modal
   - Non-blocking (manager can override)

2. **Copy Settimana Button** ✅
   - Copies all shifts from current week to next week
   - Dropdown: "Copy to next week", "Copy to next 2 weeks", "Copy to month"

3. **Visual Shift Indicators**
   - Different colors for M/P/S
   - R is not shown (empty cell)

4. **Undo/Redo** ❌ (Not MVP)
   - No undo — each modal action is final

---

## 🔄 State Management

**Simple Local State** (for mockup):
- `currentWeek` → Date object
- `selectedView` → "giorno" | "settimana" | "mese"
- `shifts` → Array of shift objects
- `modalOpen` → Boolean
- `selectedCell` → { employee_id, date }

**Future: Redux/Context for production**

---

## 🚀 Implementation Roadmap

### Phase 1: Static Mockup ✅ (current)
- HTML structure with hardcoded sample data
- CSS styling (color palette, grid layout, responsive)
- Modal HTML (not functional)

### Phase 2: Interactive Mockup
- Click cells → modal opens
- Modal form submission → update data
- Real-time grid update

### Phase 3: Integration with API
- `GET /api/shifts?week=2026-05-27&site_id=...`
- `POST /api/shifts` (create)
- `PUT /api/shifts/:id` (update)
- `DELETE /api/shifts/:id` (delete)

### Phase 4: Advanced Features
- Undo/Redo
- Bulk operations
- Export to PDF
- Integration with Dashboard (auto-show shifts in presences)

---

## 📊 Sample Data

```javascript
const employees = [
  { id: '1', name: 'Marco Rossi', role: 'Cassiere' },
  { id: '2', name: 'Anna Bianchi', role: 'Reparto' },
  { id: '3', name: 'Luigi Verdi', role: 'Magazzino' },
  { id: '4', name: 'Sara Gialli', role: 'Cassiere' },
  { id: '5', name: 'Luca Neri', role: 'Reparto' },
];

const shifts = [
  { employee_id: '1', date: '2026-05-27', type: 'M' },
  { employee_id: '1', date: '2026-05-28', type: 'P' },
  { employee_id: '2', date: '2026-05-27', type: 'P' },
  // ...
];
```

---

## ✅ Success Criteria — MVP (ACHIEVED)

- ✅ Monthly view rendering correctly (dipendenti × giorni)
- ✅ Responsive design (desktop + mobile-friendly)
- ✅ Inline editable cells with dropdown (no modal dialogs)
- ✅ Color coding clear for m/p/s/R shifts
- ✅ Month/year navigation working
- ✅ Real-time counters (N/30 per employee)
- ✅ Save/Reset/Export CSV functional
- ✅ Change detection (red badges)
- ✅ Employee view (read-only)
- ✅ All 8 code review findings fixed
- ✅ No console errors
- ✅ Load time < 3 sec
- ✅ Committed to GitHub (33a7a72)

## 📋 Future Phases (Not MVP)

**Phase 2: Advanced Views**
- [ ] 3 viste (Giorno, Settimana, Mese) instead of monthly only
- [ ] Modal dialogs for CRUD operations
- [ ] Copy Settimana button with week replication
- [ ] Double shift warning
- [ ] PDF export (currently CSV only)

**Phase 3: Notifications**
- [ ] Real-time notifications when shifts change
- [ ] Polling endpoint or Redis Pub/Sub
- [ ] Toast notifications in frontend

**Phase 4: Mobile & Offline**
- [ ] React Native mobile app
- [ ] Offline shift viewing/editing
- [ ] Sync when reconnected

---

**Last Updated:** 4 Giugno 2026  
**Status:** ✅ **FRONTEND IMPLEMENTATION COMPLETE** — Backend API pending (Phase 2)
