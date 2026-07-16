/**
 * extractApiErrorMessage (code-review Fix 4b, Task 8 of 9)
 *
 * Shared axios-error → user-facing Italian message mapping. Extracted from
 * three independently hand-rolled copies of the same generic tail
 * (TryDemoPage.jsx, DemoContactModal.jsx, DemoBanner.jsx — Tasks 7-8):
 * prefer the backend's own `message`, then a Zod-style `details[0].message`,
 * then a dedicated network-error message, then a generic fallback.
 *
 * Endpoint-specific error-CODE branching (e.g. TryDemoPage's
 * RATE_LIMIT_EXCEEDED / TOO_MANY_ACTIVE_DEMOS, which always show a fixed
 * message regardless of what the backend sent) is NOT part of this shared
 * tail — that logic is specific to POST /demo/start and isn't duplicated
 * anywhere else, so it stays inline in TryDemoPage.jsx and should check
 * `data?.error` itself before falling back to this utility.
 *
 * @param {*} err - the error caught from an axios call (apiClient.post/get)
 * @param {string} [fallback] - message shown when nothing more specific is
 *   found; callers with a more specific default (e.g. TryDemoPage's
 *   EMAIL_ALREADY_REGISTERED copy) can override it.
 * @returns {string}
 */
export function extractApiErrorMessage(err, fallback = 'Qualcosa è andato storto — riprova tra un momento.') {
  const data = err?.response?.data;

  if (data?.message) {
    return data.message;
  }
  if (data?.details?.length) {
    return data.details[0].message;
  }
  if (!err?.response && err?.request) {
    // axios sets err.request truthy for any dispatched request, even one
    // that got a real HTTP response — so this must be gated on the
    // *absence* of err.response, otherwise a response with a minimal/odd
    // body (e.g. a bare 404 with no message/details) gets misreported as a
    // network connectivity problem.
    return 'Errore di rete — controlla la connessione e riprova.';
  }
  return fallback;
}
