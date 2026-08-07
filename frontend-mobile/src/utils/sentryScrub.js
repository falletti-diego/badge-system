const SENSITIVE_KEYS = ['authorization', 'password', 'token', 'cookie', 'x-api-key'];

function scrubObject(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      obj[key] = '[Filtered]';
    }
  }
}

export function scrubBreadcrumb(breadcrumb) {
  if (breadcrumb?.data) {
    scrubObject(breadcrumb.data);
    scrubObject(breadcrumb.data.headers);
    scrubObject(breadcrumb.data.request_headers);
  }
  return breadcrumb;
}

export function scrubEvent(event) {
  if (event?.request?.headers) scrubObject(event.request.headers);
  if (event?.request?.data) scrubObject(event.request.data);
  return event;
}
