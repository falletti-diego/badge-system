#!/bin/bash

##############################################################################
# S.32.6 Complete Test Automation Script
#
# Testa:
# 1. Backend endpoint (curl — 5 min)
# 2. Frontend components (Jest + RTL — 15 min)
# 3. Route guard (Jest — 5 min)
# 4. Integration flow (Jest + mocking — 10 min)
#
# Total: ~35 minutes
#
# Usage: bash scripts/test-s32-6-complete.sh
##############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED_SECTIONS=0
FAILED_SECTIONS=0

# Helper: Print section header
print_header() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

# Helper: Print section result
print_section_result() {
  local section=$1
  local result=$2

  if [ "$result" == "PASS" ]; then
    echo -e "${GREEN}✅ $section: PASSED${NC}"
    ((PASSED_SECTIONS++))
  else
    echo -e "${RED}❌ $section: FAILED${NC}"
    ((FAILED_SECTIONS++))
  fi
}

# ============================================================================
# PREAMBLE: Check Prerequisites
# ============================================================================
print_header "Prerequisites Check"

# Check if backend is running
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo -e "${GREEN}✅${NC} Backend running on http://localhost:3000"
else
  echo -e "${RED}❌${NC} Backend NOT running on http://localhost:3000"
  echo "   Start with: cd backend && npm run dev"
  exit 1
fi

# Check Node version
NODE_VERSION=$(node -v)
echo -e "${GREEN}✅${NC} Node $NODE_VERSION"

# Check npm
NPM_VERSION=$(npm -v)
echo -e "${GREEN}✅${NC} npm $NPM_VERSION"

# ============================================================================
# PART 1: Backend Endpoint Tests
# ============================================================================
print_header "PART 1: Backend Endpoint Tests (curl)"

echo "Executing bash backend/scripts/test-change-password-backend.sh..."

if bash backend/scripts/test-change-password-backend.sh > /tmp/backend-test-results.log 2>&1; then
  print_section_result "Backend Endpoint Tests" "PASS"
  cat /tmp/backend-test-results.log | tail -20
else
  print_section_result "Backend Endpoint Tests" "FAIL"
  cat /tmp/backend-test-results.log | tail -30
fi

# ============================================================================
# PART 2: Frontend Component Tests
# ============================================================================
print_header "PART 2: Frontend Component Tests"

echo "Running Jest + React Testing Library for ChangePasswordPage..."
echo "Location: frontend-web/src/__tests__/ChangePasswordPage.test.js"

cd frontend-web

if npm run test -- --testPathPattern="ChangePasswordPage" --run > /tmp/frontend-component-test.log 2>&1; then
  print_section_result "Frontend Component Tests" "PASS"
  echo "Summary:"
  grep -E "passed|failed|test suites" /tmp/frontend-component-test.log | tail -3
else
  print_section_result "Frontend Component Tests" "FAIL"
  echo "Errors:"
  tail -50 /tmp/frontend-component-test.log
fi

cd ..

# ============================================================================
# PART 3: Route Guard Tests
# ============================================================================
print_header "PART 3: Route Guard Tests"

echo "Running Jest for PasswordChangeGuard..."
echo "Location: frontend-web/src/__tests__/PasswordChangeGuard.test.js"

cd frontend-web

if npm run test -- --testPathPattern="PasswordChangeGuard" --run > /tmp/frontend-guard-test.log 2>&1; then
  print_section_result "Route Guard Tests" "PASS"
  echo "Summary:"
  grep -E "passed|failed|test suites" /tmp/frontend-guard-test.log | tail -3
else
  print_section_result "Route Guard Tests" "FAIL"
  echo "Errors:"
  tail -50 /tmp/frontend-guard-test.log
fi

cd ..

# ============================================================================
# PART 4: Integration Tests (Full Lifecycle)
# ============================================================================
print_header "PART 4: Integration Tests (Full Lifecycle)"

echo "Running Jest for ChangePasswordFlow (full lifecycle with mocking)..."
echo "Location: frontend-web/src/__tests__/ChangePasswordFlow.e2e.test.js"

cd frontend-web

if npm run test -- --testPathPattern="ChangePasswordFlow" --run > /tmp/frontend-integration-test.log 2>&1; then
  print_section_result "Integration Tests" "PASS"
  echo "Summary:"
  grep -E "passed|failed|test suites" /tmp/frontend-integration-test.log | tail -3
else
  print_section_result "Integration Tests" "FAIL"
  echo "Errors:"
  tail -50 /tmp/frontend-integration-test.log
fi

cd ..

# ============================================================================
# FINAL REPORT
# ============================================================================
print_header "Final Test Report — S.32.6"

TOTAL_SECTIONS=4
PERCENTAGE=$((PASSED_SECTIONS * 100 / TOTAL_SECTIONS))

echo ""
echo -e "${BLUE}Section Results:${NC}"
echo "  • Backend Endpoint Tests: $([[ -f /tmp/backend-test-results.log ]] && grep -q 'BACKEND READY' /tmp/backend-test-results.log && echo -e '${GREEN}✅${NC}' || echo -e '${RED}❌${NC}')"
echo "  • Frontend Component Tests: $([[ -f /tmp/frontend-component-test.log ]] && grep -q 'passed' /tmp/frontend-component-test.log && echo -e '${GREEN}✅${NC}' || echo -e '${RED}❌${NC}')"
echo "  • Route Guard Tests: $([[ -f /tmp/frontend-guard-test.log ]] && grep -q 'passed' /tmp/frontend-guard-test.log && echo -e '${GREEN}✅${NC}' || echo -e '${RED}❌${NC}')"
echo "  • Integration Tests: $([[ -f /tmp/frontend-integration-test.log ]] && grep -q 'passed' /tmp/frontend-integration-test.log && echo -e '${GREEN}✅${NC}' || echo -e '${RED}❌${NC}')"

echo ""
echo -e "${BLUE}Summary:${NC}"
echo "  Passed: $PASSED_SECTIONS / $TOTAL_SECTIONS ($PERCENTAGE%)"
echo "  Failed: $FAILED_SECTIONS / $TOTAL_SECTIONS"

echo ""

if [ $FAILED_SECTIONS -eq 0 ]; then
  echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}✅ ALL TESTS PASSED — READY FOR STAGING DEPLOYMENT${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Next Steps:"
  echo "  1. Manual E2E Test: CSV import → temp password → change → new login"
  echo "  2. Deploy to staging: git push && netlify deploy --prod"
  echo "  3. QA verification in staging environment"
  echo ""
  exit 0
else
  echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}❌ SOME TESTS FAILED — FIX BEFORE DEPLOYMENT${NC}"
  echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Failed Sections: $FAILED_SECTIONS"
  echo "Check logs:"
  echo "  • Backend: cat /tmp/backend-test-results.log"
  echo "  • Frontend Components: cat /tmp/frontend-component-test.log"
  echo "  • Route Guard: cat /tmp/frontend-guard-test.log"
  echo "  • Integration: cat /tmp/frontend-integration-test.log"
  echo ""
  exit 1
fi
