/* FinBlasti core utilities — loaded before app.js */
window.FinBlasti = window.FinBlasti || {};

FinBlasti.TOP_SCORE_MIN = 7.5;
FinBlasti.savedSpotIds = new Set();
FinBlasti.commentsBySpot = {};

FinBlasti.getToken = () => localStorage.getItem('finblasti_token');

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
