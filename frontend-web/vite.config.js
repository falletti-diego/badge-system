import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
  plugins: [
    react(),
    // Upload source maps to Sentry on production builds (only if DSN is set)
    env.VITE_SENTRY_DSN && sentryVitePlugin({
      org: env.SENTRY_ORG,
      project: env.SENTRY_PROJECT,
      authToken: env.SENTRY_AUTH_TOKEN,
      telemetry: false,
    }),
  ].filter(Boolean),
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'https://api.dataxiom.it',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Enable source maps for Sentry — hidden means not served publicly but uploaded to Sentry
    sourcemap: env.VITE_SENTRY_DSN ? 'hidden' : false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          mui: ['@mui/material', '@mui/icons-material'],
          table: ['@tanstack/react-table'],
        },
      },
    },
  },
  }
})
