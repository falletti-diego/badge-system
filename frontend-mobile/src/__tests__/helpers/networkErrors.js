// Shared axios-style network error helper — request was sent but no response
// was ever received (offline, DNS failure, timeout). Matches the `!err.response`
// branch screens use to distinguish "try the cache" from "show a hard error".
function makeNetworkError() {
  const err = new Error('Network Error');
  err.isAxiosError = true;
  return err;
}

module.exports = { makeNetworkError };
