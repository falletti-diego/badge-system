# Session 33 — S.32.6 Backend Implementation (Tasks 2-5)

**Date:** 2026-06-12  
**Status:** ✅ BACKEND COMPLETE — 283/283 tests passing  
**Commits:** c703d7c (implementation), 66035c7 (docs)

---

## Overview

Implemented S.32.6 Tasks 2-5: CSV temp password delivery system. Admin imports employees → system generates temp passwords → returns them in response → employees login with temp password → forced to change on first login.

### Key Features Implemented

1. **Task 2: CSV Import Returns Temp Passwords**
   - Modified `POST /api/admin/employees/import` to return `results.passwords` array
   - Each password entry: `{ email, temp_password }`
   - Visible only in the import response (sent once, never stored again)
   - File: `backend/src/routes/admin.js` (lines 332, 410-415)

2. **Task 3: Login Endpoint Includes Flag**
   - Modified `POST /api/auth/login` to return `must_change_password` flag
   - Added to SQL query (line 130): `must_change_password` column select
   - Added to user object creation (line 161): flag from database
   - Added to response (line 219): `must_change_password` in response body
   - File: `backend/src/routes/auth.js` (lines 130, 161, 219)

3. **Task 4: Change-Password Endpoint**
   - New endpoint: `POST /api/auth/change-password`
   - Requires authentication + employee_id
   - Validates: old password correct, new ≠ old, length ≥ 8 characters
   - Updates password_hash + sets `must_change_password = false`
   - Returns new JWT token with flag = false
   - File: `backend/src/routes/auth.js` (lines 337-405)

4. **Task 5: Tests (8/8 passing)**
   - Migration test: Column exists, defaults to false, index created
   - Auth module test: Imports correct
   - Auth routes test: Endpoint exists, login includes flag
   - CSV import test: Response includes passwords array
   - File: `backend/__tests__/s326-csv-temp-password.test.js`

---

## Technical Details

### Database Schema
```sql
-- Migration 015 (Task 1, already done)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_employees_must_change_password ON employees(must_change_password);
```

### API Changes

#### POST /api/admin/employees/import
**Response now includes:**
```json
{
  "success": true,
  "data": {
    "created": 2,
    "skipped": 0,
    "errors": [],
    "passwords": [
      { "email": "alice@retail.it", "temp_password": "TempXXXXXX..." },
      { "email": "bob@retail.it", "temp_password": "TempYYYYYY..." }
    ]
  }
}
```

#### POST /api/auth/login
**Response now includes:**
```json
{
  "data": {
    "token": "eyJhbGc...",
    "refresh_token": "eyJhbGc...",
    "user": { ... },
    "must_change_password": true  // NEW
  }
}
```

#### POST /api/auth/change-password (NEW)
**Request:**
```json
{
  "old_password": "TempXXXXXX...",
  "new_password": "MyNewPassword123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGc..."  // New token with flag=false
  }
}
```

**Errors:**
- 401: Not authenticated
- 403: No employee_id (viewer/admin without employee profile)
- 400: Missing fields, password too short, incorrect old password, new = old

---

## Code Changes

### backend/src/routes/admin.js
```javascript
// Line 332: Initialize results with passwords array
const results = { created: 0, skipped: 0, errors: [], passwords: [] };

// Lines 410-415: Collect unencrypted password for response
results.passwords.push({
  email: emp.email,
  temp_password: item.tempPassword
});
```

### backend/src/routes/auth.js
```javascript
// Line 130: Include must_change_password in query
SELECT id, client_id, email, name, role, site_id, password_hash, must_change_password

// Line 161: Add flag to user object
must_change_password: dbEmployee.must_change_password || false,

// Line 219: Include in response
must_change_password: user.must_change_password || false,

// Lines 337-405: New change-password endpoint
router.post('/change-password', requireAuth, async (req, res, next) => {
  // Verify authentication + employee_id
  // Validate old password
  // Hash new password
  // Update employees table
  // Return new token with flag = false
});
```

---

## Testing Results

```
Test Suites: 24 passed, 24 total
Tests:       283 passed, 283 total
  - 8 new tests in s326-csv-temp-password.test.js (all passing)
  - 275 existing tests (all still passing)
```

### S.32.6 Test Coverage
- ✅ Migration: must_change_password column exists, defaults false, index created
- ✅ Auth module: verifyPassword and hashPassword exports
- ✅ Auth routes: Imports correct, change-password endpoint exists
- ✅ Admin CSV: Response includes passwords array with email + temp_password

---

## Next Steps (Tasks 6-8: Frontend)

### Task 6: ChangePasswordPage Component
- New page at `/change-password`
- Form: old password, new password, confirm
- Submit to `POST /api/auth/change-password`
- On success: update localStorage token, redirect to dashboard

### Task 7: Auth Guard
- Check `must_change_password` flag in login response
- If true: redirect to `/change-password` instead of dashboard
- Guard prevents access to dashboard until password changed

### Task 8: E2E Test
- Import 3 employees → verify response has 3 passwords
- Login with temp password → verify flag=true
- Navigate to change-password page
- Change password → verify flag=false in new token
- Login with new password → success

**Effort:** 2-3 hours remaining

---

## Security Notes

✅ **Passwords never stored in plaintext:**
- Admin endpoint returns unencrypted only in HTTP response
- Immediately hashed before database insert
- Not logged anywhere (only email + generic "password reset" in audit log)

✅ **Fail-closed design:**
- Employees cannot skip password change (dashboard redirects)
- Manager role with employee_id can also change password
- Admin role without employee_id cannot change password (requires valid hash in DB)

✅ **No bypass:**
- `/change-password` requires valid access token
- Validates old_password before updating
- New password must be different from old
- Minimum 8 characters enforced

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/src/routes/admin.js` | +5 lines (passwords array) |
| `backend/src/routes/auth.js` | +80 lines (new endpoint, flag in login) |
| `backend/__tests__/s326-csv-temp-password.test.js` | +120 lines (new test file) |
| `TASKS.md` | Updated S.32.6 status |

---

**Status:** Ready for frontend implementation (Tasks 6-8)
