# AWS Cost Optimization + DNS Migration to Route53 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut AWS spend from a $102.81 forecast down to ~€20-30/month baseline, fix the ephemeral-IP DNS incident found this session, and migrate DNS management for `dataxiom.it` to Route53 (nameserver delegation only — registration stays at Register.it).

**Architecture:** A sequence of independent AWS resource changes (RDS/EC2/ECR/CloudWatch), each reversible and non-disruptive to production, followed by a DNS cutover (Route53 hosted zone → verify → manual nameserver change at Register.it → post-cutover verification).

**Tech Stack:** AWS CLI (`aws ec2`, `aws rds`, `aws ecr`, `aws logs`, `aws route53`), `dig`, `curl`.

**Out of scope (per spec, section 4/6):** EC2 production downgrade (deferred until the pilot customer is stable 2-4 weeks post-launch), full domain registrar transfer to Route53 (Solution B), staging start/stop automation.

---

### Task 1: Stop RDS staging

**Resources:** `badge-system-db-staging` (RDS instance)

- [ ] **Step 1: Confirm current state**

Run: `aws rds describe-db-instances --db-instance-identifier badge-system-db-staging --query "DBInstances[0].DBInstanceStatus" --output text`
Expected: `available`

- [ ] **Step 2: Stop the instance**

Run: `aws rds stop-db-instance --db-instance-identifier badge-system-db-staging`
Expected: JSON output with `"DBInstanceStatus": "stopping"`

- [ ] **Step 3: Verify it reaches `stopped`**

Run: `aws rds describe-db-instances --db-instance-identifier badge-system-db-staging --query "DBInstances[0].DBInstanceStatus" --output text`
Expected: `stopped` (may take 2-5 minutes; re-run until it stops showing `stopping`)

**Note:** AWS auto-restarts a stopped RDS instance after 7 days if left stopped (AWS limitation, not a bug) — if this plan's execution date is postponed, restart-and-stop again before day 7, or accept it will briefly resume billing.

---

### Task 2: Delete obsolete manual RDS snapshots

**Resources:** `badge-backup-test-20260608`, `badge-system-db-snapshot` (manual RDS snapshots, 20GB each, both from June, never referenced since)

- [ ] **Step 1: Confirm they're not needed — list all snapshots one more time**

Run: `aws rds describe-db-snapshots --query "DBSnapshots[?SnapshotType=='manual'].{ID:DBSnapshotIdentifier,Created:SnapshotCreateTime}" --output table`
Expected: only the two snapshots above listed as manual (automated ones are separate and untouched by this task)

- [ ] **Step 2: Delete `badge-backup-test-20260608`**

Run: `aws rds delete-db-snapshot --db-snapshot-identifier badge-backup-test-20260608`
Expected: JSON output confirming deletion request, `Status: deleting`

- [ ] **Step 3: Delete `badge-system-db-snapshot`**

Run: `aws rds delete-db-snapshot --db-snapshot-identifier badge-system-db-snapshot`
Expected: JSON output confirming deletion request, `Status: deleting`

- [ ] **Step 4: Verify both are gone**

Run: `aws rds describe-db-snapshots --query "DBSnapshots[?SnapshotType=='manual'].DBSnapshotIdentifier" --output text`
Expected: empty output

---

### Task 3: Add ECR lifecycle policy (stop unbounded image growth)

**Resources:** `badge-system-backend` (ECR repository, currently 181 images / ~33GB, no lifecycle policy)

- [ ] **Step 1: Confirm no policy exists yet**

Run: `aws ecr get-lifecycle-policy --repository-name badge-system-backend`
Expected: error `LifecyclePolicyNotFoundException` (confirms the gap found during diagnosis)

- [ ] **Step 2: Write the policy file**

Create `/tmp/ecr-lifecycle-policy.json`:
```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep only the 15 most recent images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 15
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
```

- [ ] **Step 3: Apply it**

Run: `aws ecr put-lifecycle-policy --repository-name badge-system-backend --lifecycle-policy-text file:///tmp/ecr-lifecycle-policy.json`
Expected: JSON output echoing back the policy text, no error

- [ ] **Step 4: Verify it's active**

Run: `aws ecr get-lifecycle-policy --repository-name badge-system-backend --query "lifecyclePolicyText" --output text`
Expected: the JSON policy text from Step 2, not an error

- [ ] **Step 5: Trigger an evaluation and confirm old images start expiring**

Run: `aws ecr start-lifecycle-policy-preview --repository-name badge-system-backend`
Wait ~10s, then run: `aws ecr get-lifecycle-policy-preview --repository-name badge-system-backend --query "summary"`
Expected: `expiringImageTotalCount` around 166 (181 current images − 15 kept), confirming the policy targets the expected count. The actual expiration happens asynchronously on AWS's own schedule after this point — no further action needed.

---

### Task 4: Set CloudWatch log retention on staging log group

**Resources:** `/badge/api-staging` (CloudWatch log group, currently retention `None` — never expires)

- [ ] **Step 1: Confirm current retention is unset**

Run: `aws logs describe-log-groups --log-group-name-prefix /badge/api-staging --query "logGroups[0].retentionInDays"`
Expected: `null`

- [ ] **Step 2: Set retention to 30 days (matching production's `/badge/api`)**

Run: `aws logs put-retention-policy --log-group-name /badge/api-staging --retention-in-days 30`
Expected: no output (success is silent for this command)

- [ ] **Step 3: Verify**

Run: `aws logs describe-log-groups --log-group-name-prefix /badge/api-staging --query "logGroups[0].retentionInDays"`
Expected: `30`

---

### Task 5: Increase RDS production backup retention to 7 days

**Resources:** `badge-system-db` (production RDS, currently `BackupRetentionPeriod: 1`)

**Why this task, not just a cost item:** with the first paying customer onboarding within ~1 month, a 1-day backup window is too thin for a rollback scenario on real customer data.

- [ ] **Step 1: Confirm current value**

Run: `aws rds describe-db-instances --db-instance-identifier badge-system-db --query "DBInstances[0].BackupRetentionPeriod"`
Expected: `1`

- [ ] **Step 2: Apply the change**

Run: `aws rds modify-db-instance --db-instance-identifier badge-system-db --backup-retention-period 7 --apply-immediately`
Expected: JSON output showing `PendingModifiedValues.BackupRetentionPeriod: 7` (applies immediately, no restart/downtime required for this specific parameter)

- [ ] **Step 3: Verify it took effect**

Run: `aws rds describe-db-instances --db-instance-identifier badge-system-db --query "DBInstances[0].BackupRetentionPeriod"`
Expected: `7` (may take a minute to reflect; re-run if still `1`)

---

### Task 6: Allocate and associate an Elastic IP for production EC2

**Resources:** `badge-system-api` (EC2 instance `i-033bb0cc6ad03f88f`), currently has only an ephemeral public IP (`52.210.168.149` as of this session) — root cause of today's `api.dataxiom.it` outage after restart.

- [ ] **Step 1: Allocate a new Elastic IP**

Run: `aws ec2 allocate-address --domain vpc --query "{AllocationId:AllocationId,PublicIp:PublicIp}" --output json`
Expected: JSON with a new `AllocationId` (starts `eipalloc-`) and a new `PublicIp`. **Record both values — they're used in every step below and in Task 7.**

- [ ] **Step 2: Associate it with the production instance**

Run (replace `<ALLOCATION_ID>` with the value from Step 1): `aws ec2 associate-address --instance-id i-033bb0cc6ad03f88f --allocation-id <ALLOCATION_ID>`
Expected: JSON output with an `AssociationId`

- [ ] **Step 3: Verify the instance now reports the new static IP**

Run: `aws ec2 describe-instances --instance-ids i-033bb0cc6ad03f88f --query "Reservations[0].Instances[0].PublicIpAddress" --output text`
Expected: matches the `PublicIp` from Step 1

- [ ] **Step 4: Confirm the API is reachable on the new IP directly (before any DNS change)**

Run: `curl -s -m 10 http://<NEW_PUBLIC_IP>:3000/health`
Expected: `{"status":"ok",...,"database":"connected",...}`

- [ ] **Step 5: Update the existing DNS A record for `api.dataxiom.it` at Register.it to point to the new Elastic IP**

**USER ACTION REQUIRED** (Register.it has no API accessible from here): log into the Register.it control panel → DNS management for `dataxiom.it` → edit the `api` A record → change the value from the old ephemeral IP to the new Elastic IP from Step 1.

- [ ] **Step 6: Verify DNS propagation and end-to-end health**

Run: `dig +short api.dataxiom.it` — expect it to eventually return the new Elastic IP (may take a few minutes to a few hours depending on the record's current TTL)
Then run: `curl -s -m 10 https://api.dataxiom.it/health` — expect `{"status":"ok",...}`

**This closes the incident found at the start of this session independently of the Route53 migration below** — even if the Route53 cutover (Task 7-10) is postponed, the API will no longer break on a future EC2 restart, because the IP is now static.

---

### Task 7: Create the Route53 hosted zone and populate it with the current DNS records

**Resources:** new Route53 hosted zone for `dataxiom.it`

**Exact current record inventory** (captured this session via `dig` against the live Register.it nameservers — use these values verbatim, do not re-derive):

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `dataxiom.it` | `75.2.60.5` | 3600 |
| CNAME | `www.dataxiom.it` | `dataxiom.netlify.app` | 3600 |
| A | `api.dataxiom.it` | **the new Elastic IP from Task 6, Step 1** | 300 |
| CNAME | `badge.dataxiom.it` | `dataxiom-badge.netlify.app` | 3600 |
| MX | `dataxiom.it` | `10 mail.register.it` | 3600 |
| TXT | `dataxiom.it` | `google-site-verification=Uwyp21SA4mVp2Bi1Ce4tBcwPNcwdiHt5kFKIYm5jDsc` | 3600 |
| CNAME | `f2p3zqvnhqkbkg6l4z5r7ehlffmyuney._domainkey.dataxiom.it` | `f2p3zqvnhqkbkg6l4z5r7ehlffmyuney.dkim.amazonses.com` | 1800 |
| CNAME | `me5k4wgeffp4etlmz6e7up42b3rrkv2p._domainkey.dataxiom.it` | `me5k4wgeffp4etlmz6e7up42b3rrkv2p.dkim.amazonses.com` | 1800 |
| CNAME | `lbnyjkec7aw3x2l3qxxzcckt4ldftwkk._domainkey.dataxiom.it` | `lbnyjkec7aw3x2l3qxxzcckt4ldftwkk.dkim.amazonses.com` | 1800 |

The 3 DKIM CNAMEs are what keeps SES sending-domain verification (`dataxiom.it`, status `SUCCESS`) valid — if these are missed, SES sending breaks. The MX record is what keeps `@dataxiom.it` mailboxes (hosted at Register.it, not AWS) receiving mail — if missed, all email to the domain bounces.

**No SPF or DMARC record exists today** (confirmed via `dig TXT` and `dig TXT _dmarc.dataxiom.it`, both came back empty aside from the Google verification TXT) — do not add one, replicate the current state exactly, adding new record types is out of scope for this migration.

- [ ] **Step 1: Create the hosted zone**

Run: `aws route53 create-hosted-zone --name dataxiom.it --caller-reference "badge-system-dns-migration-$(date +%s)" --query "{ZoneId:HostedZone.Id,NameServers:DelegationSet.NameServers}"`
Expected: JSON with a new `ZoneId` (format `/hostedzone/XXXX`) and a list of 4 AWS name servers. **Record both — used in every remaining step of this task and in Task 8.**

- [ ] **Step 2: Write the record-set change batch**

Create `/tmp/route53-records.json` (replace `<ZONE_ID>` is not needed in this file, only in the apply command; replace `<ELASTIC_IP>` with the value from Task 6 Step 1):

```json
{
  "Comment": "Initial migration of dataxiom.it records from Register.it",
  "Changes": [
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "dataxiom.it", "Type": "A", "TTL": 3600, "ResourceRecords": [{"Value": "75.2.60.5"}]}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "www.dataxiom.it", "Type": "CNAME", "TTL": 3600, "ResourceRecords": [{"Value": "dataxiom.netlify.app"}]}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "api.dataxiom.it", "Type": "A", "TTL": 300, "ResourceRecords": [{"Value": "<ELASTIC_IP>"}]}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "badge.dataxiom.it", "Type": "CNAME", "TTL": 3600, "ResourceRecords": [{"Value": "dataxiom-badge.netlify.app"}]}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "dataxiom.it", "Type": "MX", "TTL": 3600, "ResourceRecords": [{"Value": "10 mail.register.it"}]}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "dataxiom.it", "Type": "TXT", "TTL": 3600, "ResourceRecords": [{"Value": "\"google-site-verification=Uwyp21SA4mVp2Bi1Ce4tBcwPNcwdiHt5kFKIYm5jDsc\""}]}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "f2p3zqvnhqkbkg6l4z5r7ehlffmyuney._domainkey.dataxiom.it", "Type": "CNAME", "TTL": 1800, "ResourceRecords": [{"Value": "f2p3zqvnhqkbkg6l4z5r7ehlffmyuney.dkim.amazonses.com"}]}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "me5k4wgeffp4etlmz6e7up42b3rrkv2p._domainkey.dataxiom.it", "Type": "CNAME", "TTL": 1800, "ResourceRecords": [{"Value": "me5k4wgeffp4etlmz6e7up42b3rrkv2p.dkim.amazonses.com"}]}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "lbnyjkec7aw3x2l3qxxzcckt4ldftwkk._domainkey.dataxiom.it", "Type": "CNAME", "TTL": 1800, "ResourceRecords": [{"Value": "lbnyjkec7aw3x2l3qxxzcckt4ldftwkk.dkim.amazonses.com"}]}}
  ]
}
```

- [ ] **Step 3: Apply the record batch**

Run: `aws route53 change-resource-record-sets --hosted-zone-id <ZONE_ID> --change-batch file:///tmp/route53-records.json --query "ChangeInfo.{Id:Id,Status:Status}"`
Expected: JSON with `Status: PENDING`. **Record the `Id`.**

- [ ] **Step 4: Wait for the change to propagate to Route53's own servers**

Run: `aws route53 wait resource-record-sets-changed --id <CHANGE_ID>`
Expected: no output, command returns once `Status` becomes `INSYNC` (typically under a minute)

---

### Task 8: Verify the Route53 hosted zone resolves correctly BEFORE touching the live nameservers

**This task must pass in full before Task 9 — it's the safety gate for the cutover.**

- [ ] **Step 1: Query each record directly against the new Route53 name servers (not the public resolver, which still points to Register.it)**

For each of the 4 name servers returned in Task 7 Step 1, run: `dig @<ROUTE53_NAMESERVER> dataxiom.it A +short`
Expected: `75.2.60.5`

- [ ] **Step 2: Repeat for the other records**

Run: `dig @<ROUTE53_NAMESERVER> api.dataxiom.it A +short` → expect the Elastic IP
Run: `dig @<ROUTE53_NAMESERVER> www.dataxiom.it CNAME +short` → expect `dataxiom.netlify.app.`
Run: `dig @<ROUTE53_NAMESERVER> badge.dataxiom.it CNAME +short` → expect `dataxiom-badge.netlify.app.`
Run: `dig @<ROUTE53_NAMESERVER> dataxiom.it MX +short` → expect `10 mail.register.it.`
Run: `dig @<ROUTE53_NAMESERVER> f2p3zqvnhqkbkg6l4z5r7ehlffmyuney._domainkey.dataxiom.it CNAME +short` → expect `f2p3zqvnhqkbkg6l4z5r7ehlffmyuney.dkim.amazonses.com.`

**If any of these don't match: stop, fix the record in the hosted zone (re-run Task 7 Step 2-4 with the correction), and re-verify. Do not proceed to Task 9 with a mismatch.**

---

### Task 9: Cut over — change the nameservers at Register.it

**USER ACTION REQUIRED — this step cannot be done via AWS CLI, it's on the registrar's own control panel.**

- [ ] **Step 1: Note the current nameservers as a rollback reference**

Already captured this session: `ns1.register.it`, `ns2.register.it`. Keep this note until Task 10 is fully verified.

- [ ] **Step 2: Change the nameservers**

Log into the Register.it control panel → domain management for `dataxiom.it` → DNS/Nameserver settings → replace `ns1.register.it`/`ns2.register.it` with the 4 Route53 name servers from Task 7 Step 1.

- [ ] **Step 3: Rollback plan if anything breaks post-cutover**

If Task 10 verification fails and the cause isn't quickly fixable in the Route53 hosted zone, revert this step immediately by changing the nameservers back to `ns1.register.it`/`ns2.register.it` in the same control panel. This is fully reversible; the only cost is the propagation delay of the previous TTL.

---

### Task 10: Post-cutover verification

- [ ] **Step 1: Confirm the public resolver now returns Route53's answers**

Run: `dig +short NS dataxiom.it` — expect the 4 AWS name servers (may take time to propagate depending on the previous NS record's TTL, potentially several hours; re-check periodically rather than assuming instant failure)

- [ ] **Step 2: Re-run the full record check from Task 8, this time against the public resolver (no `@` server override)**

Run: `dig +short A dataxiom.it`, `dig +short A api.dataxiom.it`, `dig +short CNAME www.dataxiom.it`, `dig +short CNAME badge.dataxiom.it`, `dig +short MX dataxiom.it`
Expected: same values as Task 8

- [ ] **Step 3: Confirm the live sites and API still work end-to-end**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://badge.dataxiom.it` → expect `200`
Run: `curl -s https://api.dataxiom.it/health` → expect `{"status":"ok",...,"database":"connected",...}`

- [ ] **Step 4: Confirm SES sending still works (DKIM depends on the migrated CNAMEs)**

Run: `aws sesv2 get-email-identity --email-identity dataxiom.it --query "DkimAttributes.Status"`
Expected: `SUCCESS` (if it shows `PENDING` or `FAILED`, the DKIM CNAMEs from Task 7 need re-checking — do not consider the migration complete until this returns `SUCCESS` again)

---

### Task 11: Update project documentation

**Files:**
- Modify: `TASKS.md` (Session Log entry)
- Modify: `HANDOFF.md` (new session handoff)
- Modify: `PROJECT_DECISIONS.md` (new session section)

- [ ] **Step 1: Record the final verified monthly cost baseline**

Run: `aws budgets describe-budgets --account-id 125579685235 --query "Budgets[0].CalculatedSpend"`
Note the `ActualSpend`/`ForecastedSpend` values for the docs update — these are the real numbers to report, not the pre-optimization estimate.

- [ ] **Step 2: Update `TASKS.md`, `HANDOFF.md`, `PROJECT_DECISIONS.md`**

Summarize: staging stopped, snapshots deleted, ECR lifecycle policy active, log retention fixed, backup retention raised to 7 days, Elastic IP allocated (record the IP), DNS migrated to Route53 (nameserver delegation only, registration unchanged at Register.it), EC2 downgrade explicitly deferred with its trigger condition (2-4 weeks post-launch stability).

- [ ] **Step 3: Commit**

Run:
```bash
git add TASKS.md HANDOFF.md PROJECT_DECISIONS.md
git commit -m "docs: AWS cost optimization + Route53 DNS migration executed"
```
