# FASE 3.2 Implementation Plan: Auth Page — MVP Login

**Date:** 3 Giugno 2026  
**Status:** Ready for Implementation  
**Context:** Dashboard MVP complete, now building login page  
**Time Estimate:** 3-4 hours with Haiku  

---

## 🎯 REQUIREMENTS

### MVP Auth Scope
- **Email/Password login** (simple form)
- **Mock Auth0 integration** (hardcoded token for MVP)
- **Session storage** (localStorage for JWT token)
- **Protected routes** (redirect to /login if not authenticated)
- **Logout functionality** (clear token + redirect to /login)
- **Mobile-friendly responsive design**

### OUT of Scope (Phase 2)
- ❌ Real Auth0 integration
- ❌ Face ID authentication
- ❌ Sign-up/registration page
- ❌ Password reset
- ❌ Two-factor authentication
- ❌ Social login (Google, GitHub)

---

## 🏗️ ARCHITECTURE

### Frontend Flow
```
/login (Public)
├─ Email input
├─ Password input
├─ Submit button
├─ Error messages
└─ Redirect to /dashboard on success

/dashboard (Protected)
├─ Check localStorage for token
├─ If missing → redirect to /login
├─ If present → render dashboard
└─ Logout button in navbar

PrivateRoute Component
├─ Wrap protected pages
├─ Verify token exists
├─ If not → <Redirect to="/login" />
└─ If yes → <Component />
```

### Backend Endpoints (MVP)

#### POST /api/auth/login
**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (Success 200):**
```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "role": "admin"
    }
  }
}
```

**Response (Error 401):**
```json
{
  "error": "INVALID_CREDENTIALS",
  "message": "Email or password incorrect",
  "statusCode": 401
}
```

#### GET /api/auth/me (optional, but good practice)
**Request:** Requires Authorization header
**Response:** Returns current user data

---

## 📋 IMPLEMENTATION CHECKLIST

### Backend
- [ ] **auth.js route:** POST /api/auth/login endpoint
- [ ] **authService.js:** Mock credential validation (hardcoded for MVP)
- [ ] **Validation schema:** LoginSchema with email/password validation
- [ ] **JWT generation:** Sign token with JWT_SECRET env var
- [ ] **Error handling:** 401 for invalid credentials
- [ ] **Test endpoint:** Curl test with valid/invalid credentials

### Frontend
- [ ] **Login page component** (LoginPage.jsx)
  - [ ] Email input field
  - [ ] Password input field
  - [ ] Submit button
  - [ ] Error message display
  - [ ] Loading state during submission
- [ ] **PrivateRoute component** (ProtectedRoute.jsx)
  - [ ] Check token in localStorage
  - [ ] Redirect to /login if missing
  - [ ] Render component if present
- [ ] **Auth service** (authService.js)
  - [ ] `login(email, password)` function
  - [ ] `logout()` function
  - [ ] `getToken()` function
  - [ ] `setToken(token)` function
- [ ] **App routing** (App.jsx)
  - [ ] `/login` → LoginPage (public)
  - [ ] `/dashboard` → wrapped in PrivateRoute
  - [ ] Logout button in navbar
- [ ] **Styling** (Tailwind CSS)
  - [ ] Login form centered on page
  - [ ] Error messages (red text)
  - [ ] Loading spinner on submit
  - [ ] Responsive mobile design

### Integration
- [ ] Logout button in dashboard navbar
- [ ] Redirect after logout to /login
- [ ] Auth header in API calls (`Authorization: Bearer <token>`)
- [ ] Test full login → dashboard → logout flow

---

## 📁 FILE STRUCTURE

**Backend:**
```
backend/src/
├─ routes/
│  └─ auth.js (NEW)
├─ middleware/
│  ├─ validation.js (UPDATE: add LoginSchema)
│  └─ auth.js (ALREADY EXISTS)
└─ services/
   └─ auth-service.js (NEW: mock credentials)
```

**Frontend:**
```
frontend-web/src/
├─ pages/
│  └─ LoginPage.jsx (NEW)
├─ components/
│  └─ ProtectedRoute.jsx (NEW)
├─ services/
│  └─ authService.js (NEW)
├─ App.jsx (UPDATE: add routes)
└─ index.css (if needed)
```

---

## 🔐 SECURITY NOTES (MVP)

### For MVP Only
- **Hardcoded credentials:** `email: "demo@badge.it", password: "demo123"`
- **JWT_SECRET:** Will use from env var (set in .env)
- **Token expiry:** 7 days (hardcoded)
- **No password hashing:** Since it's mock auth

### For Production (Phase 2)
- Use real Auth0 or similar service
- Hash passwords with bcrypt
- Short token expiry (15 min access + refresh token)
- HTTPS only (already done)
- Secure cookies (httpOnly, sameSite)

---

## 📐 DATA MODELS

### LoginRequest (Zod)
```javascript
const LoginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password required'),
  }),
});
```

### User (Internal)
```typescript
interface User {
  id: string;          // UUID
  email: string;       // user@example.com
  role: 'admin' | 'manager' | 'employee';  // for future RBAC
  client_id: string;   // Multi-tenant
}
```

### JWT Payload
```typescript
interface JWTPayload {
  user_id: string;
  email: string;
  role: string;
  client_id: string;
  iat: number;         // Issued at
  exp: number;         // Expiration
}
```

---

## 🧪 TESTING PLAN

### Manual Testing (Checklist)
- [ ] Login with valid credentials → redirect to /dashboard
- [ ] Login with invalid email → show error message
- [ ] Login with wrong password → show error message
- [ ] Login with empty fields → show validation error
- [ ] Token stored in localStorage ✓
- [ ] Hard refresh dashboard → still authenticated (token in storage)
- [ ] Logout button → clears token + redirects to /login
- [ ] Try accessing /dashboard without token → redirect to /login
- [ ] Token expires after 7 days (or test with short expiry)

### Curl Testing
```bash
# Valid login
curl -X POST https://api.dataxiom.it/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@badge.it","password":"demo123"}' | jq '.'

# Invalid credentials
curl -X POST https://api.dataxiom.it/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@badge.it","password":"wrong"}' | jq '.'

# Use token in protected endpoint
curl -H "Authorization: Bearer <token>" \
  https://api.dataxiom.it/api/checkins | jq '.'
```

---

## 🎨 UI MOCKUP (LoginPage)

```
┌─────────────────────────────────────┐
│                                     │
│      Badge System - Login           │
│                                     │
│   ┌───────────────────────────┐    │
│   │ Email                     │    │
│   │ [demo@badge.it          ]│    │
│   └───────────────────────────┘    │
│                                     │
│   ┌───────────────────────────┐    │
│   │ Password                  │    │
│   │ [•••••••••••••••         ]│    │
│   └───────────────────────────┘    │
│                                     │
│   ┌───────────────────────────┐    │
│   │    Sign In                │    │
│   └───────────────────────────┘    │
│                                     │
│   Forgot password? (Phase 2)        │
│                                     │
└─────────────────────────────────────┘
```

**Colors:**
- Button: Navy Blue (#1E3A5F)
- Error text: Red (#DC2626)
- Input border: Light Gray (#E5E7EB)
- Background: Linen (#F5F2ED)

---

## ⏱️ TIME ESTIMATE

| Task | Time | Notes |
|------|------|-------|
| Backend: auth route + validation | 45min | POST /login endpoint, LoginSchema |
| Backend: mock auth service | 30min | Hardcoded credentials |
| Frontend: LoginPage component | 45min | Form, inputs, styling |
| Frontend: ProtectedRoute component | 30min | Token check, redirect logic |
| Frontend: authService.js | 30min | Login/logout/token management |
| Frontend: App.jsx routing | 30min | Add routes, protect /dashboard |
| Frontend: Navbar logout button | 20min | Add logout to existing navbar |
| Integration testing | 30min | E2E test login → dashboard → logout |
| **TOTAL** | **3.5h** | Includes 20% buffer |

---

## 🚀 SUCCESS CRITERIA

- ✅ User can login with demo@badge.it / demo123
- ✅ Token stored in localStorage after login
- ✅ Dashboard only accessible when authenticated
- ✅ Logout clears token + redirects to /login
- ✅ Form validation shows errors (empty fields, invalid email)
- ✅ API calls include Authorization header with token
- ✅ Responsive design works on mobile
- ✅ No console errors
- ✅ Netlify deployment successful

---

## 🔗 DEPENDENCIES

**Backend:**
- Express.js (✅ exists)
- jsonwebtoken (npm: `npm install jsonwebtoken`)
- Zod (✅ exists)

**Frontend:**
- React Router (npm: `npm install react-router-dom` if not exists)
- Axios (✅ exists)
- Material-UI (✅ exists)
- Tailwind CSS (✅ exists)

---

## 📝 NOTES

### MVP Philosophy
- **Hardcoded demo account** for simplicity
- **localStorage for token storage** (not secure, but OK for MVP demo)
- **No password hashing** (mock auth)
- **Simple JWT token** (no refresh tokens yet)

### Real Auth0 Migration (Phase 2)
When ready to migrate:
1. Create Auth0 tenant
2. Replace POST /login with Auth0 SDK
3. Update frontend to use Auth0 React SDK
4. Move from localStorage to secure cookies
5. Add social login options

### Tech Debt (Phase 2)
- [ ] Switch to httpOnly cookies (not localStorage)
- [ ] Implement refresh tokens
- [ ] Add password reset flow
- [ ] Add user sign-up endpoint
- [ ] Implement rate limiting on login (prevent brute force)

---

## NEXT STEPS

1. ✅ Create this plan
2. → Implement backend auth route (POST /login)
3. → Implement frontend LoginPage
4. → Test login/logout flow
5. → Update dashboard navbar with logout button
6. → Deploy to production
7. → Verify Netlify + API working

**Ready to start? Let's implement!**

