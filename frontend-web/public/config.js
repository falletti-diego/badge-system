// Runtime configuration - loaded before the app starts
// Localhost: http://localhost:3000 (backend dev server)
// Production: https://api.dataxiom.it (valid Let's Encrypt cert)
window.API_CONFIG = {
  API_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : 'https://api.dataxiom.it'
};
