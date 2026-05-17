(function () {
  const host = location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  if (isLocal) {
    window.FINBLASTI_API_URL = 'http://localhost:3000/api';
  } else {
    window.FINBLASTI_API_URL = 'https://finblasti-backend-production.up.railway.app/api';
  }
})();
