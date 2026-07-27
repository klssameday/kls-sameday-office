# KLS SameDay Office v35.0.1

## Customer Management (CRM)

- Customer account status, tags and preferred vehicle
- Multiple contacts for every customer
- Follow-up reminders with due dates, completion and reopening
- Existing 360° customer timeline, jobs, quotes, invoices and account metrics retained
- One-click new quote and repeat-last-job actions retained

Run `SUPABASE-v35-CUSTOMER-MANAGEMENT.sql` in Supabase before deployment.

# KLS SameDay Office v34.3

## Driver App Pro

- Map app chooser: Google Maps, Apple Maps or Waze
- Favourite collection and delivery locations stored on the driver's device
- Photo preview before collection, incident and POD uploads
- Live timer for the current job
- Important site instructions displayed prominently
- Job-specific driver-to-dispatch chat
- Messages queued automatically if the mobile signal drops
- Larger, cleaner driver job cards
- No swipe controls and no shift clock features

Run `SUPABASE-v34.3-DRIVER-APP-PRO.sql` in Supabase before deployment.

# KLS SameDay Office v34.2

Smart Driver Assistant upgrade.

## Added
- Collection countdown and late warning
- One-tap driver support panel
- Automatic arrival prompt when GPS coordinates are available
- Automatic night mode on first use
- Existing v34.1 guided workflow, route, messages, incidents and POD retained

No new Supabase SQL migration is required for v34.2.


## v34.5 – Smart Route Assistant

- Highlights timed collection and delivery risks.
- Suggests the next job based on current status and deadlines.
- Lets drivers optimise or manually reorder the route.
- Provides one-tap delay alerts to dispatch using the existing incident table.
- No additional Supabase migration is required.


## v34.5 – Driver App Pro+
- Professional Job Pack
- Job document attachments
- Searchable completed-job history
- Enhanced POD confirmation

## v35.0.1 owner navigation hotfix

The signed-in KLS office owner now sees a **Back to KLS Office** button in the Driver App profile. Ordinary driver accounts do not see this button. No Supabase migration is required.
