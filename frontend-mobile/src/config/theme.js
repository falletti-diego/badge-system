/**
 * Shared design tokens — mirrors the CSS custom properties in
 * frontend-mobile/mockups/badge-mobile-mockups.html (:root block).
 * Single source of truth for the mobile redesign; reused across screens.
 */

export const COLORS = {
  linen: '#F5F2ED',
  parchment: '#EDE9E2',
  bone: '#D9D4CB',
  dust: '#A89F94',
  stone: '#6B625A',
  ink: '#2A2520',
  white: '#FFFFFF',

  navy50: '#EEF2F7',
  navy200: '#8FACCC',
  navy500: '#1E3A5F',
  navy700: '#132543',
  navy900: '#0A1628',

  success: '#2D7049',
  successBg: '#EEF6F1',
  error: '#C0392B',
  errorBg: '#FDF1F1',
  warning: '#B45309',
  warningBg: '#FEF6EC',
  gold: '#C9A86C',

  scanBlue: '#5AADFF',
};

// Font family keys — must match the useFonts() keys loaded in App.jsx
export const FONTS = {
  displayLight: 'Cormorant_300Light',
  display: 'Cormorant_400Regular',
  displayMedium: 'Cormorant_500Medium',
  displayItalic: 'Cormorant_400Regular_Italic',

  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
};

export default { COLORS, FONTS };
