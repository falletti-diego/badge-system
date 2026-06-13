# S.32.6 Test Automation Guide — Complete Change Password Flow

## Overview

Questa guida descrive l'automazione di test per S.32.6 (ChangePasswordPage). Lo script testa:

1. **Backend Endpoint** (curl) — POST /api/auth/change-password
2. **Frontend Component** (Jest + RTL) — ChangePasswordPage rendering, validation, submission
3. **Route Guard** (Jest) — PasswordChangeGuard redirect logic
4. **Integration Flow** (Jest + mocking) — Full lifecycle: temp password → change → new login

**Tempo totale:** ~35 minuti  
**Quando usare:** Prima di ogni deploy a staging

---

## Prerequisiti

```bash
# Backend deve essere running
cd backend && npm run dev

# Frontend dev server è opzionale per questo test
# (Jest testa in isolamento con mock)

# Database deve avere:
# - Admin user: admin@company.local / AdminPassword123
# - Schema con users, clients, sites tables
```

---

## Come Eseguire

### Option A: Esegui tutti i test

```bash
bash scripts/test-s32-6-complete.sh
```

Output:
```
═══════════════════════════════════════════════════════════
  S.32.6 Complete Test Automation Script
═══════════════════════════════════════════════════════════

✅ Backend running on http://localhost:3000
✅ Node v20.x.x
✅ npm 10.x.x

═══════════════════════════════════════════════════════════
  PART 1: Backend Endpoint Tests (curl)
═══════════════════════════════════════════════════════════

✅ POST /api/auth/change-password (valid credentials) [HTTP 200]
✅ Response token is valid JWT format
✅ New token different from old token
✅ must_change_password: false
✅ Old password incorrect [HTTP 400]
✅ New password too short (<8 chars) [HTTP 400]
... (18/18 tests)

═══════════════════════════════════════════════════════════
  PART 2: Frontend Component Tests
═══════════════════════════════════════════════════════════

PASS src/__tests__/ChangePasswordPage.test.js (4.2s)
  ✓ should render all form fields (12ms)
  ✓ should show error when old password is empty (45ms)
  ... (14 tests total)

═══════════════════════════════════════════════════════════
  Final Test Report — S.32.6
═══════════════════════════════════════════════════════════

✅ ALL TESTS PASSED — READY FOR STAGING DEPLOYMENT

Next Steps:
  1. Manual E2E Test: CSV import → temp password → change → new login
  2. Deploy to staging: git push && netlify deploy --prod
  3. QA verification in staging environment
```

### Option B: Esegui test singoli

```bash
# Solo backend endpoint tests
bash backend/scripts/test-change-password-backend.sh

# Solo frontend component tests
cd frontend-web && npm run test -- --testPathPattern="ChangePasswordPage" --run

# Solo route guard tests
cd frontend-web && npm run test -- --testPathPattern="PasswordChangeGuard" --run

# Solo integration tests
cd frontend-web && npm run test -- --testPathPattern="ChangePasswordFlow" --run
```

---

## Cosa Viene Testato

### PART 1: Backend Endpoint (test-change-password-backend.sh)

| Test Case | Verifica | Pass Criteria |
|-----------|----------|---------------|
| Happy Path | Valid password change | Status 200, new token in response |
| Valid JWT | New token is proper JWT | Token format `xxx.yyy.zzz` |
| Different token | New token ≠ old token | Token actually changed |
| Flag cleared | must_change_password becomes false | Response has flag=false |
| Old password wrong | Validation error | Status 400 |
| Password too short | Validation error | Status 400 |
| Passwords equal | Validation error | Status 400 |
| Missing old_password | Validation error | Status 400 |
| Missing new_password | Validation error | Status 400 |
| No auth header | Unauthorized | Status 401 |
| Invalid token | Unauthorized | Status 401 |
| Request timeout | Network resilience | Response within 2s |

**Total: 18 tests**

### PART 2: Frontend Component (ChangePasswordPage.test.js)

| Test Case | Verifica | Pass Criteria |
|-----------|----------|---------------|
| Rendering | All form fields present | TextFields + Button visible |
| Empty validation | Old password required | Error message appears |
| Empty validation | New password required | Error message appears |
| Length validation | Password >= 8 chars | Error message appears |
| Match validation | Passwords match | Error message if different |
| Different validation | New ≠ old | Error message if equal |
| Error clear | Error disappears on type | No error after user input |
| Submit success | Form submits + localStorage updates | Token updated, success message |
| 400 error handling | Validation error no logout | Error shown, button enabled |
| 500 error handling | Server error no logout | Error shown, button enabled |
| Network error | Network error no logout | Error shown, button enabled |
| 401 error handling | Session revoked, logout | Logout called, redirect /login |
| Loading state | Button disabled while submitting | Button shows spinner |
| Fields disabled | Form fields disabled while submitting | All inputs disabled |

**Total: 14 tests**

### PART 3: Route Guard (PasswordChangeGuard.test.js)

| Test Case | Verifica | Pass Criteria |
|-----------|----------|---------------|
| Redirect /dashboard | Redirect when flag=true | Path becomes /change-password |
| Redirect /planning | Redirect when flag=true | Path becomes /change-password |
| Redirect /admin | Redirect when flag=true | Path becomes /change-password |
| Allow /change-password | No redirect when on /change-password | Path stays /change-password |
| Allow /login | No redirect when on /login | Path stays /login |
| No redirect flag=false | No redirect when flag=false | Path stays /dashboard |
| No redirect /planning flag=false | No redirect when flag=false | Path stays /planning |
| No redirect /admin flag=false | No redirect when flag=false | Path stays /admin |
| Token update affects guard | After password change, no redirect | Redirect stops after token update |
| Invalid JSON handling | Graceful handling of corrupted data | No crash, guard works |
| Missing flag handling | Graceful handling of missing flag | No redirect (undefined ≠ true) |

**Total: 11 tests**

### PART 4: Integration Flow (ChangePasswordFlow.e2e.test.js)

| Test Case | Verifica | Pass Criteria |
|-----------|----------|---------------|
| CSV login | Login with temp password | User has must_change_password=true |
| Flag present | Flag is set after CSV import | must_change_password=true in response |
| Password change | Change password successfully | New token in localStorage |
| New token | Token changes after password change | token != old_token |
| Flag cleared | Flag cleared after password change | must_change_password=false |
| Guard redirect | Guard redirects to /change-password | Redirect when flag=true |
| Guard allow | Guard allows dashboard when flag=false | No redirect when flag=false |
| 400 no logout | 400 error doesn't logout | Token still in localStorage |
| 500 no logout | 500 error doesn't logout | Token still in localStorage |
| Network no logout | Network error doesn't logout | Token still in localStorage |
| 401 logout | 401 error causes logout | localStorage cleared |
| New password login | Login with new password works | must_change_password=false |
| Old password fails | Old password doesn't work | Login fails with 400 |
| Full lifecycle | CSV → temp → change → new login | Complete flow works |
| User data maintained | User id/email unchanged | Email and id persist |

**Total: 15 tests**

---

## Output & Interpretation

### Success Output
```
✅ ALL TESTS PASSED — READY FOR STAGING DEPLOYMENT

Passed: 4 / 4 (100%)
Failed: 0 / 4

Next Steps:
  1. Manual E2E Test: CSV import → temp password → change → new login
  2. Deploy to staging: git push && netlify deploy --prod
  3. QA verification in staging environment
```

**Significato:** Tutti i test hanno passato. Il backend endpoint è stabile, il frontend component funziona correttamente, la route guard redirige come previsto, e il flusso di integrazione completo è verificato.

### Failure Output
```
❌ SOME TESTS FAILED — FIX BEFORE DEPLOYMENT

Passed: 2 / 4 (50%)
Failed: 2 / 4

Failed Sections: 2
Check logs:
  • Backend: cat /tmp/backend-test-results.log
  • Frontend Components: cat /tmp/frontend-component-test.log
  • Route Guard: cat /tmp/frontend-guard-test.log
  • Integration: cat /tmp/frontend-integration-test.log
```

**Significato:** Alcuni test hanno fallito. Controlla i log per capire quale sezione ha problemi.

---

## Debugging

### Se fallisce Backend Endpoint Tests

```bash
cat /tmp/backend-test-results.log

# Cercare: "❌" per vedere quale test è fallito
# Azioni:
# 1. Verifica backend is running: curl http://localhost:3000/health
# 2. Verifica database has admin user: 
#    psql -U postgres -d badge_system -c "SELECT email FROM users WHERE role='admin';"
# 3. Controlla routes/auth.js per errori di logica
```

### Se fallisce Frontend Component Tests

```bash
cat /tmp/frontend-component-test.log

# Azioni:
# 1. Controlla ChangePasswordPage.jsx per sintassi/logica
# 2. Verifica mock setup in test file
# 3. Run in watch mode per debugging:
#    npm run test -- --testPathPattern="ChangePasswordPage" --watch
```

### Se fallisce Route Guard Tests

```bash
cat /tmp/frontend-guard-test.log

# Azioni:
# 1. Controlla App.jsx PasswordChangeGuard component
# 2. Verifica localStorage handling
# 3. Controlla useLocation/useNavigate mock setup
```

### Se fallisce Integration Tests

```bash
cat /tmp/frontend-integration-test.log

# Azioni:
# 1. Controlla apiClient mock in test setup
# 2. Verifica authService mock
# 3. Assicurati localStorage mock funziona
```

---

## Performance Metrics

Tempo per ciascuna sezione:

| Sezione | Tempo | Note |
|---------|-------|------|
| Backend tests | 5 min | 18 curl request |
| Frontend component | 10 min | 14 Jest tests |
| Route guard | 5 min | 11 Jest tests |
| Integration | 8 min | 15 Jest + mock tests |
| **Total** | **~35 min** | Per esecuzione completa |

---

## When to Run

**Prima di ogni deploy a staging:**
```bash
bash scripts/test-s32-6-complete.sh
```

**Durante sviluppo (watch mode):**
```bash
cd frontend-web && npm run test -- --testPathPattern="ChangePasswordPage" --watch
```

**Su CI/CD (GitHub Actions):**
```bash
npm run test:coverage
npm run test -- --testPathPattern="ChangePassword|PasswordChangeGuard|ChangePasswordFlow" --run
```

---

## Limiti Noti

⚠️ **Cose NON testate da questo script:**

| Cosa | Perché | Soluzione |
|------|--------|----------|
| UI/UX visuale | Richiede browser | Manual E2E test (Part 5 del piano) |
| CSV file upload | Richiede browser + file system | Manual test in AdminPage |
| Real database queries | Usa mock axios | Run `npm run test -- --env=integration` |
| Network latency | Mock istantanea | Use `jest.useFakeTimers()` |
| Cross-browser compatibility | Test su Node.js | Manual test in Safari/Chrome/Firefox |

Per testare questi aspetti, esegui il **Manual E2E Test** (Part 7 del piano di test).

---

## Files Coinvolti

```
backend/
├── scripts/
│   └── test-change-password-backend.sh   ← Backend endpoint tests
└── src/
    └── routes/auth.js                    ← POST /api/auth/change-password endpoint

frontend-web/
├── src/
│   ├── pages/
│   │   └── ChangePasswordPage.jsx        ← Component tested in Part 2
│   └── __tests__/
│       ├── ChangePasswordPage.test.js    ← Part 2 tests
│       ├── PasswordChangeGuard.test.js   ← Part 3 tests
│       └── ChangePasswordFlow.e2e.test.js ← Part 4 tests
└── src/App.jsx                           ← PasswordChangeGuard component tested in Part 3

scripts/
└── test-s32-6-complete.sh                ← Master script (questo)
```

---

## Workflow Consigliato

```
1. Commit codice S.32.6
   git add .
   git commit -m "feat: S.32.6 ChangePasswordPage (Tasks 6-8)"

2. Esegui automazione test
   bash scripts/test-s32-6-complete.sh

3. Se tutti i test passano:
   → Go to Manual E2E test (Part 5-7 del piano di test)
   
4. Se alcuni test falliscono:
   → Controlla log, fix, retry
   → Repeat step 2

5. Dopo manual E2E test passa:
   → git push
   → netlify deploy --prod
   → QA verification in staging
```

---

## Contacts & Support

Domande? Controlla:
- CLAUDE.md (project instructions)
- Session memory files in `.claude/projects/*/memory/`
- TASKS.md (current status)

