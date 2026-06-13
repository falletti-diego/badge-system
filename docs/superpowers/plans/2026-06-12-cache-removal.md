# S.32.3 — Remove App-Level Cache Middleware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove app-level cache middleware from Express app to eliminate cross-tenant data leak vulnerability via pre-auth caching.

**Architecture:** Single file change — remove cache middleware from `app.js:154` and clean up unused imports. No other changes needed; Redis utilities remain for future use.

**Tech Stack:** Node.js 20, Express 4, Jest test suite.

---

## File Structure

**Files to modify:**
- `backend/src/app.js` — Remove cache middleware mounting + clean up imports

**Files to keep (not touched):**
- `backend/src/middleware/cache.js` — Left as template for future per-route caching
- `backend/src/db/redis.js` — Utilities kept (used by rate limiter, not by cache)
- Test suite — Redis mocks remain (harmless, used elsewhere)

**Breaking change risk:** Zero — cache middleware is inactive (`CACHE_ENABLED=false`), so removal changes no behavior.

---

### Task 1: Remove cache middleware from app.js

**Files:**
- Modify: `backend/src/app.js` (lines 1-20 for imports, line 154 for middleware mounting)

- [ ] **Step 1: Read app.js to locate cache middleware**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/backend"
grep -n "cacheMiddleware" src/app.js
```

Expected output:
```
2: const { cacheMiddleware } = require('./middleware/cache');
154: app.use('/api/', cacheMiddleware());
```

- [ ] **Step 2: Remove the cache middleware mounting line**

Edit `backend/src/app.js` and delete line 154: `app.use('/api/', cacheMiddleware());`

After deletion, the code should go directly from:
```js
app.get('/api/v1', (req, res) => {
  res.json({ message: 'Badge System API', version: '1.0.0', status: 'operational' });
});

// v1 router — canonical API prefix
const v1Router = express.Router();
```

- [ ] **Step 3: Remove unused import**

Check if `cacheMiddleware` is imported but no longer used. In `backend/src/app.js` line ~2, if you see:

```js
const { cacheMiddleware } = require('./middleware/cache');
```

Remove this import line entirely (since we removed the only call to `cacheMiddleware()`).

- [ ] **Step 4: Verify no other references to cacheMiddleware**

```bash
grep -n "cacheMiddleware" src/app.js
```

Expected: No output (no references found).

- [ ] **Step 5: Run the full test suite to verify no regressions**

```bash
npm run test 2>&1 | tail -30
```

Expected output:
```
Test Suites: 20 passed, 20 total
Tests:       260 passed, 260 total
```

All tests should PASS. If any fail, investigate (but unlikely since cache is unused).

- [ ] **Step 6: Commit the change**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge"
git add backend/src/app.js
git commit -m "fix: remove app-level cache middleware to eliminate cross-tenant leak (S.32.3)

Removes pre-auth cache mounting that could serve responses across tenants.
Cache middleware is now disabled and unused. Redis utilities remain for
future per-route caching in Phase 2."
```

---

### Task 2: Smoke test on production-like environment

**Files:**
- None (testing only)

- [ ] **Step 1: Verify backend starts without errors**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/backend"
npm run dev 2>&1 | head -20
```

Expected: Backend starts, listens on port 3000, no cache-related errors.

- [ ] **Step 2: Health check**

```bash
curl -s http://localhost:3000/health | jq '.status'
```

Expected: `"ok"`

- [ ] **Step 3: Test a GET endpoint (would have hit cache if middleware existed)**

```bash
# Login to get a token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"pippo@badge.local","password":"pippo01"}' | jq -r '.data.token')

# GET checkins (should work, no cache involved)
curl -s http://localhost:3000/api/v1/checkins \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'
```

Expected: Number of check-ins returned (e.g., `71`), no errors.

- [ ] **Step 4: Verify no cache middleware logs**

```bash
# In backend logs, search for cache-related messages
npm run dev 2>&1 | grep -i "cache_middleware" &
# Make a request
curl -s http://localhost:3000/api/v1/checkins \
  -H "Authorization: Bearer $TOKEN" | jq '.' > /dev/null
# Check logs
```

Expected: No output (no cache middleware logs).

- [ ] **Step 5: Stop backend**

```bash
# Press Ctrl+C in the running dev server, or:
pkill -f "node.*app.js"
```

---

### Task 3: Update TASKS.md and commit

**Files:**
- Modify: `TASKS.md` (mark S.32.3 complete)

- [ ] **Step 1: Open TASKS.md and find S.32.3 section**

Read the section starting with `### S.32.3 — 🔴 Cache middleware...` (should be around line 34).

- [ ] **Step 2: Update S.32.3 to mark as complete**

Replace the S.32.3 section with:

```markdown
### S.32.3 — ✅ Cache middleware: chiave pre-auth = leak cross-tenant (CRITICO latente) 

App-level cache middleware removed to eliminate cross-tenant data leak vulnerability.
Pre-auth requests could share cached responses if CACHE_ENABLED=true. Now removed entirely.
Redis utilities remain for future per-route caching (Phase 2).

- [x] Decision: remove app-level cache entirely (safest for MVP)
- [x] Remove cache middleware from app.js:154
- [x] Clean up unused imports
- [x] Smoke test: backend starts, API works, no cache logs
- [x] Test suite: 260/260 tests passing
- ✅ Completato 2026-06-12 — zero cross-tenant leak risk | Spec: `docs/superpowers/specs/2026-06-12-cache-removal-design.md` | Commits: 581ca32 (spec), TBD_IMPLEMENTATION (implementation)
```

- [ ] **Step 3: Commit TASKS.md**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge"
git add TASKS.md
git commit -m "docs: mark S.32.3 complete in TASKS.md

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Spec Coverage Checklist

- ✅ Problem identified (pre-auth cache key → cross-tenant leak)
- ✅ Solution (remove middleware from app.js:154)
- ✅ Keep Redis utilities (not deleted, template left)
- ✅ Testing (smoke test + test suite verification)
- ✅ Future Phase 2 noted (per-route caching deferred)

**No gaps detected.**
