const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'assets', 'js', 'app.js');
let c = fs.readFileSync(file, 'utf8');

c = c.replace(
  /const reviewCount = spot\.reviewCount \?\? spot\.reviews \?\? 0;`n      return `/g,
  'const reviewCount = spot.reviewCount ?? spot.reviews ?? 0;\n      return `'
);

c = c.replace(
  '<div class="spot-card bg-white dark:bg-slate-900 rounded-[1.75rem] overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm card-hover relative group">',
  '<article class="spot-card spot-card-premium card-hover relative group">'
);

c = c.replace(
  /        <\/article>`;`n    }`n`n    \/\/ Event delegation/g,
  '        </article>\n      `;\n    }\n\n    // Event delegation'
);

if (!c.includes('const fromApi = apiReviews')) {
  c = c.replace(
    '      const reviews = spots.flatMap(s => (s.reviewsText || []).map(r => ({ ...r, spot: s.name, city: s.city })));',
    `      const fromApi = apiReviews.map(r => {
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
      const reviews = fromApi.length ? fromApi : fromSpots;`
  );
}

const emptyFn = `function emptyState(text) {
      return \`<motion class="col-span-full spot-card-premium p-10 text-center">
        <div class="empty-state-art mb-5" data-ai-slot="empty-state" aria-hidden="true"></div>
        <p class="text-slate-600 dark:text-slate-300 font-semibold">\${text}</p>
      </div>\`;
    }`.replace('<motion', '<div').replace('</motion>', '');

c = c.replace(/function emptyState\(text\) \{[\s\S]*?\n    \}/, emptyFn);

fs.writeFileSync(file, c, 'utf8');
console.log('ok');
