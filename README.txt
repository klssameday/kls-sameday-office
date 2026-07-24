KLS SameDay Office v10 — Dispatch Centre

INSTALL ORDER
1. In Supabase open SQL Editor > New query.
2. Open KLS_SameDay_v10_Dispatch_Centre_Upgrade.sql, copy all, paste into the editor and click Run.
3. Replace the website files in the GitHub repository with:
   app.js, styles.css, index.html, manifest.json, sw.js, build.js and package.json
4. Commit to main with summary: Upgrade to v10 Dispatch Centre
5. Push origin and wait for Vercel to show Ready.
6. Refresh KLS SameDay Office and sign in again if required.

V10 FEATURES
- Driver records and vehicle details
- Assign or unassign jobs from the Dispatch Centre
- Driver workload panels
- Open the latest live GPS position in Google Maps
- Multi-drop addresses saved with quotes and jobs
- Customer ETA saved against a job
- ETA and additional stops visible on the private tracking page
- Native phone Share button for customer tracking messages

IMPORTANT
- Live GPS still requires the Driver App to remain open.
- Customer messages are shared from the phone/browser; fully automatic SMS/email requires a future server messaging integration.
- Existing v9 quotes, jobs, invoices, tracking and POD remain in place.
