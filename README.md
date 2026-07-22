# KLS SameDay Office — Authentication Fix

This build normalises the Supabase project URL before creating the client. It accepts either the base project URL or a mistakenly copied `/rest/v1/` Data API URL and uses the correct project origin for authentication.

## Vercel variables

- `VITE_SUPABASE_URL`: the Supabase project URL, ideally `https://YOUR-PROJECT.supabase.co`
- `VITE_SUPABASE_ANON_KEY`: the Supabase publishable key (`sb_publishable_...`) or legacy anon key

Never use the secret/service-role key in Vercel for this browser application.
