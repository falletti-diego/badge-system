# /deploy — Badge System Deploy & Verify

Deploy the Badge System frontend to Netlify, verify the HTTPS certificate, and test all API endpoints for CORS issues from the production origin.

---

## When invoked

Run these steps in order. Announce each step before starting it.

---

## Step 1 — Pre-flight checks

Before deploying, verify the local repo is ready:

```bash
cd frontend-web
git status              # Check for uncommitted changes
npm run build 2>&1 | tail -10   # Verify the build succeeds locally
```

If the build fails, **stop and report the error** — do not deploy broken code.

---

## Step 2 — Deploy

Netlify deploys automatically on `git push origin main`. If there are uncommitted changes, commit them first:

```bash
git add frontend-web/
git commit -m "deploy: <short description of changes>"
git push origin main
```

Then wait ~45 seconds for the Netlify build to finish.

---

## Step 3 — Run the deploy script

Run the full verification suite:

```bash
./scripts/deploy.sh --skip-build
```

This script (in `scripts/deploy.sh`) does:
1. Skips the build (already done in Step 1)
2. Verifies the HTTPS certificate on `dataxiom-badge.netlify.app` — issuer, validity, days until expiry
3. Checks the frontend loads with HTTP 200
4. Tests the API health endpoint at `http://34.245.145.143:3000/health`
5. Sends CORS preflight (`OPTIONS`) requests from `https://dataxiom-badge.netlify.app` to all 7 API endpoints
6. Runs an auth smoke test: logs in as `pino@badge.local` and calls `/api/checkins` with the returned token

---

## Step 4 — Interpret results

Report the output of the script in a clear table:

| Check | Status | Notes |
|-------|--------|-------|

For any ❌ failure:

**HTTPS cert self-signed:** Go to Netlify → Site → Domain management → HTTPS → Verify DNS → Let's Encrypt issues free certs automatically.

**CORS failure (no Access-Control-Allow-Origin):** The backend at `34.245.145.143:3000` needs to return CORS headers. In `backend/src/app.js`, enable the CORS middleware and set `CORS_ORIGIN=https://dataxiom-badge.netlify.app` in the EC2 container env. Then rebuild the container:
```bash
docker stop badge-system-api
docker rm badge-system-api
docker run -d --name badge-system-api \
  -e CORS_ORIGIN=https://dataxiom-badge.netlify.app \
  ... (other env vars)
```

**API health 000 (unreachable):** EC2 container may be down. Check with:
```bash
ssh -i badge-key.pem ubuntu@34.245.145.143 'docker ps && docker logs badge-system-api --tail 20'
```

**Login fails (not JWT in response):** Wrong credentials or DB down. Try `pino@badge.local / pino01` manually via `curl`.

---

## Step 5 — Report back

Summarize:
- ✅ All N checks passed — site is live and healthy
- OR: list each failure with the fix applied or the action needed

Always end with the live URLs:
- **Frontend:** https://dataxiom-badge.netlify.app
- **API:** http://34.245.145.143:3000
- **Login:** https://dataxiom-badge.netlify.app/login

---

## Quick flags

| Flag | When to use |
|------|-------------|
| `--skip-build` | Build already verified locally |
| `--skip-deploy` | Already deployed; just want to verify |

Example — verify only, no deploy:
```bash
./scripts/deploy.sh --skip-build --skip-deploy
```
