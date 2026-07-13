-- Removes ALL temporary May 2026 demo data (employees + cascaded checkins/leaves/illnesses)
--
-- Companion of seed-may-2026-demo.sql (created 2026-07-13). All rows created by that
-- script carry the @demo-maggio.local email domain, so this script targets exactly
-- those rows and nothing else.
--
-- Run against production (via SSH to the EC2 host, which is the only host that can
-- reach the RDS instance):
--   scp -i ~/.ssh/badge-system-ec2-v2.pem backend/scripts/cleanup-may-2026-demo.sql ubuntu@34.245.145.143:/tmp/
--   ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@34.245.145.143
--   DBPASS=$(grep '^DB_PASSWORD=' /home/ubuntu/badge-api/.env | cut -d= -f2-)
--   PGPASSWORD="$DBPASS" psql -h badge-system-db.cvs80y0my080.eu-west-1.rds.amazonaws.com -U postgres -d badge_system -f /tmp/cleanup-may-2026-demo.sql
BEGIN;

DELETE FROM checkins WHERE employee_id IN (SELECT id FROM employees WHERE email LIKE '%@demo-maggio.local');
DELETE FROM illnesses WHERE employee_id IN (SELECT id FROM employees WHERE email LIKE '%@demo-maggio.local');
DELETE FROM leave_requests WHERE user_id IN (SELECT id FROM employees WHERE email LIKE '%@demo-maggio.local');
DELETE FROM employees WHERE email LIKE '%@demo-maggio.local';

COMMIT;
