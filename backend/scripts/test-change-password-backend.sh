#!/bin/bash

##############################################################################
# S.32.6 Backend Tests: Change Password Endpoint
#
# Testa POST /api/auth/change-password isolatamente
# Verifica: validation, authorization, error handling, response format
#
# Usage: bash backend/scripts/test-change-password-backend.sh
##############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKEND_URL="http://localhost:3000"
PASSED=0
FAILED=0

# Helper: Test endpoint
test_endpoint() {
  local test_name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_status=$5
  local auth_header=${6:-""}

  local response
  local status
  local body

  # Build curl command
  local curl_cmd="curl -s -w '%{http_code}' -X $method"
  curl_cmd="$curl_cmd -H 'Content-Type: application/json'"

  if [ -n "$auth_header" ]; then
    curl_cmd="$curl_cmd -H 'Authorization: Bearer $auth_header'"
  fi

  if [ -n "$data" ]; then
    curl_cmd="$curl_cmd -d '$data'"
  fi

  curl_cmd="$curl_cmd $BACKEND_URL$endpoint"

  # Execute and capture response + status
  response=$(eval "$curl_cmd")
  status="${response: -3}"
  body="${response%???}"

  # Assert status
  if [ "$status" == "$expected_status" ]; then
    echo -e "${GREEN}✅${NC} $test_name [HTTP $status]"
    ((PASSED++))
    echo "$body" > /tmp/last_response.json
    return 0
  else
    echo -e "${RED}❌${NC} $test_name [Expected HTTP $expected_status, got $status]"
    echo -e "${YELLOW}   Response: $body${NC}"
    ((FAILED++))
    return 1
  fi
}

# Helper: Extract JSON value
get_json_value() {
  local json=$1
  local key=$2
  echo "$json" | grep -o "\"$key\":\"[^\"]*\"" | cut -d'"' -f4
}

# Helper: Check if JWT valid format
is_valid_jwt() {
  local token=$1
  # JWT format: xxx.yyy.zzz (3 parts separated by dots)
  if [[ $token =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]]; then
    return 0
  else
    return 1
  fi
}

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  S.32.6 Backend Tests: Change Password Endpoint${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

# SETUP: Check backend is running
echo ""
echo -e "${BLUE}📌 SETUP: Health Check${NC}"
if curl -s "$BACKEND_URL/health" > /dev/null 2>&1; then
  echo -e "${GREEN}✅${NC} Backend running on $BACKEND_URL"
else
  echo -e "${RED}❌${NC} Backend NOT running on $BACKEND_URL"
  echo "   Start backend with: cd backend && npm run dev"
  exit 1
fi

# SETUP: Login as admin first to create test employee
echo ""
echo -e "${BLUE}📌 SETUP: Login as Admin${NC}"

ADMIN_LOGIN=$(curl -s -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"pippo@badge.local","password":"pippo01"}')

ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo -e "${RED}❌${NC} Failed to obtain admin token"
  exit 1
fi

echo -e "${GREEN}✅${NC} Admin token obtained"

# SETUP: Create test employee with unique email
echo ""
echo -e "${BLUE}📌 SETUP: Create Test Employee${NC}"

TIMESTAMP=$(date +%s%N | cut -b1-13)
TEST_EMAIL="testemployee.changepass.$TIMESTAMP@company.local"

CREATE_EMP=$(curl -s -X POST "$BACKEND_URL/api/admin/employees" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id":"550e8400-e29b-41d4-a716-446655440001",
    "email":"'"$TEST_EMAIL"'",
    "name":"Test Employee Change Pass",
    "phone":"+39-333-1234567",
    "assigned_sites":["550e8400-e29b-41d4-a716-446655440010"],
    "role":"employee"
  }')

TEST_EMP_ID=$(echo "$CREATE_EMP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
TEST_EMP_TEMP_PASS=$(echo "$CREATE_EMP" | grep -o '"temp_password":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TEST_EMP_ID" ] || [ -z "$TEST_EMP_TEMP_PASS" ]; then
  echo -e "${RED}❌${NC} Failed to create test employee"
  echo "Response: $CREATE_EMP"
  exit 1
fi

echo -e "${GREEN}✅${NC} Test employee created: $TEST_EMP_ID (temp password: $TEST_EMP_TEMP_PASS)"

# SETUP: Login with test employee temp password
echo ""
echo -e "${BLUE}📌 SETUP: Login with Test Employee (Temp Password)${NC}"

LOGIN_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"'"$TEST_EMAIL"'","password":"'"$TEST_EMP_TEMP_PASS"'"}')

ADMIN_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo -e "${RED}❌${NC} Failed to obtain token"
  echo "   Response: $LOGIN_RESPONSE"
  echo "   Try: Check database has admin user with password '"$TEST_EMP_TEMP_PASS"'"
  exit 1
fi

echo -e "${GREEN}✅${NC} Token obtained (${#ADMIN_TOKEN} chars)"
echo "$ADMIN_TOKEN" > /tmp/admin_token.txt

# ============================================================================
# TEST SUITE 1: Happy Path
# ============================================================================
echo ""
echo -e "${BLUE}📌 TEST SUITE 1: Happy Path${NC}"

# Test 1.1: Valid password change
test_endpoint \
  "POST /api/auth/change-password (valid credentials)" \
  "POST" \
  "/api/auth/change-password" \
  '{"old_password":"'"$TEST_EMP_TEMP_PASS"'","new_password":"maria02"}' \
  "200" \
  "$ADMIN_TOKEN"

# Parse response to extract new token
RESPONSE=$(cat /tmp/last_response.json)
NEW_TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

# Test 1.2: New token is valid JWT
if [ -n "$NEW_TOKEN" ] && is_valid_jwt "$NEW_TOKEN"; then
  echo -e "${GREEN}✅${NC} Response token is valid JWT format"
  ((PASSED++))
else
  echo -e "${RED}❌${NC} Response token is NOT valid JWT (or missing)"
  ((FAILED++))
fi

# Test 1.3: Token is different from old token
if [ "$NEW_TOKEN" != "$ADMIN_TOKEN" ]; then
  echo -e "${GREEN}✅${NC} New token different from old token"
  ((PASSED++))
else
  echo -e "${RED}❌${NC} New token same as old token (should be different)"
  ((FAILED++))
fi

# Test 1.4: must_change_password is false
if echo "$RESPONSE" | grep -q '"must_change_password":false'; then
  echo -e "${GREEN}✅${NC} must_change_password: false"
  ((PASSED++))
else
  echo -e "${RED}❌${NC} must_change_password not false (should be false after change)"
  ((FAILED++))
fi

# ============================================================================
# TEST SUITE 2: Validation Errors (400)
# ============================================================================
echo ""
echo -e "${BLUE}📌 TEST SUITE 2: Validation Errors (400)${NC}"

# Test 2.1: Old password incorrect
test_endpoint \
  "Old password incorrect" \
  "POST" \
  "/api/auth/change-password" \
  '{"old_password":"WrongPassword","new_password":"NewPassword123"}' \
  "400" \
  "$ADMIN_TOKEN"

# Test 2.2: New password too short
test_endpoint \
  "New password too short (<8 chars)" \
  "POST" \
  "/api/auth/change-password" \
  '{"old_password":"New'"$TEST_EMP_TEMP_PASS"'","new_password":"Short"}' \
  "400" \
  "$ADMIN_TOKEN"

# Test 2.3: New password equals old password
test_endpoint \
  "New password equals old password" \
  "POST" \
  "/api/auth/change-password" \
  '{"old_password":"New'"$TEST_EMP_TEMP_PASS"'","new_password":"New'"$TEST_EMP_TEMP_PASS"'"}' \
  "400" \
  "$ADMIN_TOKEN"

# Test 2.4: Missing old_password
test_endpoint \
  "Missing old_password field" \
  "POST" \
  "/api/auth/change-password" \
  '{"new_password":"Password123"}' \
  "400" \
  "$ADMIN_TOKEN"

# Test 2.5: Missing new_password
test_endpoint \
  "Missing new_password field" \
  "POST" \
  "/api/auth/change-password" \
  '{"old_password":"New'"$TEST_EMP_TEMP_PASS"'"}' \
  "400" \
  "$ADMIN_TOKEN"

# ============================================================================
# TEST SUITE 3: Authorization Errors (401/403)
# ============================================================================
echo ""
echo -e "${BLUE}📌 TEST SUITE 3: Authorization Errors (401/403)${NC}"

# Test 3.1: Missing Authorization header
test_endpoint \
  "Missing Authorization header" \
  "POST" \
  "/api/auth/change-password" \
  '{"old_password":"New'"$TEST_EMP_TEMP_PASS"'","new_password":"Password123"}' \
  "401"

# Test 3.2: Invalid token
test_endpoint \
  "Invalid JWT token" \
  "POST" \
  "/api/auth/change-password" \
  '{"old_password":"New'"$TEST_EMP_TEMP_PASS"'","new_password":"Password123"}' \
  "401" \
  "invalid.token.here"

# ============================================================================
# TEST SUITE 4: Network Resilience
# ============================================================================
echo ""
echo -e "${BLUE}📌 TEST SUITE 4: Network Resilience${NC}"

# Test 4.1: Timeout handling (curl with max-time)
if timeout 3 curl -s -X POST "$BACKEND_URL/api/auth/change-password" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"old_password":"New'"$TEST_EMP_TEMP_PASS"'","new_password":"AnotherPassword123"}' \
  --max-time 2 > /dev/null 2>&1; then
  echo -e "${GREEN}✅${NC} Request completes within timeout (2s)"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠️${NC}  Request timeout (> 2s) - check backend performance"
  ((FAILED++))
fi

# ============================================================================
# REPORT
# ============================================================================
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

TOTAL=$((PASSED + FAILED))
PERCENTAGE=$((PASSED * 100 / TOTAL))

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ SUMMARY: $PASSED/$TOTAL PASSED ($PERCENTAGE%)${NC}"
  echo -e "${GREEN}Status: BACKEND READY FOR DEPLOYMENT${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  exit 0
else
  echo -e "${RED}❌ SUMMARY: $PASSED/$TOTAL PASSED ($PERCENTAGE%)${NC}"
  echo -e "${RED}Status: BACKEND TESTS FAILING - FIX BEFORE DEPLOYMENT${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  exit 1
fi
