# Invariante `site_id ⊆ assigned_sites` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere strutturalmente il bug per cui righe `employees` possono avere `site_id` valorizzato senza che compaia in `assigned_sites` (il solo campo che `POST /checkins` controlla per autorizzare un check-in) — corregge le righe rotte esistenti (1 in produzione, 2 su staging, verificate il 6 Agosto 2026) e previene ogni ricorrenza futura, indipendentemente da quale codice scriva sulla tabella.

**Architecture:** Una migration (`038`) con due parti — un backfill generale (`UPDATE ... WHERE site_id IS NOT NULL AND NOT (site_id = ANY(assigned_sites))`, nessun UUID hardcoded) e un trigger Postgres `BEFORE INSERT OR UPDATE` additivo che mantiene l'invariante per sempre. Testing su tre livelli: comportamento del trigger in isolamento (Postgres reale), non-regressione dei path applicativi esistenti che scrivono `employees` (suite già esistenti, invariate), e un test end-to-end che dimostra — attraverso l'handler reale di `POST /checkins`, non solo asserzioni SQL — che il bug originale è chiuso.

**Tech Stack:** PostgreSQL (funzione trigger PL/pgSQL) · Jest + `pg` reale (no mock) per i test di migration · supertest per il test end-to-end.

**Riferimento:** spec approvata in `docs/superpowers/specs/2026-08-06-assigned-sites-invariant-design.md`.

---

## File Structure

- `backend/migrations/038_enforce_site_id_in_assigned_sites.sql` (nuovo) — backfill + funzione trigger + trigger
- `backend/src/__tests__/migration-038-assigned-sites-invariant.test.js` (nuovo) — comportamento del trigger e del backfill, Postgres reale
- `backend/src/__tests__/checkins-assigned-sites-backfill.test.js` (nuovo) — test end-to-end: un employee con `site_id` senza `assigned_sites` (simulando il path storicamente rotto) riesce comunque a fare check-in, perché il trigger lo corregge all'INSERT

Nessun file applicativo esistente viene modificato — il fix è interamente a livello di database. I task 3 e 4 rieseguono (senza modificarle) le suite esistenti che scrivono sulla tabella `employees`, per dimostrare l'assenza di regressioni.

---

## Task 1: Migration — backfill + trigger

**Files:**
- Create: `backend/migrations/038_enforce_site_id_in_assigned_sites.sql`

- [ ] **Step 1: Scrivere la migration**

```sql
-- 038_enforce_site_id_in_assigned_sites.sql
-- Bug (6 Agosto 2026, scoperto durante verifica manuale staging Fase A):
-- alcune migration storiche (018, 019a) valorizzano employees.site_id senza
-- mai toccare assigned_sites (resta al default schema '{}'). POST /checkins
-- autorizza SOLO tramite `site_id = ANY(assigned_sites)` — site_id da solo
-- non basta. Stessa causa già colpita in produzione una volta (Pino,
-- migration 033, patch one-off che ha risolto solo la sua riga).
--
-- Verificato (sola lettura, 6/8/2026): 1 riga rotta in produzione
-- (maria@badge.local, dal 19/06/2026), 2 su staging. Nessun cliente reale
-- coinvolto.
--
-- Fix in due parti:
-- 1) Backfill generale (non specifico a nessun UUID) per le righe già rotte.
-- 2) Trigger che mantiene l'invariante per ogni futuro INSERT/UPDATE su
--    employees, indipendentemente da quale codice applicativo scrive —
--    additivo, non rimuove mai siti già presenti in assigned_sites (un
--    dipendente multi-sede resta multi-sede).

-- Parte 1: backfill
UPDATE employees
SET assigned_sites = array_append(assigned_sites, site_id)
WHERE site_id IS NOT NULL
  AND NOT (site_id = ANY(assigned_sites));

-- Parte 2: trigger
CREATE OR REPLACE FUNCTION ensure_site_id_in_assigned_sites()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.site_id IS NOT NULL AND NOT (NEW.site_id = ANY(NEW.assigned_sites)) THEN
    NEW.assigned_sites := array_append(NEW.assigned_sites, NEW.site_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_site_id_in_assigned_sites ON employees;
CREATE TRIGGER trg_ensure_site_id_in_assigned_sites
  BEFORE INSERT OR UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION ensure_site_id_in_assigned_sites();
```

Nota: `NEW.assigned_sites` non è mai `NULL` per righe scritte dal codice applicativo (colonna con `DEFAULT ARRAY[]::UUID[]` in `schema.sql`), ma se una riga arrivasse con `assigned_sites IS NULL` esplicito, `NOT (x = ANY(NULL))` valuta `NULL` (falsy in un `IF`), quindi il trigger non farebbe nulla invece di sollevare un errore — comportamento sicuro, verificato nel Task 2.

- [ ] **Step 2: Verificare la numerazione**

Run: `ls backend/migrations/ | tail -5`
Expected: l'ultimo file esistente è `037_add_client_id_to_audit_log.sql` — `038` è libero. Se non lo fosse (collisione con lavoro nel frattempo su `main`/`develop`), fermarsi e segnalarlo prima di procedere, non rinumerare in autonomia.

- [ ] **Step 3: Applicare in locale e verificare**

Run: `cd backend && npm run migrate` (o lo script equivalente indicato in `package.json` — verificare il nome esatto, es. `node scripts/run-migrations.js`)
Expected: migration 038 applicata senza errori.

Verifica diretta che il backfill abbia corretto la riga storicamente rotta nel DB locale (se presente — dipende da quali migration demo sono state applicate in locale):
```bash
psql -d badge_system -c "SELECT email, site_id, assigned_sites FROM employees WHERE email = 'maria@badge.local';"
```
Expected: `assigned_sites` include il valore di `site_id`.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/038_enforce_site_id_in_assigned_sites.sql
git commit -m "fix(db): enforce site_id in assigned_sites via trigger + backfill existing broken rows"
```

---

## Task 2: Test del trigger e del backfill (Postgres reale)

**Files:**
- Create: `backend/src/__tests__/migration-038-assigned-sites-invariant.test.js`

- [ ] **Step 1: Scrivere il test — segue esattamente il pattern reale già in uso in `migration-035-employee-lifecycle.test.js`**

```javascript
'use strict';

/**
 * Migration 038 — invariante site_id ⊆ assigned_sites (trigger + backfill).
 *
 * Real-Postgres test, stesso pattern di migration-035-employee-lifecycle.test.js:
 * dbAvailable soft-skip, Pool con fallback DB_HOST/DB_PORT/... a localhost
 * (src/db/pool.js non ha default e dipende da config-loader, non invocato
 * da jest.setup.js).
 */

const { Pool } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('migration 038 — invariante site_id ⊆ assigned_sites', () => {
  let pool;
  let dbAvailable = false;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[migration-038 test] DB unavailable, skipping: ${err.message}`);
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('backfill: la riga storicamente rotta maria@badge.local (migration 018) ha site_id in assigned_sites', async () => {
    if (!dbAvailable) return;
    const res = await pool.query(
      `SELECT site_id, assigned_sites FROM employees WHERE email = 'maria@badge.local'`
    );
    expect(res.rows.length).toBe(1);
    const { site_id, assigned_sites } = res.rows[0];
    expect(site_id).not.toBeNull();
    expect(assigned_sites).toContain(site_id);
  });

  it('backfill idempotente: rieseguire la stessa UPDATE non modifica più nulla', async () => {
    if (!dbAvailable) return;
    const res = await pool.query(
      `UPDATE employees
       SET assigned_sites = array_append(assigned_sites, site_id)
       WHERE site_id IS NOT NULL AND NOT (site_id = ANY(assigned_sites))`
    );
    expect(res.rowCount).toBe(0);
  });

  it('trigger su INSERT: site_id non incluso in assigned_sites viene aggiunto automaticamente', async () => {
    if (!dbAvailable) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const clientRow = await client.query(
        `INSERT INTO clients (id, name, email, plan, is_demo)
         VALUES (uuid_generate_v4(), 'Trigger Test Co', $1, 'starter', false)
         RETURNING id`,
        [`trigger-test-${Date.now()}@example.invalid`]
      );
      const clientId = clientRow.rows[0].id;
      const siteRow = await client.query(
        `INSERT INTO sites (id, client_id, name, qr_code_content)
         VALUES (uuid_generate_v4(), $1, 'Trigger Test Site', $2)
         RETURNING id`,
        [clientId, `badge://trigger-test-${Date.now()}`]
      );
      const siteId = siteRow.rows[0].id;

      const empRow = await client.query(
        `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites)
         VALUES ($1, $2, 'Trigger Test Employee', 'employee', $3, ARRAY[]::uuid[])
         RETURNING assigned_sites`,
        [clientId, `trigger-test-emp-${Date.now()}@example.invalid`, siteId]
      );

      expect(empRow.rows[0].assigned_sites).toEqual([siteId]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('trigger su UPDATE: cambiare site_id aggiunge il nuovo sito SENZA rimuovere quelli già presenti (multi-sede)', async () => {
    if (!dbAvailable) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const clientRow = await client.query(
        `INSERT INTO clients (id, name, email, plan, is_demo)
         VALUES (uuid_generate_v4(), 'Trigger Test Co 2', $1, 'starter', false)
         RETURNING id`,
        [`trigger-test-2-${Date.now()}@example.invalid`]
      );
      const clientId = clientRow.rows[0].id;
      const site1 = await client.query(
        `INSERT INTO sites (id, client_id, name, qr_code_content)
         VALUES (uuid_generate_v4(), $1, 'Site Roma', $2) RETURNING id`,
        [clientId, `badge://trigger-test-roma-${Date.now()}`]
      );
      const site2 = await client.query(
        `INSERT INTO sites (id, client_id, name, qr_code_content)
         VALUES (uuid_generate_v4(), $1, 'Site Milano', $2) RETURNING id`,
        [clientId, `badge://trigger-test-milano-${Date.now()}`]
      );
      const site3 = await client.query(
        `INSERT INTO sites (id, client_id, name, qr_code_content)
         VALUES (uuid_generate_v4(), $1, 'Site Torino', $2) RETURNING id`,
        [clientId, `badge://trigger-test-torino-${Date.now()}`]
      );
      const roma = site1.rows[0].id, milano = site2.rows[0].id, torino = site3.rows[0].id;

      const empRow = await client.query(
        `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites)
         VALUES ($1, $2, 'Multi Site Employee', 'manager', $3, ARRAY[$3, $4]::uuid[])
         RETURNING id`,
        [clientId, `multi-site-${Date.now()}@example.invalid`, roma, milano]
      );
      const empId = empRow.rows[0].id;

      const updated = await client.query(
        `UPDATE employees SET site_id = $1 WHERE id = $2 RETURNING assigned_sites`,
        [torino, empId]
      );

      const finalSites = updated.rows[0].assigned_sites;
      expect(finalSites).toContain(roma);
      expect(finalSites).toContain(milano);
      expect(finalSites).toContain(torino);
      expect(finalSites.length).toBe(3);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('site_id NULL (admin/superadmin) non causa errori dal trigger', async () => {
    if (!dbAvailable) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const clientRow = await client.query(
        `INSERT INTO clients (id, name, email, plan, is_demo)
         VALUES (uuid_generate_v4(), 'Trigger Test Co 3', $1, 'starter', false)
         RETURNING id`,
        [`trigger-test-3-${Date.now()}@example.invalid`]
      );
      const clientId = clientRow.rows[0].id;

      const empRow = await client.query(
        `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites)
         VALUES ($1, $2, 'Admin No Site', 'admin', NULL, ARRAY[]::uuid[])
         RETURNING site_id, assigned_sites`,
        [clientId, `admin-no-site-${Date.now()}@example.invalid`]
      );

      expect(empRow.rows[0].site_id).toBeNull();
      expect(empRow.rows[0].assigned_sites).toEqual([]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
```

- [ ] **Step 2: Eseguire e verificare**

Run: `cd backend && npx jest migration-038-assigned-sites-invariant --silent=false`
Expected: 5/5 PASS. Se la migration 038 non fosse ancora applicata sul DB di test locale, il primo test fallirebbe (`assigned_sites` non conterrebbe `site_id`) — eseguire `NODE_ENV=test node scripts/run-migrations.js` prima di rieseguire.

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/migration-038-assigned-sites-invariant.test.js
git commit -m "test(backend): verify trigger and backfill behavior for site_id/assigned_sites invariant"
```

---

## Task 3: Test end-to-end — il bug originale è davvero chiuso

**Files:**
- Create: `backend/src/__tests__/checkins-assigned-sites-backfill.test.js`

- [ ] **Step 1: Scrivere il test — riusa il pattern reale già in `checkins-active-employee.test.js` (client/site/employee helper + `tokenFor` + supertest)**

```javascript
'use strict';

/**
 * Verifica end-to-end (non solo asserzioni SQL) che il trigger della
 * migration 038 chiuda davvero il bug originale: un employee inserito con
 * site_id valorizzato ma assigned_sites vuoto — il path storicamente rotto
 * di migration 018/019a — riesce comunque a fare check-in, perché il
 * trigger lo corregge automaticamente all'INSERT.
 */

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('POST /api/v1/checkins — employee inserito con site_id ma assigned_sites vuoto (migration 038)', () => {
  jest.setTimeout(30000);

  let pool;
  let dbAvailable = false;
  let request;
  let app;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[checkins-assigned-sites-backfill test] Skipping — could not connect: ${err.message}`);
    }
    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      const { closePool } = require('../db/pool');
      await closePool();
    }
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  function tokenFor({ client_id, role, employee_id }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign(
      { user_id: 'test-user', client_id, role, employee_id, name: 'Test' },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );
  }

  it('un employee inserito passando SOLO site_id (assigned_sites di default) riesce comunque a fare check-in', async () => {
    if (!dbAvailable) return;

    const clientRow = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Backfill E2E Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('backfill-e2e-client')]
    );
    const clientId = clientRow.rows[0].id;

    const siteRow = await pool.query(
      `INSERT INTO sites (id, client_id, name, qr_code_content)
       VALUES (uuid_generate_v4(), $1, 'Backfill E2E Site', $2)
       RETURNING id`,
      [clientId, `badge://backfill-e2e-${Date.now()}`]
    );
    const siteId = siteRow.rows[0].id;

    // Simula esattamente il path storicamente rotto: solo site_id, MAI
    // assigned_sites (colonna omessa dall'INSERT, resta al default '{}').
    // Se il trigger della migration 038 funziona, la riga risulterà
    // comunque con site_id incluso in assigned_sites subito dopo l'insert.
    const empRow = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, site_id)
       VALUES ($1, $2, 'Backfill E2E Employee', 'employee', $3)
       RETURNING id, assigned_sites`,
      [clientId, uniqueEmail('backfill-e2e-employee'), siteId]
    );
    const employeeId = empRow.rows[0].id;

    expect(empRow.rows[0].assigned_sites).toEqual([siteId]);

    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Eseguire e verificare**

Run: `cd backend && npx jest checkins-assigned-sites-backfill --silent=false`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/checkins-assigned-sites-backfill.test.js
git commit -m "test(backend): end-to-end regression guard — employee with site_id-only insert can check in (migration 038)"
```

---

## Task 4: Non-regressione sui path applicativi esistenti che scrivono `employees`

Nessun codice applicativo viene modificato in questo piano — questo task rieseguisce le suite già esistenti con il trigger attivo, per dimostrare che nessuna assunzione preesistente si rompe. In particolare `employeeSync/applyDiff.js` resetta esplicitamente `assigned_sites = [nuovo_site_id]` quando `site_id` cambia (vedi spec, sezione "test 6") — con il trigger attivo questo deve restare un no-op (il nuovo sito è già incluso nell'array che l'applicazione stessa scrive), non deve introdurre doppioni.

- [ ] **Step 1: Eseguire le suite che scrivono/leggono `assigned_sites` via i path applicativi esistenti**

Run:
```bash
cd backend && npx jest admin-employees-active-filter admin-employees-deactivate employeeSync-applyDiff employeeSync-computeDiff checkins-ownership checkins checkins-active-employee checkins-assigned-sites-backfill migration-038-assigned-sites-invariant --silent=false
```
Expected: tutti verdi, stessi numeri di pass di prima dell'introduzione del trigger (nessuna suite qui viene modificata da questo piano — un fallimento indicherebbe un'interazione inattesa tra il trigger e uno di questi path, da investigare prima di proseguire, non da ignorare).

- [ ] **Step 2: Verifica mirata — un trasferimento di sede via wizard non produce doppioni in `assigned_sites`**

Se, leggendo l'output del Task precedente, `employeeSync-applyDiff.test.js` non asserisce già esplicitamente il contenuto di `assigned_sites` dopo un trasferimento di sede (solo `site_id`), aggiungere un'unica asserzione mirata al test esistente più vicino a questo scenario in quel file (non creare un file nuovo per un singolo controllo) verificando che `assigned_sites` dopo il trasferimento contenga esattamente il nuovo sito una sola volta, non un doppione del vecchio+nuovo. Se l'asserzione esiste già ed è verde, questo step è già soddisfatto — annotarlo nel report invece di duplicare test.

- [ ] **Step 3: Suite completa backend**

Run: `cd backend && npm test`
Expected: tutti verdi, stesso conteggio complessivo di pass/skip già noto da Fase A (716+/730, 14 skip) più i nuovi test di questo piano — nessuna regressione su nessun test esistente, non solo su quelli che toccano `employees` direttamente (un trigger a livello di tabella è un cambiamento globale).

- [ ] **Step 4: Lint**

Run: `cd backend && npm run lint`
Expected: 0 errori (i warning pre-esistenti non correlati sono accettabili, coerente con la Fase A).

Nessun commit in questo task — è verifica, non produce modifiche (a meno che lo Step 2 non richieda l'aggiunta di un'asserzione, nel qual caso commit separato con messaggio `test(backend): assert no duplicate site in assigned_sites after wizard site transfer`).

---

## Task 5: Rollout — develop → staging, poi main → produzione

Segue lo stesso protocollo già stabilito nel piano Fase A (2026-08-02): mai push diretto su `main`.

- [ ] **Step 1: Determinare il branch di partenza corretto**

Questo lavoro è stato brainstormato/pianificato su un branch creato da `main` (`fix/assigned-sites-invariant-2026-08-06`), non da `develop` — verificare lo stato di `develop` al momento dell'esecuzione (`git log develop..main --oneline` e viceversa) prima di aprire un PR/merge, per capire se serve prima riallineare `develop` con `main` (che nella sessione Fase A precedente ha già ricevuto il wizard "Aggiorna Dipendenti" oltre a Fase A) o se questo branch va ribasato su `develop` per seguire lo stesso percorso di verifica staging→produzione.

- [ ] **Step 2: Merge in `develop`, push, verifica staging**

Stesso protocollo Fase A Task 14: merge in `develop` (via worktree se `develop` risulta già occupato altrove — verificare con `git worktree list` prima di un `git checkout develop`), push, attendere `deploy-staging.yml`, poi verifica manuale che l'employee `maria@badge.local` su staging riesca finalmente a fare un check-in reale (era il sintomo originale che ha scoperto questo bug).

- [ ] **Step 3: Merge in `main` SOLO dopo conferma esplicita dell'utente**

Come da Fase A — non eseguire senza una conferma esplicita e separata dopo la verifica su staging.

---

## Note per l'implementer

- Il trigger PL/pgSQL non è testabile con i mock già in uso altrove nel progetto (`jest.mock` su `pool`) — richiede sempre una connessione Postgres reale, da qui il pattern `dbAvailable` soft-skip già consolidato nel repo (vedi `migration-035-employee-lifecycle.test.js`, `checkins-active-employee.test.js`).
- Non esiste modo di inserire una riga "rotta" via SQL normale una volta che il trigger è attivo (la corregge lui stesso prima della scrittura) — per questo il Task 3 non tenta di creare una riga rotta e poi ripararla, ma verifica che il trigger la corregga già al momento dell'INSERT, che è il comportamento realmente rilevante per il bug originale.
- Se, eseguendo il Task 1 Step 2, `038` risultasse già occupato (altro lavoro nel frattempo su `main`), fermarsi e chiedere conferma sul numero corretto prima di procedere — non rinumerare autonomamente (già successo una volta in Fase A, gestito correttamente fermandosi).
