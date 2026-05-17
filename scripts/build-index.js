const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const lines = fs.readFileSync(path.join(root, 'index.html'), 'utf8').split(/\r?\n/);

const headStart = lines.slice(0, 20);
const tailwindScript = lines.slice(20, 37).map((l) =>
  l
    .replace("primary: '#4F46E5'", "primary: '#5B4CFF'")
    .replace("primaryHover: '#4338CA'", "primaryHover: '#4A3FE8'")
);

const body = lines.slice(523, 1233).join('\n');

const newHead = [
  ...headStart,
  ...tailwindScript,
  '  <link rel="stylesheet" href="assets/css/main.css" />',
  '</head>',
].join('\n');

let newBody = body;

newBody = newBody.replace(
  '<body class="text-slate-800 antialiased selection:bg-primary selection:text-white dark:bg-slate-950 dark:text-slate-100">',
  `<body class="text-slate-800 antialiased selection:bg-primary selection:text-white dark:bg-slate-950 dark:text-slate-100">
  <motion id="app-loader" aria-live="polite" aria-busy="true"><div class="loader-mark">F</div></motion>`
);

newBody = newBody.replace(
  /<motion id="app-loader"[^>]*><div class="loader-mark">F<\/div><\/motion>/,
  '<motion id="app-loader" aria-live="polite" aria-busy="true"><div class="loader-mark">F</div></div>'.replace(/motion/g, 'div')
);

// simpler loader inject
newBody = body.replace(
  '<body class="text-slate-800 antialiased selection:bg-primary selection:text-white dark:bg-slate-950 dark:text-slate-100">',
  '<body class="text-slate-800 antialiased selection:bg-primary selection:text-white dark:bg-slate-950 dark:text-slate-100">\n  <div id="app-loader" aria-live="polite" aria-busy="true"><motion class="loader-mark">F</div></div>'.replace(
    /<motion class="loader-mark">F<\/motion>/,
    '<div class="loader-mark">F</motion>'
  )
);

newBody = body.replace(
  '<body class="text-slate-800 antialiased selection:bg-primary selection:text-white dark:bg-slate-950 dark:text-slate-100">',
  '<body class="text-slate-800 antialiased selection:bg-primary selection:text-white dark:bg-slate-950 dark:text-slate-100">\n  <div id="app-loader" aria-live="polite" aria-busy="true"><div class="loader-mark">F</div></div>'
);

const heroFixes = [
  ['ajoutÃ©s', 'ajoutés'],
  ['trouvÃ©', 'trouvé'],
  ['Ã©tudiants', 'étudiants'],
  ['tÃ©lÃ©travailleurs', 'télétravailleurs'],
  ['Ã ', 'à '],
  ['cafÃ©s', 'cafés'],
  ['Ã‰co-Friendly', 'Éco-Friendly'],
  ['Ã‰tudiant', 'Étudiant'],
  ['recommandÃ©', 'recommandé'],
  ['CafÃ©', 'Café'],
  ['repÃ©rer', 'repérer'],
  ["l'Ã©nergie", "l'énergie"],
  ['dÃ©chets', 'déchets'],
  ['rÃ©utilisables', 'réutilisables'],
  ['qualitÃ©', 'qualité'],
  ['rÃ©seau', 'réseau'],
  ['dÃ©placer', 'déplacer'],
  ['bibliothÃ¨que', 'bibliothèque'],
  ['ville Ã ', 'ville à '],
  ['ðŸš€', '🚀'],
  ['ðŸ”Œ', '🔌'],
  ['ðŸ¤«', '🤫'],
  ['ðŸŒ¿', '🌿'],
  ['ðŸŽ“', '🎓'],
];

for (const [bad, good] of heroFixes) {
  newBody = newBody.split(bad).join(good);
}

newBody = newBody.replace(/\s*<section class="hidden" aria-hidden="true">[\s\S]*?<\/section>\s*/, '\n');

const trendingFinal = `
      <!-- Trending spots -->
      <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 reveal-section">
        <div class="flex items-end justify-between gap-4 mb-6">
          <div>
            <p class="section-kicker">Tendances</p>
            <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-2">Spots qui montent</h2>
            <p class="text-slate-500 dark:text-slate-400 mt-1 text-sm sm:text-base">Les meilleurs FinScores du moment, mis à jour en direct.</p>
          </div>
          <button data-route="top" class="hidden sm:inline-flex shrink-0 items-center gap-2 text-sm font-bold text-primary hover:underline">Voir le classement <i class="fa-solid fa-arrow-right"></i></button>
        </div>
        <div id="trendingRail" class="trending-rail"></div>
      </section>
`;

if (!newBody.includes('trendingRail')) {
  newBody = newBody.replace('      <!-- Featured cards -->', trendingFinal + '\n      <!-- Featured cards -->');
}

newBody = newBody.replace(
  'class="image-slot rounded-[1.5rem]',
  'data-ai-slot="hero" class="image-slot rounded-[1.5rem]'
);

const html = `${newHead}\n${newBody}\n  <script src="assets/js/config.js"></script>\n  <script defer src="assets/js/app.js"></script>\n`;

fs.writeFileSync(path.join(root, 'index.html'), html, 'utf8');
console.log('rebuilt', fs.statSync(path.join(root, 'index.html')).size);
