# KLS SameDay Platform v26.2

## Driver Control deployment fix
- Preserves every existing office module and the separate Driver App.
- Keeps the real Driver Control page already present in `app.js`.
- Updates office and driver asset versions to `26.2`.
- Replaces cache-first app assets with network-first loading.
- Changes the service-worker cache name so previous cached v26 files are deleted.
- Prevents Vercel deployments from showing the older Driver App office screen or stale loading placeholders.

## Database
No Supabase migration is included. The existing `drivers` and `driver_accounts` tables are used.
