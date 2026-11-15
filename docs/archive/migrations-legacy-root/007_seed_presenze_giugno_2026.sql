/**
 * SEED DATA: Presenze Realistiche — Giugno 2026
 * MVP Demo Dataset: 160+ check-ins
 */

\set ON_ERROR_STOP on

-- Step 1: Clear old June data
DELETE FROM checkins
WHERE DATE(timestamp) BETWEEN '2026-06-01' AND '2026-06-30';

-- Step 2: Create temp table with all data
CREATE TEMP TABLE presenze_temp AS
WITH employee_ids AS (
  SELECT id, client_id, name, ROW_NUMBER() OVER (ORDER BY name) as emp_num
  FROM employees
  WHERE name IN ('Marco Rossi', 'Anna Bianchi', 'Luigi Rossi', 'Sara Gallo', 'Luca Verdi')
),
site_ids AS (
  SELECT id, name, ROW_NUMBER() OVER (ORDER BY name) as site_num
  FROM sites
  WHERE name IN ('Milano Store', 'Roma Store', 'Torino Store')
),
all_dates AS (
  SELECT generate_series('2026-06-01'::date, '2026-06-30'::date, '1 day'::interval)::date AS work_date
),
combinations AS (
  SELECT
    ad.work_date,
    ei.id AS employee_id,
    ei.client_id,
    si.id AS site_id,
    (EXTRACT(DAY FROM ad.work_date)::int + ei.emp_num * 7 + si.site_num * 13) % 100 AS hash_val
  FROM all_dates ad
  CROSS JOIN employee_ids ei
  CROSS JOIN site_ids si
),
with_status AS (
  SELECT
    work_date,
    employee_id,
    client_id,
    site_id,
    hash_val,
    CASE
      WHEN hash_val < 70 THEN 'PRESENTE'
      WHEN hash_val < 85 THEN 'IN_RITARDO'
      WHEN hash_val < 95 THEN 'ASSENTE'
      ELSE 'MALATTIA'
    END AS status,
    CASE
      WHEN (EXTRACT(DAY FROM work_date)::int + hash_val) % 3 = 0 THEN 'M'
      WHEN (EXTRACT(DAY FROM work_date)::int + hash_val) % 3 = 1 THEN 'P'
      ELSE 'S'
    END AS shift_type
  FROM combinations
),
final_data AS (
  SELECT
    work_date,
    employee_id,
    client_id,
    site_id,
    status,
    shift_type,
    CASE
      WHEN shift_type = 'M' THEN '08:00'::time
      WHEN shift_type = 'P' THEN '13:00'::time
      ELSE '18:00'::time
    END AS scheduled_in,
    CASE
      WHEN shift_type = 'M' THEN '13:00'::time
      WHEN shift_type = 'P' THEN '21:00'::time
      ELSE '23:00'::time
    END AS scheduled_out,
    CASE
      WHEN status = 'PRESENTE' THEN ((hash_val % 10) - 4)::int
      WHEN status = 'IN_RITARDO' THEN (15 + (hash_val % 45))::int
      ELSE 0
    END AS variance_minutes
  FROM with_status
)
SELECT * FROM final_data;

-- Step 3: Insert IN records
INSERT INTO checkins
  (id, employee_id, client_id, site_id, timestamp, type, created_by, created_at, modified_at)
SELECT
  gen_random_uuid(),
  employee_id,
  client_id,
  site_id,
  work_date::timestamp + scheduled_in + (variance_minutes || ' minutes')::interval,
  'IN',
  'system',
  NOW(),
  NOW()
FROM presenze_temp
WHERE status IN ('PRESENTE', 'IN_RITARDO');

-- Step 4: Insert OUT records
INSERT INTO checkins
  (id, employee_id, client_id, site_id, timestamp, type, created_by, created_at, modified_at)
SELECT
  gen_random_uuid(),
  employee_id,
  client_id,
  site_id,
  work_date::timestamp + scheduled_out + ((variance_minutes - 10) || ' minutes')::interval,
  'OUT',
  'system',
  NOW(),
  NOW()
FROM presenze_temp
WHERE status IN ('PRESENTE', 'IN_RITARDO');

-- Step 5: Cleanup
DROP TABLE presenze_temp;

-- Step 6: Verification
SELECT '✅ SEED COMPLETE' AS result,
       COUNT(*) AS total_records,
       COUNT(DISTINCT DATE(timestamp)) AS unique_dates,
       COUNT(DISTINCT employee_id) AS employees,
       COUNT(DISTINCT site_id) AS sites,
       COUNT(CASE WHEN type = 'IN' THEN 1 END) AS check_ins,
       COUNT(CASE WHEN type = 'OUT' THEN 1 END) AS check_outs
FROM checkins
WHERE DATE(timestamp) BETWEEN '2026-06-01' AND '2026-06-30';

-- Sample data
\echo ''
\echo '═══════════════════════════════════════════════════════════'
\echo '📊 SAMPLE PRESENZE (first 10):'
\echo '═══════════════════════════════════════════════════════════'

SELECT
  TO_CHAR(timestamp, 'YYYY-MM-DD HH24:MI') AS datetime,
  (SELECT name FROM employees WHERE id = checkins.employee_id) AS employee,
  (SELECT name FROM sites WHERE id = checkins.site_id) AS site,
  type
FROM checkins
WHERE DATE(timestamp) BETWEEN '2026-06-01' AND '2026-06-30'
ORDER BY timestamp DESC
LIMIT 10;

\echo ''
\echo '✅ Dataset ready for Dashboard!'
\echo ''
