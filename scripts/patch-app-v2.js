const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'assets', 'js', 'app.js');
let c = fs.readFileSync(file, 'utf8');

// normalizeSpot in chargerSpotsDepuisAPI
c = c.replace(
  'spots = donnees.map(s => ({\n        ...s,\n        id: s.id || s._id,',
  'spots = donnees.map(s => FinBlasti.normalizeSpot({\n        ...s,\n        id: s.id || s._id,'
);
c = c.replace(
  /tags: s\.tags \|\| \[\],[\s\S]*?description: s\.description \|\| 'Aucune description disponible pour ce spot\.'\n      \}\)\);/,
  "tags: s.tags || []\n      }));"
);

// example spot normalize
c = c.replace(
  "id: 'le-hub-cafe',",
  "...(FinBlasti.normalizeSpot({ id: 'le-hub-cafe',"
);
c = c.replace(
  "          ]\n        }\n        // Ajoutez",
  "          ]\n        })),\n        // Ajoutez"
);

// animateDynamicList - safe version
c = c.replace(
  `function animateDynamicList(container) {
  if (!container) return;
  refreshScrollReveals(container);
  if (reduceMotion || !hasGSAP()) return;

  gsap.fromTo(
    container.children,
    { autoAlpha: 0, y: 18, scale: 0.985 },
    { autoAlpha: 1, y: 0, scale: 1, duration: 0.42, stagger: 0.045, ease: 'power3.out', clearProps: 'opacity,visibility,transform' }
  );
}`,
  `function animateDynamicList(container) {
  if (!container) return;
  FinBlasti.forceVisible(container);
  if (reduceMotion || !hasGSAP()) return;
  gsap.fromTo(
    container.children,
    { autoAlpha: 0, y: 12 },
    { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.03, ease: 'power2.out', clearProps: 'all' }
  );
}`
);

// refreshScrollReveals - don't hide list cards
c = c.replace(
  "const targets = gsap.utils.toArray(scope.querySelectorAll('section, .card-hover, aside > div, #rankingList > div, #reviewsList > div'));",
  "const targets = gsap.utils.toArray(scope.querySelectorAll('section:not(#page-discover):not(#page-top) .metric-card, aside > div, .hero-visual'));"
);

// setRoute refresh
const setRouteOld = `    if (typeof applyLanguage === 'function') applyLanguage();
  }

  mobileMenu.classList.remove('open');
}`;
const setRouteNew = `    if (typeof applyLanguage === 'function') applyLanguage();

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
}`;
if (c.includes(setRouteOld)) c = c.replace(setRouteOld, setRouteNew);

// renderDiscover filter
c = c.replace(
  'const matchNeeds = needs.length === 0 || needs.every(n => s.tags.includes(n));',
  'const matchNeeds = FinBlasti.matchSpotNeeds(s, needs);'
);

// renderRanking
c = c.replace(
  `    function renderRanking() {
      const sorted = [...spots].sort((a, b) => b.score - a.score);
      document.getElementById('rankingList').innerHTML = sorted.map((s, index) =>`,
  `    function renderRanking() {
      const topSpots = FinBlasti.getTopSpots(spots);
      const el = document.getElementById('rankingList');
      if (!topSpots.length) {
        el.innerHTML = '<div class="p-10 text-center text-slate-500 dark:text-slate-400">Aucun top spot pour le moment. Explore tous les lieux dans Découvrir.</motion>';
        el.innerHTML = el.innerHTML.replace('</motion>', '');
        el.innerHTML = el.innerHTML.replace('<motion', '<div');
        FinBlasti.forceVisible(el);
        return;
      }
      el.innerHTML = topSpots.map((s, index) =>`
);

c = c.replace(
  'animateDynamicList(document.getElementById(\'rankingList\'));',
  'FinBlasti.forceVisible(el);\n      animateDynamicList(el);'
);

// openDetail find spot
c = c.replace(
  'const s = spots.find(item => item.id === id);',
  'const s = FinBlasti.findSpot(spots, id);'
);

// spotCard - add save and actions
const oldCardFooter = `            <motion class="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
              <div class="flex items-center gap-2">
                <span class="text-sm text-slate-500 dark:text-slate-400"><i class="fa-solid fa-comment-dots mr-1"></i>\${reviewCount} avis</span>
              </div>
              <button data-detail="\${spot.id}" class="detail-btn text-primary font-semibold text-sm hover:underline">Voir détails <i class="fa-solid fa-arrow-right ml-1"></i></button>
            </div>`;

const newCardFooter = `            <div class="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4 gap-2">
              <span class="text-sm text-slate-500 dark:text-slate-400"><i class="fa-solid fa-comment-dots mr-1"></i>\${reviewCount}</span>
              <div class="flex items-center gap-1.5">
                \${FinBlasti.saveButtonHtml(spot.id)}
                <button type="button" data-comment-spot="\${spot.id}" class="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:border-primary" aria-label="Commenter"><i class="fa-regular fa-comment"></i></button>
                <button data-detail="\${spot.id}" class="detail-btn rounded-full bg-primary text-white px-3 py-2 text-xs font-bold">Détails</button>
              </div>
            </div>`;

// simpler replace for spot card
c = c.replace(
  `<div class="absolute top-4 right-4 z-10">`,
  `<div class="absolute top-4 left-4 z-10">\${FinBlasti.saveButtonHtml(spot.id)}</motion><div class="absolute top-4 right-4 z-10">`
);
c = c.replace('${FinBlasti.saveButtonHtml(spot.id)}</motion>', '${FinBlasti.saveButtonHtml(spot.id)}');

c = c.replace(
  'Voir détails <i class="fa-solid fa-arrow-right ml-1"></i></button>',
  'Détails</button><button type="button" data-comment-spot="${spot.id}" class="ml-2 text-xs font-bold text-slate-500 hover:text-primary">Commenter</button>'
);

// Promise.all load favorites
c = c.replace(
  'Promise.all([chargerSpotsDepuisAPI(), chargerReviewsDepuisAPI()]).then(() => {',
  'Promise.all([chargerSpotsDepuisAPI(), chargerReviewsDepuisAPI(), FinBlasti.loadFavorites()]).then(() => {'
);

// renderSaved function - insert before renderTrending
if (!c.includes('function renderSaved')) {
  c = c.replace(
    'function renderTrending() {',
    `function renderSaved() {
      const grid = document.getElementById('savedCards');
      if (!grid) return;
      if (!FinBlasti.getToken()) {
        grid.innerHTML = emptyState('Connecte-toi pour voir tes spots enregistrés.');
        return;
      }
      const saved = spots.filter((s) => FinBlasti.isSaved(s.id));
      grid.innerHTML = saved.length
        ? saved.map((s) => spotCard(s, true)).join('')
        : emptyState('Tu n\\'as pas encore enregistré de spot. Utilise l\\'icône signet sur une carte.');
      FinBlasti.forceVisible(grid);
      animateDynamicList(grid);
      grid.querySelectorAll('[data-save-spot]').forEach((btn) => FinBlasti.updateSaveButton(btn, btn.dataset.saveSpot));
      if (typeof applyLanguage === 'function') applyLanguage();
    }

    function renderTrending() {`
  );
}

// Event delegation save + comment
if (!c.includes('data-save-spot')) {
  c = c.replace(
    `document.addEventListener('click', (e) => {
      const btn = e.target.closest('.detail-btn');
      if (btn && btn.dataset.detail) openDetail(btn.dataset.detail);
    });`,
    `document.addEventListener('click', (e) => {
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
    });`
  );
}

// openDetail - comments + save
c = c.replace(
  `<h2 class="text-2xl font-extrabold text-slate-900 dark:text-white mt-10 mb-4">Avis récents</h2>
                <div class="space-y-4">
                  \${s.reviewsText.map(r =>`,
  `\${FinBlasti.commentsSectionHtml(s.id)}
                <h2 class="text-2xl font-extrabold text-slate-900 dark:text-white mt-10 mb-4">Avis récents</h2>
                <div class="space-y-4">
                  \${(s.reviewsText || []).map(r =>`
);

c = c.replace(
  `document.getElementById('saveFavorite').addEventListener('click', () => showToast('Spot enregistré', \`\${s.name} a été ajouté à tes favoris.\`));`,
  `const saveBtn = document.getElementById('saveFavorite');
      FinBlasti.updateSaveButton(saveBtn, s.id);
      saveBtn.addEventListener('click', () => FinBlasti.toggleFavorite(s.id));
      FinBlasti.bindCommentsSection(s.id);
      detailContent.querySelectorAll('[data-route]').forEach((b) => {
        b.addEventListener('click', () => setRoute(b.dataset.route));
      });`
);

c = c.replace(
  "document.querySelector('#detailContent [data-route=\"discover\"]').addEventListener('click', () => setRoute('discover'));",
  ''
);

// After spot renders update save buttons
c = c.replace(
  'animateDynamicList(container);\n      if (typeof applyLanguage === \'function\') applyLanguage();\n    }\n\n    function emptyState',
  `animateDynamicList(container);
      container.querySelectorAll('[data-save-spot]').forEach((btn) => FinBlasti.updateSaveButton(btn, btn.dataset.saveSpot));
      if (typeof applyLanguage === 'function') applyLanguage();
    }

    function emptyState`
);

// verify login loads favorites
c = c.replace(
  'updateAuthUI();\n\nshowToast(\'Connexion réussie\'',
  'updateAuthUI();\nawait FinBlasti.loadFavorites();\n\nshowToast(\'Connexion réussie\''
);

// make verify handler async
c = c.replace(
  "document.getElementById('verifyCodeBtn').addEventListener('click', async () => {",
  "document.getElementById('verifyCodeBtn').addEventListener('click', async () => {"
);

fs.writeFileSync(file, c, 'utf8');
console.log('patched app.js');
