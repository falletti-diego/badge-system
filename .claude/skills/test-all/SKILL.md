---
name: test-all
description: Run test suites for Badge System (backend Jest, frontend Vitest, or both)
---

# /test-all — Esegui Test Suite

Esegue i test per backend (Jest), frontend web (Vitest), o entrambi. Riporta un sommario con pass/fail e azioni suggerite.

## Usage

```
/test-all [backend|frontend|all]
```

- `/test-all backend` — solo backend (Jest)
- `/test-all frontend` — solo frontend-web (Vitest)
- `/test-all all` — entrambi in sequenza
- `/test-all` — uguale a `all` (default)

---

## Step 1 — Backend Tests (Jest)

```bash
cd backend
npm run test:coverage 2>&1
```

Script disponibili:
- `npm run test` — run once, no coverage
- `npm run test:coverage` — run with coverage report
- `npm run test:watch` — watch mode (non usare in CI)

**Dove si trovano i test:** `backend/tests/`

Interpreta l'output:
- `PASS` / `FAIL` per ogni file di test
- Coverage % per linee, branches, functions, statements
- Tempo di esecuzione totale

---

## Step 2 — Frontend Tests (Vitest)

```bash
cd frontend-web
npm run test -- --run 2>&1
```

Nota: `--run` esegue una volta sola (senza watch mode interattivo).

**Dove si trovano i test:** `frontend-web/src/**/*.test.{js,jsx}`

---

## Step 3 — Riporta sommario

Dopo ogni suite, presenta un report così:

```
┌─────────────────────────────────────────┐
│  BADGE SYSTEM — TEST REPORT             │
├──────────────┬──────────────────────────┤
│  Backend     │  ✅ 12/12 passed (100%)  │
│  Coverage    │  78% lines, 71% branches │
│  Frontend    │  ✅ 8/8 passed (100%)    │
├──────────────┴──────────────────────────┤
│  STATUS: ✅ ALL PASS — safe to deploy   │
└─────────────────────────────────────────┘
```

Se ci sono fallimenti:

```
┌─────────────────────────────────────────┐
│  BADGE SYSTEM — TEST REPORT             │
├──────────────┬──────────────────────────┤
│  Backend     │  ❌ 10/12 passed         │
│  Failed      │  auth.test.js:45         │
│              │  checkins.test.js:88     │
├──────────────┴──────────────────────────┤
│  STATUS: ❌ FAILING — DO NOT DEPLOY     │
└─────────────────────────────────────────┘

Suggested fix: [breve diagnosi del primo errore]
```

---

## Regole

- **Non interrompere** i test a metà — esegui sempre l'intera suite
- Se `npm run test` non esiste in una directory, riportalo chiaramente invece di fallire silenziosamente
- Se i test passano ma la coverage è < 50%, aggiungi un warning (non un blocco)
- Se c'è un test lento (> 5s singolo test), segnalalo
- **Non modificare i test** durante questa skill — solo eseguire e riportare
