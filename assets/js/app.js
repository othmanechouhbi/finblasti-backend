const API_BASE_URL = window.API_BASE_URL || 'https://finblasti-backend-production.up.railway.app';
const API_URL = `${API_BASE_URL.replace(/\/$/, '')}/api`;
let apiReviews = [];

// Tableau des spots (on va le remplir depuis l'API)
let spots = [];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasGSAP() {
  return Boolean(window.gsap);
}

function decorateMotionTargets(scope = document) {
  scope.querySelectorAll('button, .badge, .city-chip, .theme-option, .language-option').forEach(el => {
    el.classList.add('magnetic-hover');
  });

  scope.querySelectorAll(
    '.bg-white.dark\\:bg-slate-900, .dark\\:bg-slate-900, aside > div, form, #detailContent > div > div > div'
  ).forEach(el => {
    if (!el.closest('nav') && !el.classList.contains('card-hover')) {
      el.classList.add('soft-panel');
    }
  });
}

function animatePageIn(page) {
  if (!page || reduceMotion || !hasGSAP()) return;

  gsap.fromTo(
    page,
    { autoAlpha: 0, y: 16 },
    { autoAlpha: 1, y: 0, duration: 0.48, ease: 'power3.out', clearProps: 'opacity,visibility,transform' }
  );

  gsap.fromTo(
    page.querySelectorAll('h1, h2, .quick-filter, .card-hover, aside, form, #rankingList > div, #reviewsList > div'),
    { autoAlpha: 0, y: 18 },
    { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.055, ease: 'power3.out', delay: 0.08, clearProps: 'opacity,visibility,transform' }
  );

  if (page.id === 'page-home') {
    gsap.fromTo('.hero-visual', { autoAlpha: 0, y: 26, rotate: -1.5 }, { autoAlpha: 1, y: 0, rotate: 0, duration: 0.7, ease: 'power3.out', delay: 0.12, clearProps: 'opacity,visibility,transform' });
  }
}

function refreshScrollReveals(scope = document) {
  decorateMotionTargets(scope);
  if (reduceMotion || !hasGSAP() || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.normalizeScroll(false);
  const targets = gsap.utils.toArray(scope.querySelectorAll('section:not(#page-discover):not(#page-top) .metric-card, aside > div, .hero-visual'));

  targets.forEach(el => {
    if (el.dataset.revealBound) return;
    el.dataset.revealBound = 'true';
    el.classList.add('reveal-ready');

    gsap.to(el, {
      autoAlpha: 1,
      y: 0,
      duration: 0.65,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 88%',
        once: true
      }
    });
  });

  const heroVisual = document.querySelector('.hero-visual');
  if (heroVisual && !heroVisual.dataset.parallaxBound) {
    heroVisual.dataset.parallaxBound = 'true';
    gsap.to(heroVisual, {
      yPercent: 5,
      ease: 'none',
      scrollTrigger: {
        trigger: heroVisual,
        start: 'top bottom',
        end: 'bottom top',
        scrub: 0.6
      }
    });
  }
}

function animateDynamicList(container) {
  if (!container) return;
  FinBlasti.forceVisible(container);
  if (reduceMotion || !hasGSAP()) return;
  gsap.fromTo(
    container.children,
    { autoAlpha: 0, y: 10 },
    { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.025, ease: 'power2.out', clearProps: 'all' }
  );
}

function getConnectedUser() {
  try {
    return JSON.parse(localStorage.getItem('finblasti_user'));
  } catch {
    return null;
  }
}

function updateAuthUI() {
  const user = getConnectedUser();
  const authButton = document.getElementById('authButton');

  if (!authButton) return;

  if (user && user.name) {
    authButton.innerHTML = `<i class="fa-solid fa-user-check mr-1"></i> ${user.name}`;
    authButton.dataset.route = 'profile';
  } else {
    authButton.innerHTML = 'Connexion';
    authButton.dataset.route = 'login';
  }
}

function logoutUser() {
  localStorage.removeItem('finblasti_token');
  localStorage.removeItem('finblasti_user');
  updateAuthUI();
  showToast('Déconnexion', 'Tu es maintenant déconnecté.');
  setRoute('home');
}
document.addEventListener('click', (e) => {
  const authMenu = document.getElementById('authMenu');

  if (!authMenu) return;

  if (
    !e.target.closest('#authMenu') &&
    !e.target.closest('#authButton')
  ) {
    authMenu.classList.add('hidden');
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  document.getElementById('authMenu')?.classList.add('hidden');
  logoutUser();
});

document.getElementById('editNameBtn')?.addEventListener('click', () => {
  const user = getConnectedUser();

  if (!user) return;

  const newName = prompt('Entre ton nouveau nom :', user.name || '');

  if (!newName || !newName.trim()) return;

  user.name = newName.trim();

  localStorage.setItem('finblasti_user', JSON.stringify(user));

  updateAuthUI();

  document.getElementById('authMenu')?.classList.add('hidden');

  showToast('Nom modifié', 'Ton nom a été modifié sur ce navigateur.');
});

// Fonction pour charger les spots depuis l'API
function renderLoadingCards() {
  const skeleton = Array.from({ length: 3 }, () => `
    <div class="rounded-[1.75rem] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div class="h-52 loading-skeleton"></div>
      <div class="p-6 space-y-3">
        <div class="h-4 w-24 rounded-full loading-skeleton"></div>
        <div class="h-6 w-2/3 rounded-full loading-skeleton"></div>
        <div class="h-4 w-full rounded-full loading-skeleton"></div>
        <div class="h-10 w-full rounded-full loading-skeleton mt-5"></div>
      </div>
    </div>
  `).join('');

  const home = document.getElementById('homeCards');
  const discover = document.getElementById('discoverCards');
  if (home) home.innerHTML = skeleton;
  if (discover) discover.innerHTML = skeleton;
}

async function chargerReviewsDepuisAPI() {
  try {
    const data = await FinBlasti.apiFetch('/reviews');
    apiReviews = Array.isArray(data) ? data : [];
    return apiReviews;
  } catch (err) {
    console.warn('Avis API indisponibles:', err);
    return [];
  }
}

function hideAppLoader() {
  const loader = document.getElementById('app-loader');
  if (!loader || reduceMotion) {
    loader?.classList.add('is-hidden');
    return;
  }
  if (hasGSAP()) {
    gsap.to(loader, {
      autoAlpha: 0,
      duration: 0.45,
      ease: 'power2.out',
      onComplete: () => loader.classList.add('is-hidden')
    });
  } else {
    loader.classList.add('is-hidden');
  }
}

async function chargerSpotsDepuisAPI() {
  try {
    console.log('📡 Chargement des spots depuis l\'API...');
    const donnees = await FinBlasti.apiFetch('/spots');
    
    if (Array.isArray(donnees) && donnees.length > 0) {
      console.log('✅ ' + donnees.length + ' spots chargés depuis l\'API');
      spots = donnees.map((s) => FinBlasti.normalizeSpot({ ...s, id: s.id || s._id }));
    } else {
      console.log('⚠️ Aucun spot trouvé, utilisation des données d\'exemple');
      // Données d'exemple si la BD est vide
      spots = [
        FinBlasti.normalizeSpot({
          id: 'le-hub-cafe',
          name: 'Le Hub Café',
          city: 'Casablanca',
          district: 'Maarif',
          type: 'Café',
          score: 9.8,
          eco: 8.5,
          price: 'Prix étudiant',
          tags: ['wifi', 'prises', 'student'],
          badges: ['🚀 Wi-Fi 100Mbps', '🔌 Prises +++', '🎓 -20% Étudiants'],
          image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=1200',
          quiet: 8.9,
          comfort: 9.1,
          wifi: 9.8,
          reviews: 124,
          description: 'Un café moderne, bien placé, avec un Wi-Fi rapide et plusieurs prises.',
          hours: '08:00 - 22:30',
          address: 'Maarif, Casablanca',
          reviewsText: [
            { user: 'Sara M.', text: 'Très bon Wi-Fi, tables confortables.', rating: 5 },
            { user: 'Yassine A.', text: 'Bon spot pour travailler le matin.', rating: 5 }
          ]
        })
      ];
    }
    
    return spots;
  } catch (error) {
    console.error('❌ Erreur lors du chargement:', error);
    showToast('Erreur API', error.message || 'Impossible de charger les spots.', 'error');
    spots = [];
    return spots;
  }
}

// Charger les spots au démarrage
renderLoadingCards();
Promise.allSettled([chargerSpotsDepuisAPI(), chargerReviewsDepuisAPI(), FinBlasti.loadFavorites()]).then(() => {
  updateAuthUI();
  renderHomeCards();
  renderTrending();
  renderDiscover();
  renderRanking();
  renderReviews();
}).finally(() => {
  hideAppLoader();
});

    const pages = document.querySelectorAll('.page');
    const routeButtons = document.querySelectorAll('[data-route]');
    const mobileMenu = document.getElementById('mobileMenu');

    function updateActiveNavigation(route) {
      document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.route === route);
      });
    }

    function setRoute(route, addToHistory = true) {
        if (route === 'add' && !localStorage.getItem('finblasti_token')) {
    showToast('Connexion requise', 'Tu dois te connecter avant d’ajouter un spot.');
    route = 'login';
  }
  pages.forEach(page => page.classList.remove('active', 'fade-in'));

  const target = document.getElementById(`page-${route}`);

  if (target) {
    target.classList.add('active');
    updateActiveNavigation(route);
    setTimeout(() => target.classList.add('fade-in'), 5);
    animatePageIn(target);
    refreshScrollReveals(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (addToHistory) {
      history.pushState({ route }, '', `#${route}`);
    }

    if (typeof applyLanguage === 'function') applyLanguage();

    if (route === 'discover') {
      renderDiscover();
      requestAnimationFrame(() => FinBlasti.forceVisible(target));
    } else if (route === 'top') {
      renderRanking();
      requestAnimationFrame(() => FinBlasti.forceVisible(target));
    } else if (route === 'saved') {
      renderSaved();
      requestAnimationFrame(() => FinBlasti.forceVisible(target));
    } else if (route === 'community') {
      renderReviews();
    }
  }

  mobileMenu.classList.remove('open');
}
window.addEventListener('popstate', (event) => {
  const route = event.state?.route || 'home';
  setRoute(route, false);
});

window.addEventListener('scroll', () => {
      const nav = document.querySelector('nav.glass-nav');
      if (nav) nav.classList.toggle('nav-scrolled', window.scrollY > 12);
    }, { passive: true });

    window.addEventListener('load', () => {
  const routeFromHash = window.location.hash.replace('#', '') || 'home';
  setRoute(routeFromHash, false);
});
    routeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const route = btn.dataset.route;

        if (btn.id === 'authButton' && getConnectedUser()) {
          e.preventDefault();
          e.stopPropagation();

          const authMenu = document.getElementById('authMenu');
          if (authMenu) authMenu.classList.toggle('hidden');
          return;
        }

        if (route) setRoute(route);
      });
    });


    document.getElementById('mobileToggle').addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
    });
document.addEventListener('click', (e) => {

  const image = e.target.closest('.spot-image-click');

  if (!image) return;

  const viewer = document.getElementById('imageViewer');
  const viewerImage = document.getElementById('viewerImage');

  viewerImage.src = image.dataset.fullImage || image.src;

  viewer.classList.add('open');
});

document.getElementById('closeImageViewer')?.addEventListener('click', () => {
  document.getElementById('imageViewer')?.classList.remove('open');
});

document.getElementById('imageViewer')?.addEventListener('click', (e) => {
  if (e.target.id === 'imageViewer') {
    document.getElementById('imageViewer')?.classList.remove('open');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('imageViewer')?.classList.remove('open');
  }
});
    function renderStars(rating) {
      const full = Math.round(rating);
      return Array.from({ length: 5 }, (_, i) => `<i class="fa-solid fa-star ${i < full ? 'text-yellow-400' : 'text-slate-300 dark:text-slate-700'}"></i>`).join('');
    }

    function spotCard(spot, compact = false) {
      const reviewCount = spot.reviewCount ?? spot.reviews ?? 0;
      return `
        <article class="spot-card spot-card-premium card-hover relative group">
          <div class="absolute top-4 left-4 z-10">${FinBlasti.saveButtonHtml(spot.id)}</div>
          <div class="absolute top-4 right-4 z-10">
            <div class="${spot.score >= 9.5 ? 'finscore-gradient' : 'bg-slate-900 dark:bg-white dark:text-slate-900'} text-white font-bold text-lg px-3 py-1 rounded-xl shadow-lg flex items-center gap-1">
              ${spot.score >= 9.5 ? '<i class="fa-solid fa-bolt text-xs text-yellow-300"></i>' : ''} ${spot.score}
            </div>
          </div>

          <div class="${compact ? 'h-48' : 'h-56'} image-slot bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <img 
  src="${spot.image}" 
  alt="${spot.name}"
  loading="lazy"
  data-full-image="${spot.image}"
  class="spot-image-click w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-zoom-in"
>
          </div>

          <div class="p-6">
            <div class="flex items-center justify-between gap-3 mb-3">
              <span class="text-xs font-extrabold text-primary bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1.5 rounded-full">${spot.type || 'Spot'}</span>
              <span class="text-xs font-bold text-slate-500 dark:text-slate-400"><i class="fa-solid fa-coins mr-1 text-amber-500"></i>${spot.price || 'Prix variable'}</span>
            </div>
            <div class="flex justify-between items-start mb-2 gap-3">
              <h3 class="text-xl font-bold text-slate-900 dark:text-white">${spot.name}</h3>
              <span class="${spot.eco >= 8 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'} text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1 shrink-0">
                <i class="fa-solid fa-leaf"></i> ${spot.eco}
              </span>
            </div>

            <p class="text-slate-500 dark:text-slate-400 text-sm mb-4">
              <i class="fa-solid fa-location-dot mr-1"></i> ${spot.district}, ${spot.city}
            </p>

            <div class="flex flex-wrap gap-2 mb-6">
            ${(spot.badges || ['🚀 Wi-Fi', '🔌 Prises', '🎓 Étudiant']).map(b => `<span class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold px-2.5 py-1 rounded-md">${b}</span>`).join('')}
            </div>

            <div class="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
              <div class="flex items-center gap-2">
                <span class="text-sm text-slate-500 dark:text-slate-400"><i class="fa-solid fa-comment-dots mr-1"></i>${reviewCount} avis</span>
              </div>
              <button data-detail="${spot.id}" class="detail-btn text-primary font-semibold text-sm hover:underline">Détails</button><button type="button" data-comment-spot="${spot.id}" class="ml-2 text-xs font-bold text-slate-500 hover:text-primary">Commenter</button>
            </div>
          </div>
        </article>
      `;
    }

    // Event delegation — save, comment, details
    document.addEventListener('click', (e) => {
      const saveBtn = e.target.closest('[data-save-spot]');
      if (saveBtn) {
        e.preventDefault();
        e.stopPropagation();
        FinBlasti.toggleFavorite(saveBtn.dataset.saveSpot);
        return;
      }
      const commentBtn = e.target.closest('[data-comment-spot]');
      if (commentBtn) {
        e.preventDefault();
        openDetail(commentBtn.dataset.commentSpot);
        return;
      }
      const btn = e.target.closest('.detail-btn');
      if (btn && btn.dataset.detail) openDetail(btn.dataset.detail);
    });

    function attachDetailButtons() {
      // kept for backwards compat - delegation handles everything
    }

    function refreshSaveButtons(root = document) {
      root.querySelectorAll('[data-save-spot]').forEach((btn) => {
        FinBlasti.updateSaveButton(btn, btn.dataset.saveSpot);
      });
    }

    
    function renderSaved() {
      const grid = document.getElementById('savedCards');
      if (!grid) return;
      if (!FinBlasti.getToken()) {
        grid.innerHTML = emptyState('Connecte-toi pour voir tes spots enregistrés.');
        return;
      }
      const saved = spots.filter((s) => FinBlasti.isSaved(s.id));
      grid.innerHTML = saved.length
        ? saved.map((s) => spotCard(s, true)).join('')
        : emptyState('Tu n\'as pas encore enregistré de spot. Utilise l\'icône signet sur une carte.');
      FinBlasti.forceVisible(grid);
      animateDynamicList(grid);
      refreshSaveButtons(grid);
      if (typeof applyLanguage === 'function') applyLanguage();
    }

    function renderTrending() {
      const rail = document.getElementById('trendingRail');
      if (!rail) return;
      const trending = [...spots].sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 8);
      rail.innerHTML = trending.map(s => spotCard(s, true)).join('') || emptyState('Aucun spot tendance pour le moment.');
      refreshSaveButtons(rail);
      animateDynamicList(rail);
      if (typeof applyLanguage === 'function') applyLanguage();
    }

    function renderHomeCards(city = 'all') {
      const container = document.getElementById('homeCards');
      const filtered = city === 'all' ? spots.slice(0, 3) : spots.filter(s => s.city === city);
      container.innerHTML = filtered.map(s => spotCard(s)).join('') || emptyState('Aucun spot trouvé pour cette ville.');
      attachDetailButtons();
      refreshSaveButtons(container);
      animateDynamicList(container);
      if (typeof applyLanguage === 'function') applyLanguage();
    }

    function emptyState(text) {
      return `<div class="col-span-full spot-card-premium p-10 text-center">
        <div class="empty-state-art mb-5" data-ai-slot="empty-state" aria-hidden="true"></div>
        <p class="text-slate-600 dark:text-slate-300 font-semibold">${text}</p>
      </div>`;
    }

    document.querySelectorAll('.city-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.city-chip').forEach(c => c.classList.remove('chip-active'));
        chip.classList.add('chip-active');
        renderHomeCards(chip.dataset.city);
      });
    });

    function getSelectedNeeds() {
      return Array.from(document.querySelectorAll('.need-filter:checked')).map(c => c.value);
    }

    let scoreSortDesc = true;

    function renderDiscover() {
      const city = document.getElementById('cityFilter').value;
      const type = document.getElementById('typeFilter').value;
      const query = document.getElementById('discoverSearch').value.trim().toLowerCase();
      const needs = getSelectedNeeds();

      let result = spots.filter(s => {
        const matchCity = city === 'all' || s.city === city;
        const matchType = type === 'all' || s.type === type;
        const matchQuery = !query || `${s.name} ${s.city} ${s.district} ${s.type}`.toLowerCase().includes(query);
        const matchNeeds = FinBlasti.matchSpotNeeds(s, needs);
        return matchCity && matchType && matchQuery && matchNeeds;
      });

      result.sort((a, b) => scoreSortDesc ? b.score - a.score : a.score - b.score);

      const container = document.getElementById('discoverCards');
      const countEl = document.getElementById('discoverCount');
      if (countEl) {
        countEl.textContent = result.length
          ? `${result.length} spot${result.length > 1 ? 's' : ''} trouvé${result.length > 1 ? 's' : ''}`
          : 'Aucun spot ne correspond — réinitialise les filtres pour tout afficher.';
      }
      container.innerHTML = result.map(s => spotCard(s, true)).join('') || emptyState('Aucun résultat. Essaie « Réinitialiser / Tout afficher ».');
      attachDetailButtons();
      refreshSaveButtons(container);
      animateDynamicList(container);
      if (typeof applyLanguage === 'function') applyLanguage();
    }

    ['cityFilter', 'typeFilter', 'discoverSearch'].forEach(id => {
      document.getElementById(id).addEventListener('input', renderDiscover);
    });

    document.querySelectorAll('.need-filter').forEach(c => c.addEventListener('change', renderDiscover));

    document.getElementById('resetFilters').addEventListener('click', () => {
      document.getElementById('cityFilter').value = 'all';
      document.getElementById('typeFilter').value = 'all';
      document.getElementById('discoverSearch').value = '';
      document.querySelectorAll('.need-filter').forEach(c => c.checked = false);
      renderDiscover();
    });

    document.getElementById('sortButton').addEventListener('click', () => {
      scoreSortDesc = !scoreSortDesc;
      document.getElementById('sortButton').innerHTML = `<i class="fa-solid fa-arrow-down-wide-short mr-2"></i>${scoreSortDesc ? 'Score' : 'Score inversé'}`;
      renderDiscover();
    });

    function renderRanking() {
      const topSpots = FinBlasti.getTopSpots(spots);
      const el = document.getElementById('rankingList');
      if (!topSpots.length) {
        el.innerHTML = emptyState('Aucun top spot pour le moment. Découvre tous les lieux disponibles.');
        FinBlasti.forceVisible(el);
        return;
      }
      el.innerHTML = topSpots.map((s, index) => `
        <div class="flex flex-col md:flex-row md:items-center gap-4 p-5 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors card-hover">
          <div class="w-12 h-12 rounded-2xl ${index < 3 ? 'finscore-gradient text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'} flex items-center justify-center font-extrabold text-lg">#${index + 1}</div>
          <img src="${s.image}" alt="${s.name}" class="w-full md:w-28 h-24 rounded-2xl object-cover">
          <div class="flex-1">
            <h3 class="font-extrabold text-lg text-slate-900 dark:text-white">${s.name}</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">${s.type} · ${s.district}, ${s.city}</p>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <div class="text-center"><p class="text-2xl font-extrabold">${s.score}</p><p class="text-xs text-slate-400">FinScore</p></div>
            ${FinBlasti.saveButtonHtml(s.id)}
            <button data-detail="${s.id}" class="detail-btn rounded-full bg-primary text-white px-5 py-2.5 font-bold">Voir</button>
          </div>
        </div>
      `).join('');
      refreshSaveButtons(el);
      FinBlasti.forceVisible(el);
      animateDynamicList(el);
      if (typeof applyLanguage === 'function') applyLanguage();
    }

    function renderReviews() {
      const fromApi = apiReviews.map(r => {
        const spot = spots.find(s => String(s.id) === String(r.spot_id));
        return {
          user: r.user_name || 'Utilisateur',
          text: r.text,
          rating: Number(r.rating) || 5,
          spot: spot?.name || 'Spot',
          city: spot?.city || ''
        };
      });
      const fromSpots = spots.flatMap(s => (s.reviewsText || []).map(r => ({ ...r, spot: s.name, city: s.city })));
      const reviews = fromApi.length ? fromApi : fromSpots;
      const reviewsEl = document.getElementById('reviewsList');
      if (!reviewsEl) return;
      reviewsEl.innerHTML = reviews.length ? reviews.map((r, i) => `
        <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6">
          <div class="flex items-start gap-4">
            <img src="https://i.pravatar.cc/100?img=${i + 24}" class="w-12 h-12 rounded-full" alt="">
            <div class="flex-1">
              <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <div>
                  <p class="font-extrabold text-slate-900 dark:text-white">${r.user}</p>
                  <p class="text-sm text-slate-500 dark:text-slate-400">${r.spot} · ${r.city}</p>
                </div>
                <div>${renderStars(r.rating)}</div>
              </div>
              <p class="text-slate-600 dark:text-slate-300 mt-4 leading-relaxed">${r.text}</p>
            </div>
          </div>
        </div>
      `).join('') : emptyState('Aucun avis disponible pour le moment.');
      animateDynamicList(reviewsEl);
      if (typeof applyLanguage === 'function') applyLanguage();
    }

    function openDetail(id) {
      const s = FinBlasti.findSpot(spots, id);
      if (!s) return;

      document.getElementById('detailContent').innerHTML = `
        <button data-route="discover" class="text-primary font-semibold mb-5 inline-flex items-center"><i class="fa-solid fa-arrow-left mr-2"></i>Retour aux spots</button>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2">
            <div class="rounded-[2rem] overflow-hidden border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div class="image-slot">
              <img 
  src="${s.image}" 
  alt="${s.name}"
  data-full-image="${s.image}"
  class="spot-image-click w-full h-[360px] object-cover cursor-zoom-in"
>
              </div>
              <div class="p-6 md:p-8">
                <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
                  <div>
                    <p class="text-primary font-bold">${s.type}</p>
                    <h1 class="text-4xl font-extrabold text-slate-900 dark:text-white mt-2">${s.name}</h1>
                    <p class="text-slate-500 dark:text-slate-400 mt-3"><i class="fa-solid fa-location-dot mr-2"></i>${s.address}</p>
                  </div>
                  <div class="finscore-gradient text-white rounded-3xl p-5 min-w-32 text-center shadow-xl">
                    <p class="text-4xl font-extrabold">${s.score}</p>
                    <p class="text-sm font-semibold opacity-90">FinScore</p>
                  </div>
                </div>

                <p class="text-slate-600 dark:text-slate-300 leading-relaxed mt-6">${s.description}</p>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                  <div class="rounded-2xl bg-slate-50 dark:bg-slate-950 p-4 border border-slate-100 dark:border-slate-800">
                    <p class="text-sm text-slate-500 dark:text-slate-400">Wi-Fi</p>
                    <p class="text-2xl font-extrabold">${s.wifi}/10</p>
                  </div>
                  <div class="rounded-2xl bg-slate-50 dark:bg-slate-950 p-4 border border-slate-100 dark:border-slate-800">
                    <p class="text-sm text-slate-500 dark:text-slate-400">Calme</p>
                    <p class="text-2xl font-extrabold">${s.quiet}/10</p>
                  </div>
                  <div class="rounded-2xl bg-slate-50 dark:bg-slate-950 p-4 border border-slate-100 dark:border-slate-800">
                    <p class="text-sm text-slate-500 dark:text-slate-400">Confort</p>
                    <p class="text-2xl font-extrabold">${s.comfort}/10</p>
                  </div>
                  <div class="rounded-2xl bg-slate-50 dark:bg-slate-950 p-4 border border-slate-100 dark:border-slate-800">
                    <p class="text-sm text-slate-500 dark:text-slate-400">Éco-score</p>
                    <p class="text-2xl font-extrabold">${s.eco}/10</p>
                  </div>
                </div>

                ${FinBlasti.commentsSectionHtml(s.id)}
                <h2 class="text-2xl font-extrabold text-slate-900 dark:text-white mt-10 mb-4">Avis récents</h2>
                <div class="space-y-4">
                  ${(s.reviewsText || []).map(r => `
                    <div class="rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-5">
                      <div class="flex justify-between gap-4">
                        <p class="font-bold">${r.user}</p>
                        <div>${renderStars(r.rating)}</div>
                      </div>
                      <p class="text-slate-600 dark:text-slate-300 mt-3">${r.text}</p>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <aside class="space-y-5">
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800">
              <h2 class="font-extrabold text-xl text-slate-900 dark:text-white mb-4">Infos pratiques</h2>
              <div class="space-y-4 text-sm">
                <p><i class="fa-solid fa-clock text-primary w-6"></i> ${s.hours}</p>
                <p><i class="fa-solid fa-money-bill text-primary w-6"></i> ${s.price}</p>
                <p><i class="fa-solid fa-comment text-primary w-6"></i> ${s.reviews} avis</p>
                <p><i class="fa-solid fa-map-location-dot text-primary w-6"></i> ${s.address}</p>
              </div>
              <button id="saveFavorite" data-save-spot="${s.id}" type="button" class="save-spot-btn mt-6 w-full rounded-full bg-primary text-white py-3 font-bold hover:bg-primaryHover"><i class="fa-regular fa-bookmark mr-2"></i><span>Enregistrer</span></button>
            </div>

            <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800">
              <h2 class="font-extrabold text-xl text-slate-900 dark:text-white mb-4">Tags</h2>
              <div class="flex flex-wrap gap-2">
                ${(s.badges || ['🚀 Wi-Fi', '🔌 Prises', '🎓 Étudiant']).map(b => `<span class="bg-slate-100 dark:bg-slate-800 text-sm font-semibold px-3 py-2 rounded-xl">${b}</span>`).join('')}
              </div>
            </div>

            <div class="bg-emerald-50 dark:bg-emerald-950/40 rounded-3xl p-6 border border-emerald-100 dark:border-emerald-900">
              <h2 class="font-extrabold text-xl text-slate-900 dark:text-white">Éco-score</h2>
              <p class="text-sm text-slate-600 dark:text-slate-300 mt-2">Score indicatif basé sur les pratiques visibles du lieu.</p>
              <div class="mt-4 h-3 rounded-full bg-emerald-100 dark:bg-emerald-900 overflow-hidden">
                <div class="h-full eco-gradient rounded-full" style="width:${s.eco * 10}%"></div>
              </div>
            </div>
          </aside>
        </div>
      `;

      
      const saveBtn = document.getElementById('saveFavorite');
      FinBlasti.updateSaveButton(saveBtn, s.id);
      FinBlasti.bindCommentsSection(s.id);
      document.getElementById('detailContent').querySelectorAll('[data-route]').forEach((b) => {
        b.addEventListener('click', () => setRoute(b.dataset.route));
      });
      refreshScrollReveals(document.getElementById('detailContent'));
      if (typeof applyLanguage === 'function') applyLanguage();
      setRoute('detail');
    }

   function showToast(title, text, type = 'success') {

const toastTitle = document.getElementById('toastTitle');
const toastText = document.getElementById('toastText');

toastTitle.textContent = title;

// empêcher la répétition
if (
  !text ||
  text.trim().toLowerCase() === title.trim().toLowerCase()
) {
  toastText.classList.add('hidden');
  toastText.textContent = '';
} else {
  toastText.classList.remove('hidden');
  toastText.textContent = text;
}

  const iconBox = document.getElementById('toastIconBox');
  const icon = document.getElementById('toastIcon');

  if (type === 'error') {

    iconBox.className =
      'w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-rose-500 text-white flex items-center justify-center mb-4 shadow-lg';

    icon.className = 'fa-solid fa-xmark text-2xl';

  } else {

    iconBox.className =
      'w-12 h-12 rounded-2xl finscore-gradient text-white flex items-center justify-center mb-4 shadow-lg';

    icon.className = 'fa-solid fa-check text-2xl';

  }

  document.getElementById('toastModal').classList.add('open');
}

    document.getElementById('closeToast').addEventListener('click', () => {
      document.getElementById('toastModal').classList.remove('open');
    });

    // ── Villes & Quartiers du Maroc ──────────────────────────────────────────
    const VILLES_QUARTIERS = {
      // ── Grandes villes ────────────────────────────────────────────────────
      "Casablanca":   ["Maârif","Gauthier","Racine","Bourgogne","Anfa","Ain Diab","Sidi Belyout","Centre-ville","Habous","Mers Sultan","Derb Sultan","Hay Mohammadi","Ain Sebaâ","Roches Noires","Belvédère","Palmier","Oasis","Polo","Californie","Sidi Maârouf","Hay Hassani","Oulfa","Lissasfa","Sbata","Sidi Othmane","Ben M'Sick","Moulay Rachid","Bernoussi","Sidi Bernoussi","Aïn Chock","Errahma"],
      "Rabat":        ["Agdal","Hay Riad","Souissi","Hassan","Centre-ville","Médina","Océan","Akkari","Yacoub El Mansour","Hay El Fath","Hay Nahda","Takaddoum","Aviation","Les Orangers","Diour Jamaa","Ambassadeurs","Al Irfane","Hay Al Massira"],
      "Marrakech":    ["Guéliz","Hivernage","Médina","Ménara","Sidi Ghanem","Daoudiate","Massira","Targa","Semlalia","Amerchich","Sidi Youssef Ben Ali","Mhamid","Hay Charaf","Hay Al Massar","Palmeraie","Agdal","Route de Casablanca","Route d'Ourika"],
      "Fès":          ["Fès El Bali","Fès Jdid","Ville Nouvelle","Agdal","Narjiss","Saâda","Bensouda","Zouagha","Aïn Kadous","Sais","Hay Lalla Soukaina","Montfleuri","Dokkarat","Hay Anas","Hay Adarissa","Oued Fès","Ben Debbab"],
      "Tanger":       ["Centre-ville","Médina","Malabata","Iberia","Marshan","Boubana","Dradeb","Branes","Mesnana","Mghogha","Val Fleuri","Souani","Castilla","Aouama","Achakar","Route de Rabat","Tanja Balia","Tanja El Balia"],
      "Agadir":       ["Talborjt","Haut Founty","Founty","Dakhla","Salam","Cité Suisse","Charaf","Hay Mohammadi","Al Houda","Tilila","Bensergao","Anza","Tikiouine","Amsernat","Illigh","Najah","Port","Centre-ville"],
      "Meknès":       ["Hamria","Ville Nouvelle","Médina","Toulal","Marjane","Zitoune","Sidi Bouzekri","Borj Moulay Omar","Bassatine","Riad","Hay Salam","El Menzeh","Wislane","Ain Slougui","Sidi Said"],
      "Oujda":        ["Centre-ville","Lazaret","Al Qods","Hay El Fath","Hay Salam","Sidi Yahya","Boudir","Andalous","Isly","Al Massira","El Hikma","Hay Ennajd","Route de Jerada","Université","Médina"],
      "Kénitra":      ["Maamora","Ville Haute","Médina","Bir Rami","Oulad Oujih","La Cigogne","Saknia","Mimosas","Val Fleuri","Atlas","Haddada","Maghreb Arabi","Ismailia","Ouled Berjal"],
      "Tétouan":      ["Médina","Ensanche","M'hanech","Touilaa","Saniat Rmel","Martil proche","Taboula","Wilaya","Dersa","Korrat Sbaa","Touabel","Jamaa Mezouak","Coelma","Boussafou"],
      "Mohammedia":   ["Centre-ville","Parc","La Siesta","Mansouria proche","Riad Salam","Wafa","Nassim","Al Alia","El Hassania","Hay Chabab","Hay Falah","Hay El Massira","Hay Al Amal","Kasbah","Port","Plage","Bd Hassan II","Bd Palestine","Sablettes"],
      "Salé":         ["Bab Lamrissa","Médina","Bettana","Tabriquet","Hay Salam","Laayayda","Sidi Moussa","Karia","Hay Chmaou","Said Hajji","Sala Al Jadida","Technopolis","Oulja","Hssaine"],
      "Témara":       ["Centre-ville","Wifaq","Massira","Harhoura","Val d'Or","Guich Loudaya","Abbadi","Nahda","Maghreb Arabi","Al Mansour Dahbi","Al Firdaous","Skikina"],
      "El Jadida":    ["Centre-ville","Cité Portugaise","Sidi Bouzid","Najd","Saada","El Qods","Al Matar","Mouilha","Hay Essalam","Hay Al Amal","Californie","Plateaux"],
      "Safi":         ["Médina","Plateau","Sidi Bouzid","Kaouki","Biada","Hay Mohammadi","Anas","Jenan","Bouregba","Saada","Lalla Hnia Hamria","Quartier Industriel"],
      "Nador":        ["Centre-ville","El Kindi","Hay Al Matar","Hay El Khattabi","Hay Arrid","Laari Cheikh","Taouima","Boubarg","Ouled Mimoun","Ihamouten","Selouane proche"],
      "Béni Mellal":  ["Centre-ville","Médina","Atlas","Oulad Hamdane","Hay Salam","Hay Riad","Takadoum","Ouled Ayad","Mghila","El Massira","Sidi Jaber","Hay Al Amal"],
      "Khouribga":    ["Centre-ville","Hay El Qods","Nahda","Massira","Hay Salam","Al Fath","Hay Riyad","OCP","Hay Hassania","Hay Farah","Quartier Industriel"],
      "Settat":       ["Centre-ville","Hay Salam","Hay Amal","Smaala","Miftah El Kheir","Mabrouka","Farah","Saada","Hay Al Massira","Hay Lissasfa","Quartier Administratif"],
      "Laâyoune":     ["Centre-ville","Al Wahda","Al Qods","Hay Al Massira","Hay Essalam","Moulay Rachid","25 Mars","Erraha","Hay Al Fath","Hay Linaach"],
      "Dakhla":       ["Centre-ville","Hay Al Massira","Hay Rahma","Hay Salam","Hay Al Qods","Hay Al Kassam","Hay Essalam","Hay Ennahda","Port","Corniche"],
      // ── Autres villes par ordre alphabétique ─────────────────────────────
      "Al Hoceima":   ["Centre-ville","Mirador","Sidi Abid","Calabonita","Tala Youssef proche","Izemouren","Hay Riad","Corniche","Sabadia"],
      "Azemmour":     ["Médina","Centre-ville","Hay Nahda","Hay Salam","Hay El Massira","Sidi Ali","Route d'El Jadida"],
      "Berkane":      ["Centre-ville","Hay Al Qods","Hay Salam","Hay Hassani","Hay Moulay Rachid","Hay El Massira","Sidi Slimane","Laâyoune-Berkane"],
      "Berrechid":    ["Centre-ville","Hay Hassani","Hay Salam","Hay Farah","Hay Al Fath","Hay Al Amal","Hay Yasmine","Quartier Industriel"],
      "Bouznika":     ["Centre-ville","Plage","Hay Riad","Hay Salam","Hay Al Amal","Hay Al Massira","Bahia","Route de Benslimane"],
      "Chefchaouen":  ["Médina","Outa Hammam","Souika","Rif Al Andalous","Ain Haouzi","Loubar","Bab Souk","Bab Taza","Sidi Abdelhamid"],
      "Essaouira":    ["Médina","Mellah","Borj","Centre-ville","Quartier Industriel","Ghazoua proche","Diabat proche","Azlef","El Borj"],
      "Fnideq":       ["Centre-ville","Bab Sebta","Hay Al Massira","Hay Salam","Hay Riad","Hay Al Amal","Route de M'diq"],
      "Guelmim":      ["Centre-ville","Hay Rahma","Hay Salam","Hay Al Qods","Hay Al Massira","Hay Ennahda","Hay El Fath","Quartier Administratif"],
      "Ifrane":       ["Centre-ville","Hay Riad","Hay Atlas","Vittel","Tizguite","Al Akhawayn","Zaouia","Marché"],
      "Khemisset":    ["Centre-ville","Hay Salam","Hay Al Massira","Hay Amal","Hay Nahda","Hay Riyad","Sidi Allal","Quartier Administratif"],
      "Ksar El Kebir":["Centre-ville","Médina","Hay Salam","Hay Al Massira","Hay Ennahda","Hay Al Amal","Hay Andalous","Oulad Hmaid"],
      "Larache":      ["Centre-ville","Médina","Hay Jadid","Hay Salam","Hay Maghreb Jadid","Hay Al Massira","Hay Essadaka","Port","Balcon Atlantique"],
      "Ouarzazate":   ["Centre-ville","Taourirt","Hay Al Massira","Hay Salam","Hay Mohammadi","Tarmigte proche","Tabounte","Hay El Wahda"],
      "Sidi Bennour": ["Centre-ville","Hay Salam","Hay Al Massira","Hay Amal","Hay Nahda","Hay Al Qods","Quartier Administratif"],
      "Sidi Kacem":   ["Centre-ville","Hay Salam","Hay El Massira","Hay Al Qods","Hay Nahda","Hay Amal","Gare","Quartier Industriel"],
      "Taroudant":    ["Médina","Centre-ville","Bab El Kasbah","Bab Targhount","Hay Salam","Hay Mohammadi","Hay Al Massira","Sidi Belkass"],
      "Taza":         ["Médina","Ville Nouvelle","Hay Salam","Hay Al Qods","Hay Massira","Hay Taza Al Oulia","Bab Jamaa","Jiarine","Quartier Administratif"],
      "Tiznit":       ["Médina","Centre-ville","Hay Al Massira","Hay Salam","Hay Idzakri","Hay El Fath","Hay Al Amal","Bab Oulad Jerrar"],
      "Youssoufia":   ["Centre-ville","Hay Salam","Hay Al Massira","Hay Mohammadi","Hay Farah","Hay Amal","Hay Nahda","Quartier OCP"],
    };

    const TOUTES_VILLES = Object.keys(VILLES_QUARTIERS).sort();

    function populateVilleSelect(selectEl) {
      selectEl.innerHTML = '<option value="">Choisir une ville...</option>' +
        TOUTES_VILLES.map(v => `<option value="${v}">${v}</option>`).join('');
    }

    function populateQuartierSelect(quartierEl, ville) {
      const quartiers = VILLES_QUARTIERS[ville] || [];
      quartierEl.innerHTML = '<option value="">Choisir un quartier...</option>' +
        quartiers.map(q => `<option value="${q}">${q}</option>`).join('');
      quartierEl.disabled = quartiers.length === 0;
    }

    // Init add form dropdowns
    const addVilleSelect = document.getElementById('addVilleSelect');
    const addQuartierSelect = document.getElementById('addQuartierSelect');
    if (addVilleSelect && addQuartierSelect) {
      populateVilleSelect(addVilleSelect);
      populateQuartierSelect(addQuartierSelect, '');
      addVilleSelect.addEventListener('change', () => {
        populateQuartierSelect(addQuartierSelect, addVilleSelect.value);
      });
    }

    document.getElementById('addSpotForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const token = localStorage.getItem('finblasti_token');

      if (!token) {
        showToast('Connexion requise', 'Connecte-toi avant d’ajouter un spot.');
        setRoute('login');
        return;
      }

      const formData = new FormData(e.target);

      try {
        const result = await FinBlasti.apiFetch('/spots', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });

        if (result) {
          showToast('Spot ajouté !', 'Votre proposition avec photo a été sauvegardée.');
          e.target.reset();

          const quartierSelect = document.getElementById('addQuartierSelect');
          if (quartierSelect) populateQuartierSelect(quartierSelect, '');

          spots = await chargerSpotsDepuisAPI();
          renderHomeCards();
          renderDiscover();
          renderRanking();
          renderReviews();

          setRoute('discover');
        }
      } catch (error) {
        console.error('Erreur:', error);
        if (String(error.message || '').includes('401') || String(error.message || '').includes('Session')) {
          localStorage.removeItem('finblasti_token');
          localStorage.removeItem('finblasti_user');
          showToast('Session expirée', 'Reconnecte-toi pour ajouter un spot.', 'error');
          setRoute('login');
        } else {
          showToast('Erreur', error.message || 'Impossible d’ajouter le spot', 'error');
        }
      }
    });

    document.getElementById('sendCodeBtn').addEventListener('click', async () => {
      const email = document.getElementById('loginEmail').value.trim();

      if (!email) {
        showToast('Email requis', 'Entre ton email pour recevoir le code.');
        return;
      }

      try {
        await FinBlasti.apiFetch('/auth/request-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        document.getElementById('codeBox').classList.remove('hidden');
        showToast('Code envoyé', 'Vérifie ton email et entre le code reçu.');
      } catch (error) {
        showToast('Erreur', error.message, 'error');
      }
    });

    document.getElementById('verifyCodeBtn').addEventListener('click', async () => {
      const name = document.getElementById('loginName').value.trim();
      const email = document.getElementById('loginEmail').value.trim();
      const code = document.getElementById('loginCode').value.trim();

      if (!email || !code) {
        showToast('Code requis', 'Entre le code reçu par email.');
        return;
      }

      try {
        const result = await FinBlasti.apiFetch('/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, code })
        });

        if (result?.token) {
localStorage.setItem('finblasti_token', result.token);
localStorage.setItem('finblasti_user', JSON.stringify(result.user));

updateAuthUI();
await FinBlasti.loadFavorites();

showToast('Connexion réussie', 'Tu peux maintenant ajouter des spots avec photo.');
setRoute('add');
        }
      } catch (error) {
        showToast('Erreur', error.message, 'error');
      }
    });

    document.getElementById('searchButton').addEventListener('click', () => {
      const value = document.getElementById('mainSearch').value.trim();
      setRoute('discover');
      document.getElementById('discoverSearch').value = value;
      renderDiscover();
    });

    document.querySelectorAll('.quick-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        setRoute('discover');
        document.querySelectorAll('.need-filter').forEach(c => c.checked = c.value === btn.dataset.filter);
        renderDiscover();
      });
    });


    // Language: FR / AR / EN / ES
    const I18N_META = {
      fr: { label: 'FR', title: 'FinBlasti | Trouve ton spot de travail idéal', dir: 'ltr', htmlLang: 'fr' },
      ar: { label: 'AR', title: 'فين بلاصتي | لقى البلاصة المناسبة للخدمة والقراية', dir: 'rtl', htmlLang: 'ar' },
      en: { label: 'EN', title: 'FinBlasti | Find your ideal work spot', dir: 'ltr', htmlLang: 'en' },
      es: { label: 'ES', title: 'FinBlasti | Encuentra tu lugar ideal para trabajar', dir: 'ltr', htmlLang: 'es' }
    };

    const I18N = {
      "Découvrir": {
        ar: "استكشف",
        en: "Discover",
        es: "Descubrir"
      },
      "Top Spots": {
        ar: "أفضل الأماكن",
        en: "Top Spots",
        es: "Mejores sitios"
      },
      "Communauté": {
        ar: "المجتمع",
        en: "Community",
        es: "Comunidad"
      },
      "Concept": {
        ar: "الفكرة",
        en: "Concept",
        es: "Concepto"
      },
      "Connexion": {
        ar: "تسجيل الدخول",
        en: "Login",
        es: "Iniciar sesión"
      },
      "Ajouter un spot": {
        ar: "إضافة مكان",
        en: "Add a spot",
        es: "Añadir un sitio"
      },
      "+50 nouveaux spots ajoutés cette semaine": {
        ar: "+50 مكان جديد تمت إضافته هذا الأسبوع",
        en: "+50 new spots added this week",
        es: "+50 nuevos sitios añadidos esta semana"
      },
      "Trouve ton spot de travail": {
        ar: "لقى البلاصة المناسبة",
        en: "Find your ideal",
        es: "Encuentra tu lugar"
      },
      "idéal au Maroc.": {
        ar: "للخدمة والقراية في المغرب.",
        en: "work spot in Morocco.",
        es: "ideal para trabajar en Marruecos."
      },
      "Découvre, note et partage les meilleurs cafés, bibliothèques et espaces de coworking selon le Wi-Fi, le calme, les prises, le confort et l’éco-score.": {
        ar: "اكتشف وقيّم وشارك أفضل المقاهي والمكتبات ومساحات العمل حسب الويفي، الهدوء، المقابس، الراحة والتقييم البيئي.",
        en: "Discover, rate and share the best cafés, libraries and coworking spaces based on Wi-Fi, quietness, plugs, comfort and eco-score.",
        es: "Descubre, valora y comparte los mejores cafés, bibliotecas y espacios de coworking según Wi-Fi, tranquilidad, enchufes, comodidad y eco-score."
      },
      "Chercher": {
        ar: "بحث",
        en: "Search",
        es: "Buscar"
      },
      "🚀 Wi-Fi Rapide": {
        ar: "🚀 ويفي سريع",
        en: "🚀 Fast Wi-Fi",
        es: "🚀 Wi-Fi rápido"
      },
      "🔌 Prises dispo": {
        ar: "🔌 مقابس متوفرة",
        en: "🔌 Available plugs",
        es: "🔌 Enchufes disponibles"
      },
      "🤫 Calme absolu": {
        ar: "🤫 هدوء تام",
        en: "🤫 Very quiet",
        es: "🤫 Muy tranquilo"
      },
      "🌿 Éco-Friendly": {
        ar: "🌿 صديق للبيئة",
        en: "🌿 Eco-friendly",
        es: "🌿 Eco-friendly"
      },
      "🎓 Prix Étudiant": {
        ar: "🎓 ثمن مناسب للطلبة",
        en: "🎓 Student price",
        es: "🎓 Precio estudiante"
      },
      "spots référencés": {
        ar: "مكان مسجل",
        en: "listed spots",
        es: "sitios registrados"
      },
      "note moyenne": {
        ar: "متوسط التقييم",
        en: "average rating",
        es: "valoración media"
      },
      "couvertes au Maroc": {
        ar: "مدن مغطاة في المغرب",
        en: "covered cities in Morocco",
        es: "ciudades cubiertas en Marruecos"
      },
      "avis étudiants": {
        ar: "تقييم من الطلبة",
        en: "student reviews",
        es: "reseñas de estudiantes"
      },
      "Top spots à la une": {
        ar: "أماكن مختارة",
        en: "Featured top spots",
        es: "Sitios destacados"
      },
      "Les endroits les mieux notés par la communauté FinBlasti.": {
        ar: "الأماكن الأعلى تقييما من طرف مجتمع FinBlasti.",
        en: "The best-rated places by the FinBlasti community.",
        es: "Los lugares mejor valorados por la comunidad FinBlasti."
      },
      "Tous": {
        ar: "الكل",
        en: "All",
        es: "Todos"
      },
      "Voir détails": {
        ar: "عرض التفاصيل",
        en: "View details",
        es: "Ver detalles"
      },
      "Voir": {
        ar: "عرض",
        en: "View",
        es: "Ver"
      },
      "avis": {
        ar: "تقييم",
        en: "reviews",
        es: "reseñas"
      },
      "Comment ça marche ?": {
        ar: "كيف يعمل؟",
        en: "How does it work?",
        es: "¿Cómo funciona?"
      },
      "Un score simple pour choisir rapidement.": {
        ar: "تقييم بسيط لاختيار المكان بسرعة.",
        en: "A simple score to choose quickly.",
        es: "Una puntuación simple para elegir rápido."
      },
      "Chaque lieu reçoit un FinScore basé sur les critères utiles pour étudier ou travailler : Wi-Fi, calme, prises, confort, prix, accessibilité et dimension environnementale.": {
        ar: "كل مكان يحصل على FinScore حسب معايير مهمة للدراسة أو العمل: الويفي، الهدوء، المقابس، الراحة، الثمن، سهولة الوصول والجانب البيئي.",
        en: "Each place gets a FinScore based on useful work and study criteria: Wi-Fi, quietness, plugs, comfort, price, accessibility and environmental dimension.",
        es: "Cada lugar recibe un FinScore basado en criterios útiles para estudiar o trabajar: Wi-Fi, tranquilidad, enchufes, comodidad, precio, accesibilidad y dimensión ambiental."
      },
      "1. Cherche": {
        ar: "1. ابحث",
        en: "1. Search",
        es: "1. Busca"
      },
      "Ville, quartier ou critère : Wi-Fi, calme, budget étudiant.": {
        ar: "مدينة، حي أو معيار: ويفي، هدوء، ميزانية طالب.",
        en: "City, district or criterion: Wi-Fi, quietness, student budget.",
        es: "Ciudad, barrio o criterio: Wi-Fi, tranquilidad, presupuesto estudiante."
      },
      "2. Compare": {
        ar: "2. قارن",
        en: "2. Compare",
        es: "2. Compara"
      },
      "Lis les avis et compare les notes par besoin.": {
        ar: "اقرأ الآراء وقارن التقييمات حسب احتياجك.",
        en: "Read reviews and compare ratings by need.",
        es: "Lee reseñas y compara valoraciones según tus necesidades."
      },
      "3. Va au spot": {
        ar: "3. اذهب للمكان",
        en: "3. Go to the spot",
        es: "3. Ve al sitio"
      },
      "Consulte la localisation, les horaires et les infos pratiques.": {
        ar: "اطلع على الموقع، أوقات العمل والمعلومات العملية.",
        en: "Check the location, opening hours and practical information.",
        es: "Consulta la ubicación, los horarios y la información práctica."
      },
      "4. Note": {
        ar: "4. قيّم",
        en: "4. Rate",
        es: "4. Valora"
      },
      "Ajoute ton retour pour aider les autres étudiants.": {
        ar: "أضف تجربتك لمساعدة الطلبة الآخرين.",
        en: "Add your feedback to help other students.",
        es: "Añade tu opinión para ayudar a otros estudiantes."
      },
      "Retour": {
        ar: "رجوع",
        en: "Back",
        es: "Volver"
      },
      "Découvrir les spots": {
        ar: "استكشاف الأماكن",
        en: "Discover spots",
        es: "Descubrir sitios"
      },
      "Filtre selon ta ville, ton budget et ton style de travail.": {
        ar: "استعمل الفلاتر حسب المدينة، الميزانية وطريقة العمل.",
        en: "Filter by city, budget and work style.",
        es: "Filtra por ciudad, presupuesto y estilo de trabajo."
      },
      "Filtres": {
        ar: "الفلاتر",
        en: "Filters",
        es: "Filtros"
      },
      "Ville": {
        ar: "المدينة",
        en: "City",
        es: "Ciudad"
      },
      "Toutes les villes": {
        ar: "كل المدن",
        en: "All cities",
        es: "Todas las ciudades"
      },
      "Type": {
        ar: "النوع",
        en: "Type",
        es: "Tipo"
      },
      "Tous": {
        ar: "الكل",
        en: "All",
        es: "Todos"
      },
      "Café": {
        ar: "مقهى",
        en: "Café",
        es: "Café"
      },
      "Coworking": {
        ar: "فضاء عمل مشترك",
        en: "Coworking",
        es: "Coworking"
      },
      "Bibliothèque": {
        ar: "مكتبة",
        en: "Library",
        es: "Biblioteca"
      },
      "Espace public": {
        ar: "فضاء عمومي",
        en: "Public space",
        es: "Espacio público"
      },
      "Besoin principal": {
        ar: "الحاجة الرئيسية",
        en: "Main need",
        es: "Necesidad principal"
      },
      "Wi-Fi rapide": {
        ar: "ويفي سريع",
        en: "Fast Wi-Fi",
        es: "Wi-Fi rápido"
      },
      "Prises électriques": {
        ar: "مقابس كهربائية",
        en: "Power plugs",
        es: "Enchufes"
      },
      "Calme": {
        ar: "الهدوء",
        en: "Quiet",
        es: "Tranquilidad"
      },
      "Éco-friendly": {
        ar: "صديق للبيئة",
        en: "Eco-friendly",
        es: "Eco-friendly"
      },
      "Réinitialiser": {
        ar: "إعادة الضبط",
        en: "Reset",
        es: "Restablecer"
      },
      "Score": {
        ar: "التقييم",
        en: "Score",
        es: "Puntuación"
      },
      "Score inversé": {
        ar: "ترتيب عكسي",
        en: "Reverse score",
        es: "Puntuación inversa"
      },
      "Aucun résultat. Essaie de modifier les filtres.": {
        ar: "لا توجد نتائج. جرب تغيير الفلاتر.",
        en: "No results. Try changing the filters.",
        es: "Sin resultados. Prueba a cambiar los filtros."
      },
      "Aucun spot trouvé pour cette ville.": {
        ar: "لا يوجد أي مكان لهذه المدينة.",
        en: "No spots found for this city.",
        es: "No se encontraron sitios para esta ciudad."
      },
      "Classement Top Spots": {
        ar: "ترتيب أفضل الأماكن",
        en: "Top spots ranking",
        es: "Ranking de mejores sitios"
      },
      "Le ranking des meilleurs endroits pour étudier ou travailler.": {
        ar: "ترتيب أفضل الأماكن للدراسة أو العمل.",
        en: "The ranking of the best places to study or work.",
        es: "El ranking de los mejores lugares para estudiar o trabajar."
      },
      "Proposer un spot": {
        ar: "اقترح مكانا",
        en: "Suggest a spot",
        es: "Proponer un sitio"
      },
      "FinScore": {
        ar: "FinScore",
        en: "FinScore",
        es: "FinScore"
      },
      "Communauté FinBlasti": {
        ar: "مجتمع FinBlasti",
        en: "FinBlasti Community",
        es: "Comunidad FinBlasti"
      },
      "Les derniers avis utiles partagés par les étudiants, freelances et télétravailleurs.": {
        ar: "آخر الآراء المفيدة التي شاركها الطلبة والفريلانسرز والعاملون عن بعد.",
        en: "The latest useful reviews shared by students, freelancers and remote workers.",
        es: "Las últimas reseñas útiles compartidas por estudiantes, freelancers y teletrabajadores."
      },
      "Top contributeurs": {
        ar: "أفضل المساهمين",
        en: "Top contributors",
        es: "Principales colaboradores"
      },
      "Tu connais un bon spot ?": {
        ar: "كتعرف شي بلاصة مزيانة؟",
        en: "Know a good spot?",
        es: "¿Conoces un buen sitio?"
      },
      "Ajoute-le pour aider les étudiants de ta ville.": {
        ar: "أضفه لمساعدة طلبة مدينتك.",
        en: "Add it to help students in your city.",
        es: "Añádelo para ayudar a los estudiantes de tu ciudad."
      },
      "Ajouter maintenant": {
        ar: "أضف الآن",
        en: "Add now",
        es: "Añadir ahora"
      },
      "Retour aux spots": {
        ar: "الرجوع للأماكن",
        en: "Back to spots",
        es: "Volver a los sitios"
      },
      "Avis récents": {
        ar: "آخر الآراء",
        en: "Recent reviews",
        es: "Reseñas recientes"
      },
      "Infos pratiques": {
        ar: "معلومات عملية",
        en: "Practical information",
        es: "Información práctica"
      },
      "Enregistrer": {
        ar: "حفظ",
        en: "Save",
        es: "Guardar"
      },
      "Tags": {
        ar: "وسوم",
        en: "Tags",
        es: "Etiquetas"
      },
      "Éco-score": {
        ar: "التقييم البيئي",
        en: "Eco-score",
        es: "Eco-score"
      },
      "Score indicatif basé sur les pratiques visibles du lieu.": {
        ar: "تقييم تقريبي مبني على الممارسات الظاهرة في المكان.",
        en: "Indicative score based on the place’s visible practices.",
        es: "Puntuación indicativa basada en las prácticas visibles del lugar."
      },
      "Ajouter un spot": {
        ar: "إضافة مكان",
        en: "Add a spot",
        es: "Añadir un sitio"
      },
      "Ajoute un nouveau spot. Tu dois être connecté pour envoyer une proposition avec photo.": {
        ar: "هذا النموذج مجرد واجهة أمامية. لاحقا يمكنك ربطه بقاعدة بيانات حقيقية.",
        en: "This form is a front-end mockup. Later, you can connect it to a real database.",
        es: "Este formulario es una maqueta front-end. Más adelante podrás conectarlo a una base de datos real."
      },
      "Nom du lieu": {
        ar: "اسم المكان",
        en: "Place name",
        es: "Nombre del lugar"
      },
      "Ville": {
        ar: "المدينة",
        en: "City",
        es: "Ciudad"
      },
      "Quartier": {
        ar: "الحي",
        en: "District",
        es: "Barrio"
      },
      "Wi-Fi /10": {
        ar: "الويفي /10",
        en: "Wi-Fi /10",
        es: "Wi-Fi /10"
      },
      "Calme /10": {
        ar: "الهدوء /10",
        en: "Quietness /10",
        es: "Tranquilidad /10"
      },
      "Éco-score /10": {
        ar: "التقييم البيئي /10",
        en: "Eco-score /10",
        es: "Eco-score /10"
      },
      "Commentaire": {
        ar: "تعليق",
        en: "Comment",
        es: "Comentario"
      },
      "Annuler": {
        ar: "إلغاء",
        en: "Cancel",
        es: "Cancelar"
      },
      "Envoyer la proposition": {
        ar: "إرسال الاقتراح",
        en: "Submit suggestion",
        es: "Enviar propuesta"
      },
      "Connecte-toi pour noter les spots et enregistrer tes favoris.": {
        ar: "سجل الدخول لتقييم الأماكن وحفظ المفضلة.",
        en: "Log in to rate spots and save your favorites.",
        es: "Inicia sesión para valorar sitios y guardar tus favoritos."
      },
      "Email": {
        ar: "البريد الإلكتروني",
        en: "Email",
        es: "Correo electrónico"
      },
      "Mot de passe": {
        ar: "كلمة المرور",
        en: "Password",
        es: "Contraseña"
      },
      "Se connecter": {
        ar: "تسجيل الدخول",
        en: "Log in",
        es: "Iniciar sesión"
      },
      "Pas encore de compte ?": {
        ar: "ليس لديك حساب بعد؟",
        en: "No account yet?",
        es: "¿Aún no tienes cuenta?"
      },
      "Commencer par ajouter un spot": {
        ar: "ابدأ بإضافة مكان",
        en: "Start by adding a spot",
        es: "Empieza añadiendo un sitio"
      },
      "Le concept FinBlasti": {
        ar: "فكرة FinBlasti",
        en: "The FinBlasti concept",
        es: "El concepto FinBlasti"
      },
      "FinBlasti est une plateforme marocaine pensée pour les étudiants, freelances et personnes en télétravail. L’objectif est simple : trouver rapidement un lieu adapté au travail selon des critères concrets.": {
        ar: "FinBlasti منصة مغربية موجهة للطلبة، الفريلانسرز والعاملين عن بعد. الهدف بسيط: إيجاد مكان مناسب للعمل بسرعة حسب معايير واضحة.",
        en: "FinBlasti is a Moroccan platform designed for students, freelancers and remote workers. The goal is simple: quickly find a suitable place to work using concrete criteria.",
        es: "FinBlasti es una plataforma marroquí pensada para estudiantes, freelancers y teletrabajadores. El objetivo es simple: encontrar rápidamente un lugar adecuado para trabajar con criterios concretos."
      },
      "Critères pratiques": {
        ar: "معايير عملية",
        en: "Practical criteria",
        es: "Criterios prácticos"
      },
      "Wi-Fi, calme, prises, confort, prix, horaires, accessibilité.": {
        ar: "الويفي، الهدوء، المقابس، الراحة، الثمن، الأوقات وسهولة الوصول.",
        en: "Wi-Fi, quietness, plugs, comfort, price, hours and accessibility.",
        es: "Wi-Fi, tranquilidad, enchufes, comodidad, precio, horarios y accesibilidad."
      },
      "Dimension environnementale": {
        ar: "البعد البيئي",
        en: "Environmental dimension",
        es: "Dimensión ambiental"
      },
      "Éco-score basé sur les pratiques visibles : déchets, eau, énergie, produits réutilisables.": {
        ar: "تقييم بيئي حسب الممارسات الظاهرة: النفايات، الماء، الطاقة والمواد القابلة لإعادة الاستعمال.",
        en: "Eco-score based on visible practices: waste, water, energy and reusable products.",
        es: "Eco-score basado en prácticas visibles: residuos, agua, energía y productos reutilizables."
      },
      "Les notes et avis sont construits à partir des retours utilisateurs.": {
        ar: "التقييمات والآراء مبنية على تجارب المستخدمين.",
        en: "Ratings and reviews are built from user feedback.",
        es: "Las valoraciones y reseñas se construyen a partir de la experiencia de los usuarios."
      },
      "Prochaine étape": {
        ar: "الخطوة التالية",
        en: "Next step",
        es: "Siguiente paso"
      },
      "Connecter ce front-end avec une base de données pour stocker les lieux, avis et utilisateurs.": {
        ar: "ربط هذه الواجهة بقاعدة بيانات لتخزين الأماكن، الآراء والمستخدمين.",
        en: "Connect this front-end to a database to store places, reviews and users.",
        es: "Conectar este front-end con una base de datos para guardar lugares, reseñas y usuarios."
      },
      "Trouver, comparer et noter les spots de travail au Maroc.": {
        ar: "البحث، المقارنة وتقييم أماكن العمل والدراسة في المغرب.",
        en: "Find, compare and rate work spots in Morocco.",
        es: "Encontrar, comparar y valorar lugares de trabajo en Marruecos."
      },
      "Action réalisée": {
        ar: "تمت العملية",
        en: "Action completed",
        es: "Acción realizada"
      },
      "Message": {
        ar: "رسالة",
        en: "Message",
        es: "Mensaje"
      },
      "OK": {
        ar: "حسنا",
        en: "OK",
        es: "OK"
      },
      "Spot enregistré": {
        ar: "تم حفظ المكان",
        en: "Spot saved",
        es: "Sitio guardado"
      },
      "Proposition envoyée": {
        ar: "تم إرسال الاقتراح",
        en: "Suggestion submitted",
        es: "Propuesta enviada"
      },
      "Le spot a été enregistré dans la maquette. La prochaine étape sera de le sauvegarder dans une base de données.": {
        ar: "تم تسجيل المكان في الماكيت. الخطوة القادمة هي حفظه في قاعدة بيانات.",
        en: "The spot has been saved in the mockup. The next step is to store it in a database.",
        es: "El sitio se guardó en la maqueta. El siguiente paso será guardarlo en una base de datos."
      },
      "Connexion simulée": {
        ar: "تسجيل دخول تجريبي",
        en: "Simulated login",
        es: "Inicio de sesión simulado"
      },
      "Cette partie est prête visuellement. Il faudra ensuite ajouter l’authentification réelle.": {
        ar: "هذا الجزء جاهز بصريا. لاحقا يجب إضافة نظام تسجيل دخول حقيقي.",
        en: "This part is visually ready. Real authentication should be added later.",
        es: "Esta parte está lista visualmente. Después habrá que añadir autenticación real."
      },
      "Mode clair": {
        ar: "الوضع الفاتح",
        en: "Light mode",
        es: "Modo claro"
      },
      "Mode nuit": {
        ar: "الوضع الليلي",
        en: "Night mode",
        es: "Modo noche"
      },
      "Auto appareil": {
        ar: "حسب الجهاز",
        en: "Device auto",
        es: "Auto dispositivo"
      }
    };

    const I18N_PLACEHOLDERS = {
      "Casablanca, Mohammedia, Rabat...": {
        ar: "الدار البيضاء، المحمدية، الرباط...",
        en: "Casablanca, Mohammedia, Rabat...",
        es: "Casablanca, Mohammedia, Rabat..."
      },
      "Rechercher un spot...": {
        ar: "ابحث عن مكان...",
        en: "Search for a spot...",
        es: "Buscar un sitio..."
      },
      "Ex : Le Hub Café": {
        ar: "مثال: Le Hub Café",
        en: "Ex: Le Hub Café",
        es: "Ej.: Le Hub Café"
      },
      "Casablanca, Rabat...": {
        ar: "الدار البيضاء، الرباط...",
        en: "Casablanca, Rabat...",
        es: "Casablanca, Rabat..."
      },
      "Maarif, Agdal, Parc...": {
        ar: "المعاريف، أكدال، بارك...",
        en: "Maarif, Agdal, Park...",
        es: "Maarif, Agdal, Parc..."
      },
      "Expliquer pourquoi ce spot est utile pour étudier ou travailler...": {
        ar: "اشرح لماذا هذا المكان مناسب للدراسة أو العمل...",
        en: "Explain why this spot is useful for studying or working...",
        es: "Explica por qué este sitio es útil para estudiar o trabajar..."
      }
    };

    function tr(text, lang = localStorage.getItem('finblasti-language') || 'fr') {
      if (lang === 'fr') return text;
      return I18N[text]?.[lang] || text;
    }

    function applyLanguage(lang) {
      const selected = lang || localStorage.getItem('finblasti-language') || 'fr';
      const meta = I18N_META[selected] || I18N_META.fr;

      localStorage.setItem('finblasti-language', selected);
      document.documentElement.lang = meta.htmlLang;
      document.documentElement.dir = meta.dir;
      document.title = meta.title;

      const label = document.getElementById('currentLanguageLabel');
      if (label) label.textContent = meta.label;

      document.querySelectorAll('body *').forEach(el => {
        if (['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName)) return;

        el.childNodes.forEach(node => {
          if (node.nodeType !== Node.TEXT_NODE) return;

          if (!node._i18nOriginal) node._i18nOriginal = node.textContent;
          const original = node._i18nOriginal;
          const trimmed = original.trim();

          if (!trimmed || !I18N[trimmed]) return;

          const leading = original.match(/^\s*/)[0];
          const trailing = original.match(/\s*$/)[0];
          node.textContent = leading + tr(trimmed, selected) + trailing;
        });

        if (el.placeholder) {
          if (!el.dataset.i18nPlaceholderOriginal) el.dataset.i18nPlaceholderOriginal = el.placeholder;
          const originalPlaceholder = el.dataset.i18nPlaceholderOriginal;
          el.placeholder = selected === 'fr'
            ? originalPlaceholder
            : (I18N_PLACEHOLDERS[originalPlaceholder]?.[selected] || originalPlaceholder);
        }

        if (el.getAttribute('aria-label')) {
          if (!el.dataset.i18nAriaOriginal) el.dataset.i18nAriaOriginal = el.getAttribute('aria-label');
          const originalAria = el.dataset.i18nAriaOriginal;
          el.setAttribute('aria-label', selected === 'fr' ? originalAria : (I18N[originalAria]?.[selected] || originalAria));
        }
      });

      document.querySelectorAll('.language-option').forEach(opt => {
        const active = opt.dataset.language === selected;
        opt.classList.toggle('bg-slate-100', active);
        opt.classList.toggle('dark:bg-slate-800', active);
      });
    }

    const languageButton = document.getElementById('languageButton');
    const languageMenu = document.getElementById('languageMenu');

    languageButton.addEventListener('click', () => {
      languageMenu.classList.toggle('hidden');
    });

    document.querySelectorAll('.language-option').forEach(btn => {
      btn.addEventListener('click', () => {
        applyLanguage(btn.dataset.language);
        languageMenu.classList.add('hidden');
      });
    });

    document.addEventListener('click', (e) => {
      if (!languageButton.contains(e.target) && !languageMenu.contains(e.target)) {
        languageMenu.classList.add('hidden');
      }
    });

    // Theme: light / dark / auto device
    const root = document.documentElement;
    const themeButton = document.getElementById('themeButton');
    const themeMenu = document.getElementById('themeMenu');
    const themeIcon = document.getElementById('themeIcon');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

    function applyTheme(theme) {
      const selected = theme || localStorage.getItem('finblasti-theme') || 'auto';
      const shouldDark = selected === 'dark' || (selected === 'auto' && prefersDark.matches);

      root.classList.toggle('dark', shouldDark);
      localStorage.setItem('finblasti-theme', selected);

      if (selected === 'light') themeIcon.className = 'fa-solid fa-sun';
      if (selected === 'dark') themeIcon.className = 'fa-solid fa-moon';
      if (selected === 'auto') themeIcon.className = 'fa-solid fa-circle-half-stroke';

      document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('bg-slate-100', opt.dataset.theme === selected);
        opt.classList.toggle('dark:bg-slate-800', opt.dataset.theme === selected);
      });
    }

    themeButton.addEventListener('click', () => {
      themeMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!themeButton.contains(e.target) && !themeMenu.contains(e.target)) {
        themeMenu.classList.add('hidden');
      }
    });

    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.dataset.theme);
        themeMenu.classList.add('hidden');
      });
    });

    prefersDark.addEventListener('change', () => {
      if ((localStorage.getItem('finblasti-theme') || 'auto') === 'auto') applyTheme('auto');
    });

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.contains('dark');
        applyTheme(isDark ? 'light' : 'dark');
      });
    }

    if (hasGSAP() && !reduceMotion) {
      gsap.to('.map-dot', {
        scale: 1.35,
        opacity: 1,
        duration: 1.2,
        stagger: 0.15,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      });
    }

    // Initial renders
    applyTheme(localStorage.getItem('finblasti-theme') || 'auto');
    renderHomeCards();
    renderDiscover();
    renderRanking();
    renderReviews();
    refreshScrollReveals();
    animatePageIn(document.querySelector('.page.active'));
    applyLanguage(localStorage.getItem('finblasti-language') || 'fr');

    window.addEventListener('load', () => {
      refreshScrollReveals();
      animatePageIn(document.querySelector('.page.active'));
    });


