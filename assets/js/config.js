(function () {
  const host = location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  window.API_BASE_URL = isLocal
    ? 'http://localhost:3000'
    : 'https://finblasti-backend-production.up.railway.app';

  window.FINBLASTI_API_URL = `${window.API_BASE_URL}/api`;
})();
