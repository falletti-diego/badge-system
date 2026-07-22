---
name: migration
description: Create a PostgreSQL migration file for Badge System database changes
disable-model-invocation: true
---

# /migration — Crea Database Migration

Genera un file SQL migration valido per il database Badge System (PostgreSQL su AWS RDS).

## Usage

```
/migration <nome_descrittivo>
```

Esempi:
- `/migration add_employee_photo_field`
- `/migration create_audit_events_table`
- `/migration add_site_timezone`

---

## Step 1 — Determina il numero progressivo

Guarda i file esistenti nella cartella `backend/migrations/`:

```bash
ls backend/migrations/ | sort
```

Il prossimo numero è il massimo attuale + 1, con zero-padding a 3 cifre (es. `005`, `010`).

---

## Step 2 — Costruisci il nome del file

Formato: `NNN_<nome_descrittivo>.sql`

Esempio: `005_add_employee_photo_field.sql`

---

## Step 3 — Scrivi la migration

Crea il file in `backend/migrations/<NNN_nome>.sql` con questo template:

```sql
-- Migration: <Descrizione leggibile della modifica>
-- Date: <YYYY-MM-DD>
-- Description: <Perché questa migration è necessaria>

BEGIN;

-- ============================================================
-- DDL STATEMENTS
-- ============================================================

-- <Scrivi qui le istruzioni ALTER TABLE / CREATE TABLE / CREATE INDEX>

-- ============================================================
-- ROLLBACK (commenta come guida per eventuale rollback manuale)
-- ============================================================
-- Per fare rollback:
-- <Scrivi qui le istruzioni inverse, commentate>

COMMIT;
```

### Regole obbligatorie:
- ✅ Sempre wrapped in `BEGIN; ... COMMIT;`
- ✅ Usa `CREATE TABLE IF NOT EXISTS` e `ADD COLUMN IF NOT EXISTS` (idempotente)
- ✅ Foreign keys con `ON DELETE CASCADE` o `ON DELETE SET NULL` (mai ON DELETE NO ACTION senza motivo)
- ✅ UUID come PK: `DEFAULT uuid_generate_v4()`
- ✅ Timestamp con timezone: `TIMESTAMP WITH TIME ZONE DEFAULT NOW()`
- ✅ Crea INDEX per colonne usate in WHERE/JOIN frequenti
- ❌ Mai `DROP TABLE` o `DROP COLUMN` senza chiedere conferma esplicita all'utente
- ❌ Mai modificare tabelle `clients`, `employees`, `sites` senza conferma
- ❌ Non usare `NOT NULL` su nuove colonne senza `DEFAULT` (romperebbe righe esistenti)

---

## Step 4 — Verifica syntax

Controlla che il file sia sintatticamente corretto:

```bash
# Verifica che non ci siano errori evidenti di syntax SQL
grep -n "BEGIN\|COMMIT\|ROLLBACK" backend/migrations/<NNN_nome>.sql
```

Se il DB dev è raggiungibile in locale:
```bash
PGPASSWORD=Badge2026Simple psql -h localhost -U postgres -d badge_dev -f backend/migrations/<NNN_nome>.sql
```

---

## Step 5 — Esegui su RDS (solo se esplicitamente richiesto)

Per applicare la migration al database di produzione su AWS RDS, l'utente deve eseguire manualmente:

```bash
npm run migrations
```

Da `backend/`. Questo esegue il runner `backend/scripts/run-migrations.js` (idempotente, traccia le migration applicate in `schema_migrations`).

**Nota:** RDS non è raggiungibile direttamente dalla rete locale (security group VPC-only) — per applicare una migration in produzione va eseguito da dentro la VPC: `scp` del file su EC2, poi `ssh` + `psql -f` da lì (vedi `aws_ec2_instance.md` in memoria per le credenziali SSH).

**Non applicare la migration automaticamente a produzione.** Chiedi sempre conferma prima.

---

## Output finale

Comunica:
1. Il path del file creato
2. Le tabelle/colonne modificate
3. Se serve rollback manuale, come farlo
4. Se ci sono dipendenze da verificare (es. FK su tabelle che devono esistere)
