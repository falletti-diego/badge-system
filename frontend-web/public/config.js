// Runtime configuration - loaded before the app starts
// Localhost: http://localhost:3000 (backend dev server)
// Staging: https://staging-api.dataxiom.it (hostname contains "staging")
// Production: https://api.dataxiom.it (valid Let's Encrypt cert)
window.API_CONFIG = {
  API_URL: (() => {
    const host = window.location.hostname;
    if (host === 'localhost') return 'http://localhost:3000';
    if (host.includes('staging')) return 'https://staging-api.dataxiom.it';
    return 'https://api.dataxiom.it';
  })()
};
