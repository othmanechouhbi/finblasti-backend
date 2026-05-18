const fs = require('fs');
const p = require('path').join(__dirname, '..', 'index.html');
let h = fs.readFileSync(p, 'utf8');
if (!h.includes('id="discoverCount"')) {
  h = h.replace(
    '<div id="discoverCards" class="grid grid-cols-1 md:grid-cols-2 gap-6"></div>',
    '<p id="discoverCount" class="mb-4" aria-live="polite"></p>\n            <motion id="discoverCards" class="grid grid-cols-1 md:grid-cols-2 gap-6"></motion>'
  );
  h = h.replace('<motion id="discoverCards"', '<div id="discoverCards"').replace('</motion>\n          </div>\n        </div>\n      </div>\n    </section>\n\n    <!-- TOP PAGE -->', '</motion>\n          </div>\n        </div>\n      </div>\n    </section>\n\n    <!-- TOP PAGE -->');
  h = h.replace('<motion id="discoverCards"', '<div id="discoverCards"');
  h = h.replace(/<p id="discoverCount"[^>]*><\/p>\s*<motion id="discoverCards"/, '<p id="discoverCount" class="mb-4" aria-live="polite"></p>\n            <div id="discoverCards"');
  h = h.replace(/<div id="discoverCards"[^>]*><\/motion>/, '<motion id="discoverCards"');
  h = h.replace(/<motion id="discoverCards" class="grid[^"]*"><\/motion>/, '<div id="discoverCards" class="grid grid-cols-1 md:grid-cols-2 gap-6"></div>');
}
fs.writeFileSync(p, h);
console.log('index ok', h.includes('discoverCount'));
