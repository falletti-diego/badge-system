// Zero-pad a number to 2 digits: 1 → '01'
export const pad = (n) => String(n).padStart(2, '0');

// Normalize any date value to a 'YYYY-MM-DD' string.
// Handles ISO strings ('2026-06-15T00:00:00') and plain dates ('2026-06-15').
// Using string slicing avoids Date() timezone issues where 'YYYY-MM-DD' is
// parsed as UTC midnight and can shift to the previous day in UTC+ timezones.
export const toDateStr = (val) => String(val ?? '').slice(0, 10);

// Check if dateStr falls within [start, end] inclusive.
// All values are normalized to 'YYYY-MM-DD' strings before comparison so that
// timezone offsets from the server cannot cause off-by-one errors on boundaries.
export const inDateRange = (dateStr, start, end) => {
  const d = toDateStr(dateStr);
  return d >= toDateStr(start) && d <= toDateStr(end);
};
