# Badge System — Leave Management Feature Handoff

**Date:** 2026-06-13  
**Feature:** Employee & Manager Leave Management (Ferie + Malattia)  
**Status:** Task 1 COMPLETE | Task 2 COMPLETE | Tasks 3-9 PENDING  
**Plan:** `docs/superpowers/plans/2026-06-12-leave-management.md`

---

## Goal

Implement a calendar-based leave request system for vacation and sick leave, with employee/manager request flows, HR/Admin approval workflow, and hard-block integration into shift planning.

MVP target remains 9 tasks, using TDD and subagent-assisted review where useful.

---

## Current Progress

### Task 1: Database Schema — COMPLETE
- **Commits:** `a601c2a` initial schema, `2969493` schema security/data-integrity fixes
- **Status:** Spec review PASS, code quality PASS
- **Deliverables:**
  - Tables: `leaves`, `leave_requests`, `leave_saldi`
  - Indexes, constraints, FK relationships
  - Idempotent migration
  - Schema validation tests
- **Key files:**
  - `backend/src/migrations/022_create_leaves_tables.sql`
  - `backend/src/__tests__/leaves-schema.test.js`

### Task 2: Backend API Endpoints — COMPLETE
- **Commits:** `de9cfc9` implementation, `fdf2b76` security fixes
- **Status:** Spec review PASS, focused security/code review PASS after fix
- **Endpoints:**
  - `POST /api/v1/leave/request`
  - `GET /api/v1/leave/pending`
  - `PUT /api/v1/leave/:id/approve`
  - `GET /api/v1/leave/my-requests`
- **Deliverables:**
  - RBAC for admin, manager, employee/viewer behavior
  - Zod validation schemas
  - Transactional saldo update and shift deletion on approval
  - Regression tests for security fixes
- **Security fixes completed in `fdf2b76`:**
  1. `GET /pending` now fails closed. Only admins or managers with `site_id` can view pending leave requests.
  2. `PUT /:id/approve` now rejects unauthorized approvers before DB lookup to avoid state leakage.
  3. Manager site authorization is checked before returning processed-state errors.
  4. Approval update is atomic: `WHERE id = $4::uuid AND status = 'PENDING'`.
  5. Stale/double approvals return `VALIDATION_ERROR` instead of mutating saldo twice.
- **Verification:**
  - `cd backend && npm test -- leaves.test.js --runInBand`
  - Result: `13/13` tests passing
- **Key files:**
  - `backend/src/routes/leaves.js`
  - `backend/src/middleware/validation.js`
  - `backend/src/__tests__/leaves.test.js`
  - `backend/src/app.js`

### Task 3: Frontend — LeaveCalendar Component — COMPLETE
- **Commits:** `efd2b86` implementation with tests
- **Status:** All 11 tests passing ✓
- **Deliverables:**
  - `LeaveCalendar.jsx`: Reusable date-range calendar picker using MUI components
    - Navigate between months with Previous/Next buttons
    - Select date ranges by clicking start and end dates
    - Highlight selected ranges with visual styling
    - Disable past dates to prevent selection errors
    - Show day names in Italian (Lun, Mar, Mer, etc.)
    - Display selected date range and day count
    - Controlled component (accepts startDate/endDate as props)
  - `LeaveCalendar.test.jsx`: Comprehensive test suite (11 tests)
    - Calendar rendering and month navigation
    - Date selection (single and range)
    - Date range highlighting and clearing
    - Past date validation
    - Localization (Italian month/day names)
  - `vitest.setup.js`: Jest-DOM matchers configuration
  - `vitest.config.js`: Updated with setupFiles reference
- **Verification:**
  - `cd frontend-web && npm test -- LeaveCalendar.test.jsx --run`
  - Result: `11/11` tests passing ✓
- **Key files:**
  - `frontend-web/src/features/leave/components/LeaveCalendar.jsx`
  - `frontend-web/src/__tests__/LeaveCalendar.test.jsx`
  - `frontend-web/vitest.setup.js`
  - `frontend-web/vitest.config.js`

---

## Multiagent Notes

- A worker checked `badge-system/` because the user said not to ignore it.
- Result: no leave-management implementation exists under `badge-system/`; no files changed there.
- A focused review agent found one medium issue in the initial security patch: approval status was checked before authorization, leaking processed state.
- That issue was fixed before commit `fdf2b76`.

---

## What Worked

1. **TDD-style regression coverage** made the security fixes concrete and durable.
2. **Fail-closed RBAC** is now explicit instead of relying on fallthrough.
3. **Atomic state transition** prevents double approval/double saldo deduction.
4. **Subagent review** caught an authorization ordering leak before commit.
5. **Scoped commits** kept unrelated workspace changes untouched.

---

## Lessons Learned

1. **Authorization before state disclosure.** Do coarse role checks before DB lookup where possible, then resource-specific authorization, then state validation.
2. **Fail closed for every non-explicit role.** `viewer`, `employee`, managers without `site_id`, and unknown roles should not fall through.
3. **Prechecks are not enough for concurrency.** Keep the atomic `UPDATE ... AND status = 'PENDING'` as the real race guard.
4. **Do not assume duplicate trees are irrelevant.** `badge-system/` was inspected and confirmed not to contain leave code.

---

## Next Steps

### Immediate Next Task: Task 4 — EmployeeLeaveRequest Page

**Goal:** Build a form page where employees request leave using the newly completed `LeaveCalendar` component.

**Requirements:**
- Employee leave request form with:
  - `LeaveCalendar` component for date range selection
  - `leave_type` dropdown (FERIE_1, FERIE_2, FERIE_3, MALATTIA)
  - `motivation` text area (optional, max 500 chars)
  - Submit and Cancel buttons
- Displays list of user's own leave requests below form (`GET /api/v1/leave/my-requests`)
- RBAC: Only employees/viewers can access this page
- Error handling: Show validation errors, insufficient saldo, etc.
- Success feedback: Toast/snackbar after successful request

**Key integrations:**
- API endpoint: `POST /api/v1/leave/request` (backend ready ✓)
- API endpoint: `GET /api/v1/leave/my-requests` (backend ready ✓)
- Use existing patterns from `DashboardPage.jsx`, `CorrectionsPage.jsx`
- Use MUI components: `Card`, `Button`, `TextField`, `Select`, `Snackbar`
- Follow Italian localization patterns already in project

**Test approach:**
- Form rendering and state management
- API call success/error cases
- Insufficient saldo validation
- Request list display and pagination
- RBAC edge cases

**Files to create/modify:**
- `frontend-web/src/features/leave/pages/EmployeeLeaveRequest.jsx` (new)
- `frontend-web/src/features/leave/hooks/useLeave.js` (new)
- `frontend-web/src/__tests__/EmployeeLeaveRequest.test.jsx` (new)
- `frontend-web/src/App.jsx` (add route `/leave/request`)

**Suggested next commit message:**
```
feat: implement EmployeeLeaveRequest page with LeaveCalendar integration

- Page: EmployeeLeaveRequest.jsx with form + request list
- Hook: useLeave.js for API interactions
- Tests: 15+ tests covering form, API, RBAC, validation
- Integration: Routed at /leave/request (employee, viewer)
- Status: 15/15 tests passing
```

---

4. **EmployeeLeaveRequest** — Task 4 above
   - Employee leave request form using `LeaveCalendar`
   - Calls `POST /api/v1/leave/request`
   - Displays own requests from `GET /api/v1/leave/my-requests`

5. **ManagerLeaveRequest**
   - Manager self-request flow, likely same reusable form/component as employee

6. **ManagerLeaveApprovalPanel**
   - Dashboard panel for pending requests
   - Calls `GET /api/v1/leave/pending`
   - Approve/reject via `PUT /api/v1/leave/:id/approve`

7. **AdminLeaveManagement**
   - Admin view for approvals, saldi, and request history

8. **PlanningPage Integration**
   - Approved leave hard-blocks shift planning
   - Show blocked days in planning grid

9. **GET /approved Endpoint**
   - Add approved leave fetch endpoint needed by planning/admin/history views

---

## Suggested Resume Command

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge"
```

Suggested next prompt:

```text
Continue with leave management feature. Read HANDOFF.md first.
Status: Task 1 and Task 2 are complete. Task 2 security fixes are committed in fdf2b76 and tests pass.
Proceed with Task 3: frontend LeaveCalendar component, using TDD and multiagent review where useful.
```

---

## Progress Summary

| Task | Status | Commits | Tests | Notes |
|------|--------|---------|-------|-------|
| 1. Database Schema | COMPLETE | `a601c2a`, `2969493` | Schema tests passing | Spec + quality pass |
| 2. Backend API | COMPLETE | `de9cfc9`, `fdf2b76` | `13/13` focused API tests passing | Security fixes complete |
| 3. LeaveCalendar Component | COMPLETE | `efd2b86` | `11/11` tests passing ✓ | MUI date-range picker |
| 4. EmployeeLeaveRequest | TODO | - | - | Next task — use LeaveCalendar |
| 5. ManagerLeaveRequest | TODO | - | - | After Task 4 |
| 6. ManagerLeaveApprovalPanel | TODO | - | - | After Task 5 |
| 7. AdminLeaveManagement | TODO | - | - | After Task 6 |
| 8. PlanningPage Integration | TODO | - | - | After Task 7 |
| 9. GET /approved Endpoint | TODO | - | - | Final API endpoint |

---

## Current Workspace Notes

- Existing unrelated dirty/untracked items were left untouched:
  - `.DS_Store`
  - `.claude/scheduled_tasks.lock`
  - `frontend-mobile/.DS_Store`
  - `badge-system/`
  - several `docs/superpowers/plans/...` files
  - load-test result JSON files
  - `frontend-web/public/examples/`

---

**Last Updated:** 2026-06-13  
**Last Completed Commit:** `efd2b86 feat: implement LeaveCalendar component with comprehensive tests`  
**Status:** Task 1-3 COMPLETE | Task 4-9 TODO
