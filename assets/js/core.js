/* FinBlasti core utilities — loaded before app.js */
window.FinBlasti = window.FinBlasti || {};

FinBlasti.TOP_SCORE_MIN = 7.5;
FinBlasti.savedSpotIds = new Set();
FinBlasti.commentsBySpot = {};
FinBlasti.commentsLoadErrors = {};
FinBlasti.favoritesLoadError = null;

FinBlasti.currentUser = null;

FinBlasti.getStorageForToken = () => {
  if (localStorage.getItem('finblasti_token')) return localStorage;
  if (sessionStorage.getItem('finblasti_token')) return sessionStorage;
  return localStorage.getItem('finblasti_user') ? localStorage : sessionStorage;
};

FinBlasti.getToken = () =>
  localStorage.getItem('finblasti_token') || sessionStorage.getItem('finblasti_token');

FinBlasti.getStoredUser = () => {
  try {
    const storage = FinBlasti.getStorageForToken();
    const user = JSON.parse(storage.getItem('finblasti_user') || 'null');
    FinBlasti.currentUser = user;
    return user;
  } catch {
    return null;
  }
};

FinBlasti.storeSession = (token, user, remember = false) => {
  localStorage.removeItem('finblasti_token');
  localStorage.removeItem('finblasti_user');
  sessionStorage.removeItem('finblasti_token');
  sessionStorage.removeItem('finblasti_user');

  const storage = remember ? localStorage : sessionStorage;
  storage.setItem('finblasti_token', token);
  storage.setItem('finblasti_user', JSON.stringify(user));
  FinBlasti.currentUser = user;
};

FinBlasti.updateStoredUser = (user) => {
  const storage = FinBlasti.getStorageForToken();
  storage.setItem('finblasti_user', JSON.stringify(user));
  if (storage === localStorage) {
    sessionStorage.removeItem('finblasti_user');
  } else {
    localStorage.removeItem('finblasti_user');
  }
  FinBlasti.currentUser = user;
};

FinBlasti.clearSession = () => {
  localStorage.removeItem('finblasti_token');
  localStorage.removeItem('finblasti_user');
  sessionStorage.removeItem('finblasti_token');
  sessionStorage.removeItem('finblasti_user');
  FinBlasti.currentUser = null;
};

FinBlasti.apiUrl = (path) => {
  const base = (
    window.API_BASE_URL ||
    window.FINBLASTI_API_URL?.replace(/\/api\/?$/, '') ||
    'https://finblasti-backend-production.up.railway.app'
  ).replace(/\/$/, '');
  const cleanPath = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${base}/api${cleanPath}`;
};

FinBlasti.readJsonResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const preview = await response.text().catch(() => '');
    const isHtml = /<!doctype|<html/i.test(preview);
    throw new Error(
      isHtml
        ? 'Le serveur a renvoye une page HTML au lieu de JSON. Verifie l URL API de production.'
        : 'Reponse API invalide. Recharge la page ou reessaie dans un instant.'
    );
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Erreur API (${response.status})`);
  }
  return data;
};

FinBlasti.apiFetch = async (path, options = {}) => {
  const timeoutMs = options.timeoutMs || 12000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchOptions = { ...options, signal: controller.signal };
  delete fetchOptions.timeoutMs;

  try {
    const response = await fetch(FinBlasti.apiUrl(path), fetchOptions);
    return FinBlasti.readJsonResponse(response);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Le serveur met trop de temps a repondre. Reessaie dans un instant.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

FinBlasti.authHeaders = (json = true) => {
  const headers = {};
  const token = FinBlasti.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
};

FinBlasti.deriveSpotTags = (spot) => {
  const tags = new Set(Array.isArray(spot.tags) ? spot.tags : []);
  if (Number(spot.wifi) >= 7) tags.add('wifi');
  if (Number(spot.quiet) >= 7) tags.add('calme');
  if (Number(spot.comfort) >= 7) tags.add('prises');
  if (Number(spot.eco) >= 7) tags.add('eco');
  return [...tags];
};

FinBlasti.normalizeSpot = (s) => ({
  ...s,
  id: s.id ?? s._id,
  score: Number(s.score) || 0,
  wifi: Number(s.wifi) || 0,
  quiet: Number(s.quiet) || 0,
  comfort: Number(s.comfort) || 0,
  eco: Number(s.eco) || 0,
  tags: FinBlasti.deriveSpotTags(s),
  image: s.image || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=1200',
  reviewsText: s.reviewsText || [],
  badges: s.badges || ['Wi-Fi', 'Prises', 'Étudiant'],
  reviews: s.reviews || 0,
  price: s.price || 'Prix variable',
  hours: s.hours || 'Horaires non renseignés',
  address: s.address || `${s.district || ''}, ${s.city || ''}`.trim(),
  description: s.description || 'Aucune description disponible pour ce spot.'
});

FinBlasti.matchSpotNeeds = (spot, needs) => {
  if (!needs?.length) return true;
  const tags = FinBlasti.deriveSpotTags(spot);
  return needs.every((n) => tags.includes(n));
};

FinBlasti.findSpot = (spots, id) =>
  spots.find((s) => String(s.id) === String(id));

FinBlasti.getTopSpots = (spots) => {
  const sorted = [...spots].sort((a, b) => Number(b.score) - Number(a.score));
  const top = sorted.filter((s) => Number(s.score) >= FinBlasti.TOP_SCORE_MIN);
  return top.length ? top : sorted.slice(0, Math.min(10, sorted.length));
};

/** Fix GSAP leaving cards invisible on hidden pages */
FinBlasti.forceVisible = (root) => {
  if (!root) return;
  root.querySelectorAll('.reveal-ready, .spot-card, .card-hover, #rankingList > div').forEach((el) => {
    el.classList.remove('reveal-ready');
    el.style.opacity = '1';
    el.style.visibility = 'visible';
    el.style.transform = 'none';
  });
  if (window.gsap && root.children?.length) {
    gsap.set(root.children, { autoAlpha: 1, y: 0, scale: 1, clearProps: 'all' });
  }
};

FinBlasti.formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('fr-MA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
};

FinBlasti.escapeHtml = (str) => {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
};
