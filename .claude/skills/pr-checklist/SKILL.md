---
name: pr-checklist
description: Pre-merge validation checklist before pushing to main (lint, test, build, security, secrets)
disable-model-invocation: true
---

# /pr-checklist — Validazione Pre-Merge

Esegui questa checklist prima di aprire un PR o fare `git push origin main`. Blocca il merge se ci sono ❌.

---

## Step 1 — Git Status

```bash
git status
git diff --stat HEAD
```

Verifica:
- [ ] Nessun file non-staged che dovrebbe essere incluso
- [ ] Nessun file `.env`, `.env.local`, `*.pem`, `*.key` nel diff
- [ ] Nessun `console.log` di debug dimenticato nel diff

Se ci sono file sensibili in staging, **STOP** e chiedi all'utente di rimuoverli.

---

## Step 2 — Lint

```bash
# Backend
cd backend && npm run lint 2>&1 | tail -20
cd ..

# Frontend Web
cd frontend-web && npm run lint 2>&1 | tail -20
cd ..
```

- ✅ 0 errors → OK
- ⚠️ Solo warnings → OK ma segnala
- ❌ Errors → blocco. Suggerisci `npm run lint:fix` e correggi manualmente quello che non viene fixato auto

---

## Step 3 — Test

Esegui `/test-all all` (o i passi equivalenti):

```bash
cd backend && npm run test 2>&1 | tail -30
cd ../frontend-web && npm run test -- --run 2>&1 | tail -20
cd ..
```

- ✅ Tutti pass → OK
- ❌ Failures → blocco. Non fare merge con test rossi.

---

## Step 4 — Build (verifica che il codice sia compilabile)

```bash
# Frontend build
cd frontend-web && npm run build 2>&1 | tail -20
cd ..

# Backend syntax check (node --check su file modificati)
git diff --name-only HEAD | grep -E '\.js$' | grep 'backend/' | while read f; do
  node --check "$f" && echo "✅ $f" || echo "❌ SYNTAX ERROR: $f"
done
```

- ✅ Build succeeded → OK
- ❌ Build error → blocco

---

## Step 5 — Security scan

Cerca pattern pericolosi nel diff:

```bash
git diff HEAD | grep -E "(password|secret|token|api_key|private_key)\s*=\s*['\"][^'\"]+" | grep -v "process\.env\." | grep -v "\.example\." | grep -v "test\." | head -20
```

- Se trova match: ⚠️ segnala manualmente ogni occorrenza e chiedi all'utente di confermare che non sono hardcoded
- Se 0 match: ✅

Controlla anche:
- [ ] Nessun `eval()` introdotto
- [ ] Nessuna query SQL costruita con string concatenation (deve usare parametri `$1, $2`)
- [ ] Nessun `res.json(err)` che espone stack traces in produzione

---

## Step 6 — API compatibility

Se il diff tocca `backend/src/routes/`:

```bash
git diff HEAD -- backend/src/routes/ | grep "^+" | grep -E "(router\.(get|post|put|delete|patch))" | head -20
```

Verifica:
- [ ] Nessun endpoint rimosso o rinominato (breaking change)
- [ ] Se aggiunto un endpoint, è documentato in CLAUDE.md o nel README?
- [ ] Autenticazione richiesta sui nuovi endpoint? (verifica presenza di `authMiddleware`)

---

## Step 7 — Output finale

```
╔══════════════════════════════════════════════════════╗
║         PR CHECKLIST — BADGE SYSTEM                  ║
╠═══════════════╦══════════════════════════════════════╣
║  Git status   ║  ✅ Clean                            ║
║  Lint backend ║  ✅ 0 errors                         ║
║  Lint frontend║  ✅ 0 errors                         ║
║  Tests        ║  ✅ 20/20 passed                     ║
║  Build        ║  ✅ Success                          ║
║  Secrets scan ║  ✅ No hardcoded secrets             ║
║  API compat   ║  ✅ No breaking changes              ║
╠═══════════════╩══════════════════════════════════════╣
║  ✅ SAFE TO MERGE                                    ║
╚══════════════════════════════════════════════════════╝
```

Se ci sono blocchi:
```
╔══════════════════════════════════════════════════════╗
║  ❌ BLOCKED — Fix before merging:                    ║
║                                                      ║
║  1. [lint] backend/src/routes/auth.js:45             ║
║     Unexpected token                                 ║
║  2. [test] auth.test.js:88 — Expected 200 got 403    ║
╚══════════════════════════════════════════════════════╝
```

**Non proporre mai il commit/push** se ci sono ❌ bloccanti. Chiedi all'utente di risolvere prima.
