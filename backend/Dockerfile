# Build stage — Badge System Backend API
FROM node:20-alpine

# Metadata
LABEL maintainer="Diego Falletti <falletti.diego2533@gmail.com>"
LABEL description="Badge System Backend API - Node.js 20 + Express.js"
LABEL version="1.0.0"

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Set working directory
WORKDIR /app

# Copy package files (package.json + package-lock.json if exists)
COPY package*.json ./

# Install production dependencies only
# Using npm ci for reproducible, faster, and more reliable installs
RUN npm ci --only=production && npm cache clean --force

# Copy application source code
COPY src ./src

# Copy environment template (reference only, actual .env set at runtime)
COPY .env.example .env.example

# Create non-root user for security (principle of least privilege)
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

# Expose application port
EXPOSE 3000

# Health check — ensures container is healthy
# Checks /health endpoint every 30s, allows 5s startup grace period
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to handle signals properly (prevents zombie processes)
ENTRYPOINT ["dumb-init", "--"]

# Run application
CMD ["npm", "start"]
