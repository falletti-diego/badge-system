# Migrations 011 & 012: GDPR Compliance for Italian Market

**Status:** Ready for production RDS  
**Date:** 2026-06-11  
**Impact:** Adds 2 new tables + 1 new column to employees  
**Rollback:** Possible via dropping tables/columns (see instructions)  
**Duration:** < 1 minute

---

## What's in These Migrations?

### Migration 011: DPA Acknowledgements
- New table `dpa_acknowledgements` — tracks when clients accept the Data Processing Agreement (GDPR Art. 28)
- Columns: id, client_id, dpa_version, accepted_at, accepted_by, dpa_signature, notes, created_at, created_by
- Indexes: client_id, accepted_at DESC
- Used by: `POST /api/admin/dpa-acknowledgement`, `GET /api/admin/dpa-acknowledgements`

### Migration 012: Employee Consent Tracking
- New column on `employees` table: `gps_consent_given` (BOOLEAN, default false), `gps_consent_given_at` (TIMESTAMP)
- New table `employee_consent_log` — audit trail of all consent decisions (GDPR Art. 7)
- Columns: id, employee_id, client_id, consent_type, consent_given, dpa_version, privacy_policy_version, accepted_at, user_agent, ip_address, notes, created_at
- Indexes: employee_id, client_id, consent_type + accepted_at, accepted_at DESC
- Used by: `POST /api/consent/gps-acceptance`, `GET /api/consent/my-consents`

---

## How to Apply (3 Methods)

### **Method 1: SSH via EC2 (Recommended)**

1. **SSH into EC2:**
   ```bash
   ssh -i badge-key.pem ubuntu@<EC2_IP>
   ```

2. **Download migrations to EC2:**
   ```bash
   cd /tmp
   git clone https://github.com/your-org/badge-system.git
   cd badge-system
   ```

3. **Set RDS credentials:**
   ```bash
   export PGHOST=badge-system-db.xxxxx.eu-west-1.rds.amazonaws.com
   export PGPORT=5432
   export PGDATABASE=badge_db
   export PGUSER=postgres
   export PGPASSWORD="<RDS_PASSWORD>"  # From AWS Secrets Manager or SSM
   ```

4. **Run migration script:**
   ```bash
   bash backend/migrations/apply-migrations-011-012.sh
   ```

5. **Expected output:**
   ```
   🔷 Applying GDPR compliance migrations (011 & 012)...
   ...
   ✅ Migrations applied successfully!
   ✅ All migrations applied! Database is now GDPR Art. 28 + Art. 7 compliant.
   ```

---

### **Method 2: AWS RDS Query Editor (No SSH needed)**

1. **Open AWS Console** → RDS → Databases → `badge-system-db`

2. **Click "Query Editor" tab** (or use "Data API")

3. **Copy & paste the content of:**
   - `backend/migrations/011_add_dpa_acknowledgements.sql`
   - `backend/migrations/012_add_consent_tracking.sql`

4. **Execute in order** (separate queries or combined in transaction)

5. **Verify:**
   ```sql
   -- List new tables
   SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'dpa_%' OR tablename LIKE 'employee_consent%';
   
   -- Check new columns on employees
   SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'employees' AND column_name LIKE 'gps_%';
   ```

---

### **Method 3: Local psql with SSH Tunnel**

1. **Create SSH tunnel to EC2:**
   ```bash
   ssh -i badge-key.pem -L 5432:badge-system-db.xxxxx.eu-west-1.rds.amazonaws.com:5432 ubuntu@<EC2_IP>
   # Keep this terminal open
   ```

2. **In another terminal, run migration:**
   ```bash
   export PGHOST=localhost
   export PGPORT=5432
   export PGDATABASE=badge_db
   export PGUSER=postgres
   export PGPASSWORD="<RDS_PASSWORD>"
   
   bash backend/migrations/apply-migrations-011-012.sh
   ```

---

## Pre-Migration Checklist

- [ ] RDS backup exists (AWS automatic 7-day retention + manual snapshot if possible)
- [ ] Have RDS credentials available (postgres user password)
- [ ] Know EC2 instance IP address (for SSH)
- [ ] Have badge-key.pem for SSH authentication
- [ ] Read migrations SQL to understand changes (files linked below)
- [ ] No other migrations running on RDS concurrently

---

## Migration Files

- [Migration 011](../backend/migrations/011_add_dpa_acknowledgements.sql) — DPA acknowledgements
- [Migration 012](../backend/migrations/012_add_consent_tracking.sql) — GPS consent tracking
- [Application script](../backend/migrations/apply-migrations-011-012.sh) — Automated runner

---

## Verify Success

After running migrations, verify both tables exist:

```bash
# Via psql
psql -h badge-system-db.xxxxx.eu-west-1.rds.amazonaws.com -U postgres -d badge_db -c "
SELECT 'dpa_acknowledgements' as table_name, COUNT(*) as row_count FROM dpa_acknowledgements
UNION
SELECT 'employee_consent_log', COUNT(*) FROM employee_consent_log;
"

# Should return:
# table_name              | row_count
# dpa_acknowledgements    | 0
# employee_consent_log    | 0
```

Also verify new column on employees:

```bash
psql -h ... -c "
SELECT gps_consent_given, COUNT(*) FROM employees GROUP BY gps_consent_given;
"

# Should return:
# gps_consent_given | count
# false             | <total employees>
```

---

## Rollback Instructions (if needed)

If migrations fail or need to be rolled back:

```sql
-- Rollback Migration 012
DROP TABLE IF EXISTS employee_consent_log CASCADE;
ALTER TABLE employees DROP COLUMN IF EXISTS gps_consent_given;
ALTER TABLE employees DROP COLUMN IF EXISTS gps_consent_given_at;

-- Rollback Migration 011
DROP TABLE IF EXISTS dpa_acknowledgements CASCADE;

-- Verify rollback
SELECT COUNT(*) FROM employees WHERE gps_consent_given IS NOT NULL;
-- Should return: no rows
```

---

## After Migration

1. **Backend API is ready:**
   - `POST /api/admin/dpa-acknowledgement` — admin accepts DPA
   - `GET /api/admin/dpa-acknowledgements` — retrieve DPA history
   - `POST /api/consent/gps-acceptance` — employee accepts GPS consent
   - `GET /api/consent/my-consents` — retrieve consent history

2. **Mobile app needs Build 18:**
   - Includes `GPSConsentDialog` component
   - Calls `POST /api/consent/gps-acceptance` on acceptance
   - Shows dialog before first GPS check-in

3. **Test the flows:**
   - Admin: Accept DPA via `POST /api/admin/dpa-acknowledgement`
   - Employee: QR scan → GPS consent dialog → API call → stored in `employee_consent_log`

---

## Questions?

Contact: privacy@dataxiom.it  
Compliance Review: GDPR Art. 28 (DPA) + Art. 7 (Explicit Consent)  
Status: Production-ready ✅
