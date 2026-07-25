# KLS SameDay v26.9

## Driver sign-in loading fix
- Prevents a Supabase authentication callback deadlock after sign-in.
- Loads driver profile and jobs only after the auth callback has completed.
- Adds a 15-second timeout with a visible error instead of an endless loading screen.
- Keeps the v26.8 URL validation and drivers.user_id linking fallback.
- No Supabase SQL migration required.
