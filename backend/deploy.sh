#!/bin/bash
# Badge System Backend Deployment Script
# Pulls Docker image from ECR and runs container on EC2
# Usage: ./deploy.sh

set -e  # Exit on error

echo "======================================"
echo "Badge System Backend - EC2 Deployment"
echo "======================================"

# Load environment variables from .env (safely, only VAR=value lines)
if [ -f .env ]; then
  echo "📋 Loading environment from .env..."
  export $(grep -E '^[A-Z_]+=' .env | xargs)
  echo "✅ Loaded $(grep -E '^[A-Z_]+=' .env | wc -l) variables"
else
  echo "⚠️  .env file not found - using defaults"
fi

# Configuration
ECR_REGISTRY="125579685235.dkr.ecr.eu-west-1.amazonaws.com"
ECR_REPOSITORY="badge-system-backend"
IMAGE_TAG="latest"
CONTAINER_NAME="badge-system-api"
CONTAINER_PORT="3000"
HOST_PORT="3000"

# RDS Configuration (from .env or defaults)
DB_HOST="${DB_HOST:-badge-system-db.cvs80y0my080.eu-west-1.rds.amazonaws.com}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-badge_system}"
AWS_REGION="${AWS_REGION:-eu-west-1}"
CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:3000}"

# Debug: Show loaded values
echo ""
echo "🔍 Database Configuration:"
echo "   DB_HOST: $DB_HOST"
echo "   DB_PORT: $DB_PORT"
echo "   DB_USER: $DB_USER"
echo "   DB_NAME: $DB_NAME"
echo "   DB_PASSWORD: $(if [ -z \"$DB_PASSWORD\" ]; then echo \"[EMPTY]\"; else echo \"[SET]\"; fi)"
echo ""

# Validate DB_PASSWORD is set
if [ -z "$DB_PASSWORD" ]; then
  echo "❌ Error: DB_PASSWORD not set in .env or environment"
  exit 1
fi

echo ""
echo "📦 Step 1: Login to AWS ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}
echo "✅ ECR login successful"

echo ""
echo "🐋 Step 2: Pull latest image from ECR..."
docker pull ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}
echo "✅ Image pulled successfully"

echo ""
echo "🛑 Step 3: Stop and remove existing container (if running)..."
docker stop ${CONTAINER_NAME} 2>/dev/null || true
docker rm ${CONTAINER_NAME} 2>/dev/null || true
echo "✅ Old container removed"

echo ""
echo "🚀 Step 4: Run container with environment variables..."
echo "   CORS_ORIGIN: ${CORS_ORIGIN}"

docker run -d \
  --name ${CONTAINER_NAME} \
  --restart unless-stopped \
  -p ${HOST_PORT}:${CONTAINER_PORT} \
  -v /home/ubuntu/badge-api/cert.pem:/app/cert.pem:ro \
  -v /home/ubuntu/badge-api/key.pem:/app/key.pem:ro \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  -e PORT=${CONTAINER_PORT} \
  -e DB_HOST=${DB_HOST} \
  -e DB_PORT=${DB_PORT} \
  -e DB_USER=${DB_USER} \
  -e DB_PASSWORD="${DB_PASSWORD}" \
  -e DB_NAME=${DB_NAME} \
  -e CORS_ORIGIN="${CORS_ORIGIN}" \
  -e CORS_CREDENTIALS="true" \
  ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}

CONTAINER_ID=$(docker ps -q -f name=${CONTAINER_NAME})
echo "✅ Container running: ${CONTAINER_ID}"

echo ""
echo "⏳ Step 5: Wait for container to start (5 seconds)..."
sleep 5

echo ""
echo "🏥 Step 6: Test health endpoint..."
# Try HTTPS first (if certificates available), fallback to HTTP
HEALTH_RESPONSE=$(curl -s -k https://localhost:${HOST_PORT}/health 2>/dev/null || curl -s http://localhost:${HOST_PORT}/health)
echo "Health response: ${HEALTH_RESPONSE}"

if echo "${HEALTH_RESPONSE}" | grep -q '"status":"ok"'; then
  echo "✅ Health endpoint working!"
else
  echo "❌ Health endpoint failed. Checking logs..."
  docker logs ${CONTAINER_NAME}
  exit 1
fi

echo ""
echo "======================================"
echo "🎉 Deployment Complete!"
echo "======================================"
echo ""
echo "Container Details:"
echo "  Name: ${CONTAINER_NAME}"
echo "  Port: ${HOST_PORT}"
echo "  Image: ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
echo ""
echo "Test URLs:"
echo "  Health (HTTPS): https://34.245.145.143:${HOST_PORT}/health"
echo "  Health (HTTP): http://34.245.145.143:${HOST_PORT}/health"
echo "  API (HTTPS): https://34.245.145.143:${HOST_PORT}/api"
echo "  API (HTTP): http://34.245.145.143:${HOST_PORT}/api"
echo ""
echo "View logs:"
echo "  docker logs ${CONTAINER_NAME}"
echo "  docker logs -f ${CONTAINER_NAME}  (follow)"
echo ""
