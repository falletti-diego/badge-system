# S.32.6 Manual E2E Test — Complete Change Password Flow

**Documento:** Manual E2E Test Plan  
**Data:** 2026-06-13  
**Durata stimata:** 20-30 minuti  
**Prerequisiti:**
- Backend running: `npm run dev` (backend/)
- Frontend dev server: `npm run dev` (frontend-web/)
- Browser: Chrome/Safari/Firefox
- Localhost: http://localhost:5173

---

## 📋 OVERVIEW

Test completo della password change flow:

```
CSV Import (3 employees)
    ↓
Employee 1: Login con temp password
    ↓
Redirect automatico → /change-password
    ↓
ChangePasswordPage form rendering
    ↓
Form validation (client-side)
    ↓
Submit change password
    ↓
Success message
    ↓
Auto-redirect → /dashboard
    ↓
Dashboard loads
    ↓
Logout
    ↓
Login con NEW password
    ↓
Direct access to /dashboard (no redirect)
```

**Total steps:** 12  
**Expected time:** 20-30 min

---

## 🚀 PARTE 1: CSV Import (Create 3 Test Employees)

### Step 1.1: Open Admin Panel
1. Open http://localhost:5173/admin
2. You should see **Admin Dashboard**
3. Login: `pippo@badge.local` / `pippo01`

**Verify:**
- ✅ Admin panel loads
- ✅ Navigation visible (Admin menu items)
- ✅ Employee list visible

### Step 1.2: Prepare CSV File
Create a file `test-employees.csv` on your computer:

```csv
email,name,phone,assigned_sites
testemployee1.s33@company.local,Test Employee 1,+39-333-1111111,Torino Store
testemployee2.s33@company.local,Test Employee 2,+39-333-2222222,Torino Store
testemployee3.s33@company.local,Test Employee 3,+39-333-3333333,Milano Store
```

**Note:** Use unique emails (add date/timestamp if running test multiple times)

### Step 1.3: Import CSV in Admin Panel
1. In Admin panel, find **"Import Employees"** section (or similar)
2. Click **"Upload CSV"** button
3. Select `test-employees.csv`
4. Click **"Import"**

**Expected Response:**
```
✅ Import successful
Created: 3 employees
Passwords generated:
  - testemployee1: [temp_password_1]
  - testemployee2: [temp_password_2]
  - testemployee3: [temp_password_3]
```

**Action:** 📋 **Copy temp passwords for testemployee1** (needed for Step 2.1)

**Verify:**
- ✅ 3 employees created
- ✅ Temp passwords displayed
- ✅ Employees visible in employee list

---

## 🔐 PARTE 2: Employee 1 — Login with Temp Password

### Step 2.1: Navigate to Login Page
1. Open http://localhost:5173/login
2. You should see **Login Form**

### Step 2.2: Enter Credentials
1. **Email:** `testemployee1.s33@company.local`
2. **Password:** [temp_password_1 from Step 1.3]
3. Click **"Login"** button

**Expected Behavior:**
- ✅ Submit button shows "Logging in..." (spinner)
- ✅ No errors
- ✅ Page redirects automatically

---

## 📝 PARTE 3: PasswordChangeGuard — Automatic Redirect

### Step 3.1: Verify Redirect to /change-password
After Step 2.2, you should be **automatically redirected** to:

```
URL: http://localhost:5173/change-password
```

**Do NOT manually navigate** — the guard should redirect automatically.

**Expected:**
- ✅ URL is `/change-password`
- ✅ Page loads within 1-2 seconds
- ✅ No console errors

**If redirect doesn't happen:**
- ⚠️ Check browser console (F12 → Console tab)
- ⚠️ Check localStorage (F12 → Application → Local Storage)
- ⚠️ Verify badge_user has `must_change_password: true`

---

## 🔄 PARTE 4: ChangePasswordPage — Form Rendering & Validation

### Step 4.1: Verify Page Rendering
You should see:

```
┌─────────────────────────────────────────┐
│  Change Password                        │
│                                         │
│  For security reasons, you must change  │
│  your password before you can continue. │
│                                         │
│  ┌─────────────────────────────────────┐
│  │ Current Password                    │
│  │ [________________]                  │
│  │                                     │
│  │ New Password                        │
│  │ [________________]                  │
│  │                                     │
│  │ Confirm New Password                │
│  │ [________________]                  │
│  │                                     │
│  │ [Change Password] (button)          │
│  └─────────────────────────────────────┘
│                                         │
│  Requirements:                          │
│  • At least 8 characters                │
│  • Different from current password      │
└─────────────────────────────────────────┘
```

**Verify:**
- ✅ Title "Change Password" visible
- ✅ Subtitle about mandatory change visible
- ✅ 3 password fields (Current, New, Confirm)
- ✅ "Change Password" button enabled
- ✅ Info box with requirements visible

### Step 4.2: Test Client-Side Validation — Missing Fields

1. Click **"Change Password"** button (without filling any fields)
2. Check for error messages under each field

**Expected Errors:**
- Under "Current Password": ❌ "Current password is required"
- Under "New Password": ❌ "New password is required"
- Under "Confirm New Password": ❌ "Confirm password is required"

**Verify:**
- ✅ Errors appear in red
- ✅ Button remains clickable (not disabled)
- ✅ Form doesn't submit

### Step 4.3: Test Client-Side Validation — Password Too Short

1. Fill **"Current Password"**: `[temp_password_1]`
2. Fill **"New Password"**: `Short` (5 characters)
3. Fill **"Confirm New Password"**: `Short`
4. Click **"Change Password"**

**Expected Error:**
- Under "New Password": ❌ "Password must be at least 8 characters"

**Verify:**
- ✅ Error appears
- ✅ Form doesn't submit

### Step 4.4: Test Client-Side Validation — Passwords Don't Match

1. Fill **"Current Password"**: `[temp_password_1]`
2. Fill **"New Password"**: `NewPassword123`
3. Fill **"Confirm New Password"**: `DifferentPassword123`
4. Click **"Change Password"**

**Expected Error:**
- Under "Confirm New Password": ❌ "Passwords do not match"

**Verify:**
- ✅ Error appears
- ✅ Form doesn't submit

### Step 4.5: Test Client-Side Validation — New = Old Password

1. Fill **"Current Password"**: `[temp_password_1]`
2. Fill **"New Password"**: `[temp_password_1]` (same as current)
3. Fill **"Confirm New Password"**: `[temp_password_1]`
4. Click **"Change Password"**

**Expected Error:**
- Under "New Password": ❌ "New password must be different from current password"

**Verify:**
- ✅ Error appears
- ✅ Form doesn't submit

---

## ✅ PARTE 5: Change Password — Success Flow (Opzione A)

### Step 5.1: Clear Form & Fill Correct Values

1. Clear all fields (or refresh page and login again if needed)
2. Fill **"Current Password"**: `[temp_password_1]`
3. Fill **"New Password"**: `NewPassword123NewPassword!`
4. Fill **"Confirm New Password"**: `NewPassword123NewPassword!`

**Note:** Use a strong password (8+ chars, mix upper/lower/numbers/special chars)

### Step 5.2: Submit Form

1. Click **"Change Password"** button

**Expected Behavior (Opzione A — Auto-Update + Auto-Redirect):**

🔄 **During submit (2-3 seconds):**
- ✅ Button changes to "Changing password..." with spinner
- ✅ Form fields become disabled (grayed out)
- ✅ Network request in DevTools: POST /api/auth/change-password (should be 200)

🎉 **After success:**
- ✅ **Green success message:** "Password changed successfully! Redirecting to dashboard..."
- ✅ Message appears for ~1 second
- ✅ Page automatically redirects to `/dashboard`

**Verify in DevTools (F12 → Application → Local Storage):**
- ✅ `badge_auth_token`: Updated with NEW token (different from before)
- ✅ `badge_refresh_token`: Updated
- ✅ `badge_user`: JSON with `must_change_password: false` ← **CRITICAL**

---

## 📊 PARTE 6: Dashboard — Verify Access & Data

### Step 6.1: Dashboard Loads Successfully

After redirect from Step 5.2, you should be on `/dashboard` with:

```
┌──────────────────────────────────────────┐
│  Badge System Dashboard                  │
│                                          │
│  ┌─────────────┐  ┌─────────────┐       │
│  │ Presenti    │  │ Assenti     │       │
│  │ 42          │  │ 3           │       │
│  └─────────────┘  └─────────────┘       │
│                                          │
│  ┌─────────────┐  ┌─────────────┐       │
│  │ In Ritardo  │  │ Ore Lavorate│       │
│  │ 1           │  │ 320:45      │       │
│  └─────────────┘  └─────────────┘       │
│                                          │
│  [Presences Table...]                   │
└──────────────────────────────────────────┘
```

**Verify:**
- ✅ Dashboard URL is `http://localhost:5173/dashboard`
- ✅ KPI cards visible (Presenti, Assenti, etc.)
- ✅ Presences table visible
- ✅ No error messages
- ✅ No redirect back to /change-password

### Step 6.2: Verify No Redirect Back to /change-password

1. Dashboard should load and **stay on /dashboard**
2. Refresh page (F5) — should remain on /dashboard
3. No automatic redirect to /change-password

**Verify:**
- ✅ URL remains `/dashboard`
- ✅ Page doesn't redirect
- ✅ PasswordChangeGuard is not active (because must_change_password=false)

---

## 🚪 PARTE 7: Logout

### Step 7.1: Logout from Dashboard
1. Look for **"Logout"** button (usually top-right or hamburger menu)
2. Click **"Logout"**

**Expected Behavior:**
- ✅ Page redirects to `/login`
- ✅ localStorage is cleared (verify in DevTools)
- ✅ No tokens in storage

**Verify in DevTools (F12 → Application → Local Storage):**
- ✅ `badge_auth_token`: Empty or removed
- ✅ `badge_refresh_token`: Empty or removed
- ✅ `badge_user`: Empty or removed

---

## 🔐 PARTE 8: Login with NEW Password

### Step 8.1: Login with New Password
1. You should be on `/login` page (from Step 7.1)
2. Fill **Email**: `testemployee1.s33@company.local`
3. Fill **Password**: `NewPassword123NewPassword!` (the NEW password you set in Step 5.1)
4. Click **"Login"**

**Expected Behavior:**
- ✅ Login succeeds (no error)
- ✅ Token generated and stored in localStorage
- ✅ **NO redirect to /change-password** (because must_change_password=false)
- ✅ **Direct redirect to /dashboard**

**Verify:**
- ✅ URL is `/dashboard` (not `/change-password`)
- ✅ Dashboard loads normally
- ✅ localStorage has new tokens

### Step 8.2: Verify OLD Password Doesn't Work

1. Logout again (Step 7.1)
2. Try to login with **OLD password**: `[temp_password_1]`

**Expected Behavior:**
- ❌ Login fails with error: "Email or password is incorrect"
- ✅ No redirect, user stays on login page

**Verify:**
- ✅ Error message visible
- ✅ Login fails as expected

---

## 🎯 PARTE 9: Additional Test Cases (Optional)

### Test Case 9.1: Error Handling — Server Error

**Scenario:** Network hiccup during password change

1. Logout and login with testemployee2 (Step 1.3 — use testemployee2 for this)
2. Follow Step 5.1 & 5.2, BUT
3. Open DevTools **Network tab** BEFORE clicking submit
4. In Network tab, find the **POST /api/auth/change-password** request and **right-click → Throttle to offline** (simulate server error)
5. Click **"Change Password"**

**Expected Behavior (Opzione B — Intelligente):**
- ✅ Error message appears: "Server error. Please wait a moment and try again. Your session is still valid."
- ✅ **NO logout** — localStorage still has tokens
- ✅ "Change Password" button re-enabled
- ✅ Form fields remain editable
- ✅ User can retry after network recovers

**Verify:**
- ✅ Error handling works
- ✅ Session not destroyed
- ✅ Retry possible

### Test Case 9.2: Validation Error — Wrong Old Password

1. Logout and login with testemployee3
2. Fill form:
   - Current Password: `WrongPassword123`
   - New Password: `NewPassword456`
   - Confirm: `NewPassword456`
3. Click **"Change Password"**

**Expected Behavior (Opzione B — Intelligente):**
- ✅ Error message: "Current password is incorrect"
- ✅ **NO logout** — session still valid
- ✅ Button re-enabled
- ✅ User can retry with correct password

**Verify:**
- ✅ Error message specific and helpful
- ✅ Session preserved
- ✅ No unexpected logout

---

## 📋 TEST SUMMARY CHECKLIST

After completing all parts, verify:

### Part 1: CSV Import
- [ ] 3 employees imported successfully
- [ ] Temp passwords displayed
- [ ] Employees visible in admin panel

### Part 2: Login with Temp Password
- [ ] Login succeeds with temp password
- [ ] No errors

### Part 3: PasswordChangeGuard Redirect
- [ ] Automatic redirect to /change-password
- [ ] No manual navigation needed
- [ ] must_change_password=true in localStorage

### Part 4: Form Validation
- [ ] Missing fields: errors shown
- [ ] Password too short: error shown
- [ ] Passwords don't match: error shown
- [ ] New = old password: error shown
- [ ] Errors disappear when user corrects input

### Part 5: Success Flow
- [ ] Form submits successfully
- [ ] Success message visible for ~1 second
- [ ] Auto-redirect to /dashboard
- [ ] localStorage updated with new tokens
- [ ] must_change_password=false in localStorage

### Part 6: Dashboard Access
- [ ] Dashboard loads without errors
- [ ] KPI cards and table visible
- [ ] No unexpected redirect to /change-password

### Part 7: Logout
- [ ] Logout button accessible
- [ ] Redirect to /login successful
- [ ] localStorage cleared

### Part 8: Login with New Password
- [ ] Login with NEW password succeeds
- [ ] Direct access to /dashboard (no /change-password redirect)
- [ ] OLD password fails to login

### Part 9 (Optional): Error Cases
- [ ] Server error handling works
- [ ] Validation error handling works
- [ ] Session preserved in error cases

---

## ❌ TROUBLESHOOTING

### Issue: Redirect to /change-password doesn't happen
**Solution:**
1. Check DevTools Console (F12) for errors
2. Verify `must_change_password: true` in localStorage
3. Check that PasswordChangeGuard component is mounted in App.jsx
4. Verify /change-password route exists in App.jsx

### Issue: Form validation doesn't show errors
**Solution:**
1. Check DevTools Console for JavaScript errors
2. Verify TextField components are rendering
3. Confirm validation logic in ChangePasswordPage.jsx

### Issue: Password change submits but doesn't redirect
**Solution:**
1. Check Network tab in DevTools
2. Verify POST /api/auth/change-password returns 200
3. Check response includes new token
4. Verify localStorage is being updated
5. Check setTimeout is working (1 second delay before redirect)

### Issue: Cannot login with new password
**Solution:**
1. Verify password was actually changed (check response in Step 5.2)
2. Verify new password is typed correctly (case-sensitive)
3. Check database: employee's password_hash should be updated
4. Try logging in with temp password first to confirm it's no longer valid

### Issue: Old password still works after change
**Solution:**
1. This is a **CRITICAL BUG** — password change didn't persist
2. Check backend logs for errors during password change
3. Verify database transaction completed
4. Restart backend and try again

---

## 🎯 SUCCESS CRITERIA

Test is **PASSED** when:

1. ✅ All 3 employees imported via CSV
2. ✅ Employee 1 logs in with temp password
3. ✅ Automatic redirect to /change-password
4. ✅ Form renders with all fields
5. ✅ Validation errors show correctly
6. ✅ Password change submits successfully
7. ✅ Auto-redirect to /dashboard (1 second delay)
8. ✅ Dashboard loads normally
9. ✅ Logout clears session
10. ✅ Login with NEW password succeeds
11. ✅ Login with OLD password fails
12. ✅ Direct access to /dashboard with new password (no /change-password redirect)

---

## 📞 NEXT STEPS

After manual E2E test **PASSES**:

1. ✅ Commit test results: `git add . && git commit -m "manual E2E test: S.32.6 passed"`
2. ✅ Deploy to staging: `git push && netlify deploy --prod`
3. ✅ QA verification in staging environment
4. ✅ Move to next task: S.32.8 (Split file monolitics)

If test **FAILS**:

1. ❌ Check logs and fix the bug
2. ❌ Re-run affected test cases
3. ❌ When fixed, re-run full E2E test again

---

**Duration:** 20-30 minutes  
**Complexity:** Medium (form interaction, validation, redirects)  
**Browser:** Chrome/Safari/Firefox  
**Confidence:** HIGH — tests complete user flow end-to-end

