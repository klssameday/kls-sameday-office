# KLS SameDay Platform v26.8

## Driver sign-in URL fix
- Normalises the Supabase project URL during the Vercel build.
- Removes accidental `/rest/v1`, `/auth/v1` or other paths from a valid project API URL.
- Converts a pasted Supabase dashboard project URL into the correct `https://PROJECT-REF.supabase.co` API URL.
- Rejects unrelated or malformed URLs instead of sending broken authentication requests.
- Adds a clearer Driver App configuration error.
- No Supabase SQL migration required.
