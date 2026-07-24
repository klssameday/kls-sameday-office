KLS SameDay Office v12 — Live Dispatch Map

INSTALL ORDER
1. Open Supabase > SQL Editor > New query.
2. Copy and run KLS_SameDay_v12_Live_Dispatch_Map.sql.
3. Replace these website files in GitHub:
   app.js, styles.css, index.html, manifest.json, sw.js, build.js, package.json
4. Commit summary: Upgrade to v12 Live Dispatch Map
5. Push origin and wait for Vercel to show Ready.
6. Hard refresh KLS SameDay Office.

V12 FEATURES
- Real live fleet map in Dispatch Centre using OpenStreetMap and Leaflet
- Map markers show assigned driver, job, status and latest update
- Automatic map fit around all live vehicles
- Driver availability: Available, On Job, Break or Offline
- Availability saved in Supabase
- Existing v11 Driver Management, tracking, POD, quotes, jobs, CRM and invoices retained

IMPORTANT
- A vehicle appears on the map after live GPS tracking has started for its job.
- Browser tracking still requires the Driver App to remain open.
