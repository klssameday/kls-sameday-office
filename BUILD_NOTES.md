# KLS SameDay Platform v26.3

## Supabase deployment fix

- The Vercel build now generates `dist/config.js` from environment variables instead of copying an empty file.
- Supports `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, plus compatible fallback names.
- Existing non-empty `config.js` values are preserved as a fallback.
- The service worker now fetches configuration, JavaScript and CSS from the network first so an old blank configuration is not reused.
- All existing Office and Driver App modules are preserved.

## Vercel

The recommended environment-variable names are:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

They must be enabled for Production, Preview and Development, followed by a redeploy.
