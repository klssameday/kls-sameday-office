KLS SameDay Platform 3.0 - Driver Exchange

WHAT THIS BUILD ADDS
- Office menu: Driver Exchange
- Post a job to the approved KLS driver network
- No bid-closing time or countdown
- Drivers cannot see customer prices, costs or margins
- Drivers submit an offer and optional message
- Office sees offers with driver and vehicle details
- Office awards or withdraws a job
- Awarding a linked KLS job assigns it to the winning driver
- Driver app tab: Available Work

INSTALL ORDER
1. In Supabase SQL Editor, run KLS_Platform_3_0_Driver_Exchange.sql
2. Confirm both verification rows show true
3. Upload the website files to GitHub, keeping your existing config.js
4. Wait for Vercel deployment
5. Open Driver Exchange from the Office menu
6. Drivers open driver.html and choose Available Work

IMPORTANT
This build uses in-app network work updates. Native push notifications are the next stage and require Apple/Google notification credentials and a native development build.
