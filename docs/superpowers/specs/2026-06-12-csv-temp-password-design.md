# S.32.6 — CSV Import: Temporary Passwords Delivery & Forced Change

**Data:** 2026-06-12  
**Status:** Design approvato  
**Priorità:** 🟡 MEDIA — Employee onboarding blocker (imported users can't login)  
**Origine:** Analisi critica Session 32 (piano d'azione S.32 in TASKS.md)

---

## Problema

### Problema 1: Temp Passwords Not Returned

In `POST /api/admin/employees/import`:
- Linea 383-384: genera temp password + hashata
- Linea 435: restituisce solo `{created, skipped, errors}` — **NON le password**

**Conseguenza:** Dipendenti importati non possono fare login perché non conoscono la password temporanea.

**Workaround attuale:** Admin deve resetare manualmente la password uno-a-uno via `/api/admin/employees/:id/reset-password` (non esiste ancora, probabile che sia manual DB edit).

### Problema 2: No Forced Password Change

Anche se la password venisse fornita, non c'è meccanismo per forzare il cambio al primo login.

**Rischio:** Temp password rimane attiva indefinitamente (riduce security).

---

## Contesto

**Flusso attuale (broken):**
```
Admin uploads CSV (3 dipendenti) 
  → Backend genera temp passwords, hashate
  → Response: {"created": 3, "skipped": 0, "errors": []}
  ❌ Password non visibili → Dipendenti bloccati, non riescono a login
```

**Flusso desiderato (S.32.6):**
```
Admin uploads CSV (3 dipendenti)
  → Backend genera temp passwords, hashate, ma restituisce non-hashate
  → Response: {"created": 3, "results": [{email, temp_password}, ...]}
  ✅ Admin scarica CSV con password → condivide ai dipendenti
  ✅ Dipendente login con temp password
  → Server: "must_change_password": true in risposta
  ✅ Frontend reindirizza a pagina cambio password
  ✅ Dipendente cambia password
  → Server: `must_change_password = false`, login normale
```

---

## Soluzione

### 1. Database: Add `must_change_password` Column

New migration `015_add_must_change_password.sql`:

```sql
-- Migration 015: Add must_change_password flag to employees
-- Purpose: Force password change on first login for imported employees
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_employees_must_change_password ON employees(must_change_password);
```

**Behavior:**
- Default `false` — existing employees not affected
- Set `true` on CSV import → triggers forced change flow
- Set `false` after successful password change

### 2. CSV Import Response: Return Temp Passwords

Modify `POST /api/admin/employees/import` to:

```javascript
// Old response:
{ success: true, data: { created: 3, skipped: 0, errors: [] } }

// New response:
{
  success: true,
  data: {
    created: 3,
    skipped: 0,
    errors: [],
    results: [
      { email: "alice@retail.com", temp_password: "TempPass123!@#" },
      { email: "bob@retail.com", temp_password: "TempPass456!@#" },
      { email: "carol@retail.com", temp_password: "TempPass789!@#" }
    ]
  }
}
```

**Key points:**
- `results` array contains **unencrypted** passwords (visible only in response)
- Admin can download as CSV or copy to clipboard
- Passwords are **never** logged or stored in plaintext
- Once request completes, passwords are only in response (use once)

### 3. Login Response: Flag Must-Change

Modify `POST /api/auth/login` response:

```javascript
// Old response:
{ token: "...", user: { id, email, role } }

// New response (if must_change_password = true):
{
  token: "...",  // Still valid, but restricted
  user: { id, email, role },
  must_change_password: true  // Frontend sees this → redirect
}
```

**Behavior:**
- Token is still valid (can call /auth/change-password)
- Other endpoints should reject if `must_change_password = true`
- Frontend must enforce redirect before showing dashboard

### 4. Change Password Endpoint

New endpoint `POST /api/auth/change-password`:

```javascript
POST /api/auth/change-password
{
  old_password: "TempPass123!@#",   // Current password (plain)
  new_password: "MySecurePass123!@#" // New password (plain)
}

Response:
{ success: true, token: "new_jwt_token" }
// Sets must_change_password = false in DB
// Returns new JWT (old one still valid but marked as "old")
```

**Validation:**
- Require `old_password` (user must know current password)
- Validate `new_password` (complexity rules TBD — for MVP: 8+ chars)
- Check employee exists and `must_change_password = true`
- Hash new password with bcrypt
- Update DB: `password_hash`, `must_change_password = false`

### 5. Frontend Redirect

In dashboard/protected pages:
```javascript
if (user.must_change_password) {
  navigate('/auth/change-password', { state: { force: true } });
}
```

**Change Password Page:**
- Form: old password + new password + confirm
- Shows warning: "This is your first login. You must change your password."
- Submit → POST /auth/change-password
- On success → get new token, set localStorage, navigate to dashboard

---

## Scope & Timeline

**Effort:** 2h
- Add `must_change_password` column migration: 10 min
- Modify CSV import endpoint: 20 min
- Modify login endpoint: 15 min
- Add change-password endpoint: 25 min
- Frontend redirect logic: 20 min
- Test: CSV import → login → change password flow: 30 min

**Breakability:** Very low
- New column defaults to `false` (backward compatible)
- New response field (`must_change_password`) is optional (old clients ignore)
- New endpoint doesn't affect existing flows

---

## Testing Strategy

### Test 1: CSV Import Returns Temp Passwords

```bash
POST /api/v1/admin/employees/import
Content-Type: multipart/form-data
File: employees.csv
client_id: <client_uuid>

Response:
{
  success: true,
  data: {
    created: 3,
    skipped: 0,
    errors: [],
    results: [
      { email: "alice@retail.com", temp_password: "..." },
      ...
    ]
  }
}
```

Expected: 3 passwords returned, each different, non-hashed.

### Test 2: Imported Employees Have must_change_password = true

```sql
SELECT email, must_change_password FROM employees 
WHERE email IN ('alice@retail.com', ...);
```

Expected: All 3 have `must_change_password = true`.

### Test 3: Login with Temp Password Returns must_change_password Flag

```bash
POST /api/v1/auth/login
{ email: "alice@retail.com", password: "<temp_password>" }

Response:
{
  token: "...",
  user: { ... },
  must_change_password: true
}
```

Expected: Flag is `true` in response.

### Test 4: Change Password Workflow

```bash
# Step 1: Attempt to login with temp password
POST /api/v1/auth/login
{ email: "alice@retail.com", password: "<temp_password>" }
Response: { token: "...", must_change_password: true }

# Step 2: Call change-password endpoint with old (temp) password
POST /api/v1/auth/change-password
{ old_password: "<temp_password>", new_password: "MyNewPass123!" }
Response: { success: true, token: "new_token_with_must_change_password=false" }

# Step 3: Login with new password
POST /api/v1/auth/login
{ email: "alice@retail.com", password: "MyNewPass123!" }
Response: { token: "...", must_change_password: false }
```

Expected: All 3 steps succeed. New password works. No more forced change.

---

## Deploy & Verification

**Pre-Deployment:**
1. Run migration 015 (add `must_change_password` column)
2. Deploy backend (new endpoints)
3. Deploy frontend (change password page, redirect logic)

**Smoke Test:**
1. Import 3 employees via CSV → get temp passwords
2. Login as one → see `must_change_password: true`
3. Change password → login with new password works

---

## Fuori Scope

- Password complexity validation (MVP: 8+ chars minimum)
- Token refresh logic with `must_change_password` flag (deferred to Phase 2)
- Audit logging for password changes (can be added per audit roadmap)
- Session revocation (old tokens after password change)

---

## Impatto in Produzione

**Backward compatible:**
- Existing employees: `must_change_password = false` by default
- Old login flow unchanged
- CSV import now returns more data (safe addition)

**Security improvement:**
- Temp passwords no longer stuck in email/chat (visible only in response)
- Forced change enforces password freshness
- Audit trail (can be added) shows who changed passwords when
