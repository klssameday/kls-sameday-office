KLS SameDay Office v17 — Live Tracking Centre

WHAT'S NEW
- New Live Tracking page in the office navigation
- Live vehicle map for every active GPS-reporting job
- GPS health: Live now, recent, stale or not started
- Quick access to driver job, customer tracking link and latest location
- Customer public tracking page now includes an embedded live map
- Customer ETA countdown updates automatically
- Existing Driver App GPS, POD, dispatch, portal and accounts features retained

INSTALL
1. No new Supabase SQL is required for v17 if v9 live tracking and v16 customer portal are already working.
2. Replace app.js, styles.css, index.html, manifest.json, sw.js, build.js and package.json in GitHub.
3. Keep your existing config.js.
4. Commit summary: Upgrade to v17 Live Tracking Centre
5. Wait for Vercel Ready and hard refresh the website.

TEST
1. Open an active job in Driver App on a phone.
2. Press Start Live Tracking and allow location access.
3. Open Live Tracking in the office system.
4. Copy the customer tracking link and open it in a private browser window.
