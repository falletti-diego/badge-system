# Badge System — REST API Specification

**Version:** 1.0.0 (MVP)  
**Last Updated:** 28 Maggio 2026  
**Base URL:** `https://api.badge.dataxiom.it` (production) | `http://localhost:3000` (development)  
**API Version:** `/api/v1/`

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Rate Limiting](#rate-limiting)
4. [Response Format](#response-format)
5. [Error Handling](#error-handling)
6. [Endpoints](#endpoints)
   - [Authentication](#authentication-endpoints)
   - [Check-ins](#check-in-endpoints)
   - [Reporting](#reporting-endpoints)
   - [Admin](#admin-endpoints)
7. [Code Examples](#code-examples)
8. [Webhook Events (Phase 2)](#webhooks-phase-2)

---

## 📖 Overview

### API Architecture
- **Protocol:** REST over HTTPS
- **Format:** JSON request/response
- **Versioning:** URL-based (`/api/v1/`)
- **Authentication:** JWT Bearer tokens
- **Rate Limit:** 100 requests/minute per IP
- **Timezone:** All timestamps in ISO 8601 UTC (`2026-05-28T14:30:00Z`)

### Key Concepts

**Multi-Tenant:**
- Each client (azienda retail) is isolated
- API automatically scopes data to authenticated user's client
- No cross-client data visibility

**Check-in Types:**
- `IN` — Employee arrival
- `OUT` — Employee departure

**User Roles:**
- `employee` — Can only see own check-ins
- `manager` — Can see site check-ins, approve corrections
- `admin` — Dataxiom staff, full access

---

## 🔐 Authentication

### JWT Bearer Token

All protected endpoints require:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Structure

**Access Token (expires in 30 minutes):**
```json
{
  "sub": "employee@retail.it",
  "aud": "https://api.badge.dataxiom.it",
  "iat": 1748353800,
  "exp": 1748355600,
  "role": "employee",
  "client_id": "client_123"
}
```

**Refresh Token (expires in 7 days):**
- Used to obtain new access token without re-authenticating
- Stored securely (httpOnly cookie recommended)

### How to Get a Token

1. **First Login:** `POST /api/v1/auth/login` with email + password
2. **Subsequent Requests:** Use access token in `Authorization` header
3. **Token Expiry:** When expired, use refresh token: `POST /api/v1/auth/refresh`

---

## 🚦 Rate Limiting

**Limit:** 100 requests per minute per IP address

**Response Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1748353860
```

**When Exceeded:** Returns `429 Too Many Requests`

---

## 📦 Response Format

### Successful Response (2xx)

```json
{
  "success": true,
  "data": {
    "id": "checkin_abc123",
    "employee_id": "emp_001",
    "timestamp": "2026-05-28T09:15:00Z",
    "type": "IN"
  },
  "meta": {
    "request_id": "req_xyz789",
    "timestamp": "2026-05-28T14:30:15Z",
    "processing_ms": 45
  }
}
```

### Error Response (4xx, 5xx)

```json
{
  "success": false,
  "error": {
    "code": "INVALID_QR_CODE",
    "message": "QR code not found or expired",
    "details": {
      "qr_code": "Invalid format"
    },
    "http_status": 400
  },
  "meta": {
    "request_id": "req_abc123",
    "timestamp": "2026-05-28T14:30:15Z"
  }
}
```

### Response Metadata

| Field | Type | Description |
|-------|------|-------------|
| `request_id` | string | Unique request identifier (for debugging/logging) |
| `timestamp` | string | ISO 8601 UTC when response was generated |
| `processing_ms` | number | Server processing time in milliseconds |

---

## ⚠️ Error Handling

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| **200** | OK | Request successful, data returned |
| **201** | Created | Resource created (check-in registered) |
| **204** | No Content | Success, no data to return |
| **400** | Bad Request | Malformed request, validation error |
| **401** | Unauthorized | Missing/invalid authentication token |
| **403** | Forbidden | Authenticated but not authorized for resource |
| **404** | Not Found | Resource doesn't exist |
| **409** | Conflict | Check-in already exists for this time/site |
| **410** | Gone | Resource no longer available (site deactivated) |
| **422** | Unprocessable Entity | Validation error with field details |
| **429** | Too Many Requests | Rate limit exceeded |
| **500** | Server Error | Internal server error |
| **503** | Service Unavailable | Temporary service outage |

### Error Codes

**Authentication:**
```
INVALID_CREDENTIALS     — Email or password incorrect
TOKEN_EXPIRED           — JWT token expired
TOKEN_INVALID           — Token malformed or tampered
NO_AUTH_HEADER          — Missing Authorization header
INVALID_AUTH_SCHEME     — Not "Bearer" token
```

**Check-in:**
```
INVALID_QR_CODE         — QR code not found
QR_CODE_EXPIRED         — QR code's site no longer valid
DUPLICATE_CHECKIN       — Check-in already exists (within 60 seconds)
EMPLOYEE_NOT_ASSIGNED   — Employee not assigned to site
CHECK_IN_TOO_OLD        — Timestamp > 1 minute old (rejected)
INVALID_CHECK_IN_TYPE   — Type not "IN" or "OUT"
CORRECTION_WINDOW_CLOSED — Cannot edit (>2 hours old)
```

**Validation:**
```
INVALID_EMAIL           — Email format invalid
INVALID_TIMESTAMP       — Timestamp not ISO 8601
MISSING_REQUIRED_FIELD  — Required field missing
```

**Authorization:**
```
INSUFFICIENT_PERMISSIONS — User role can't perform action
CLIENT_MISMATCH          — Trying to access different client's data
```

### Example Error Response

```json
{
  "success": false,
  "error": {
    "code": "INVALID_QR_CODE",
    "message": "QR code 'site_milano_001' not found",
    "details": {
      "qr_code": "site_milano_001"
    },
    "http_status": 404
  },
  "meta": {
    "request_id": "req_123abc",
    "timestamp": "2026-05-28T09:15:30Z"
  }
}
```

---

## 🔌 Endpoints

### Authentication Endpoints

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "mario@retail.it",
  "password": "secure_password_123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 1800,
    "user": {
      "id": "emp_001",
      "email": "mario@retail.it",
      "name": "Mario Rossi",
      "role": "employee"
    }
  },
  "meta": { "request_id": "req_123", "timestamp": "2026-05-28T09:00:00Z", "processing_ms": 120 }
}
```

**Errors:** `400` (invalid credentials), `422` (validation error)

---

#### Refresh Token
```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 1800
  },
  "meta": { "request_id": "req_456", "timestamp": "2026-05-28T09:30:00Z", "processing_ms": 50 }
}
```

**Errors:** `401` (invalid/expired refresh token)

---

#### Logout
```http
POST /api/v1/auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (204 No Content):**
- No response body
- Token invalidated on server

**Errors:** `401` (not authenticated)

---

### Check-in Endpoints

#### Register Check-in
```http
POST /api/v1/checkin
Authorization: Bearer {token}
Content-Type: application/json

{
  "qr_code_content": "https://api.badge.dataxiom.it/checkin/site/site_milano_001",
  "timestamp": "2026-05-28T09:15:00Z",
  "type": "IN"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "checkin_abc123",
    "employee_id": "emp_001",
    "employee_email": "mario@retail.it",
    "site_id": "site_milano_001",
    "timestamp": "2026-05-28T09:15:00Z",
    "type": "IN",
    "created_at": "2026-05-28T09:15:05Z",
    "corrected_at": null,
    "status": "confirmed"
  },
  "meta": { "request_id": "req_789", "timestamp": "2026-05-28T09:15:05Z", "processing_ms": 85 }
}
```

**Errors:** 
- `400` (invalid QR code, timestamp too old)
- `401` (unauthorized)
- `409` (duplicate check-in within 1 min)
- `422` (validation error)

---

#### List User's Check-ins
```http
GET /api/v1/checkins?page=1&per_page=20&from_date=2026-05-01&to_date=2026-05-31&sort=timestamp_desc
Authorization: Bearer {token}
```

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `page` | int | No | 1 | Page number (1-indexed) |
| `per_page` | int | No | 20 | Items per page (max 100, not 20) |
| `from_date` | string | No | — | ISO 8601 start date |
| `to_date` | string | No | — | ISO 8601 end date |
| `type` | string | No | — | Filter by "IN" or "OUT" |
| `sort` | string | No | timestamp_desc | Sort by field + direction |

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "checkin_abc123",
      "employee_id": "emp_001",
      "site_id": "site_milano_001",
      "timestamp": "2026-05-28T09:15:00Z",
      "type": "IN",
      "created_at": "2026-05-28T09:15:05Z",
      "corrected_at": null,
      "status": "confirmed"
    },
    {
      "id": "checkin_def456",
      "employee_id": "emp_001",
      "site_id": "site_milano_001",
      "timestamp": "2026-05-28T17:45:00Z",
      "type": "OUT",
      "created_at": "2026-05-28T17:45:08Z",
      "corrected_at": "2026-05-28T17:50:00Z",
      "status": "corrected"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 47,
    "total_pages": 3
  },
  "meta": { "request_id": "req_111", "timestamp": "2026-05-28T14:30:15Z", "processing_ms": 120 }
}
```

**Errors:** `401` (unauthorized)

---

#### Get Single Check-in
```http
GET /api/v1/checkins/{checkin_id}
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "checkin_abc123",
    "employee_id": "emp_001",
    "employee_email": "mario@retail.it",
    "site_id": "site_milano_001",
    "timestamp": "2026-05-28T09:15:00Z",
    "type": "IN",
    "created_at": "2026-05-28T09:15:05Z",
    "created_by": "emp_001",
    "corrected_at": null,
    "corrected_by": null,
    "status": "confirmed"
  },
  "meta": { "request_id": "req_222", "timestamp": "2026-05-28T14:30:15Z", "processing_ms": 35 }
}
```

**Errors:** `401` (unauthorized), `404` (check-in not found)

---

#### Correct Check-in
```http
PUT /api/v1/checkins/{checkin_id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "timestamp": "2026-05-28T09:20:00Z",
  "reason": "System glitch, actual time was 9:20"
}
```

**Constraints:**
- Employee: Can correct own check-in within 2 hours
- Manager: Can correct site employees within 48 hours
- Admin: No time limit

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "checkin_abc123",
    "timestamp": "2026-05-28T09:20:00Z",
    "corrected_at": "2026-05-28T09:35:00Z",
    "corrected_by": "emp_001",
    "reason": "System glitch, actual time was 9:20",
    "status": "corrected"
  },
  "meta": { "request_id": "req_333", "timestamp": "2026-05-28T09:35:02Z", "processing_ms": 95 }
}
```

**Errors:**
- `401` (unauthorized)
- `403` (insufficient permissions)
- `404` (check-in not found)
- `409` (correction window closed)

---

### Reporting Endpoints

#### Get Presences (Dashboard)
```http
GET /api/v1/presences?page=1&per_page=50&from_date=2026-05-28&to_date=2026-05-28&site_id=site_milano_001&employee_id=emp_001&type=IN&sort=timestamp_desc
Authorization: Bearer {token}
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Page number |
| `per_page` | int | Items per page (max 100) |
| `from_date` | string | ISO 8601 start date |
| `to_date` | string | ISO 8601 end date |
| `site_id` | string | Filter by site (manager+ only) |
| `employee_id` | string | Filter by employee |
| `type` | string | Filter by "IN" or "OUT" |
| `sort` | string | Sort: timestamp_asc, timestamp_desc (check-in time) or employee_asc (by employee ID) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "checkin_abc123",
      "employee": {
        "id": "emp_001",
        "email": "mario@retail.it",
        "name": "Mario Rossi"
      },
      "site": {
        "id": "site_milano_001",
        "name": "Milano Central",
        "location": "Via Roma 123"
      },
      "timestamp": "2026-05-28T09:15:00Z",
      "type": "IN",
      "status": "confirmed",
      "corrected": false
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 342,
    "total_pages": 7
  },
  "meta": { "request_id": "req_444", "timestamp": "2026-05-28T14:30:15Z", "processing_ms": 250 }
}
```

**Permissions:**
- Employee: Only own check-ins
- Manager: Own site's check-ins
- Admin: All check-ins

---

#### Get Statistics
```http
GET /api/v1/stats?from_date=2026-05-28&to_date=2026-05-28&site_id=site_milano_001
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "date": "2026-05-28",
    "total_employees": 25,
    "present_today": 23,
    "absent": 2,
    "late_arrivals": 1,
    "total_checkins": 46,
    "by_type": {
      "IN": 23,
      "OUT": 23
    },
    "average_arrival_time": "09:12:30",
    "average_departure_time": "17:42:15"
  },
  "meta": { "request_id": "req_555", "timestamp": "2026-05-28T14:30:15Z", "processing_ms": 180 }
}
```

---

#### Export to CSV
```http
GET /api/v1/export/csv?from_date=2026-05-01&to_date=2026-05-31&site_id=site_milano_001
Authorization: Bearer {token}
Accept: text/csv
```

**Response (200 OK):**
```
Content-Type: text/csv
Content-Disposition: attachment; filename="presences_2026-05_milano.csv"

Employee Email,Employee Name,Site,Date,Time,Type,Status
mario@retail.it,Mario Rossi,Milano Central,2026-05-28,09:15:00,IN,confirmed
mario@retail.it,Mario Rossi,Milano Central,2026-05-28,17:45:00,OUT,confirmed
...
```

---

### Admin Endpoints

#### Create Client
```http
POST /api/v1/admin/clients
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "name": "Retail Chain XYZ",
  "email": "admin@retailxyz.it",
  "plan": "pro",
  "timezone": "Europe/Rome"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "client_xyz789",
    "name": "Retail Chain XYZ",
    "email": "admin@retailxyz.it",
    "plan": "pro",
    "created_at": "2026-05-28T14:30:15Z"
  },
  "meta": { "request_id": "req_666", "timestamp": "2026-05-28T14:30:15Z", "processing_ms": 110 }
}
```

**Errors:** `403` (not admin), `422` (validation error)

---

#### Create Site
```http
POST /api/v1/admin/sites
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "client_id": "client_xyz789",
  "name": "Milano Central",
  "location": "Via Roma 123, Milano",
  "address": "20100 Milano, IT"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "site_milano_001",
    "client_id": "client_xyz789",
    "name": "Milano Central",
    "location": "Via Roma 123, Milano",
    "qr_code_content": "https://api.badge.dataxiom.it/checkin/site/site_milano_001",
    "created_at": "2026-05-28T14:30:15Z"
  },
  "meta": { "request_id": "req_777", "timestamp": "2026-05-28T14:30:15Z", "processing_ms": 95 }
}
```

---

#### Create Employees (Bulk)
```http
POST /api/v1/admin/employees
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "client_id": "client_xyz789",
  "employees": [
    {
      "email": "mario@retail.it",
      "name": "Mario Rossi",
      "phone": "+39 3XX XXX XXXX",
      "assigned_sites": ["site_milano_001", "site_roma_001"]
    },
    {
      "email": "giulia@retail.it",
      "name": "Giulia Bianchi",
      "phone": "+39 3XX XXX XXXX",
      "assigned_sites": ["site_milano_001"]
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "created": 2,
    "failed": 0,
    "employees": [
      {
        "id": "emp_001",
        "email": "mario@retail.it",
        "name": "Mario Rossi",
        "assigned_sites": ["site_milano_001", "site_roma_001"]
      },
      {
        "id": "emp_002",
        "email": "giulia@retail.it",
        "name": "Giulia Bianchi",
        "assigned_sites": ["site_milano_001"]
      }
    ]
  },
  "meta": { "request_id": "req_888", "timestamp": "2026-05-28T14:30:15Z", "processing_ms": 250 }
}
```

---

#### Get System Metrics
```http
GET /api/v1/admin/metrics?from_date=2026-05-01&to_date=2026-05-31
Authorization: Bearer {admin_token}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "period": {
      "from": "2026-05-01",
      "to": "2026-05-31"
    },
    "clients": {
      "total": 3,
      "active": 3,
      "churn": 0
    },
    "employees": {
      "total": 125,
      "daily_average": 115
    },
    "checkins": {
      "total": 5234,
      "daily_average": 169,
      "on_time": 92.3,
      "late": 7.2,
      "absent": 0.5
    },
    "api_stats": {
      "total_requests": 45234,
      "avg_response_ms": 85,
      "error_rate": 0.8
    }
  },
  "meta": { "request_id": "req_999", "timestamp": "2026-05-28T14:30:15Z", "processing_ms": 1200 }
}
```

---

## 💻 Code Examples

### JavaScript / Node.js (Axios)

```javascript
const axios = require('axios');

const API_URL = 'http://localhost:3000/api/v1';
const client = axios.create({
  baseURL: API_URL,
  timeout: 30000
});

// Login
async function login(email, password) {
  const response = await client.post('/auth/login', {
    email,
    password
  });
  
  const { access_token, refresh_token } = response.data.data;
  
  // Store tokens
  localStorage.setItem('access_token', access_token);
  localStorage.setItem('refresh_token', refresh_token);
  
  // Set default header
  client.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
  
  return response.data.data;
}

// Register Check-in
async function registerCheckIn(qrCodeContent, timestamp, type) {
  const response = await client.post('/checkin', {
    qr_code_content: qrCodeContent,
    timestamp,
    type
  });
  
  return response.data.data;
}

// Get Presences
async function getPresences(page = 1, perPage = 20, filters = {}) {
  const response = await client.get('/presences', {
    params: {
      page,
      per_page: perPage,
      ...filters
    }
  });
  
  return response.data;
}

// Handle Token Refresh
client.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    
    if (error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const refreshToken = localStorage.getItem('refresh_token');
      const { data } = await axios.post(`${API_URL}/auth/refresh`, {
        refresh_token: refreshToken
      });
      
      const newAccessToken = data.data.access_token;
      localStorage.setItem('access_token', newAccessToken);
      
      originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
      return client(originalRequest);
    }
    
    return Promise.reject(error);
  }
);
```

### cURL

```bash
# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "mario@retail.it",
    "password": "secure_password"
  }'

# Response: {"data": {"access_token": "...", "refresh_token": "..."}}

# Register Check-in
curl -X POST http://localhost:3000/api/v1/checkin \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "qr_code_content": "https://api.badge.dataxiom.it/checkin/site/site_milano_001",
    "timestamp": "2026-05-28T09:15:00Z",
    "type": "IN"
  }'

# Get Presences
curl -X GET "http://localhost:3000/api/v1/presences?from_date=2026-05-28&to_date=2026-05-28" \
  -H "Authorization: Bearer eyJhbGc..."
```

### Python (Requests)

```python
import requests
from datetime import datetime, timedelta

API_URL = "http://localhost:3000/api/v1"

# Login
response = requests.post(
    f"{API_URL}/auth/login",
    json={"email": "mario@retail.it", "password": "secure_password"}
)
data = response.json()
access_token = data['data']['access_token']

headers = {"Authorization": f"Bearer {access_token}"}

# Register Check-in
response = requests.post(
    f"{API_URL}/checkin",
    headers=headers,
    json={
        "qr_code_content": "https://api.badge.dataxiom.it/checkin/site/site_milano_001",
        "timestamp": datetime.now().isoformat() + "Z",
        "type": "IN"
    }
)

checkin = response.json()['data']
print(f"Check-in registrato: {checkin['id']}")

# Get Presences
today = datetime.now().date().isoformat()
response = requests.get(
    f"{API_URL}/presences",
    headers=headers,
    params={
        "from_date": today,
        "to_date": today,
        "per_page": 100
    }
)

presences = response.json()['data']
print(f"Check-in today: {len(presences)}")
```

---

## 🔄 Webhooks (Phase 2)

**Note:** Webhooks are planned for Phase 2 (post-MVP). When implemented, events will include:

```
checkin.registered     — New check-in created
checkin.corrected      — Check-in timestamp corrected
employee.created       — New employee added
employee.removed       — Employee removed
site.created           — New site added
```

Clients can subscribe to events via dashboard configuration.

---

## 📚 Related Documents

- **Database Schema:** See `SCHEMA.md`
- **Deployment Guide:** See `DEPLOYMENT.md`
- **Error Reference:** See `ERRORS.md`
- **Security Considerations:** See `SECURITY.md`

---

**Last Updated:** 28 Maggio 2026  
**Status:** Ready for Implementation ✅
