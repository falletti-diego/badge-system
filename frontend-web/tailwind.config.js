/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#2A2520',
        linen: '#F5F2ED',
        stone: {
          600: '#999999',
        },
      },
      fontFamily: {
        cormorant: ['Cormorant', 'serif'],
      },
    },
  },
  plugins: [],
}
