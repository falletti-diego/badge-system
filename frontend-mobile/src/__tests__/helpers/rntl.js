// Shared RNTL (React Native Testing Library) test helpers.
//
// Extracted from LoginScreen.test.jsx / MyPresencesScreen.test.jsx /
// MyScheduleScreen.test.jsx, which each duplicated this idiom.
// Those three files are left untouched (same "don't churn prior work"
// boundary applied to networkErrors.js) — new tests should require this file.

/**
 * `jest.mock('../services/X', () => ({...}))` factories are sometimes read
 * back by `require('../services/X')` as-is, and sometimes end up nested
 * under `.default` depending on the real module's own export shape (CJS vs
 * ESM-via-Babel interop). Pass the already-`require()`'d module in and get
 * back whichever shape actually holds the mocked functions.
 */
function interopDefault(mod) {
  return mod.default || mod;
}

module.exports = { interopDefault };
