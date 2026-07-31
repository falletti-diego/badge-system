# Ambiente di Staging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire un ambiente di staging completo (EC2 + RDS + DNS/TLS + CI/CD + smoke test + frontend Netlify) che rispecchia la produzione 1:1 a livello di runtime, isolato a livello di rete/IAM/credenziali, con deploy automatico su push al branch `develop`.

**Architecture:** EC2 `t3.micro` dedicata + RDS `db.t3.micro` dedicato, entrambi in rete isolata dalla produzione (nuovi security group, nuovo IAM role scoped a `/badge/staging/*`); nginx+Let's Encrypt su `staging-api.dataxiom.it`; nuovo workflow GitHub Actions che ricalca `ecr-push.yml`+`deploy-to-ec2.yml` ma per lo staging, seguito da uno smoke test E2E automatico; frontend su un secondo sito Netlify con auto-deploy su `develop`.

**Tech Stack:** AWS (EC2, RDS, IAM, SSM Parameter Store, VPC/Security Groups), GitHub Actions, Docker/ECR (stesso repository, tag distinto), nginx + certbot, Netlify, bash/curl per lo smoke test.

**Riferimento:** `docs/superpowers/specs/2026-07-30-staging-environment-design.md`

---

## Nota per chi esegue questo piano

Ogni task tocca infrastruttura reale (AWS, DNS, GitHub, Netlify) — non c'è un ambiente sandbox dove "provare prima". Per questo **ogni singolo task termina con un comando di verifica concreto** che conferma lo stato atteso prima di passare al task successivo. Se una verifica fallisce, **fermarsi e non procedere al task successivo** finché non è risolta — un errore di rete/IAM non catturato subito si propaga silenziosamente ai task successivi ed è molto più difficile da diagnosticare più tardi.

Valori riusati da tutto il piano (produzione, per riferimento — MAI modificarli):
- Regione: `eu-west-1`
- Account ID: `125579685235`
- ECR registry: `125579685235.dkr.ecr.eu-west-1.amazonaws.com`
- ECR repository: `badge-system-backend` (stesso repo, tag diverso — non se ne crea uno nuovo)
- VPC produzione: `vpc-01eab8e6477fa1edf`
- Subnet produzione (stessa AZ, riusata anche per staging): `subnet-04dd717b636888015`
- AMI produzione (Ubuntu 22.04, riusata identica): `ami-0354b051078d198b4`
- Key pair SSH produzione (riusata identica — stessa persona ha accesso a entrambi gli ambienti): `badge-system-ec2-v2`

---

## Task 1: Security Group per l'EC2 di staging

**Risorse AWS create:** `badge-staging-api-sg` (nuovo security group)

- [ ] **Step 1: Creare il security group**

```bash
aws ec2 create-security-group \
  --region eu-west-1 \
  --group-name badge-staging-api-sg \
  --description "Badge System staging API — HTTP/HTTPS/SSH/3000" \
  --vpc-id vpc-01eab8e6477fa1edf \
  --query 'GroupId' --output text
```

Salva l'output (es. `sg-xxxxxxxx`) — servirà nei task successivi come `$STAGING_API_SG`.

- [ ] **Step 2: Aggiungere le regole di ingresso (stesso pattern della produzione: 22/80/443/3000 da 0.0.0.0/0)**

```bash
STAGING_API_SG="<sg-id dello step 1>"

aws ec2 authorize-security-group-ingress --region eu-west-1 --group-id $STAGING_API_SG \
  --ip-permissions \
  'IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=0.0.0.0/0}]' \
  'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]' \
  'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]' \
  'IpProtocol=tcp,FromPort=3000,ToPort=3000,IpRanges=[{CidrIp=0.0.0.0/0}]'
```

- [ ] **Verifica:**

```bash
aws ec2 describe-security-groups --region eu-west-1 --group-ids $STAGING_API_SG \
  --query 'SecurityGroups[0].IpPermissions[].{Port:FromPort,Cidr:IpRanges[0].CidrIp}' --output table
```
Atteso: 4 righe (22, 80, 443, 3000), tutte con `Cidr: 0.0.0.0/0`.

---

## Task 2: Security Group per la comunicazione EC2→RDS di staging

**Risorse AWS create:** `badge-staging-ec2-rds-sg` (nuovo security group, isolato da quello di produzione `ec2-rds-1` — la EC2 di staging non deve MAI avere accesso di rete alla RDS di produzione)

- [ ] **Step 1: Creare il security group**

```bash
aws ec2 create-security-group \
  --region eu-west-1 \
  --group-name badge-staging-ec2-rds-sg \
  --description "Badge System staging — EC2 to RDS access only" \
  --vpc-id vpc-01eab8e6477fa1edf \
  --query 'GroupId' --output text
```

Salva l'output come `$STAGING_EC2_RDS_SG`.

- [ ] **Verifica:**

```bash
aws ec2 describe-security-groups --region eu-west-1 --group-ids $STAGING_EC2_RDS_SG \
  --query 'SecurityGroups[0].{Name:GroupName,Vpc:VpcId}' --output table
```
Atteso: `Name: badge-staging-ec2-rds-sg`, `Vpc: vpc-01eab8e6477fa1edf`.

---

## Task 3: IAM Role per l'EC2 di staging (scoped a `/badge/staging/*` soltanto)

**Risorse AWS create:** `badge-system-ec2-staging-role` (nuovo IAM role + instance profile), policy inline `BadgeSSMReadStaging`

- [ ] **Step 1: Creare il ruolo con trust policy per EC2**

```bash
cat > /tmp/staging-trust-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name badge-system-ec2-staging-role \
  --assume-role-policy-document file:///tmp/staging-trust-policy.json
```

- [ ] **Step 2: Attaccare le stesse policy managed della produzione**

```bash
aws iam attach-role-policy --role-name badge-system-ec2-staging-role \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy

aws iam attach-role-policy --role-name badge-system-ec2-staging-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

aws iam attach-role-policy --role-name badge-system-ec2-staging-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
```

- [ ] **Step 3: Creare la policy inline `BadgeSSMReadStaging`, scoped SOLO a `/badge/staging/*` (mai `/badge/production/*`)**

```bash
cat > /tmp/staging-ssm-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BadgeSSMReadStaging",
      "Effect": "Allow",
      "Action": ["ssm:GetParametersByPath", "ssm:GetParameter", "ssm:GetParameters"],
      "Resource": [
        "arn:aws:ssm:eu-west-1:125579685235:parameter/badge/staging",
        "arn:aws:ssm:eu-west-1:125579685235:parameter/badge/staging/*"
      ]
    },
    {
      "Sid": "BadgeKMSDecrypt",
      "Effect": "Allow",
      "Action": ["kms:Decrypt"],
      "Resource": "*",
      "Condition": { "StringEquals": { "kms:ViaService": "ssm.eu-west-1.amazonaws.com" } }
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name badge-system-ec2-staging-role \
  --policy-name BadgeSSMReadStaging \
  --policy-document file:///tmp/staging-ssm-policy.json

rm /tmp/staging-trust-policy.json /tmp/staging-ssm-policy.json
```

- [ ] **Step 4: Creare l'instance profile e agganciarlo al ruolo**

```bash
aws iam create-instance-profile --instance-profile-name badge-system-ec2-staging-role
aws iam add-role-to-instance-profile \
  --instance-profile-name badge-system-ec2-staging-role \
  --role-name badge-system-ec2-staging-role
```

- [ ] **Verifica: il ruolo NON deve avere accesso a `/badge/production/*`, e DEVE avere accesso a `/badge/staging/*`**

```bash
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::125579685235:role/badge-system-ec2-staging-role \
  --action-names ssm:GetParametersByPath \
  --resource-arns arn:aws:ssm:eu-west-1:125579685235:parameter/badge/production/DB_PASSWORD \
  --query 'EvaluationResults[0].EvalDecision' --output text
```
Atteso: `implicitDeny`

```bash
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::125579685235:role/badge-system-ec2-staging-role \
  --action-names ssm:GetParametersByPath \
  --resource-arns arn:aws:ssm:eu-west-1:125579685235:parameter/badge/staging/DB_PASSWORD \
  --query 'EvaluationResults[0].EvalDecision' --output text
```
Atteso: `allowed`

---

## Task 4: RDS PostgreSQL di staging

**Risorse AWS create:** `badge-system-db-staging` (RDS `db.t3.micro`, Single-AZ, 20GB gp3, stessa versione motore della produzione `14.22`)

- [ ] **Step 1: Autorizzare la nuova SG di staging (Task 2) sulla porta 5432, ma SOLO su un nuovo security group RDS dedicato — mai riusare quello di produzione**

```bash
aws ec2 create-security-group \
  --region eu-west-1 \
  --group-name badge-staging-rds-sg \
  --description "Badge System staging RDS — accepts 5432 only from staging EC2" \
  --vpc-id vpc-01eab8e6477fa1edf \
  --query 'GroupId' --output text
```
Salva come `$STAGING_RDS_SG`.

```bash
aws ec2 authorize-security-group-ingress --region eu-west-1 \
  --group-id $STAGING_RDS_SG \
  --protocol tcp --port 5432 \
  --source-group $STAGING_EC2_RDS_SG
```

- [ ] **Step 2: Generare una master password casuale e salvarla temporaneamente (verrà scritta in SSM al Task 5, mai committata)**

```bash
STAGING_DB_PASSWORD=$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-32)
echo "Password generata (salvala solo in una variabile di shell per ora, la useremo al Task 5)"
```

- [ ] **Step 3: Creare l'istanza RDS**

```bash
aws rds create-db-instance \
  --region eu-west-1 \
  --db-instance-identifier badge-system-db-staging \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 14.22 \
  --master-username postgres \
  --master-user-password "$STAGING_DB_PASSWORD" \
  --allocated-storage 20 \
  --storage-type gp3 \
  --vpc-security-group-ids $STAGING_RDS_SG \
  --db-subnet-group-name default \
  --no-multi-az \
  --no-publicly-accessible \
  --backup-retention-period 1 \
  --db-name badge_system \
  --tags Key=Environment,Value=staging Key=Project,Value=badge-system
```

- [ ] **Step 4: Attendere che l'istanza sia disponibile (può richiedere 5-10 minuti)**

```bash
aws rds wait db-instance-available --region eu-west-1 --db-instance-identifier badge-system-db-staging
echo "RDS staging disponibile"
```

- [ ] **Verifica: istanza `available`, classe corretta, non pubblicamente accessibile**

```bash
aws rds describe-db-instances --region eu-west-1 --db-instance-identifier badge-system-db-staging \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Class:DBInstanceClass,Public:PubliclyAccessible,Endpoint:Endpoint.Address}' \
  --output table
```
Atteso: `Status: available`, `Class: db.t3.micro`, `Public: False`. Salva l'`Endpoint` come `$STAGING_DB_HOST` — servirà al Task 5.

- [ ] **Step 5: Abilitare l'estensione `uuid-ossp` — le migration del backend usano `uuid_generate_v4()`, la produzione l'aveva abilitata manualmente in passato (mai documentato), un RDS nuovo non ce l'ha di default. Scoperto in esecuzione (Session 89) quando la prima migration falliva con `function uuid_generate_v4() does not exist`. Il DB non è pubblicamente accessibile, quindi va fatto passando dalla EC2 di staging (Task 6, deve essere già lanciata) con un container postgres temporaneo:**

```bash
cat > /tmp/enable_extension.sql <<'EOF'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SELECT extname FROM pg_extension;
EOF

scp -i ~/.ssh/badge-system-ec2-v2.pem /tmp/enable_extension.sql ubuntu@$STAGING_EC2_IP:/tmp/enable_extension.sql

ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@$STAGING_EC2_IP \
  "docker run --rm -v /tmp/enable_extension.sql:/tmp/enable_extension.sql postgres:14 psql 'postgresql://postgres:${STAGING_DB_PASSWORD}@${STAGING_DB_HOST}:5432/badge_system' -f /tmp/enable_extension.sql"

ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@$STAGING_EC2_IP "rm -f /tmp/enable_extension.sql"
rm -f /tmp/enable_extension.sql
```
Atteso: `CREATE EXTENSION`, poi una tabella con `plpgsql` e `uuid-ossp` tra le righe.

**Nota d'ordine:** questo step richiede che la EC2 di staging (Task 6) sia già avviata, dato che l'RDS non è raggiungibile da fuori la VPC — se si segue l'ordine dei task così come scritto, il Task 6 arriva dopo; eseguire comunque questo step 5 solo dopo aver completato il Task 6, tornando indietro se necessario.

- [ ] **Step 6: Applicare lo schema di base `backend/src/db/schema.sql` (clients, sites, employees, checkins, audit_log, shifts, leaves, leave_requests, leave_saldi, illnesses) — `run-migrations.js` (eseguito da `entrypoint.sh` ad ogni boot) gestisce SOLO le migration incrementali in `backend/migrations/001+`, mai lo schema di base: la produzione lo aveva ricevuto una tantum, manualmente, mai come parte di un processo automatizzato/documentato. Un RDS nuovo non ha nessuna di queste tabelle, e la prima migration (`001_create_shifts_table.sql`, che referenzia `clients` via FK) fallisce con `relation "clients" does not exist`. Scoperto in esecuzione (Session 89), terzo fallimento di deploy consecutivo.**

```bash
scp -i ~/.ssh/badge-system-ec2-v2.pem \
  "backend/src/db/schema.sql" \
  ubuntu@$STAGING_EC2_IP:/tmp/schema.sql

ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@$STAGING_EC2_IP \
  "docker run --rm -v /tmp/schema.sql:/tmp/schema.sql postgres:14 psql 'postgresql://postgres:${STAGING_DB_PASSWORD}@${STAGING_DB_HOST}:5432/badge_system' -f /tmp/schema.sql"

ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@$STAGING_EC2_IP "rm -f /tmp/schema.sql"
```

- [ ] **Verifica: le tabelle di base esistono**

```bash
ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@$STAGING_EC2_IP \
  "docker run --rm postgres:14 psql 'postgresql://postgres:${STAGING_DB_PASSWORD}@${STAGING_DB_HOST}:5432/badge_system' -c '\dt'"
```
Atteso: almeno `clients`, `sites`, `employees`, `checkins`, `audit_log`, `shifts`, `leaves`, `leave_requests`, `leave_saldi`, `illnesses` nell'elenco.

---

## Task 5: Popolare `/badge/staging/*` in SSM Parameter Store

**Risorse AWS create:** 30 parametri sotto `/badge/staging/*` (stessa struttura di `/badge/production/*`, valori nuovi e distinti — mai copiati 1:1 dalla produzione: JWT keys nuove, password DB nuova, così un token/credenziale di staging non è mai valido contro la produzione)

- [ ] **Step 1: Generare le chiavi JWT RSA nuove (mai condivise con la produzione)**

```bash
openssl genrsa -out /tmp/staging_jwt_private.pem 2048
openssl rsa -in /tmp/staging_jwt_private.pem -pubout -out /tmp/staging_jwt_public.pem
```

- [ ] **Step 2: Scrivere tutti i parametri critici in SSM (`SecureString`)**

```bash
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/DB_HOST --value "$STAGING_DB_HOST"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/DB_PORT --value "5432"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/DB_USER --value "postgres"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/DB_PASSWORD --value "$STAGING_DB_PASSWORD"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/DB_NAME --value "badge_system"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/DB_POOL_MIN --value "1"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/DB_POOL_MAX --value "10"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/DB_SSL_REJECT_UNAUTHORIZED --value "true"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/JWT_PRIVATE_KEY --value "file:///tmp/staging_jwt_private.pem"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/JWT_PUBLIC_KEY --value "file:///tmp/staging_jwt_public.pem"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/JWT_EXPIRY --value "15m"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/JWT_REFRESH_EXPIRY --value "7d"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/APP_NAME --value "badge-system-staging"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/PORT --value "3000"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/LOG_LEVEL --value "info"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/NODE_ENV --value "production"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/DISABLE_AUTH --value "false"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/SEED_TEST_DATA --value "true"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/CORS_ORIGIN --value "https://staging.dataxiom.it"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/CORS_CREDENTIALS --value "true"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/MAX_ACTIVE_DEMOS --value "5"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/DATABASE_URL --value "postgres://postgres:${STAGING_DB_PASSWORD}@${STAGING_DB_HOST}:5432/badge_system"
```

**Bug trovato in esecuzione (Session 89), sesto fallimento consecutivo:** `npm run validate-env` (chiamato da `npm start` in `package.json`, prima ancora dell'avvio del server) richiede anche `DATABASE_URL` come stringa di connessione completa, non deducibile dai singoli `DB_HOST`/`DB_USER`/ecc. — la produzione ce l'ha come parametro separato, mai menzionato esplicitamente nell'elenco originale dei 30 parametri di questo piano perché non ovvio dal solo nome. Il comando sopra lo aggiunge esplicitamente (ora sono 31 parametri, non più 30 — vedi verifica aggiornata più sotto).

Nota: `SES_FROM_EMAIL`, `AWS_S3_BUCKET`, `SENTRY_DSN`, `DEMO_CONTACT_NOTIFY_EMAIL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` — replicare questi 6 parametri con lo stesso comando pattern, usando gli stessi valori della produzione (servizi condivisi, non credenziali).

Le 3 password demo (`DEMO_PIPPO_PASSWORD`, `DEMO_PINO_PASSWORD`, `DEMO_MARIA_PASSWORD` — corrispondono ai 3 unici utenti demo esistenti in `backend/src/__fixtures__/demo-users.js`: `pippo@badge.local` admin, `pino@badge.local` manager, `maria@badge.local` employee — **non esiste** un utente `diego@badge.local`) vanno generate ex-novo e **salvate in variabili di shell**, perché serviranno identiche al Task 9 per lo smoke test:

```bash
STAGING_DEMO_PINO_PASSWORD=$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-16)
STAGING_DEMO_MARIA_PASSWORD=$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-16)
STAGING_DEMO_PIPPO_PASSWORD=$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-16)

aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/DEMO_PINO_PASSWORD --value "$STAGING_DEMO_PINO_PASSWORD"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/DEMO_MARIA_PASSWORD --value "$STAGING_DEMO_MARIA_PASSWORD"
aws ssm put-parameter --region eu-west-1 --type SecureString --overwrite \
  --name /badge/staging/DEMO_PIPPO_PASSWORD --value "$STAGING_DEMO_PIPPO_PASSWORD"
```

**Non chiudere la shell** dopo questo step — `$STAGING_DEMO_PINO_PASSWORD` e `$STAGING_DEMO_MARIA_PASSWORD` servono come argomenti allo script del Task 9. Se la sessione di shell viene persa, recuperarle con:
```bash
STAGING_DEMO_PINO_PASSWORD=$(aws ssm get-parameter --region eu-west-1 --name /badge/staging/DEMO_PINO_PASSWORD --with-decryption --query 'Parameter.Value' --output text)
STAGING_DEMO_MARIA_PASSWORD=$(aws ssm get-parameter --region eu-west-1 --name /badge/staging/DEMO_MARIA_PASSWORD --with-decryption --query 'Parameter.Value' --output text)
```

- [ ] **Step 3: Pulire i file temporanei con le chiavi JWT (mai lasciarli su disco)**

```bash
rm -f /tmp/staging_jwt_private.pem /tmp/staging_jwt_public.pem
```

- [ ] **Verifica: contare i parametri e confermare che nessuno coincide con quelli di produzione**

```bash
aws ssm get-parameters-by-path --region eu-west-1 --path /badge/staging --recursive --query 'length(Parameters)' --output text
```
Atteso: `31` (30 parametri "logici" più `DATABASE_URL`, che nell'elenco originale di produzione è un parametro a sé — usare `aws ssm get-parameters-by-path --path /badge/production --recursive --output json | python3 -c "import json,sys; print(len(json.load(sys.stdin)['Parameters']))"` per confermare che la produzione ne ha altrettanti).

```bash
# Conferma che la JWT_PRIVATE_KEY di staging sia DIVERSA da quella di produzione
STAGING_KEY=$(aws ssm get-parameter --region eu-west-1 --name /badge/staging/JWT_PRIVATE_KEY --with-decryption --query 'Parameter.Value' --output text)
PROD_KEY=$(aws ssm get-parameter --region eu-west-1 --name /badge/production/JWT_PRIVATE_KEY --with-decryption --query 'Parameter.Value' --output text)
[ "$STAGING_KEY" != "$PROD_KEY" ] && echo "OK: chiavi diverse" || echo "ERRORE: chiavi identiche, un token di staging sarebbe valido in produzione"
```
Atteso: `OK: chiavi diverse`.

---

## Task 6: Istanza EC2 di staging

**Risorse AWS create:** EC2 `t3.micro` `badge-system-api-staging`, CloudWatch Log Group `/badge/api-staging`

- [ ] **Step 0: Creare il CloudWatch Log Group PRIMA del primo deploy — `docker run --log-driver awslogs` fallisce con `ResourceNotFoundException` se il log group non esiste già (la produzione lo aveva creato manualmente in passato, mai documentato in un piano — scoperto in esecuzione, Session 89, quando il primo deploy su staging è fallito con `failed to create Cloudwatch log stream ... ResourceNotFoundException`)**

```bash
aws logs create-log-group --region eu-west-1 --log-group-name /badge/api-staging
aws logs describe-log-groups --region eu-west-1 --log-group-name-prefix /badge/api-staging --query 'logGroups[0].logGroupName' --output text
```
Atteso: `/badge/api-staging`.

- [ ] **Step 1: Lanciare l'istanza**

```bash
aws ec2 run-instances \
  --region eu-west-1 \
  --image-id ami-0354b051078d198b4 \
  --instance-type t3.micro \
  --key-name badge-system-ec2-v2 \
  --subnet-id subnet-04dd717b636888015 \
  --security-group-ids $STAGING_API_SG $STAGING_EC2_RDS_SG \
  --iam-instance-profile Name=badge-system-ec2-staging-role \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=badge-system-api-staging},{Key=Environment,Value=staging}]' \
  --user-data '#!/bin/bash
apt-get update -y
apt-get install -y docker.io nginx certbot python3-certbot-nginx python3 unzip curl
systemctl enable docker
systemctl start docker
usermod -aG docker ubuntu
curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install
rm -rf /tmp/awscliv2.zip /tmp/aws' \
  --query 'Instances[0].InstanceId' --output text
```

**Nota (trovato in esecuzione, Session 89):** l'AMI `ami-0354b051078d198b4` è Ubuntu 24.04 "noble", non 22.04 come assunto — su questa release il pacchetto apt `awscli` non esiste più (rimosso dai repository Ubuntu), e siccome `apt-get install` con più pacchetti fallisce atomicamente se anche uno solo non è disponibile, l'intero comando (incluso Docker) falliva silenziosamente in background senza bloccare il boot dell'istanza. Il comando corretto sopra installa AWS CLI v2 tramite l'installer ufficiale (zip+installer), indipendente dai pacchetti apt della distribuzione — verificare sempre con `cloud-init status --long` dopo il boot, non assumere che l'installazione sia andata a buon fine solo perché l'istanza è `running`.

Salva l'output come `$STAGING_INSTANCE_ID`.

- [ ] **Step 2: Attendere che sia in stato running e recuperare l'IP pubblico**

```bash
aws ec2 wait instance-running --region eu-west-1 --instance-ids $STAGING_INSTANCE_ID
STAGING_EC2_IP=$(aws ec2 describe-instances --region eu-west-1 --instance-ids $STAGING_INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
echo "IP pubblico staging: $STAGING_EC2_IP"
```

- [ ] **Step 3: Attendere che user-data finisca di installare Docker/nginx (circa 60-90s dopo il boot), poi verificare via SSH**

```bash
sleep 90
ssh -o StrictHostKeyChecking=no -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@$STAGING_EC2_IP "docker --version && nginx -v"
```

- [ ] **Verifica: istanza running, Docker e nginx installati e funzionanti**

```bash
aws ec2 describe-instances --region eu-west-1 --instance-ids $STAGING_INSTANCE_ID \
  --query 'Reservations[0].Instances[0].{State:State.Name,Type:InstanceType,IP:PublicIpAddress}' --output table
```
Atteso: `State: running`, `Type: t3.micro`, `IP:` valorizzato. L'output SSH dello Step 3 deve mostrare versioni valide di Docker e nginx senza errori.

---

## Task 7: DNS + nginx + Let's Encrypt per `staging-api.dataxiom.it`

**File modificati (sulla EC2 di staging, non nel repo):** `/etc/nginx/sites-available/staging-api`

- [ ] **Step 1 (MANUALE, non scriptabile — il DNS è su register.it, non Route53): creare un record A**

Nel pannello DNS di register.it per il dominio `dataxiom.it`, aggiungere:
- Tipo: `A`
- Host: `staging-api`
- Valore: `$STAGING_EC2_IP` (dallo Step 2 del Task 6)
- TTL: `3600` (o il minimo permesso dal pannello)

- [ ] **Verifica propagazione DNS (può richiedere qualche minuto):**

```bash
dig +short staging-api.dataxiom.it
```
Atteso: l'output coincide esattamente con `$STAGING_EC2_IP`. Se vuoto o diverso, attendere 5 minuti e ripetere prima di procedere.

- [ ] **Step 2: Scrivere SOLO un blocco HTTP (no SSL) sulla EC2 di staging (via SSH) — vedi nota sotto sul perché**

```bash
ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@$STAGING_EC2_IP "sudo tee /etc/nginx/sites-available/staging-api > /dev/null" <<'EOF'
server {
    listen 80;
    server_name staging-api.dataxiom.it;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@$STAGING_EC2_IP "
  sudo ln -sf /etc/nginx/sites-available/staging-api /etc/nginx/sites-enabled/staging-api
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t && sudo systemctl reload nginx
"
```

**Bug trovato in esecuzione (Session 89):** scrivere subito il blocco HTTPS con `ssl_certificate /etc/letsencrypt/live/.../fullchain.pem` **prima** che certbot abbia emesso il certificato crea un problema circolare — `nginx -t` fallisce perché il file non esiste ancora, e `certbot --nginx` a sua volta richiama `nginx -t` per validare la config prima di procedere, quindi fallisce anch'esso a catena. La sequenza corretta è: (1) solo blocco HTTP, nginx si ricarica con successo, poi (2) `certbot --nginx` — il plugin ottiene il certificato E modifica lui stesso la config aggiungendo il blocco 443/SSL e il redirect, non serve scriverlo a mano.

- [ ] **Step 3: Ottenere il certificato Let's Encrypt (il plugin nginx di certbot aggiunge da solo il blocco HTTPS e il redirect alla config esistente)**

```bash
ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@$STAGING_EC2_IP "
  sudo certbot --nginx -d staging-api.dataxiom.it --non-interactive --agree-tos -m diego.falletti@outlook.it --redirect
"
```

- [ ] **Step 4: Verificare il rinnovo automatico (certbot installa un systemd timer di default su Ubuntu 24.04)**

```bash
ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@$STAGING_EC2_IP "systemctl is-enabled certbot.timer"
```
Atteso: `enabled`.

- [ ] **Verifica finale: HTTPS funzionante con certificato valido (anche se il backend non è ancora deployato, nginx deve rispondere — un 502 è atteso e corretto qui, un errore SSL non lo è)**

```bash
curl -v https://staging-api.dataxiom.it/health 2>&1 | grep -E "SSL certificate verify|HTTP/"
```
Atteso: nessun errore di verifica certificato SSL (la connessione TLS si stabilisce), e una risposta HTTP (probabilmente `502 Bad Gateway` perché il container non è ancora avviato — questo è corretto e atteso in questo task, verrà risolto al Task 9).

---

## Task 8: Nuovo workflow GitHub Actions per il deploy di staging

**Files:**
- Create: `.github/workflows/deploy-staging.yml`
- Create: `scripts/wait-healthy.sh` (già esiste, riusato identico — nessuna modifica)

**GitHub Secrets da aggiungere** (Settings → Secrets and variables → Actions), usando gli stessi `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` già presenti (stesso utente IAM GitHub Actions, permessi ECR già validi per qualunque tag):
- `EC2_STAGING_HOST` = `$STAGING_EC2_IP` (o, meglio, il dominio `staging-api.dataxiom.it` una volta propagato — usare l'IP se si preferisce non dipendere dalla propagazione DNS per lo SSH)
- `EC2_STAGING_USER` = `ubuntu`
- `EC2_STAGING_SSH_KEY` = contenuto del file `badge-system-ec2-v2.pem` (stesso file già usato per la produzione — stessa persona ha accesso a entrambi gli ambienti, nessuna nuova chiave da generare)
- `STAGING_DEMO_MARIA_PASSWORD` / `STAGING_DEMO_PINO_PASSWORD` = le stesse password generate al Task 5 e scritte in `/badge/staging/DEMO_MARIA_PASSWORD`/`/badge/staging/DEMO_PINO_PASSWORD` — servono al job `smoke-test` per chiamare `scripts/smoke-test-staging.sh`, che non ha le password hardcoded

- [ ] **Step 1: Aggiungere i 5 secret via `gh` CLI (evita di incollare la chiave privata in una UI web)**

```bash
gh secret set EC2_STAGING_HOST --body "$STAGING_EC2_IP"
gh secret set EC2_STAGING_USER --body "ubuntu"
gh secret set EC2_STAGING_SSH_KEY < ~/.ssh/badge-system-ec2-v2.pem

# Se la shell del Task 5 non è più attiva, recupera i valori da SSM:
STAGING_DEMO_MARIA_PASSWORD=$(aws ssm get-parameter --region eu-west-1 --name /badge/staging/DEMO_MARIA_PASSWORD --with-decryption --query 'Parameter.Value' --output text)
STAGING_DEMO_PINO_PASSWORD=$(aws ssm get-parameter --region eu-west-1 --name /badge/staging/DEMO_PINO_PASSWORD --with-decryption --query 'Parameter.Value' --output text)

gh secret set STAGING_DEMO_MARIA_PASSWORD --body "$STAGING_DEMO_MARIA_PASSWORD"
gh secret set STAGING_DEMO_PINO_PASSWORD --body "$STAGING_DEMO_PINO_PASSWORD"
```

- [ ] **Verifica: i secret esistono (senza poterne leggere il valore, per design di GitHub)**

```bash
gh secret list | grep -E "EC2_STAGING_HOST|EC2_STAGING_USER|EC2_STAGING_SSH_KEY|STAGING_DEMO_MARIA_PASSWORD|STAGING_DEMO_PINO_PASSWORD"
```
Atteso: 5 righe.

- [ ] **Step 2: Creare il workflow**

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy Backend to Staging

on:
  push:
    branches:
      - develop
    paths:
      - 'backend/**'
      - '.github/workflows/deploy-staging.yml'
  workflow_dispatch: {}

env:
  AWS_REGION: eu-west-1
  ECR_REGISTRY: 125579685235.dkr.ecr.eu-west-1.amazonaws.com
  ECR_REPOSITORY: badge-system-backend
  CONTAINER_NAME: badge-system-api-staging
  CONTAINER_PORT: 3000

jobs:
  lint-and-test:
    name: Lint & Test Backend
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: 'backend/package-lock.json'
      - working-directory: ./backend
        run: npm ci
      - working-directory: ./backend
        run: npm run lint
      - working-directory: ./backend
        env:
          NODE_ENV: test
          PORT: '3000'
          LOG_LEVEL: silent
          APP_NAME: badge-system-test
          DATABASE_URL: postgres://test:test@localhost:5432/test  # pragma: allowlist secret
          DB_HOST: localhost
          DB_PORT: '5432'
          DB_USER: test
          DB_PASSWORD: test  # pragma: allowlist secret
          DB_NAME: test
          JWT_PRIVATE_KEY: ci-placeholder-overridden-by-jest-setup
          JWT_PUBLIC_KEY: ci-placeholder-overridden-by-jest-setup
          CORS_ORIGIN: http://localhost:5173
          DISABLE_AUTH: 'true'
          SEED_TEST_DATA: 'false'
        run: npm test -- --coverage

  build-and-push:
    name: Build & Push Docker Image to ECR (staging tag)
    needs: lint-and-test
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      - id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2
      - working-directory: ./backend
        run: |
          docker build -t ${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}:staging-latest .
      - run: |
          docker push ${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}:staging-latest
      - if: always()
        run: docker logout ${{ steps.login-ecr.outputs.registry }}

  deploy:
    name: Deploy to EC2 Staging
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.EC2_STAGING_HOST }}
          username: ${{ secrets.EC2_STAGING_USER }}
          key: ${{ secrets.EC2_STAGING_SSH_KEY }}
          source: "scripts/wait-healthy.sh"
          target: "/tmp"
          strip_components: 1
      - uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_STAGING_HOST }}
          username: ${{ secrets.EC2_STAGING_USER }}
          key: ${{ secrets.EC2_STAGING_SSH_KEY }}
          script: |
            set -e
            aws configure set aws_access_key_id ${{ secrets.AWS_ACCESS_KEY_ID }}
            aws configure set aws_secret_access_key ${{ secrets.AWS_SECRET_ACCESS_KEY }}
            aws configure set region ${{ env.AWS_REGION }}
            aws ecr get-login-password --region ${{ env.AWS_REGION }} | docker login --username AWS --password-stdin ${{ env.ECR_REGISTRY }}
            docker pull ${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}:staging-latest
            docker stop ${{ env.CONTAINER_NAME }} 2>/dev/null || true
            docker rm ${{ env.CONTAINER_NAME }} 2>/dev/null || true
            OTHERS=$(docker ps -q --filter "publish=${{ env.CONTAINER_PORT }}" 2>/dev/null)
            if [ -n "$OTHERS" ]; then docker stop $OTHERS; docker rm $OTHERS 2>/dev/null || true; fi
            sudo fuser -k ${{ env.CONTAINER_PORT }}/tcp 2>/dev/null || true
            sleep 2
            docker run -d \
              --name ${{ env.CONTAINER_NAME }} \
              --restart unless-stopped \
              -p ${{ env.CONTAINER_PORT }}:${{ env.CONTAINER_PORT }} \
              -e NODE_ENV=production \
              -e LOG_LEVEL=info \
              -e PORT=${{ env.CONTAINER_PORT }} \
              -e AWS_REGION=${{ env.AWS_REGION }} \
              -e SSM_PARAM_PATH=/badge/staging \
              --log-driver awslogs \
              --log-opt awslogs-region=${{ env.AWS_REGION }} \
              --log-opt awslogs-group=/badge/api-staging \
              --log-opt awslogs-stream=badge-api-staging \
              ${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}:staging-latest
            chmod +x /tmp/wait-healthy.sh
            bash /tmp/wait-healthy.sh ${{ env.CONTAINER_NAME }} --port ${{ env.CONTAINER_PORT }} --timeout 120

  smoke-test:
    name: E2E Smoke Test (golden path)
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: chmod +x scripts/smoke-test-staging.sh
      - run: |
          ./scripts/smoke-test-staging.sh \
            https://staging-api.dataxiom.it \
            "${{ secrets.STAGING_DEMO_MARIA_PASSWORD }}" \
            "${{ secrets.STAGING_DEMO_PINO_PASSWORD }}"
```

- [ ] **Verifica: il file YAML è sintatticamente valido**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-staging.yml'))" && echo "YAML valido"
```
Atteso: `YAML valido`, nessun errore di parsing.

- [ ] **Step 3: Commit (il workflow non si attiva ancora — serve prima il branch `develop`, Task 11 — e lo script di smoke test, Task 9)**

```bash
git add .github/workflows/deploy-staging.yml
git commit -m "feat(ci): workflow deploy-staging per l'ambiente di staging"
```

---

## Task 9: Script di smoke test E2E

**Files:**
- Create: `scripts/smoke-test-staging.sh`

- [ ] **Step 1: Scrivere lo script**

```bash
#!/usr/bin/env bash
# scripts/smoke-test-staging.sh — Golden path E2E contro l'ambiente di staging.
# Uso: ./scripts/smoke-test-staging.sh <base_url> <maria_password> <pino_password>
#
# Le password NON sono hardcoded: sono le stesse generate e scritte in
# /badge/staging/DEMO_MARIA_PASSWORD e /badge/staging/DEMO_PINO_PASSWORD al
# Task 5. Gli utenti demo esistenti sono solo pippo (admin), pino (manager),
# maria (employee) — vedi backend/src/__fixtures__/demo-users.js, non esiste
# un utente "diego@badge.local".
set -euo pipefail

BASE_URL="${1:?Uso: $0 <base_url> <maria_password> <pino_password>}"
MARIA_PASSWORD="${2:?Manca la password di maria@badge.local}"
PINO_PASSWORD="${3:?Manca la password di pino@badge.local}"
FAIL=0

step() { echo "▶ $1"; }
pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAIL=1; }

json_get() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

step "Login Maria (employee)"
MARIA_RES=$(curl -sf -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"maria@badge.local\",\"password\":\"$MARIA_PASSWORD\"}")
MARIA_TOKEN=$(echo "$MARIA_RES" | json_get "['data']['token']")
[ -n "$MARIA_TOKEN" ] && pass "Login Maria OK" || { fail "Login Maria fallito"; exit 1; }

step "Maria richiede ferie"
LEAVE_RES=$(curl -sf -X POST "$BASE_URL/api/v1/leaves/requests" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MARIA_TOKEN" \
  -d '{"leave_type":"ferie","start_date":"2026-09-01","end_date":"2026-09-02","reason":"smoke test"}')
LEAVE_ID=$(echo "$LEAVE_RES" | json_get "['data']['id']")
[ -n "$LEAVE_ID" ] && pass "Richiesta ferie creata (id=$LEAVE_ID)" || { fail "Richiesta ferie fallita"; exit 1; }

step "Login Pino (manager)"
PINO_RES=$(curl -sf -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"pino@badge.local\",\"password\":\"$PINO_PASSWORD\"}")
PINO_TOKEN=$(echo "$PINO_RES" | json_get "['data']['token']")
[ -n "$PINO_TOKEN" ] && pass "Login Pino OK" || { fail "Login Pino fallito"; exit 1; }

step "Pino approva la richiesta di Maria"
APPROVE_RES=$(curl -sf -X PUT "$BASE_URL/api/v1/leaves/requests/$LEAVE_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PINO_TOKEN" \
  -d '{"status":"approved"}')
APPROVED_STATUS=$(echo "$APPROVE_RES" | json_get "['data']['status']")
[ "$APPROVED_STATUS" = "approved" ] && pass "Ferie approvate" || fail "Approvazione fallita (status=$APPROVED_STATUS)"

step "Maria verifica le ferie in 'I Miei Turni'"
MYSHIFTS_RES=$(curl -sf "$BASE_URL/api/v1/leaves/requests?user_id=self" \
  -H "Authorization: Bearer $MARIA_TOKEN")
FOUND=$(echo "$MYSHIFTS_RES" | python3 -c "import json,sys; d=json.load(sys.stdin); print(any(r['id']=='$LEAVE_ID' and r['status']=='approved' for r in d['data']))")
[ "$FOUND" = "True" ] && pass "Ferie visibili e approvate per Maria" || fail "Ferie non trovate/non approvate lato Maria"

step "Pino verifica il planning mostra le ferie di Maria"
PLANNING_RES=$(curl -sf "$BASE_URL/api/v1/shifts?start_date=2026-09-01&end_date=2026-09-02" \
  -H "Authorization: Bearer $PINO_TOKEN")
echo "$PLANNING_RES" | grep -q "ferie" && pass "Planning mostra le ferie" || fail "Planning non mostra le ferie"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "🎉 SMOKE TEST: TUTTI I PASSI SUPERATI"
  exit 0
else
  echo "💥 SMOKE TEST: ALMENO UN PASSO FALLITO — vedi sopra"
  exit 1
fi
```

- [ ] **Step 2: Rendere eseguibile e verificare solo la sintassi bash (lo staging non esiste ancora — l'esecuzione live, incluso il test di regressione, avviene al Task 10 dopo il primo deploy)**

```bash
chmod +x scripts/smoke-test-staging.sh
bash -n scripts/smoke-test-staging.sh && echo "Sintassi OK"
```
Atteso: `Sintassi OK`, nessun errore di parsing.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-test-staging.sh
git commit -m "feat(staging): script smoke test E2E golden path"
```

**Nota:** l'esecuzione live dello script (sia il test di regressione con password sbagliata, sia il golden path reale) è verificata al **Task 10**, subito dopo il primo deploy — eseguirla ora fallirebbe per il motivo sbagliato (nessun servizio ancora in ascolto su `staging-api.dataxiom.it`), non per la password, vanificando il senso del test di regressione.

---

## Task 10: Branch `develop` — reset e primo deploy end-to-end

**Risorse Git:** branch `develop` (esistente ma a 752 commit di distanza da `main` — resettato ora)

- [ ] **Step 1: Reset del branch `develop` per allinearlo a `main`**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge"
git fetch origin
git push --force-with-lease origin main:develop
```

- [ ] **Verifica: `develop` e `main` puntano allo stesso commit**

```bash
git rev-parse origin/main
git rev-parse origin/develop
```
Atteso: due hash identici.

- [ ] **Step 2: Attivare manualmente il workflow (senza aspettare un push, per il primo test) via `workflow_dispatch`**

```bash
gh workflow run deploy-staging.yml --ref develop
```

- [ ] **Step 3: Seguire l'esecuzione fino al completamento**

```bash
gh run list --branch develop --workflow deploy-staging.yml --limit 1
# Copia il databaseId e segui:
gh run watch <run-id>
```

- [ ] **Verifica: tutti i job del workflow completati con successo**

```bash
gh run view <run-id> --json jobs --jq '.jobs[] | "\(.name): \(.conclusion)"'
```
Atteso: 4 righe, tutte `success` (`Lint & Test Backend`, `Build & Push Docker Image to ECR (staging tag)`, `Deploy to EC2 Staging`, `E2E Smoke Test (golden path)`).

- [ ] **Verifica aggiuntiva: health check diretto**

```bash
curl -s https://staging-api.dataxiom.it/health | python3 -m json.tool
```
Atteso: `{"status": "ok", ..., "database": "connected"}`.

- [ ] **Verifica aggiuntiva: esecuzione manuale dello smoke test con le password corrette (conferma indipendente, oltre al job CI)**

```bash
STAGING_DEMO_MARIA_PASSWORD=$(aws ssm get-parameter --region eu-west-1 --name /badge/staging/DEMO_MARIA_PASSWORD --with-decryption --query 'Parameter.Value' --output text)
STAGING_DEMO_PINO_PASSWORD=$(aws ssm get-parameter --region eu-west-1 --name /badge/staging/DEMO_PINO_PASSWORD --with-decryption --query 'Parameter.Value' --output text)
./scripts/smoke-test-staging.sh https://staging-api.dataxiom.it "$STAGING_DEMO_MARIA_PASSWORD" "$STAGING_DEMO_PINO_PASSWORD"
```
Atteso: `🎉 SMOKE TEST: TUTTI I PASSI SUPERATI`, exit code 0.

- [ ] **Verifica aggiuntiva: test di regressione deliberato — lo script deve FALLIRE davvero con una password sbagliata, non passare per costruzione**

```bash
./scripts/smoke-test-staging.sh https://staging-api.dataxiom.it "password-sbagliata" "password-sbagliata"; echo "Exit code: $?"
```
Atteso: `Exit code: 1` (o comunque un fallimento non-zero) — conferma che lo script rileva davvero un problema reale.

---

## Task 11: Sito Netlify di staging

**Risorse Netlify create:** nuovo sito, collegato al branch `develop`

- [ ] **Step 1: Creare il sito (via Netlify CLI, riusando lo stesso account già autenticato in questo progetto)**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge/frontend-web"
netlify sites:create --name badge-system-staging --account-slug dataxiom
```

Salva il `Site ID` restituito come `$STAGING_NETLIFY_SITE_ID`.

- [ ] **Step 2: Collegare il sito al repository Git per l'auto-deploy su `develop` (via dashboard Netlify, non scriptabile in modo affidabile da CLI)**

Nel pannello Netlify del nuovo sito: **Site configuration → Build & deploy → Continuous deployment → Link repository** → seleziona il repo `badge-system`, branch di produzione del sito: `develop` (non `main`), build command `npm run build`, publish directory `dist`.

- [ ] **Step 3: Impostare la env var che punta all'API di staging**

```bash
netlify env:set VITE_API_URL "https://staging-api.dataxiom.it" --site $STAGING_NETLIFY_SITE_ID
```

- [ ] **Step 4: Triggerare il primo deploy e attendere il completamento**

```bash
netlify deploy --build --site $STAGING_NETLIFY_SITE_ID
```

- [ ] **Verifica: il sito risponde ed è configurato per parlare con l'API di staging (non con quella di produzione)**

```bash
STAGING_FRONTEND_URL=$(netlify api getSite --data "{\"site_id\":\"$STAGING_NETLIFY_SITE_ID\"}" | python3 -c "import json,sys; print(json.load(sys.stdin)['url'])")
curl -s -o /dev/null -w "HTTP %{http_code}\n" "$STAGING_FRONTEND_URL"
curl -s "$STAGING_FRONTEND_URL/config.js" | grep -q "staging-api.dataxiom.it" && echo "OK: punta all'API di staging" || echo "ERRORE: non punta all'API di staging"
```
Atteso: `HTTP 200` e `OK: punta all'API di staging`.

---

## Task 12: Documentazione — runbook + TASKS.md

**Files:**
- Modify: `docs/runbook.md`
- Modify: `TASKS.md` (chiudere STG.1-STG.6)

- [ ] **Step 1: Aggiungere una sezione "Staging" a `docs/runbook.md`**

Aggiungere in coda al file, seguendo lo stile delle sezioni esistenti:

```markdown
## Ambiente di Staging

**URL:** Frontend `https://<nome-sito-netlify>.netlify.app` (o dominio custom se configurato) · API `https://staging-api.dataxiom.it`

**Flusso:**
1. Push (o merge) su `develop` → `deploy-staging.yml` si attiva automaticamente
2. Build + push immagine Docker (tag `:staging-latest`, stesso repo ECR della produzione)
3. Deploy SSH sulla EC2 `badge-system-api-staging`
4. Smoke test E2E automatico (`scripts/smoke-test-staging.sh`) — golden path ferie Maria/Pino
5. Netlify builda e deploya il frontend in parallelo (stesso trigger, sito separato)

**Nessun gate bloccante**: il fallimento dello smoke test non blocca `main` — è puramente informativo (vedi `docs/superpowers/specs/2026-07-30-staging-environment-design.md`, decisione #6). Il flusso di lavoro su `main` resta invariato.

**Quando promuovere staging→main:** dopo aver verificato manualmente su staging (o dopo che lo smoke test passa), procedere come sempre con push diretto su `main` — staging è un ambiente di verifica preventiva, non un passaggio obbligato del merge.

**Diagnosi problemi:**
- Container: `ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@<STAGING_EC2_IP> "docker logs badge-system-api-staging"`
- Health: `curl https://staging-api.dataxiom.it/health`
- SSM: `aws ssm get-parameters-by-path --path /badge/staging --recursive --region eu-west-1`

**Costo mensile:** ~€16-24/mese (EC2 `t3.micro` + RDS `db.t3.micro`, verificato Session 89 via AWS Pricing API — vedi `TASKS.md`).
```

- [ ] **Step 2: Aggiornare `TASKS.md`, marcare STG.1-STG.6 come completati**

Sostituire i 6 checkbox `- [ ]` di STG.1-STG.6 con `- [x]`, aggiungendo per ciascuno un riferimento a questo piano e alle risorse create (instance ID, RDS identifier, workflow file).

- [ ] **Verifica: nessun placeholder residuo nella documentazione**

```bash
grep -n "TBD\|TODO\|<STAGING_EC2_IP>\|<nome-sito-netlify>" docs/runbook.md
```
Atteso: solo il placeholder `<STAGING_EC2_IP>` nell'esempio di comando SSH (accettabile, è un placeholder di comando, non un valore mancante) — nessun `TBD`/`TODO` reale.

- [ ] **Step 3: Commit finale**

```bash
git add docs/runbook.md TASKS.md
git commit -m "docs: chiude STG.1-STG.6, ambiente di staging operativo"
```

---

## Gate finale del piano

- [ ] Tutti i 12 task completati con la relativa verifica passata
- [ ] `curl https://staging-api.dataxiom.it/health` → 200, `database: connected`
- [ ] `./scripts/smoke-test-staging.sh https://staging-api.dataxiom.it "$STAGING_DEMO_MARIA_PASSWORD" "$STAGING_DEMO_PINO_PASSWORD"` → tutti i passi verdi
- [ ] Push di prova su `develop` → workflow si attiva automaticamente senza intervento manuale, tutti i job verdi
- [ ] Frontend Netlify di staging raggiungibile e puntato correttamente all'API di staging
- [ ] Verificato che il ruolo IAM di staging NON ha accesso a `/badge/production/*` (Task 3)
- [ ] Verificato che le chiavi JWT di staging sono diverse da quelle di produzione (Task 5)
- [ ] `TASKS.md` aggiornato, STG.1-STG.6 chiusi

## Verification (di questo piano)

- **Spec coverage**: ogni sezione della spec (`2026-07-30-staging-environment-design.md`) ha un task corrispondente — Architettura→Task 1-2-6-7, Componenti→Task 3-4-5-8-9-11, Data flow→Task 8-10, Gestione errori→verificato inline in ogni task (fail-fast già presente in `entrypoint.sh`, riusato), Testing→Task 9 (incluso il test di regressione deliberato)
- **Nessun placeholder**: ogni comando ha valori reali (region, account ID, VPC/subnet/AMI/key pair reali, verificati durante l'esplorazione) tranne le variabili di shell popolate dinamicamente dai task precedenti (`$STAGING_*`), che sono l'equivalente corretto di una variabile calcolata a runtime, non un dato mancante
- **Coerenza nomi**: `badge-system-api-staging` (EC2/container) e `badge-system-db-staging` (RDS) usati in modo consistente in tutti i task che li referenziano

## Fuori perimetro (esplicito, riportato dalla spec)

- Nessun gate PR bloccante
- Nessuna Multi-AZ per RDS staging
- Nessuna migrazione della storia del branch `develop` esistente (resettato da zero)
- Nessuna modifica ai workflow di produzione esistenti (`ecr-push.yml`/`deploy-to-ec2.yml`)
