// Runtime configuration - loaded before the app starts
// Empty string = same origin. /api/* is proxied to EC2:
//   Production (Netlify): via netlify.toml [[redirects]]
//   Development (Vite): via proxy in vite.config.js
window.API_CONFIG = {
  API_URL: ''
};
