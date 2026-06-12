# S.32.4 — CORS Origin Parsing: Add Whitespace Trimming + Tests + Documentation

**Data:** 2026-06-12  
**Status:** Design approvato  
**Priorità:** 🟡 MEDIA — CORS parsing fragility, silent failures on whitespace  
**Origine:** Analisi critica Session 32 (piano d'azione S.32 in TASKS.md)

---

## Problema

In `backend/src/app.js:73`, la configurazione CORS è:

```js
origin: process.env.CORS_ORIGIN?.split(',') || ['https://badge.dataxiom.it', 'https://dataxiom-badge.netlify.app'],
```

**Issue:** Se `CORS_ORIGIN` ha spazi (es. `https://example.com, https://other.com`), lo `.split(',')` produce stringhe con spazi leader/trailer:
```
['https://example.com', ' https://other.com']  // spazio prima di "https"
```

La libreria `cors` fa matching esatto sui valori, quindi:
- Request origin: `https://other.com`
- Whitelist origin: `" https://other.com"` (con spazio)
- **Result:** ❌ CORS FAIL — no `Access-Control-Allow-Origin` header → frontend bloccato

**Risk:** Configuration error innocente (spacing) rompe CORS in produzione in modo silenzioso.

**Testing:** Nessun test unitario o integrazione per la logica di parsing CORS.

**Documentation:** Nessuna spiegazione di come funziona il parsing di `CORS_ORIGIN`.

---

## Contesto

**Ambienti:**
- **Dev:** `CORS_ORIGIN=http://localhost:5173` (no spazi, raramente problema)
- **Prod:** `CORS_ORIGIN` via AWS SSM → configurato manualmente → rischio umano di spazi

**Configurazione attuale (fallback):**
- Se `CORS_ORIGIN` undefined → usa default hardcoded

---

## Soluzione

### 1. Fix parsing in `app.js:73`

Aggiungere `.map(s => s.trim()).filter(Boolean)` per normalizzare:

```js
// Parse CORS_ORIGIN env var: split by comma, trim whitespace, filter empty strings.
// Example: "https://example.com, https://other.com" → ['https://example.com', 'https://other.com']
// Trailing commas and extra spaces are handled gracefully.
origin: process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) || ['https://badge.dataxiom.it', 'https://dataxiom-badge.netlify.app'],
```

**Comportamento:**
- `undefined` → fallback a default
- `"https://example.com"` → `['https://example.com']`
- `"https://example.com, https://other.com"` → `['https://example.com', 'https://other.com']`
- `"https://example.com, https://other.com,"` (trailing comma) → `['https://example.com', 'https://other.com']`
- `" https://example.com , https://other.com "` (spaces) → `['https://example.com', 'https://other.com']`
- `"https://example.com,, https://other.com"` (doppia virgola) → `['https://example.com', 'https://other.com']`

### 2. Unit test: `cors-config.test.js`

Testare la logica di parsing in isolamento:

**Test cases (6 test):**
1. No whitespace → array corretto
2. Whitespace intorno a origins → whitespace rimosso
3. Trailing comma → comma ignorata
4. Empty string (undefined CORS_ORIGIN) → fallback a default
5. Whitespace-only entries → filtrati
6. Comma doppia → entry vuota rimossa

### 3. Integration test: `cors-integration.test.js`

Testare che CORS middleware usa le origins parsate correttamente:

**Test cases (3 test):**
1. Set `CORS_ORIGIN="https://test-origin.com, https://another-origin.com"` → start app
2. Make OPTIONS preflight from `https://test-origin.com` → verify `Access-Control-Allow-Origin: https://test-origin.com` in response
3. Make OPTIONS preflight from unknown origin → verify NO CORS header (blocked)

---

## Scope & Timeline

**Effort:** ~30 minuti
- Fix parsing: 2 minuti
- Documentation comment: 1 minuto
- Unit test: 10 minuti
- Integration test: 15 minuti
- Commit: 2 minuti

**Breakability:** Zero — aggiunta di logica normativa, test in isolamento.

---

## Testing Strategy

### Test 1: Unit Tests (`cors-config.test.js`)

```bash
npx jest src/__tests__/cors-config.test.js --verbose
```

Expected: 6/6 PASS

### Test 2: Integration Tests (`cors-integration.test.js`)

```bash
npx jest src/__tests__/cors-integration.test.js --verbose
```

Expected: 3/3 PASS

### Test 3: Full Suite

```bash
npm run test 2>&1 | tail -20
```

Expected: All 260+ tests PASS (no regressions)

---

## Deploy & Verification

**Deploy:** Standard flow (git push main → GitHub Actions → ECR → EC2)

**Health check:**
```bash
curl https://api.dataxiom.it/health
```

Expected: HTTP 200, no errors.

---

## Fuori Scope

- Verifica security group EC2 (infrastruttura, non codice)
- HTTPS health check workflow (deployment, non codice)
- Altre configurazioni CORS (es. credentials, methods)

---

## Impatto in Produzione

**Zero runtime impact:** Aggiunta di parsing normativo (whitespace trimming). Se `CORS_ORIGIN` è correttamente configurato (senza spazi accidentali), comportamento identico a prima.

**Safety:** Rimozione di failure mode (silent CORS failures su spacing errors).

---

## Future Considerations

Se in futuro viene aggiunto supporto per CORS dinamico (per-tenant, per-customer), questa logica di parsing sarà il punto di ingresso — la documentazione e i test servono da foundation.
