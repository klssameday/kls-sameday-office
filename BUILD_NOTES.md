# KLS SameDay v26.11 — Driver App Loading Fix

- Bumped Driver App asset versions and service-worker cache so Safari cannot keep serving v26.7.
- Added direct jobs-table fallback when `get_my_driver_jobs` is not installed.
- Made Driver Exchange tables optional so they cannot prevent the core Driver App loading.
- No Supabase SQL migration required for the current linked Mark King driver account.
