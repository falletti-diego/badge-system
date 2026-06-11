# S.32.1 — Ownership Check su POST /checkins (Buddy Punching Fix)

**Data:** 2026-06-12
**Status:** Design approvato
**Priorità:** 🔴 CRITICA — bloccante per qualunque demo a clienti
**Origine:** Analisi critica Session 32 (piano d'azione S.32 in TASKS.md)

---

## Problema

In `backend/src/routes/checkins.js` (POST `/`), l'`employee_id` arriva dal body della
richiesta e il backend verifica solo che appartenga allo stesso `client_id` del chiamante.

**Conseguenza:** qualunque dipendente autenticato può creare check-in per qualunque altro
dipendente della stessa azienda (basta conoscere l'UUID, che viaggia nelle risposte API di
`/api/employees` e `/api/checkins`). Per un sistema di tracciamento presenze questo invalida
il valore stesso del prodotto (anti buddy-punching).

## Contesto verificato

- La mobile app (`QRScannerScreen.jsx:73-101`) invia **sempre** il proprio
  `user.employee_id` — l'unico flusso legittimo di POST /checkins è il self check-in.
- Il "manager QR check-in" di Session 13 è anch'esso un self check-in (il manager Diego
  ha `employee_id` nel token); `StorePresencesScreen` è sola visualizzazione.
- Il dashboard web non crea mai check-in via POST (le correzioni usano PUT /checkins/:id).
- La mobile app già blocca client-side gli account senza `employee_id`
  (`QRScannerScreen.jsx:75`).
- Account demo: `maria@badge.local` e `lucia@badge.local` (role employee) **non hanno**
  `employee_id` nel token → con il fix non potranno creare check-in (comportamento già
  coerente col blocco client-side esistente).

## Policy approvata

| Ruolo | Può creare check-in per |
|-------|------------------------|
| employee | solo sé stesso |
| manager | solo sé stesso |
| admin | chiunque nel proprio tenant |

Decisione utente (2026-06-12): "Admin per chiunque" — employee e manager solo self
check-in; un eventuale futuro flusso "manager timbra per dipendente senza telefono"
richiederà un endpoint dedicato con audit specifico.

## Approccio scelto

**Approccio A — guard esplicito nel route handler** (scelto tra 3 alternative):
fail-closed, errore esplicito 403 (non sovrascrittura silenziosa del body), zero cambi
di contratto API, nessuna migrazione DB, nessuna modifica a mobile/dashboard/Zod.

Alternative scartate:
- B (derivare employee_id dal token, ignorare il body): maschererebbe silenziosamente
  bug dei client invece di segnalarli.
- C (middleware di policy generico): astrazione prematura — la generalizzazione RBAC
  arriva con S.32.2 (`buildScopedFilters`).

## Modifica

File: `backend/src/routes/checkins.js`, handler POST `/`, subito dopo l'estrazione di
`req.validated.body` e prima della transazione:

```js
// S.32.1: ownership check — only admins may create check-ins for other employees
if (req.user.role !== 'admin') {
  if (!req.user.employee_id) {
    throw new ForbiddenError(
      'Your account has no employee profile — cannot create check-ins',
      'CHECKIN_NO_EMPLOYEE_PROFILE'
    );
  }
  if (req.user.employee_id !== employee_id) {
    logger.warn({
      action: 'checkin_ownership_violation',
      user_id: req.user.user_id,
      attempted_employee_id: employee_id,
    });
    throw new ForbiddenError('You can only create check-ins for yourself', 'CHECKIN_OWNERSHIP');
  }
}
```

Nota: il blocco va dentro il `try` (o comunque dove `next(err)` lo raggiunge) perché il
route handler gestisce gli errori via `next(err)`. `ForbiddenError` esiste già in
`utils/errors.js` (già usato nel PUT /checkins) e il middleware di errore centrale lo
mappa a 403.

`logger` è già importato nel file (`utils/logger`).

## Comportamento risultante

| Caller | body employee_id | Risultato |
|--------|-----------------|-----------|
| employee (con employee_id nel token) | proprio | 201 |
| employee | di un collega | 403 `CHECKIN_OWNERSHIP` + warn log |
| manager con employee_id (es. Diego) | proprio | 201 — flusso Session 13 intatto |
| manager/employee senza employee_id nel token | qualunque | 403 `CHECKIN_NO_EMPLOYEE_PROFILE` |
| admin | qualunque dipendente del tenant | 201 (vincolo client_id già esistente) |
| admin | dipendente di altro tenant | 404 `EMPLOYEE_NOT_FOUND` (check esistente, invariato) |

## Test

In `backend/src/__tests__/checkins.test.js`, con il pattern di mock esistente
(pool + withTransaction mockati, token firmati con la chiave RS256 di test):

1. employee con `employee_id` A, body `employee_id` A → 201
2. employee con `employee_id` A, body `employee_id` B → 403, error code `CHECKIN_OWNERSHIP`
3. employee senza `employee_id` nel token → 403, error code `CHECKIN_NO_EMPLOYEE_PROFILE`
4. manager con `employee_id` proprio → 201
5. manager con body `employee_id` di un altro → 403 `CHECKIN_OWNERSHIP`
6. admin con body `employee_id` di un dipendente del tenant → 201
7. la violazione (caso 2) emette `logger.warn` con `action: 'checkin_ownership_violation'`

Regressione: l'intera suite esistente (212 test) deve restare verde — in particolare i
test geofence di `checkins-geofence.test.js`, che creano check-in e dovranno usare token
con `employee_id` coerente col body (eventuale aggiustamento dei fixture è atteso e
corretto: oggi passano proprio grazie alla vulnerabilità).

## Fuori scope

- Endpoint dedicato "manager timbra per dipendente" (futuro, su richiesta cliente)
- Generalizzazione RBAC fail-closed sulle GET (S.32.2)
- Mitigazioni GPS spoofing (S.32.9)

## Deploy

Solo backend: merge su main → GitHub Actions → ECR → EC2. Nessun coordinamento con
release mobile (nessun client legittimo riceverà mai il 403).
