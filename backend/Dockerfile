# Build stage — Badge System Backend API
FROM node:20-alpine

# Metadata
LABEL maintainer="Diego Falletti <falletti.diego2533@gmail.com>"
LABEL description="Badge System Backend API - Node.js 20 + Express.js"
LABEL version="1.0.0"

# Install system deps:
#   build-base + python3 — native module compilation (pg, csv-stringify)
#   dumb-init             — PID 1 signal handling, prevents zombie processes
#   su-exec               — privilege-drop helper (replaces gosu on Alpine)
#   aws-cli               — SSM parameter fetch at bootstrap
RUN apk add --no-cache build-base python3 bash dumb-init su-exec aws-cli

# Set working directory
WORKDIR /app

# Copy package files (package.json + package-lock.json if exists)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy application source code
COPY src ./src

# Copy scripts and migrations (entrypoint.sh lives in scripts/)
COPY scripts ./scripts
COPY migrations ./migrations

# Make entrypoint executable
RUN chmod +x /app/scripts/entrypoint.sh

# Create non-root user — the entrypoint drops to this user after SSM bootstrap
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Expose application port
EXPOSE 3000

# Config knobs (non-secret, safe as build-time ENV)
ENV USE_HTTPS=false
ENV AWS_REGION=eu-west-1
ENV SSM_PARAM_PATH=/badge/production

# Health check — verifies /health returns HTTP 200.
# Env var validation is handled at startup by entrypoint.sh (fail-fast).
# Docker HEALTHCHECK runs via docker exec and does NOT inherit the process env
# of PID 1, so checking process.env vars here would always fail.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))"

# Entrypoint: fetch SSM params → validate → drop to nodejs → exec dumb-init → app
# CMD is passed as "$@" to su-exec nodejs dumb-init -- "$@"
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
CMD ["npm", "start"]
