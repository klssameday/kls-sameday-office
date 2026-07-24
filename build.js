const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of ['index.html', 'app.js', 'styles.css', 'manifest.json', 'sw.js']) {
  fs.copyFileSync(path.join(root, file), path.join(out, file));
}

const config = {
  supabaseUrl: process.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || ''
};
fs.writeFileSync(
  path.join(out, 'config.js'),
  `window.KLS_CONFIG = ${JSON.stringify(config)};\n`,
  'utf8'
);

console.log('Built KLS SameDay Office Supabase V2 to dist/');
