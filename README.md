# KLS SameDay Office – Supabase V2

This version saves customers, quotes, jobs, invoices and settings permanently in Supabase.

## Required Vercel environment variables
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Database upgrade
Run `supabase/upgrade.sql` once in the Supabase SQL Editor before using the new version.

## Vercel settings
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: project root / `./`

## First login
Use **Create account** on the login screen. Supabase may ask you to confirm the email address before signing in.
