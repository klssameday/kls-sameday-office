# KLS SameDay Office v35.3.0

Finance, invoice and POD audit fixes:

- Invoice wording now states that KLS is not VAT registered
- Invoices show the service date, explicit payment terms, company number and registered office
- Missing customer billing addresses are clearly flagged before an invoice is sent
- Paid invoices no longer offer another payment action
- POD documents recognise recipient names saved by both office and driver workflows
- POD completion now requires a recipient, delivery photo and signature
- Finance and reporting labels no longer show stale internal version numbers
- The default KLS vehicle fuel assumption is updated from 25 MPG to 28 MPG

# KLS SameDay Office v35.2.0

Archive-safe reporting update: archived jobs remain included in dashboards, customer history,
POD documents, business intelligence, profitability reports, CSV exports and full backups.

## Safe Job Archive

- Delivered and cancelled jobs can be archived from the Jobs Control Centre
- Archived jobs stay searchable and can be restored
- Archived jobs are hidden from active office, customer and driver views
- Permanent deletion is limited to the signed-in business owner
- Deletions require the job number and leave an audit record
- Jobs linked to an invoice cannot be permanently deleted
- Job-document access is restricted to the owner and the assigned driver

Run `SUPABASE-v35.1-JOB-ARCHIVE.sql` in Supabase before deployment.

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
