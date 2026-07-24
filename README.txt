KLS SameDay Office v11 — Driver Management

INSTALL ORDER
1. Open Supabase > SQL Editor > New query.
2. Copy all of KLS_SameDay_v11_Driver_Management_Upgrade.sql and click Run.
3. Replace the website files in GitHub with app.js, styles.css, index.html, manifest.json, sw.js, build.js and package.json.
4. Commit to main: Upgrade to v11 Driver Management
5. Push and wait for Vercel to show Ready.
6. Refresh the app. On iPhone, close and reopen the installed web app so the new service worker loads.

V11 FEATURES
- Dedicated Driver Management page
- Add, edit and delete driver profiles
- Personal and emergency contact details
- Employment type, start date and driver number
- Vehicle, registration, mileage and service date
- Licence, insurance, CPC and MOT expiry tracking
- Compliance warnings for expired or soon-due documents
- Document link fields
- Active/inactive driver status
- Driver job, revenue and mileage summaries
- Searchable driver roster

IMPORTANT
- Run the v10 SQL migration before this v11 migration.
- Document fields store secure links; direct file uploads require a later Supabase Storage module.
- Existing quotes, jobs, invoices, CRM, tracking and POD remain in place.
