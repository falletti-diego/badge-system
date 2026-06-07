---
name: ec2-diagnose
description: Diagnose Badge System EC2 container health via SSH. Collects docker ps, logs, /health response, CPU/mem, inspect. Outputs a markdown report with triage if anything is down.
---

# /ec2-diagnose — Badge System EC2 Container Diagnostics

Diagnoses the live state of the `badge-system-api` Docker container on EC2 in one pass.
Collects: container status, uptime, last 50 log lines, /health API response, CPU/mem usage, Docker health check state.
If something is down, shows exit code and probable cause with a fix suggestion.
Saves the full report as a timestamped markdown file.

---

## Input

Arguments (space-separated, both optional — defaults to Badge System production):

```
/ec2-diagnose [EC2_HOST] [SSH_KEY_PATH]
```

**Defaults (Badge System production):**
- `EC2_HOST` = `34.245.145.143`
- `SSH_KEY_PATH` = `~/.ssh/badge-system-ec2-v2.pem`
- `CONTAINER_NAME` = `badge-system-api`
- `PORT` = `3000`

Examples:
```
/ec2-diagnose                                           # production defaults
/ec2-diagnose 34.245.145.143 ~/.ssh/badge-key.pem      # explicit
/ec2-diagnose 10.0.0.5 ~/keys/staging.pem              # staging
```

---

## Execution

Run **all commands in a single SSH session** to minimise latency. Parse each output section separately.

### Step 1 — Connect and collect all data in one shot

```bash
SSH_HOST="${1:-34.245.145.143}"
SSH_KEY="${2:-~/.ssh/badge-key.pem}"
CONTAINER="badge-system-api"
PORT=3000

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes ubuntu@"$SSH_HOST" bash <<'REMOTE'
CONTAINER="badge-system-api"
PORT=3000

echo "=== DOCKER_PS ==="
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}" 2>&1

echo "=== CONTAINER_INSPECT ==="
docker inspect "$CONTAINER" --format '
ID:          {{.Id | printf "%.12s"}}
Status:      {{.State.Status}}
Running:     {{.State.Running}}
StartedAt:   {{.State.StartedAt}}
FinishedAt:  {{.State.FinishedAt}}
ExitCode:    {{.State.ExitCode}}
OOMKilled:   {{.State.OOMKilled}}
Restarting:  {{.State.Restarting}}
Health:      {{if .State.Health}}{{.State.Health.Status}}{{else}}no healthcheck{{end}}
FailingStreak: {{if .State.Health}}{{.State.Health.FailingStreak}}{{else}}0{{end}}
' 2>&1

echo "=== HEALTH_LAST_LOG ==="
docker inspect "$CONTAINER" --format '{{if .State.Health}}{{range .State.Health.Log}}ExitCode={{.ExitCode}} Output={{.Output}}
{{end}}{{else}}no healthcheck configured{{end}}' 2>&1 | tail -5

echo "=== STATS ==="
docker stats "$CONTAINER" --no-stream --format "CPU={{.CPUPerc}} MEM={{.MemUsage}} MEM%={{.MemPerc}} NET={{.NetIO}} BLOCK={{.BlockIO}}" 2>&1

echo "=== CURL_HEALTH ==="
curl -sk --max-time 5 "http://localhost:$PORT/health" 2>&1 || echo "CURL_FAILED: exit=$?"

echo "=== DOCKER_LOGS ==="
docker logs "$CONTAINER" --tail 50 2>&1
REMOTE
```

### Step 2 — Parse and build the diagnostic report

Extract each `=== SECTION ===` block from the SSH output and populate the tables below.

---

## Output Format

Present results in this exact structure.

### 1. Container Status Table

```
┌────────────────────────────────────────────────────────────┐
│  EC2 CONTAINER DIAGNOSTIC — badge-system-api               │
│  Host: <EC2_HOST>   Time: <ISO timestamp>                  │
├─────────────────────┬──────────────────────────────────────┤
│  Container Status   │  ✅ running  /  ❌ exited / ⚠️ ...  │
│  Uptime             │  X days, Y hours (started <date>)    │
│  Docker Health      │  healthy / unhealthy / starting      │
│  Health Fail Streak │  0  (or N consecutive failures)      │
│  Exit Code          │  0  (or N — shown only if not 0)     │
│  OOM Killed         │  No / Yes ⚠️                         │
├─────────────────────┼──────────────────────────────────────┤
│  CPU Usage          │  X.X%                                │
│  Memory             │  XXX MiB / YYY MiB (Z%)             │
│  Network I/O        │  X MB in / Y MB out                  │
├─────────────────────┼──────────────────────────────────────┤
│  /health endpoint   │  ✅ HTTP 200 + JSON  /  ❌ FAILED    │
│  Health response    │  { "status": "ok", "db": "ok" }      │
└─────────────────────┴──────────────────────────────────────┘
```

### 2. Last 50 Log Lines

Present as a fenced code block with the raw log output. Add a brief summary line above:
- ✅ No errors in last 50 lines
- ⚠️ N warnings found: `<first warning snippet>`
- ❌ Errors found: `<first error snippet>`

Grep the log output for: `ERROR`, `FATAL`, `error`, `crash`, `ECONNREFUSED`, `ETIMEDOUT`, `killed`, `OOM`, `out of memory` to populate the summary.

### 3. Triage (only if status ≠ running OR health ≠ healthy OR /health ≠ 200)

If anything is wrong, add a **Triage** section:

```
## Triage

| Signal | Observed Value | Probable Cause | Suggested Fix |
|--------|---------------|----------------|---------------|
```

Use this lookup table to populate probable cause and fix:

| Signal | Probable Cause | Suggested Fix |
|--------|---------------|---------------|
| ExitCode=1, logs contain `FATAL: JWT_SECRET` | Missing SSM parameter at bootstrap | `aws ssm put-parameter --name /badge/production/JWT_SECRET --type SecureString --value <val>` then restart container |
| ExitCode=1, logs contain `SSM fetch failed` | EC2 IAM role missing ssm:GetParametersByPath | Attach `BadgeSSMReadProduction` policy to EC2 role |
| ExitCode=1, logs contain `ECONNREFUSED.*5432` | RDS unreachable (SG, DNS, or DB down) | Check RDS security group inbound rule for port 5432 from EC2 SG |
| ExitCode=137 or OOMKilled=true | Container OOM-killed by kernel | Increase EC2 instance size or reduce Node.js heap (`--max-old-space-size`) |
| Status=restarting | Crash loop | Check logs for last error before exit; likely SSM or DB connectivity |
| HealthCheck failing, /health returns 200 | docker exec env != process env (known: secrets not in docker ENV) | Expected — healthcheck uses HTTP only, not env vars. Ignore if /health 200. |
| /health returns `{"db":"error"}` | RDS connection pool exhausted or DB down | Check RDS CloudWatch metrics; restart container to reset pool |
| /health CURL_FAILED | Port 3000 not listening — container may be starting up or crashed | `docker logs badge-system-api --tail 20` for crash reason |
| No container found in `docker ps -a` | Container never started or was removed | Run deploy workflow from GitHub Actions or re-run `docker run` manually |

---

## Step 3 — Save report as markdown

Save the full report (status table + logs + triage) to a timestamped file:

```bash
REPORT_FILE="/tmp/ec2-diagnose-$(date +%Y%m%d-%H%M%S).md"
# Write the full markdown report to $REPORT_FILE
```

Then tell the user:
```
📄 Report saved to: /tmp/ec2-diagnose-YYYYMMDD-HHMMSS.md
   Open with: open /tmp/ec2-diagnose-YYYYMMDD-HHMMSS.md
```

---

## Error handling

| Problem | Action |
|---------|--------|
| SSH connection refused / timeout | Report `❌ Cannot reach EC2 host <HOST>` — EC2 may be stopped or SG blocks port 22 |
| SSH auth failure (permission denied) | Report `❌ SSH key rejected` — verify key path and EC2 key pair |
| `docker: command not found` | Report `❌ Docker not installed on host` — unexpected for Badge System EC2 |
| Container not found in `docker ps -a` | Report `❌ Container badge-system-api not found` — was never started or was removed |

---

## When to use this skill

Use `/ec2-diagnose` proactively in these situations:

| Situation | Why |
|-----------|-----|
| After every `/deploy` that involves backend changes | Verify the new container started cleanly and SSM bootstrap succeeded |
| When `/deploy` verification shows API health ❌ | First step before any fix attempt |
| When users report login failures or 500 errors | Logs will show the exact error (DB pool, JWT, SSM) |
| Before a demo or customer onboarding | Confirm uptime and health check are green |
| After an EC2 restart or AWS maintenance window | Container restart policy may not have brought it back cleanly |
| When memory > 80% or CPU spikes are suspected | Stats section shows live resource usage |
| When GitHub Actions deploy workflow fails at "Wait for healthy" | Container may be crash-looping — logs show the reason |

---

## Proactive trigger rules (for Claude)

Claude should **suggest running `/ec2-diagnose`** when:
- The user mentions "API non risponde", "errore 500", "login non funziona", "container crashato"
- A `/deploy` run shows any ❌ in the API health or CORS checks
- The user asks "cosa sta succedendo sul server" or "perché l'API è lenta"
- A GitHub Actions deploy workflow is mentioned as failed or stuck
- More than 48h have passed since the last known-good health check (if context shows this)
