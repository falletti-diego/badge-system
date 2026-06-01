#!/bin/bash

# =============================================================================
# Badge System — Environment Setup Script
# =============================================================================
# Automatically generates .env files from .env.example templates
# 
# Usage:
#   ./scripts/setup-env.sh
#
# This script will:
#   1. Check if .env files already exist
#   2. Copy .env.example → .env in all components
#   3. Display setup instructions
#
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔧 Badge System — Environment Setup"
echo "===================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to setup .env file
setup_env_file() {
    local component=$1
    local component_dir="$PROJECT_ROOT/$component"
    local source_file="$component_dir/.env.example"
    local target_file="$component_dir/.env"

    # Check if component directory exists
    if [ ! -d "$component_dir" ]; then
        echo -e "${RED}✗ Directory '$component' not found in project root${NC}"
        return 1
    fi

    # Check if .env.example exists
    if [ ! -f "$source_file" ]; then
        echo -e "${RED}✗ $component/.env.example not found${NC}"
        return 1
    fi

    # Check if .env already exists
    if [ -f "$target_file" ]; then
        echo -e "${YELLOW}⚠ $component/.env already exists (skipping)${NC}"
        return 0
    fi

    # Copy .env.example to .env
    cp "$source_file" "$target_file"
    echo -e "${GREEN}✓ Created $component/.env${NC}"
}

# Setup backend
echo "Setting up Backend:"
setup_env_file "backend"

echo ""
echo "Setting up Frontend Web:"
setup_env_file "frontend-web"

echo ""
echo "Setting up Frontend Mobile:"
setup_env_file "frontend-mobile"

echo ""
echo "===================================="
echo -e "${GREEN}✓ Environment files created!${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit the .env files with your configuration:"
echo "   - backend/.env (PostgreSQL, Auth0, JWT secrets)"
echo "   - frontend-web/.env (API URL, Auth0 domain)"
echo "   - frontend-mobile/.env (API URL, Auth0 domain)"
echo ""
echo "2. For local development (recommended):"
echo "   - Keep default DATABASE_URL (docker-compose PostgreSQL)"
echo "   - Set DISABLE_AUTH=true in backend/.env"
echo "   - Set MOCK_AUTH0=true in backend/.env"
echo ""
echo "3. Start Docker Compose:"
echo "   cd infrastructure"
echo "   docker-compose up"
echo ""
echo "4. Start the backend:"
echo "   cd backend"
echo "   npm install && npm start"
echo ""
echo "5. In another terminal, start the frontend:"
echo "   cd frontend-web"
echo "   npm install && npm run dev"
echo ""
echo "6. Dashboard available at: http://localhost:5173"
echo ""
echo "For production setup, see docs/CONFIGURATION.md"
echo ""
