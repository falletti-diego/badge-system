# API Error Reference

**Complete list of all API error codes and HTTP status codes**

---

## 🎯 HTTP Status Codes

| Code | Name | Usage |
|------|------|-------|
| **200** | OK | Request successful, data returned |
| **201** | Created | Resource created (check-in, client, site) |
| **204** | No Content | Success, no body to return (logout) |
| **400** | Bad Request | Malformed request, invalid data |
| **401** | Unauthorized | Missing/invalid authentication token |
| **403** | Forbidden | Authenticated but not authorized |
| **404** | Not Found | Resource doesn't exist |
| **409** | Conflict | Data conflict (duplicate check-in) |
| **422** | Unprocessable Entity | Validation error with field details |
| **429** | Too Many Requests | Rate limit exceeded |
| **500** | Server Error | Internal server error |
| **503** | Service Unavailable | Temporary service outage (DB down, etc) |

---

## 🔐 Authentication Errors

### INVALID_CREDENTIALS
```json
{
  "code": "INVALID_CREDENTIALS",
  "message": "Email or password incorrect",
  "http_status": 400,
  "details": {
    "email": "mario@retail.it",
    "hint": "Check spelling and try again"
  }
}
```
**Cause:** User provided wrong email/password during login  
**Solution:** Verify email and password, use forgot password if needed

---

### TOKEN_EXPIRED
```json
{
  "code": "TOKEN_EXPIRED",
  "message": "JWT token has expired",
  "http_status": 401,
  "details": {
    "expired_at": "2026-05-28T09:30:00Z",
    "action": "Use refresh token to obtain new access token"
  }
}
```
**Cause:** Access token reached 30-minute expiry  
**Solution:** Call `POST /api/v1/auth/refresh` with refresh_token

---

### TOKEN_INVALID
```json
{
  "code": "TOKEN_INVALID",
  "message": "JWT token is malformed or tampered",
  "http_status": 401,
  "details": {
    "reason": "Invalid signature"
  }
}
```
**Cause:** Token was corrupted, tampered, or not valid JWT  
**Solution:** Re-login to obtain valid token

---

### NO_AUTH_HEADER
```json
{
  "code": "NO_AUTH_HEADER",
  "message": "Missing Authorization header",
  "http_status": 401,
  "details": {
    "expected_format": "Authorization: Bearer {token}"
  }
}
```
**Cause:** Request didn't include `Authorization` header  
**Solution:** Add `Authorization: Bearer {access_token}` header

---

### INVALID_AUTH_SCHEME
```json
{
  "code": "INVALID_AUTH_SCHEME",
  "message": "Invalid authorization scheme (expected Bearer)",
  "http_status": 401,
  "details": {
    "provided": "Basic",
    "expected": "Bearer"
  }
}
```
**Cause:** Authorization header uses wrong scheme (e.g., "Basic" instead of "Bearer")  
**Solution:** Use `Authorization: Bearer {token}` format

---

## ✅ Check-in Errors

### INVALID_QR_CODE
```json
{
  "code": "INVALID_QR_CODE",
  "message": "QR code not found or is invalid",
  "http_status": 404,
  "details": {
    "qr_code": "site_xyz_invalid",
    "hint": "Ensure QR code is correct and site exists"
  }
}
```
**Cause:** QR code doesn't match any site  
**Solution:** Verify QR code is correct, rescan, or contact manager

---

### QR_CODE_EXPIRED
```json
{
  "code": "QR_CODE_EXPIRED",
  "message": "QR code site is no longer active",
  "http_status": 410,
  "details": {
    "site_id": "site_milano_old",
    "deactivated_at": "2026-05-20T00:00:00Z"
  }
}
```
**Cause:** Site was deactivated and QR code is no longer valid  
**Solution:** Contact manager for new QR code

---

### DUPLICATE_CHECKIN
```json
{
  "code": "DUPLICATE_CHECKIN",
  "message": "Check-in already registered within 60 seconds",
  "http_status": 409,
  "details": {
    "existing_checkin": "checkin_abc123",
    "existing_timestamp": "2026-05-28T09:15:00Z",
    "time_since_previous_ms": 500,
    "window_seconds": 60,
    "action": "Duplicate registration ignored, use existing check-in"
  }
}
```
**Cause:** Check-in registered twice within 60 seconds (same employee + site)  
**Solution:** This is intentional safety feature to prevent accidental re-submission. Previous check-in ID returned in details. Window is exactly 60 seconds from the first check-in timestamp.

---

### EMPLOYEE_NOT_ASSIGNED
```json
{
  "code": "EMPLOYEE_NOT_ASSIGNED",
  "message": "Employee is not assigned to this site",
  "http_status": 403,
  "details": {
    "employee_id": "emp_001",
    "site_id": "site_roma_001",
    "assigned_sites": ["site_milano_001", "site_torino_001"],
    "action": "Contact manager to be assigned to this site"
  }
}
```
**Cause:** Employee tried to check-in at a site they're not assigned to  
**Solution:** Contact manager to add employee to site

---

### CHECK_IN_TOO_OLD
```json
{
  "code": "CHECK_IN_TOO_OLD",
  "message": "Check-in timestamp is too old (> 1 minute)",
  "http_status": 400,
  "details": {
    "provided_timestamp": "2026-05-28T09:10:00Z",
    "current_time": "2026-05-28T09:15:00Z",
    "age_seconds": 300,
    "max_age_seconds": 60
  }
}
```
**Cause:** Check-in timestamp is older than 1 minute (server safety check)  
**Solution:** Use current time for new check-in, or contact manager for manual correction

---

### INVALID_CHECK_IN_TYPE
```json
{
  "code": "INVALID_CHECK_IN_TYPE",
  "message": "Check-in type must be IN or OUT",
  "http_status": 422,
  "details": {
    "provided": "BREAK",
    "valid_values": ["IN", "OUT"]
  }
}
```
**Cause:** Provided type is not "IN" or "OUT"  
**Solution:** Use only IN (arrival) or OUT (departure)

---

### CORRECTION_WINDOW_CLOSED
```json
{
  "code": "CORRECTION_WINDOW_CLOSED",
  "message": "Cannot correct check-in (window closed)",
  "http_status": 409,
  "details": {
    "checkin_timestamp": "2026-05-27T09:15:00Z",
    "current_time": "2026-05-28T14:30:00Z",
    "age_hours": 29.25,
    "max_correction_hours": 2,
    "role": "employee",
    "action": "Contact manager for correction (managers have 48 hour window)"
  }
}
```
**Cause:** Check-in is too old to correct by employee (>2 hours). Managers can correct up to 48 hours.  
**Solution:** Contact manager if correction needed

---

## 📊 Validation Errors

### INVALID_EMAIL
```json
{
  "code": "INVALID_EMAIL",
  "message": "Email format is invalid",
  "http_status": 422,
  "details": {
    "field": "email",
    "provided": "mario@",
    "hint": "Email must include domain (e.g., mario@retail.it)"
  }
}
```
**Cause:** Email doesn't match valid format  
**Solution:** Provide valid email address

---

### INVALID_TIMESTAMP
```json
{
  "code": "INVALID_TIMESTAMP",
  "message": "Timestamp is not valid ISO 8601",
  "http_status": 422,
  "details": {
    "field": "timestamp",
    "provided": "2026-05-28 09:15:00",
    "expected_format": "2026-05-28T09:15:00Z (ISO 8601 UTC)"
  }
}
```
**Cause:** Timestamp not in ISO 8601 format  
**Solution:** Use format: `YYYY-MM-DDTHH:MM:SSZ` (example: `2026-05-28T09:15:00Z`)

---

### MISSING_REQUIRED_FIELD
```json
{
  "code": "MISSING_REQUIRED_FIELD",
  "message": "Required field is missing",
  "http_status": 422,
  "details": {
    "field": "qr_code_content",
    "type": "string",
    "example": "https://api.badge.dataxiom.it/checkin/site/site_milano_001"
  }
}
```
**Cause:** Request didn't include required field  
**Solution:** Include all required fields from API docs

---

### FIELD_TOO_LONG
```json
{
  "code": "FIELD_TOO_LONG",
  "message": "Field value exceeds maximum length",
  "http_status": 422,
  "details": {
    "field": "reason",
    "provided_length": 2050,
    "max_length": 2000
  }
}
```
**Cause:** Field value too long  
**Solution:** Reduce field length to max allowed

---

## 🔒 Authorization Errors

### INSUFFICIENT_PERMISSIONS
```json
{
  "code": "INSUFFICIENT_PERMISSIONS",
  "message": "User does not have permission for this action",
  "http_status": 403,
  "details": {
    "user_role": "employee",
    "required_role": "manager",
    "action": "approve_correction",
    "hint": "Contact manager to perform this action"
  }
}
```
**Cause:** User's role doesn't have permission  
**Solution:** Contact higher-privileged user (manager/admin)

---

### CLIENT_MISMATCH
```json
{
  "code": "CLIENT_MISMATCH",
  "message": "Cannot access data from different client",
  "http_status": 403,
  "details": {
    "user_client_id": "client_abc",
    "requested_client_id": "client_xyz",
    "action": "Access denied for security"
  }
}
```
**Cause:** User trying to access another client's data  
**Solution:** Multi-tenant isolation. Use correct credentials for target client.

---

## 🚨 Rate Limiting

### RATE_LIMIT_EXCEEDED
```json
{
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests (rate limit exceeded)",
  "http_status": 429,
  "details": {
    "limit": 100,
    "window_seconds": 60,
    "retry_after_seconds": 15,
    "headers": {
      "X-RateLimit-Limit": "100",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": "1748353815"
    }
  }
}
```
**Cause:** Made > 100 requests in 60 seconds  
**Solution:** Wait before making more requests. Use `Retry-After` header.

---

## 💾 Database/System Errors

### INTERNAL_SERVER_ERROR
```json
{
  "code": "INTERNAL_SERVER_ERROR",
  "message": "Internal server error",
  "http_status": 500,
  "details": {
    "request_id": "req_xyz789",
    "action": "Contact support with request ID"
  }
}
```
**Cause:** Unexpected server error  
**Solution:** Report error to support with `request_id` from response

---

### SERVICE_UNAVAILABLE
```json
{
  "code": "SERVICE_UNAVAILABLE",
  "message": "Service temporarily unavailable",
  "http_status": 503,
  "details": {
    "reason": "Database maintenance",
    "estimated_recovery": "2026-05-28T15:00:00Z",
    "status_page": "https://status.badge.dataxiom.it"
  }
}
```
**Cause:** Service maintenance or temporary outage  
**Solution:** Retry after estimated recovery time. Check status page.

---

## 🔍 Error Response Structure

Every error response follows this structure:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {
      "field_name": "field_value",
      "hint": "Additional helpful info"
    },
    "http_status": 400
  },
  "meta": {
    "request_id": "req_xyz789",
    "timestamp": "2026-05-28T09:15:30Z",
    "processing_ms": 45
  }
}
```

---

## 📋 Error Handling Best Practices

### For Frontend Developers

```javascript
// Handle API error
try {
  const response = await api.post('/checkin', data);
  // Success
} catch (error) {
  const errorCode = error.response?.data?.error?.code;
  
  if (errorCode === 'INVALID_QR_CODE') {
    // Show "Invalid QR code" message
  } else if (errorCode === 'CORRECTION_WINDOW_CLOSED') {
    // Show "Cannot correct (window closed)"
  } else if (error.response?.status === 401) {
    // Redirect to login
  } else if (error.response?.status === 429) {
    // Show "Too many requests, wait before retrying"
  } else {
    // Generic error handler
  }
}
```

### For Backend Developers

**Always include:**
- ✅ HTTP status code
- ✅ Error code (enum)
- ✅ Human message
- ✅ Details object (context-specific)
- ✅ request_id for debugging

**Example error response:**
```javascript
res.status(400).json({
  success: false,
  error: {
    code: 'INVALID_QR_CODE',
    message: 'QR code not found',
    details: { qr_code: 'site_xyz' },
    http_status: 400
  },
  meta: {
    request_id: generateRequestId(),
    timestamp: new Date().toISOString(),
    processing_ms: Date.now() - startTime
  }
});
```

---

## 📞 Support

**Still getting errors?**
1. Check error code above
2. Follow solution steps
3. If still stuck, contact support with `request_id`

---

**Last Updated:** 28 Maggio 2026  
**Status:** Complete ✅
