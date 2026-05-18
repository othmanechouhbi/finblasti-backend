const fs = require('fs');
const f = require('path').join(__dirname, '..', 'assets', 'js', 'app.js');
let c = fs.readFileSync(f, 'utf8');

c = c.replace(
  '${FinBlasti.saveButtonHtml(spot.id)}<motion class="absolute top-4 right-4',
  '${FinBlasti.saveButtonHtml(spot.id)}</div>\n          <div class="absolute top-4 right-4'
);
c = c.replace(
  '${FinBlasti.saveButtonHtml(spot.id)}<div class="absolute top-4 right-4',
  '${FinBlasti.saveButtonHtml(spot.id)}</motion>\n          <div class="absolute top-4 right-4'
);
c = c.replace('</motion>\n          <motion class="absolute top-4 right-4', '</div>\n          <div class="absolute top-4 right-4');
c = c.replace('</motion>\n          <motion ', '</motion>\n          <motion ');

if (c.includes('</motion>')) {
  c = c.replace('${FinBlasti.saveButtonHtml(spot.id)}</motion>', '${FinBlasti.saveButtonHtml(spot.id)}</div>');
}

c = c.replace(
  'const matchNeeds = needs.length === 0 || needs.every(n => s.tags.includes(n));',
  'const matchNeeds = FinBlasti.matchSpotNeeds(s, needs);'
);

c = c.replace('detailContent.querySelectorAll', "document.getElementById('detailContent').querySelectorAll");

const rankingFn = `function renderRanking() {
      const topSpots = FinBlasti.getTopSpots(spots);
      const el = document.getElementById('rankingList');
      if (!topSpots.length) {
        el.innerHTML = emptyState('Aucun top spot pour le moment. Découvre tous les lieux disponibles.');
        FinBlasti.forceVisible(el);
        return;
      }
      el.innerHTML = topSpots.map((s, index) => \`
        <motion class="flex flex-col md:flex-row md:items-center gap-4 p-5 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors card-hover">
          <div class="w-12 h-12 rounded-2xl \${index < 3 ? 'finscore-gradient text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'} flex items-center justify-center font-extrabold text-lg">#\${index + 1}</div>
          <img src="\${s.image}" alt="\${s.name}" class="w-full md:w-28 h-24 rounded-2xl object-cover">
          <div class="flex-1">
            <h3 class="font-extrabold text-lg text-slate-900 dark:text-white">\${s.name}</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400">\${s.type} · \${s.district}, \${s.city}</p>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <div class="text-center"><p class="text-2xl font-extrabold">\${s.score}</p><p class="text-xs text-slate-400">FinScore</p></div>
            \${FinBlasti.saveButtonHtml(s.id)}
            <button data-detail="\${s.id}" class="detail-btn rounded-full bg-primary text-white px-5 py-2.5 font-bold">Voir</button>
          </div>
        </motion>
      \`).join('').replace(/<\\/?motion>/g, (m) => (m.startsWith('</') ? '</div>' : '<div'));
      el.querySelectorAll('[data-save-spot]').forEach((btn) => FinBlasti.updateSaveButton(btn, btn.dataset.saveSpot));
      FinBlasti.forceVisible(el);
      animateDynamicList(el);
      if (typeof applyLanguage === 'function') applyLanguage();
    }`;

c = c.replace(/function renderRanking\(\) \{[\s\S]*?if \(typeof applyLanguage === 'function'\) applyLanguage\(\);\s+\}/, rankingFn.replace(/<\/?motion>/g, (m) => (m.includes('/') ? '</div>' : '<div')));

const delegOld = `document.addEventListener('click', (e) => {
      const btn = e.target.closest('.detail-btn');
      if (btn && btn.dataset.detail) openDetail(btn.dataset.detail);
    });`;

const delegNew = `document.addEventListener('click', (e) => {
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
    });`;

if (c.includes(delegOld)) c = c.replace(delegOld, delegNew);

if (!c.includes('FinBlasti.commentsSectionHtml')) {
  c = c.replace(
    '<h2 class="text-2xl font-extrabold text-slate-900 dark:text-white mt-10 mb-4">Avis récents</h2>',
    '${FinBlasti.commentsSectionHtml(s.id)}\n                <h2 class="text-2xl font-extrabold text-slate-900 dark:text-white mt-10 mb-4">Avis récents</h2>'
  );
  c = c.replace('${s.reviewsText.map(r =>', '${(s.reviewsText || []).map(r =>');
}

fs.writeFileSync(f, c, 'utf8');
console.log('fixed');
