const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'dist');
const files = [
  'index.html', 'styles.css', 'app.js', 'config.js',
  'driver.html', 'driver.css', 'driver.js',
  'manifest.json', 'offline.html', 'sw.js'
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(out, file));
fs.cpSync(path.join(root, 'icons'), path.join(out, 'icons'), { recursive: true });
console.log(`KLS SameDay build complete: ${files.length + 5} assets copied to dist/`);
