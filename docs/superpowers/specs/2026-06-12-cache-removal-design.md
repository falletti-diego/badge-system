# S.32.3 — Remove App-Level Cache Middleware (Cross-Tenant Leak Fix)

**Data:** 2026-06-12  
**Status:** Design approvato  
**Priorità:** 🔴 CRITICA — vulnerabilità latente di data leak cross-tenant  
**Origine:** Analisi critica Session 32 (piano d'azione S.32 in TASKS.md)

---

## Problema

In `backend/src/app.js:154`, `cacheMiddleware()` è montato PRIMA di `requireAuth`:

```js
app.use('/api/', cacheMiddleware());     // Line 154 — PRIMA DI REQUIREAUTH

// ... router setup ...

const v1Router = express.Router();
v1Router.use('/auth', authRouter);
v1Router.use('/employees', employeesRouter);   // employeesRouter ha requireAuth al suo interno
// ...
app.use('/api/v1', v1Router);
```

**Conseguenza:** Quando una richiesta API arriva a `cacheMiddleware()`, `req.user` è ancora `undefined` (auth non è stato eseguito). La funzione `generateCacheKey()` (cache.js:25-30) usa:

```js
req.user?.client_id || 'anonymous'  // → 'anonymous' per tutte le richieste
```

**Data leak cross-tenant:**
- Se `CACHE_ENABLED=true`: tutte le risposte GET vengono cachate con chiave `cache:...:client:anonymous`
- Utente A richiede `/api/checkins` (senza auth) → cache miss → backend responsde con ALL checkins
- Utente B richiede `/api/checkins` (senza auth) → cache hit → riceve LA STESSA RISPOSTA di utente A
- **Nessun controllo di tenant isolation**: dati di un cliente vengono serviti ad un altro

**Cache invalidation bug (secondario):**
- Pattern di invalidazione in routes (checkins.js, shifts.js) è:
  ```js
  deleteCacheByPattern(`cache:api:checkins:client:${clientId}:*`)
  ```
- Ma le chiavi reali generate sono (cache.js:28):
  ```
  cache:checkins:client:anonymous:...  (path trasformato: /checkins → checkins)
  ```
- Il pattern NON matcha → cache rimane stantia per sempre

**Attenuazione:** Oggi `CACHE_ENABLED` è hardcoded a `false` (via env), quindi il sistema è al sicuro. Ma è una **time bomb**: chiunque attivi caching via env var, senza capire il codice, espone dati cross-tenant.

---

## Contesto

**Stato attuale:**
- `CACHE_ENABLED=false` (MVP non usa cache)
- Redis è disponibile (per rate limiting, session management in futuro)
- App-level caching non è una feature critica per il MVP (launch September 2026)

**Decisione:** Per il MVP, rimuovere completamente il middleware app-level. Questo elimina la classe di vulnerabilità e semplifica la codebase. Caching per-route può essere reinserito in Phase 2 (post-launch, dopo load testing).

---

## Soluzione: Rimuovere App-Level Cache Middleware

### Cosa cambia

**File modificati:**
- `backend/src/app.js` — Rimuovere linea 154: `app.use('/api/', cacheMiddleware());`
- Pulire import/variabili inutili (se `cacheMiddleware` è importato solo per questa linea)

**File mantenuti (non rimossi):**
- `backend/src/middleware/cache.js` — Template per future implementazioni per-route
- `backend/src/db/redis.js` — Utilities Redis (usate da rate limiter, potrebbe servire altrove)
- Test suite — mocks Redis rimangono (non causano problemi)

**File non toccati:**
- Route-level cache invalidation calls (checkins.js, shifts.js, etc.) — rimangono come commented-out per future use
- Rate limiting (usa Redis, non è intaccato)
- Environment variables (`CACHE_ENABLED`, `CACHE_TTL`, `REDIS_URL`) — rimangono, diventano irrilevanti

### Risultato

- ✅ Richieste pre-auth non toccano cache
- ✅ Nessun cross-tenant data leak via caching
- ✅ MVP base è sicuro
- ✅ Redis utilities rimangono disponibili per Phase 2

---

## Scope & Timeline

**Effort:** ~15 minuti
- Rimozione middleware: 2 minuti
- Cleanup import: 2 minuti
- Test suite (verifica): 10 minuti
- Commit: 1 minuto

**Breakability:** Zero — rimozione di codice morto (CACHE_ENABLED è false, middleware non è mai attivo)

---

## Testing Strategy

### Test 1: Smoke Test (Backend Startup & API Calls)

```bash
# Start backend
npm run dev &

# Health check
curl https://api.dataxiom.it/health

# GET request (would hit cache if middleware existed)
curl -H "Authorization: Bearer $TOKEN" https://api.dataxiom.it/api/v1/checkins

# POST request (causes invalidation)
curl -X POST ... https://api.dataxiom.it/api/v1/checkins
```

Expected: All requests succeed. No cache-related errors in logs.

### Test 2: Verify Cache Middleware is Gone

```bash
# Check logs for cache middleware messages
docker logs badge-system-api | grep -i "cache_middleware"
```

Expected: No matches (middleware not running).

### Test 3: Verify Redis Still Works (Rate Limiter)

```bash
# Rate limiter uses Redis — should still work
for i in {1..101}; do
  curl -s https://api.dataxiom.it/api/v1/checkins -H "Authorization: Bearer $TOKEN" | jq '.error'
done | tail -5
```

Expected: After 100 requests in 15-min window, request 101 should be rate-limited (429).

### Test 4: Existing Test Suite

```bash
cd backend
npm run test 2>&1 | tail -20
```

Expected: All 260 tests PASS (no regressions from removing middleware).

---

## Deploy & Verification

**Deploy:** Standard flow (git push main → GitHub Actions → ECR → EC2)

**Health check:** 
```bash
curl https://api.dataxiom.it/health
```

**Functional test:** Demo account (Pino manager) accesses `/api/checkins`:
```bash
curl -H "Authorization: Bearer $TOKEN" https://api.dataxiom.it/api/v1/checkins
```

---

## Future Phase 2: Per-Route Caching (Deferred)

If performance testing shows caching is needed:

1. **When:** Post-launch (Sept 2026+), after load testing identifies bottlenecks
2. **How:** Cache middleware called INSIDE route handlers (after `requireAuth`)
3. **Key format:** Include `client_id + role + employee_id + site_id`
4. **Invalidation:** Fix patterns to match actual key format
5. **Test:** Verify different users get different cached responses

Templates remain in codebase for reference:
- `cache.js` — generateCacheKey logic (refine with role/employee_id/site_id)
- `redis.js` — utilities (already proven in rate limiter)

---

## Fuori Scope

- Altre vulnerabilità di cache (non applicabili, middleware rimosso)
- Caching strategy Phase 2 (deferred)
- Rate limiting changes (non toccato)

---

## Impatto in Produzione

**Zero impact:** Cache middleware è disabilitato (`CACHE_ENABLED=false`), quindi rimozione non cambia behavior. Non ci sono utenti in produzione oggi (MVP pre-launch).

**Safety:** Rimozione di questo codice elimina una classe di vulnerabilità futura (accidental enablement).
