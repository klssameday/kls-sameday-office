KLS SameDay v24 — Separate Driver App

WHAT THIS ADDS
- Separate driver-only URL: /driver.html
- Drivers cannot see quotes, rates, invoices, accounts or office menus.
- Drivers only receive jobs assigned to their linked driver record.
- Guided status workflow.
- Live GPS starts when Start job is pressed.
- GPS continues through collection and delivery.
- Delivery cannot be completed without recipient name, photo and signature.
- Tracking stops only after POD uploads and the completion update succeeds.

INSTALL ORDER
1. Run KLS_SameDay_v24_Driver_Only_Migration.sql in Supabase.
2. Upload all files to GitHub, but keep your existing config.js.
3. Wait for Vercel to deploy.
4. Open https://YOUR-DOMAIN/driver.html
5. A driver creates a login using their email.
6. In the Office Dispatch Centre, add the driver using the same login email.
7. Assign a job to that driver.

IMPORTANT
Mobile browser background rules can pause web GPS after the app is fully closed or the phone aggressively suspends it. Keep KLS Driver open during the live job for dependable updates.
