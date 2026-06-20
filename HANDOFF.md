# Badge System — Session 46 Handoff

**Date:** 2026-06-20  
**Session:** 46 — @badge.local change-password fix + account cleanup 8→3 + migration 023  
**Status:** ✅ **Tutto committato e deployato in produzione** — backend healthy, 3 account demo attivi

---

## Goal

Tre task indipendenti:
1. Fix "Current password is incorrect" per Maria (`maria@badge.local`) nel flow voluntario change-password
2. Pulizia account demo: da 8 a 3 (pippo/pino/maria)
3. Aggiornamento documenti sessione (TASKS.md, PROJECT_DECISIONS.md, HANDOFF.md)

---

## Cosa è stato fatto

### 1. Fix change-password per @badge.local (Commit: 2704835)

**Root cause:** `password_hash = NULL` per tutti gli account `@badge.local` (l'auth avviene via env var plaintext, non bcrypt DB). Il handler `change-password` in `backend/src/routes/auth.js` chiamava `verifyPassword(old_password, null)` che restituiva sempre `false` → 400 "Current password is incorrect".

**Fix:** Branch condizionale nel handler:
```javascript
let passwordMatch;
if (!employee.password_hash) {
  const demoUser = DEMO_USERS.find(
    (u) => u.employee_id === employee_id || u.id === employee_id
  );
  passwordMatch = demoUser != null && demoUser.password === old_password;
} else {
  passwordMatch = await verifyPassword(old_password, employee.password_hash);
}
```

**Test aggiunto:** `backend/__tests__/s326-csv-temp-password.test.js` — nuovo test case verifica che il codice contenga il branch per `password_hash = NULL`. 9/9 test passano.

### 2. Account cleanup 8→3 (Commits: fff17be, a9c243f, 2d906ae)

**Account rimossi:**
- `diego@badge.local` (manager) — due record nel DB (migration 005 UUID `446655440200` + migration 018 UUID `446655440020`)
- `luca.verdi@employee.it` — mai usato in frontend
- `alice.neri@employee.it` — mai usato in frontend  
- `carlo.rossi@employee.it` — mai usato in frontend
- `paolo.sordo@employee.it` — mai usato in frontend

**File modificati:**
- `backend/src/__fixtures__/demo-users.js` — rimosso blocco Diego
- `backend/src/routes/auth.js` — rimosso Diego da inline DEMO_USERS
- `backend/src/__tests__/auth.test.js` — test "manager with site_id" aggiornato: `diego@badge.local` → `pino@badge.local`
- `backend/.env.example` — rimosso `DEMO_DIEGO_PASSWORD`
- `backend/.env.development` (gitignored) — rimosso `DEMO_DIEGO_PASSWORD`
- `backend/migrations/023_remove_unused_demo_accounts.sql` — nuova migration

**SSM Parameter Store (EC2):**
- Rimosso `/badge/production/DEMO_DIEGO_PASSWORD`
- Rimosso `/badge/production/DEMO_LUCIA_PASSWORD` (orfana — Lucia rimossa in sessione precedente)
- Rimangono: `DEMO_PIPPO_PASSWORD`, `DEMO_PINO_PASSWORD`, `DEMO_MARIA_PASSWORD`

**Migration 023 — 3 iterazioni per FK constraints:**
1. **Iterazione 1 fail:** `DELETE FROM shifts WHERE employee_id = ANY(removed_ids)` → `column "employee_id" does not exist` — `shifts` usa JSONB per-site, non ha colonna employee_id. Fix: rimosso il DELETE shifts.
2. **Iterazione 2 fail:** `leave_requests` CHECK constraint violato — `approved_by ON DELETE SET NULL` avrebbe lasciato `approved_at` non-null con `approved_by = NULL`. Fix: `UPDATE leave_requests SET approved_by = Pippo WHERE approved_by = ANY(removed_ids)`.
3. **Iterazione 3 OK:** `checkins.created_by ON DELETE RESTRICT NOT NULL` → `UPDATE checkins SET created_by = employee_id WHERE created_by = ANY(removed_ids)`. Poi `DELETE FROM employees`.

### 3. Node.js 20 deprecation su GitHub Actions

GitHub annotation: `Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4`

**Conclusione:** Cosmetic/non-bloccante. GitHub forza la compatibilità. `actions/checkout@v4` non ha una versione `@v5` pubblica. Nessuna azione richiesta.

---

## Cosa ha funzionato

- La logica di branch `password_hash = NULL` è pulita e non rompe i test esistenti
- Migration 023 finale è robusta e auto-documentata con commenti sui constraint FK
- La suite di test è rimasta verde (455 backend, 164 frontend) attraverso tutti i commit

---

## Cosa NON ha funzionato (da non ripetere)

- **Non assumere che `shifts` abbia `employee_id`** — la tabella è JSONB per-site/month, non per-employee. Controllare sempre lo schema prima di bulk delete.
- **Non assumere che `ON DELETE SET NULL` sia sicuro** — se c'è un CHECK constraint che lega `approved_by + approved_at`, SET NULL viola il constraint. Sempre riassegnare prima.
- **Le migration fallite bloccano l'avvio del container** — il migration runner esegue a startup e se fallisce il container crasha → 502 su api.dataxiom.it. Testare sempre la logica migration su DB locale o in CI prima di pushare.

---

## Stato attuale del sistema

| Componente | Stato |
|-----------|-------|
| Backend (api.dataxiom.it) | ✅ Healthy (HTTP 200) |
| Frontend (badge.dataxiom.it) | ✅ Live |
| Migration 023 | ✅ Applicata in produzione |
| Account demo | ✅ 3 account (pippo/pino/maria) |
| SSM params demo | ✅ Puliti (3 rimasti: PIPPO/PINO/MARIA) |
| Test suite | ✅ 455 backend + 164 frontend |

**Account attivi:**
| Account | Ruolo | Password |
|---------|-------|----------|
| `pippo@badge.local` | admin | SSM `DEMO_PIPPO_PASSWORD` (dev: `pippo01`) |
| `pino@badge.local` | manager (Torino) | SSM `DEMO_PINO_PASSWORD` (dev: `pino01`) |
| `maria@badge.local` | employee (Torino) | SSM `DEMO_MARIA_PASSWORD` (dev: `maria01`) |

---

## Next Steps

Non ci sono task critici aperti da questa sessione. I prossimi lavori prioritari dal TASKS.md:

1. **C.5.3** (Phase 2): Migrazione JWT localStorage → httpOnly cookie
2. **5.5** (Phase 2): Rotate QR code functionality
3. **Staging environment**: Obbligatorio prima del lancio con primo cliente reale (decisione Session 45)
4. **First real customer onboarding**: La Rinascente era un test ONB.1 (dummy data). Il prossimo è un onboarding reale.

Per riprendere: leggi `TASKS.md` + `git log --oneline -10`.
