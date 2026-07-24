KLS SameDay Office v22 — App Edition

WHAT IS NEW
- Installable on iPhone/iPad Home Screen and Mac Dock/Applications
- KLS branded app icons
- Full-screen standalone app mode
- Branded launch/splash screen
- Improved offline fallback and app-shell caching
- PWA shortcuts for Dashboard, New Quote and Jobs on supported devices
- Safe-area support for modern iPhones

DEPLOYMENT
1. Run no new Supabase SQL. This update is front-end only.
2. Keep your existing working config.js or Vercel environment variables.
3. Replace the repository files with this package, including the new icons folder and offline.html.
4. Deploy to Vercel and hard-refresh once.

INSTALL ON IPHONE
Open the live site in Safari > Share > Add to Home Screen > Add.

INSTALL ON MAC
Safari: File > Add to Dock.
Chrome: open the site and use Install KLS SameDay Office from the address-bar/menu.

IMPORTANT
The app requires internet access for live Supabase data. The offline page prevents a broken blank screen, but live records cannot be edited while offline.
