# Refresh Token Replay-Detection Hotfix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a production bug in `POST /api/v1/auth/refresh` that rejects the *first* refresh attempt of every real (non-`@badge.local`) customer login with a false `SESSION_REVOKED`/replay-attack response, while preserving the genuine concurrency protection the buggy code was trying to add.

**Architecture:** This is a hotfix to shared, security-critical authentication code (`backend/src/routes/auth.js`) that is live on `main`/production today — it is **not** part of the `worktree-demo-self-service` feature branch and must not be bundled with it. Execute this plan in a **fresh worktree branched from `main`** (not from `worktree-demo-self-service`), created via `superpowers:using-git-worktrees` at execution time, e.g. branch name `hotfix-refresh-replay-detection`. This lets the fix ship and deploy independently of the multi-week demo-self-service feature.

**Tech Stack:** Node.js/Express backend, `jsonwebtoken` (RS256), PostgreSQL (`used_tokens`/`revoked_tokens` tables), Jest + Supertest.

---

## Root Cause (read this before touching any code)

Two commits, both already on `main`, left `POST /auth/refresh`'s replay-detection logic in a broken, self-contradictory state:

1. **Commit `907a6fb`** (12 Jun 2026, "Remove jti insert from login endpoint - unblocks first refresh") removed the `INSERT INTO used_tokens` that `POST /login` performed at token-issuance time, because its presence caused the *first* refresh of any token to be misidentified as a replay. This "fixed" the symptom, but reopened a real (narrower) race: a freshly-issued refresh token has no `used_tokens` row to lock, so `SELECT ... FOR UPDATE` on it locks nothing — two concurrent refresh requests using that same fresh token could both proceed, both succeed, and both mint a new (different) rotated token from the same original one.

2. **Commit `6abb03f`** (14 Jun 2026, "S.32.7 Critical Fixes: Race Condition + Middleware Integration + Test Suite") re-added the `INSERT INTO used_tokens` at login time specifically to close that concurrency hole ("SELECT FOR UPDATE now locks existing jti rows reliably"), but did **not** update the `SELECT ... FOR UPDATE` check in `/refresh` to match the new meaning of "a row exists." The check still says:

   ```js
   if (replayCheck.rows.length > 0) {
     // treated as REPLAY DETECTED
   }
   ```

   Under the *old* (pre-`907a6fb`) design, `used_tokens` was a blacklist of already-consumed jtis, so "found" correctly meant "replay." Under the *current* design (jti inserted at issuance, i.e. at login and at every subsequent refresh), a row's presence means "this is the current, valid, not-yet-consumed token" — the semantics **must be flipped**: presence should mean *proceed* (consume it, rotate), and *absence* should mean "already consumed or never issued" → replay.

   Net effect on `main` today: **every real (DB-backed, non-`@badge.local`) customer's first refresh attempt fails with 401 `SESSION_REVOKED`**, because `POST /login` just inserted that exact jti a few seconds earlier. `@badge.local` demo accounts are unaffected only because `POST /login` explicitly skips the insert for them (`if (user.id && !email.endsWith(BADGE_LOCAL_DOMAIN))` at `auth.js:161`) — so this has zero user-visible symptom for the fixed internal demo accounts used in most manual/session testing, which is exactly why it went unnoticed.

**The fix is not a revert to `907a6fb`** (that would silently reopen the concurrency hole `6abb03f` was trying to close). It is completing `6abb03f`'s own stated design: flip the found/not-found interpretation, and thread the existing demo-user exemption into `/refresh` (today the exemption only exists at `/login`; `/refresh`'s replay-check block currently runs unconditionally for demo users too — harmless today only because their jti is never inserted anywhere, so it always reads "not found," which under the *current* buggy code means "no replay" — i.e. after the flip, demo users must be explicitly exempted from the check, or their always-untracked jti would newly read as "always absent → always replay").

**Files involved:**
- Modify: `backend/src/routes/auth.js:291-341` (the `POST /refresh` handler's replay-check + jti lifecycle block)
- Modify: `backend/src/__tests__/auth-refresh-race.test.js` (mocked unit tests — their mock response sequences currently encode the *buggy* semantics and must be swapped to match the corrected ones)
- Modify: `backend/src/__tests__/auth-refresh-concurrent-stress.test.js` (same reason)
- Modify: `backend/src/__tests__/demo-start.test.js:184` (un-skip the pre-written regression test once the underlying bug is fixed — this test already exists, written to the *correct* expected behavior, and was deliberately left `it.skip` pending this fix)
- Create: `backend/src/__tests__/auth-refresh-first-use.test.js` (new real-DB regression test proving the exact reported bug is fixed — a genuine login → refresh round trip for a plain DB employee, not a demo account, not a mock)

---

## Task 1: Reproduce the bug with a real-database regression test

**Files:**
- Create: `backend/src/__tests__/auth-refresh-first-use.test.js`
- Test: same file (this task *is* the test)

This test must exercise the real bug end-to-end: an actual `POST /login` for a plain DB employee (not a `@badge.local` demo account, not mocked), followed immediately by an actual `POST /refresh` using the refresh token that login just issued. Follow the exact soft-skip-without-a-live-DB pattern already used in `backend/src/__tests__/demoSeed.test.js` and `backend/src/__tests__/demo-start.test.js` (both in the codebase already — read `demo-start.test.js`'s top-of-file `beforeAll`/`dbAvailable` setup before writing this, to reuse the identical pattern rather than inventing a new one) — so this test passes trivially with a console warning in CI (no Postgres service provisioned there) but runs for real against a local Postgres.

- [x] **Step 1: Write the failing test** (done — see `backend/src/__tests__/auth-refresh-first-use.test.js`)
- [x] **Step 2: Run test to verify it fails (reproducing the bug)** (confirmed: 401 instead of 200 on first refresh)
- [x] **Step 3: Commit the failing test** (commit `8c5f2fb`)

---

## Task 2: Fix the replay-detection logic in `POST /auth/refresh`

**Files:**
- Modify: `backend/src/routes/auth.js:291-341`
- Test: `backend/src/__tests__/auth-refresh-first-use.test.js` (from Task 1 — must now pass)

- [x] **Step 1: Write the corrected block** (done)
- [x] **Step 2: Run the Task 1 regression test to verify it now passes** (confirmed: both tests pass)
- [x] **Step 3: Run the full pre-existing auth test suites and confirm which ones now fail** (confirmed: `auth-refresh-race.test.js` and `auth-refresh-concurrent-stress.test.js` fail as predicted; `auth.test.js` unaffected)
- [x] **Step 4: Commit the fix** (commit `c8664af`)

---

## Task 3: Correct the pre-existing mocked unit tests to match the fixed semantics

**Files:**
- Modify: `backend/src/__tests__/auth-refresh-race.test.js`
- Modify: `backend/src/__tests__/auth-refresh-concurrent-stress.test.js`

- [x] **Step 1: Update `auth-refresh-race.test.js`** (done, including the "Revoked user cannot refresh" and "Connection released in finally block" tests, which also needed their SELECT FOR UPDATE mocks updated to stay on their intended code path)
- [x] **Step 2: Update `auth-refresh-concurrent-stress.test.js`** (done)
- [x] **Step 3: Run both files and confirm they pass** (confirmed: 7/7 and 2/2 passing)
- [x] **Step 4: Run the full backend suite** (490/504 passed, 14 skipped, 0 failed)
- [x] **Step 5: Commit** (commit `2d31e85`)

---

## Task 4: Verify the pre-written demo-tenant regression test now passes and un-skip it

**Deferred** — `demo-start.test.js` lives on the separate `worktree-demo-self-service` branch, out of scope for this `main`-based hotfix worktree. To be done when that branch rebases onto or merges this fix.

---

## Task 5: Final full-suite verification

- [x] Backend suite: 490/504 passed, 14 skipped, 0 failed.
- [ ] Frontend suite + `/code-review:code-review` — pending (blocked by a transient platform classifier outage during execution, retrying).
- [ ] ESLint pass on touched files.
- [ ] Manual sanity check against a running local server (optional).

---

## Self-Review Notes (for whoever executes this plan)

- **Do not revert commit `907a6fb`.** That was already tried and is what led to `6abb03f` reopening the concurrency hole. The fix in this plan keeps `6abb03f`'s login-time insert and fixes the check logic instead.
- **The `demoUser` exemption in Task 2 is load-bearing, not cosmetic.** Without it, every `@badge.local` refresh would start failing after the flip (their jti is never in `used_tokens`, so "absent → replay" would apply to 100% of their refresh attempts).
- **This is a hotfix for `main`, prioritize correctness and test coverage over speed.** It affects live production customer sessions today.
