/**
 * Shared style fragments for the public demo funnel's navy-900/gold hero
 * treatment (code-review Fix 4a, Task 8 of 9) — extracted from the exact
 * duplication between TryDemoPage.jsx (Task 7) and DemoExpiredPage.jsx
 * (Task 8), which independently re-typed the same hero background and CTA
 * button styling. Kept as plain sx fragments (not a wrapper component)
 * since the two pages' hero markup otherwise differs (animation, KPI
 * teaser, form vs. a simple message + CTA) — extracting only what's
 * genuinely identical, per the review's "keep it surgical" guidance.
 *
 * Usage: spread into an MUI `sx` prop, e.g.
 *   <Box sx={{ ...demoHeroSx, minHeight: '100vh' }}>
 *   <Button sx={{ ...demoGoldButtonSx, px: 3 }}>
 */

// The hero section's outer container — navy-900 background, linen text,
// identical padding on both pages.
export const demoHeroSx = {
  bgcolor: 'var(--color-navy-900)',
  color: 'var(--color-linen)',
  py: { xs: 6, md: 10 },
  px: 2,
};

// The gold-500/navy-900 CTA button treatment shared by TryDemoPage's submit
// button and DemoExpiredPage's "Inizia una nuova demo" button.
export const demoGoldButtonSx = {
  bgcolor: 'var(--color-gold-500)',
  color: 'var(--color-navy-900)',
  fontWeight: 700,
  '&:hover': { bgcolor: 'var(--color-gold-500)', opacity: 0.9 },
};
