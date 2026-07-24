KLS SameDay Office v21 — Stable Build

WHAT THIS FIXES
- Replaces the fragile positional database loader with named queries.
- Adds the missing public_quote_requests database query.
- Stops the “undefined is not an object (evaluating result.error)” failure.
- Gives database errors the name of the failing section.
- Reconciles the v19 Route Planner and v20 Online Quotes schema safely.
- Keeps all existing v1–v20 features in the supplied application.

INSTALL
1. In Supabase SQL Editor, run KLS_SameDay_v21_Stable_Migration.sql once.
2. In GitHub, replace app.js, styles.css, index.html, manifest.json,
   sw.js, build.js and package.json with the files in this folder.
3. Keep your existing config.js unless your Supabase keys have changed.
4. Commit with: Upgrade to v21 Stable Build
5. Wait for Vercel to show Ready.
6. Hard refresh the app with Command + Shift + R.

IMPORTANT
- The SQL is idempotent and can be run again safely.
- This build does not add paid routing, traffic, SMS, email or payment services.
- Existing business data is not deleted by this migration.
