const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/\u00c3\u00a0/g, 'à').replace(/\u00c3\u00a9/g, 'é');
fs.writeFileSync(path.join(root, 'index.html'), html);

let app = fs.readFileSync(path.join(root, 'assets', 'js', 'app.js'), 'utf8');
if (!app.includes('nav-scrolled')) {
  app = app.replace(
    'window.addEventListener(\'load\', () => {',
    `window.addEventListener('scroll', () => {
      const nav = document.querySelector('nav.glass-nav');
      if (nav) nav.classList.toggle('nav-scrolled', window.scrollY > 12);
    }, { passive: true });

    window.addEventListener('load', () => {`
  );
}
app = app.replace(
  '    renderHomeCards();\n    renderDiscover();',
  '    renderHomeCards();\n    renderTrending();\n    renderDiscover();'
);
fs.writeFileSync(path.join(root, 'assets', 'js', 'app.js'), app);
console.log('patched');
