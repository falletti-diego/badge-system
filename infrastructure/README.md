# Infrastructure — Docker & Cloud Setup

**Purpose:** Manage Docker images, docker-compose configs, AWS deployment scripts

---

## 📂 Contents

```
infrastructure/
├── docker/
│   ├── Dockerfile.backend     # Node.js API image
│   ├── Dockerfile.frontend    # React dashboard image (static)
│   └── .dockerignore          # Files to exclude from build
│
├── docker-compose.yml         # Local dev: PostgreSQL + backend + frontend
├── docker-compose.prod.yml    # Production: API + RDS + Netlify
│
├── aws/
│   ├── ec2-setup.sh          # EC2 instance setup script
│   ├── rds-setup.sh          # RDS PostgreSQL setup
│   ├── iam-roles.json        # IAM roles for CI/CD
│   └── security-groups.json  # AWS security group rules
│
├── ci-cd/
│   ├── github-actions-setup.yml  # GitHub Actions workflow
│   └── deploy-script.sh           # Deployment to EC2
│
├── nginx/
│   └── nginx.conf            # Reverse proxy config (optional)
│
└── README.md (this file)
```

---

## 🐳 Docker Setup

### Local Development (docker-compose)

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: badge_user
      POSTGRES_PASSWORD: badge_password
      POSTGRES_DB: badge_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build:
      context: ../backend
      dockerfile: ../infrastructure/docker/Dockerfile.backend
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://badge_user:badge_password@postgres:5432/badge_dev
      NODE_ENV: development
    depends_on:
      - postgres

volumes:
  postgres_data:
```

### Start Local Environment
```bash
cd infrastructure
docker-compose up -d
# PostgreSQL: localhost:5432
# Backend: localhost:3000
# Frontend: npm run dev → localhost:5173
```

---

## ☁️ AWS Deployment

### 1. RDS PostgreSQL Setup
```bash
./aws/rds-setup.sh
# Creates:
# - db.t3.micro PostgreSQL instance
# - Multi-AZ (optional upgrade)
# - Automated backups (7 days)
# - Endpoint: badge-db.xxxxx.eu-west-1.rds.amazonaws.com
```

### 2. EC2 Instance Setup
```bash
./aws/ec2-setup.sh
# Launches t3.small instance:
# - OS: Ubuntu 22.04 LTS
# - Security group: allows 22 (SSH), 80 (HTTP), 443 (HTTPS)
# - Docker pre-installed
# - Auto-pulls from AWS ECR on startup
```

### 3. Deployment Flow
```
GitHub (main push)
  ↓
GitHub Actions (builds Docker image)
  ↓
AWS ECR (stores image)
  ↓
SSH to EC2 (pulls image, restarts container)
  ↓
CloudWatch (monitors logs & metrics)
```

---

## 🔐 Security Groups (AWS)

**Inbound Rules:**
```
Port 22   (SSH)  → From: Your IP only
Port 80   (HTTP) → From: CloudFront/ALB
Port 443  (HTTPS) → From: CloudFront/ALB
```

**Outbound Rules:**
```
All traffic allowed (for npm install, Docker pulls, API calls)
```

---

## 🚀 CI/CD Pipeline

### GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy Badge System

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Docker image
        run: docker build -t badge-api:latest ./backend
      
      - name: Push to AWS ECR
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker tag badge-api:latest $ECR_REGISTRY/badge-api:latest
          docker push $ECR_REGISTRY/badge-api:latest
      
      - name: Deploy to EC2
        run: |
          ssh -i $SSH_KEY ubuntu@$EC2_IP \
            'cd /app && docker-compose pull && docker-compose up -d'
```

---

## 📦 Environment Files

### `.env.backend` (EC2)
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@badge-db.xxxxx.rds.amazonaws.com:5432/badge_prod
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=xxx
AUTH0_CLIENT_SECRET=xxx
JWT_SECRET=your_super_secret_key
SENTRY_DSN=https://key@sentry.io/project
```

### `.env.frontend` (Netlify)
```bash
VITE_API_URL=https://api.badge.dataxiom.it
VITE_AUTH0_DOMAIN=your-domain.auth0.com
VITE_AUTH0_CLIENT_ID=xxx
```

---

## 📊 Monitoring & Logging

### CloudWatch
```bash
# View EC2 logs
aws logs tail /aws/ec2/badge-api --follow

# View metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-xxxxx \
  --start-time 2026-05-28T00:00:00Z \
  --end-time 2026-05-28T23:59:59Z \
  --period 300 \
  --statistics Average
```

### Sentry Error Tracking
```bash
# Configure in backend/.env
SENTRY_DSN=https://key@sentry.io/project

# View errors: https://sentry.io/organizations/your-org/issues/
```

---

## 🔄 Zero-Downtime Deployments

### Blue-Green Deployment Strategy
```bash
# Current (Blue) → New (Green) → Switch

# 1. Start new container on :3001
docker run -d -p 3001:3000 badge-api:new-version

# 2. Health check new container
curl http://localhost:3001/api/health

# 3. Switch load balancer to :3001
# (via nginx or AWS ALB)

# 4. Keep old container running for quick rollback
# If issues: switch back to old version
```

---

## 🚨 Disaster Recovery

### Backup Strategy
- **RDS Automated Backups:** 7-day retention
- **Manual Snapshot:** Weekly via AWS CLI
  ```bash
  aws rds create-db-snapshot \
    --db-instance-identifier badge-db \
    --db-snapshot-identifier badge-backup-$(date +%Y%m%d)
  ```

### Point-in-Time Recovery
```bash
# Restore to specific timestamp
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier badge-db-restored \
  --db-snapshot-identifier badge-backup-20260528 \
  --restore-time 2026-05-28T14:30:00Z
```

---

## 📚 Useful Commands

### Docker
```bash
# Build image
docker build -f infrastructure/docker/Dockerfile.backend -t badge-api .

# Run container
docker run -p 3000:3000 --env-file .env badge-api

# View logs
docker logs -f container_name

# Stop container
docker stop container_name
```

### AWS CLI
```bash
# List EC2 instances
aws ec2 describe-instances --region eu-west-1

# SSH to instance
ssh -i your-key.pem ubuntu@your-instance-ip

# View RDS instances
aws rds describe-db-instances --region eu-west-1
```

---

**Last Updated:** 28 Maggio 2026
