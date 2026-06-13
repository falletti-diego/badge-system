# Task 11 — Leave Management QA & Frontend Testing Plan

**Date:** 2026-06-14  
**Task:** Complete comprehensive testing of Leave Management (Ferie & Malattia) feature  
**Effort:** 2 hours (30min setup + 60min testing + 30min documentation)  
**Status:** Planning & Execution

---

## 📋 Phase 1: Test Data Setup (30 min)

### 1.1 CSV Import: 8 Employees (2 Sites)

**File:** `backend/scripts/seed-data/leave-test-data.csv`

Structure:
```csv
email,name,phone,role,site_name,employee_id
alice@badge.local,Alice Bianchi,+39-02-1234567,manager,Milano,ALICE001
carlo@badge.local,Carlo Rossi,+39-011-2234567,manager,Torino,CARLO001
maria@badge.local,Maria Rossi,+39-02-5234567,employee,Milano,MARIA001
francesca@badge.local,Francesca Lombardi,+39-02-6234567,employee,Milano,FRAN001
paolo@badge.local,Paolo Verdi,+39-02-7234567,employee,Milano,PAOLO001
lucia@badge.local,Lucia Ferrari,+39-011-3234567,employee,Torino,LUCIA001
giovanni@badge.local,Giovanni Russo,+39-011-4234567,employee,Torino,GIOV001
sofia@badge.local,Sofia Bianchi,+39-011-5234567,employee,Torino,SOFIA001
```

**Sites:**
- Milano: `e1337fab-ba3f-4332-bb06-57c9df15b067` (existing)
- Torino: `550e8400-e29b-41d4-a716-446655440012` (existing)

**Client:** `550e8400-e29b-41d4-a716-446655440001`

### 1.2 Execute Import Script

```bash
# From project root
cd backend

# Ensure backend is running
npm run dev  # DISABLE_AUTH=true (recommended for testing)

# In another terminal
node scripts/seed-leave-test-data.js
```

**Expected Output:**
```
✅ Import succeeded!
   Created: 8
   Skipped: 0

📋 Temp Passwords (save these for login):
   alice@badge.local                 → <password>
   carlo@badge.local                 → <password>
   ...
```

### 1.3 Verify Database

Confirm all 8 employees created:
```bash
curl -X GET http://localhost:3000/api/v1/employees \
  -H "Authorization: Bearer <admin-token>"
```

Expected: 8 employees returned with assigned_sites populated.

### 1.4 Pre-assign Shifts (Manual via Backend)

Each employee should have 10 shifts assigned in June 2026.

**SQL (manual or via endpoint):**
```sql
-- For each employee, insert 10 shifts spanning June 1-30
-- Example: Maria (maria@badge.local) gets shifts on days 1,5,10,15,20,25,28,29,30
-- Assign: 'm' (mattino), 'p' (pomeriggio), 's' (sera), 'R' (riposo)
```

---

## 🧪 Phase 2: Test Plan Execution (60 min)

### Test Suite: 17 Test Cases

#### A. Ferie Tests (7 cases)

| # | Test Case | Login As | Step | Expected | Pass |
|---|-----------|----------|------|----------|------|
| 1 | Request ferie with saldo OK | Maria | POST /api/v1/leave/request {leave_type: FERIE_1, start: 2026-06-06, end: 2026-06-13} | 200, status=PENDING, num_days=8 | [ ] |
| 2 | Request ferie saldo insufficient | Maria | POST /api/v1/leave/request {leave_type: FERIE_1, start: 2026-06-01, end: 2026-06-30} (30 days) | 400, error=INSUFFICIENT_SALDO, available_days shown | [ ] |
| 3 | Manager approves ferie (same site) | Alice (Milano manager) | PUT /api/v1/leave/{maria-leave-id}/approve {status: APPROVED} | 200, leave.status=APPROVED, saldo decremented | [ ] |
| 4 | Manager rejects ferie with reason | Alice (Milano manager) | PUT /api/v1/leave/{francesca-leave-id}/approve {status: REJECTED, rejection_reason: "Non approvato per carenza personale"} | 200, leave.status=REJECTED, rejection_reason saved | [ ] |
| 5 | Admin sees all ferie requests (cross-client) | Pippo (admin) | GET /api/v1/leave/all?status=PENDING&client_id=* | 200, array includes Maria + Francesca + others | [ ] |
| 6 | Manager sees only own-site ferie | Alice (Milano manager) | GET /api/v1/leave/pending | 200, filtered to Milano employees only | [ ] |
| 7 | Employee sees only own ferie | Maria | GET /api/v1/leave/my-requests | 200, array has only Maria's requests | [ ] |

#### B. Malattia Tests (3 cases)

| # | Test Case | Login As | Step | Expected | Pass |
|---|-----------|----------|------|----------|------|
| 8 | Request malattia (no saldo limit) | Maria | POST /api/v1/leave/request {leave_type: MALATTIA, start: 2026-06-20, end: 2026-06-21} | 200, status=PENDING, saldo check skipped | [ ] |
| 9 | Request 100 days malattia (no limit) | Maria | POST /api/v1/leave/request {leave_type: MALATTIA, start: 2026-06-01, end: 2026-09-09} (100 days) | 200, num_days=100, accepted | [ ] |
| 10 | Manager approves malattia | Carlo (Torino manager) | PUT /api/v1/leave/{lucia-malattia-id}/approve {status: APPROVED} | 200, leave.status=APPROVED | [ ] |

#### C. Planning Page Blocking (4 cases)

| # | Test Case | Login As | Step | Expected | Pass |
|---|-----------|----------|------|----------|------|
| 11 | Block turno on FERIE APPROVED | Alice | Navigate PlanningPage giugno, select Francesca row, try to click days 9-15 | Select DISABLED (grayed out), shows 🔒 lock icon, tooltip "Bloccato da ferie: FERIE_1" | [ ] |
| 12 | Block turno on MALATTIA APPROVED | Carlo | Navigate PlanningPage giugno, select Lucia row, try to click days 24-26 | Select DISABLED (grayed out), shows 🔒 lock icon, tooltip "Bloccato da malattia" | [ ] |
| 13 | Allow turno no leaves | Alice | Navigate PlanningPage giugno, select Paolo row, click day 15 | Select ENABLED, dropdown opens, can assign shift, Save succeeds | [ ] |
| 14 | Locks persist after reload | Alice | After test #11, change month (June → July) and return to June | Francesca's 9-15 still blocked with 🔒 | [ ] |

#### D. Edge Cases (3 cases)

| # | Test Case | Login As | Step | Expected | Pass |
|---|-----------|----------|------|----------|------|
| 15 | PENDING ferie doesn't block | Alice | Create PENDING leave for Paolo, try to assign turno on those days | Select ENABLED (pending leaves don't block) | [ ] |
| 16 | Rejected ferie unblocks | Alice | Reject Maria's FERIE_1, reload PlanningPage | Maria's days are ENABLED again | [ ] |
| 17 | Admin delete leave unblocks | Pippo | Delete Lucia's MALATTIA from AdminPage, reload PlanningPage as Carlo | Lucia's 24-26 are ENABLED again | [ ] |

---

## 🖥️ Phase 3: Frontend Manual Testing (30 min)

### 3.1 Setup

```bash
# Terminal 1: Backend
cd backend
DISABLE_AUTH=true npm run dev

# Terminal 2: Frontend
cd frontend-web
npm run dev  # http://localhost:5173

# Terminal 3: Import test data
cd backend
node scripts/seed-leave-test-data.js
```

### 3.2 EmployeeLeaveRequest Page (as Maria)

**URL:** http://localhost:5173/leave/request

**Checklist:**
- [ ] Page title "Richiedi ferie/malattia" visible
- [ ] Layout: Dropdown "Tipo Feria" (left side) + "Richiedi Malattia" button (right, green) ✅
- [ ] Calendar component renders with month navigation ✅
- [ ] File upload appears ONLY when "Richiedi Malattia" is clicked ✅
- [ ] File upload has drag-drop styling (dashed border) ✅
- [ ] Calendar: selected range has BLUE background (#3b82f6) + white text + border ✅
- [ ] Request history table shows Maria's previous requests ✅
- [ ] Create FERIE_1 (6-13 giugno):
  - [ ] Select dates in calendar
  - [ ] Click "Richiedi Ferie"
  - [ ] Toast "Richiesta inviata"
  - [ ] History table updates with new request
- [ ] Create MALATTIA (20-21 giugno):
  - [ ] Click "Richiedi Malattia" button
  - [ ] File upload appears
  - [ ] Select dates in calendar
  - [ ] Upload a file (optional)
  - [ ] Click "Richiedi Malattia"
  - [ ] Toast "Richiesta inviata"
  - [ ] History table updates

### 3.3 AdminLeaveManagement Page (as Pippo/Admin)

**URL:** http://localhost:5173/leave/admin

**Checklist:**
- [ ] 5 tabs visible: "Pending", "Approved", "Rejected", "History", "Saldi" ✅
- [ ] Pending tab: Shows Maria (FERIE_1 + MALATTIA), Francesca (FERIE_1), Lucia (MALATTIA)
- [ ] Approve button works: Maria FERIE_1 → status=APPROVED, saldo updates
- [ ] Reject button works: Lucia MALATTIA → status=REJECTED, rejection_reason dialog appears
- [ ] Approved tab: Shows Maria FERIE_1 + others
- [ ] Rejected tab: Shows Lucia MALATTIA
- [ ] Saldi tab: Shows per-employee remaining days for FERIE_1, FERIE_2, FERIE_3
  - [ ] Maria FERIE_1: decreases after approval
  - [ ] Malattia has no limit (no saldo shown)
- [ ] History tab: Shows all requests with timestamps

### 3.4 PlanningPage (as Alice = Milano manager)

**URL:** http://localhost:5173/planning

**Setup:**
- First, approve Francesca's FERIE_1 (9-15) and Lucia's MALATTIA (24-26) from AdminPage

**Checklist:**
- [ ] Approved leaves shown as RED cells with 🔒 lock icon
- [ ] Francesca row (9-15 giugno): cells RED + 🔒
  - [ ] Try to click: Select DISABLED (grayed)
  - [ ] Hover: Tooltip shows "Bloccato da ferie: FERIE_1"
  - [ ] Try to change via dropdown: dropdown doesn't open
- [ ] Paolo row (no leaves): cells WHITE + enabled
  - [ ] Click day 15: dropdown opens ✅
  - [ ] Assign "m" (mattino) → BLUE background
  - [ ] Click "Salva": row saved, no errors
  - [ ] Reload page: shift still there ✅
- [ ] KPI card: "Dipendenti" = 6 (for Milano)
- [ ] Month navigation: change to July and back to June → locks still there
- [ ] Legend section: explains blocking behavior

### 3.5 Role-Based Visibility

Test as each role:

**Maria (employee):**
- [ ] GET /api/v1/leave/pending → 403 FORBIDDEN (employees can't see pending list)
- [ ] GET /api/v1/leave/my-requests → 200 (sees own requests only)
- [ ] GET /api/v1/leave/approved → 200 (sees own approved leaves only)
- [ ] AdminPage not accessible (redirects)

**Alice (manager Milano):**
- [ ] GET /api/v1/leave/pending → 200 (sees Milano staff pending)
- [ ] GET /api/v1/leave/all → 403 FORBIDDEN (managers can't see admin all-leaves)
- [ ] PlanningPage: can edit shifts except those blocked by leaves ✅
- [ ] AdminPage not accessible (redirects)

**Pippo (admin):**
- [ ] GET /api/v1/leave/pending → 200 (sees ALL)
- [ ] GET /api/v1/leave/all → 200 (sees ALL with filtering)
- [ ] AdminPage: can approve/reject any request ✅
- [ ] PUT /api/v1/leave/:id/approve → 200 (can approve/reject)

---

## 📝 Test Results

### Phase 1: Setup
- [ ] CSV imported successfully (8/8 employees)
- [ ] Temp passwords generated for all 8
- [ ] Employees visible in backend
- [ ] Shifts pre-assigned (10 per employee)

### Phase 2: API Tests
- [ ] Ferie tests: 7/7 PASSING
- [ ] Malattia tests: 3/3 PASSING
- [ ] Planning blocking: 4/4 PASSING
- [ ] Edge cases: 3/3 PASSING
- **Total: 17/17 PASSING**

### Phase 3: Frontend Tests
- [ ] EmployeeLeaveRequest form: all checks PASSING
- [ ] AdminLeaveManagement tabs: all checks PASSING
- [ ] PlanningPage blocking: all checks PASSING
- [ ] Role-based visibility: all checks PASSING

---

## 🐛 Known Issues / Observations

(To be filled during testing)

---

## ✅ Definition of Done

- [x] CSV created with 8 test employees
- [x] Import script created (seed-leave-test-data.js)
- [x] Test plan documented (this file)
- [ ] All 17 test cases executed and PASSING
- [ ] No 5xx errors in backend logs
- [ ] No console errors in browser (F12)
- [ ] Ferie/Malattia blocking on PlanningPage verified visually
- [ ] RBAC scoping verified for all 4 roles
- [ ] Manual test results documented below
- [ ] Any bugs logged to git issues

---

## 📚 Appendix: API Reference

### Create Leave Request
```bash
curl -X POST http://localhost:3000/api/v1/leave/request \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "leave_type": "FERIE_1|FERIE_2|FERIE_3|MALATTIA",
    "start_date": "2026-06-06",
    "end_date": "2026-06-13",
    "motivation": "Optional text"
  }'
```

### Get Pending Requests (Manager/Admin)
```bash
curl -X GET http://localhost:3000/api/v1/leave/pending \
  -H "Authorization: Bearer <token>"
```

### Approve/Reject Request
```bash
curl -X PUT http://localhost:3000/api/v1/leave/{id}/approve \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "APPROVED|REJECTED",
    "rejection_reason": "Optional text (required if REJECTED)"
  }'
```

### Get Approved Requests (for Planning blocking)
```bash
curl -X GET http://localhost:3000/api/v1/leave/approved \
  -H "Authorization: Bearer <token>"
```

---

**Last Updated:** 2026-06-14  
**Plan Status:** Ready for Execution
