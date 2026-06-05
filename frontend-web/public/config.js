// Runtime configuration - loaded before the app starts
// Production: direct HTTPS to api.dataxiom.it (valid Let's Encrypt cert)
// Development (Vite): overridden to '' so vite proxy handles /api/* to localhost:3000
window.API_CONFIG = {
  API_URL: 'https://api.dataxiom.it'
};
