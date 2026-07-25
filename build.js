const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'dist');
const files = [
  'index.html', 'styles.css', 'app.js',
  'driver.html', 'driver.css', 'driver.js',
  'manifest.json', 'offline.html', 'sw.js'
];

function firstEnvironmentValue(names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function readExistingConfig() {
  const configPath = path.join(root, 'config.js');
  if (!fs.existsSync(configPath)) return { supabaseUrl: '', supabaseAnonKey: '' };
  const source = fs.readFileSync(configPath, 'utf8');
  const match = source.match(/window\.KLS_CONFIG\s*=\s*({[\s\S]*?})\s*;?/);
  if (!match) return { supabaseUrl: '', supabaseAnonKey: '' };
  try { return JSON.parse(match[1]); } catch { return { supabaseUrl: '', supabaseAnonKey: '' }; }
}

const existing = readExistingConfig();
const supabaseUrl = firstEnvironmentValue([
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'KLS_SUPABASE_URL'
]) || String(existing.supabaseUrl || '').trim();
const supabaseAnonKey = firstEnvironmentValue([
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'KLS_SUPABASE_ANON_KEY'
]) || String(existing.supabaseAnonKey || '').trim();

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(out, file));
fs.cpSync(path.join(root, 'icons'), path.join(out, 'icons'), { recursive: true });

const generatedConfig = `window.KLS_CONFIG = ${JSON.stringify({ supabaseUrl, supabaseAnonKey })};\n`;
fs.writeFileSync(path.join(out, 'config.js'), generatedConfig, 'utf8');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('WARNING: Supabase configuration was not found during the build.');
  console.warn('Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel Project Settings → Environment Variables, then redeploy.');
} else {
  console.log('Supabase configuration added to dist/config.js.');
}
console.log(`KLS SameDay build complete: ${files.length + 6} assets copied to dist/`);
