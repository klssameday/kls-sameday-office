# KLS SameDay Office v31.0

## Customer Portal — Working Release

This release activates the customer self-service portal already connected to KLS SameDay Office.

### Customer features
- Secure Supabase customer login
- Customer dashboard with active jobs, completed jobs and account totals
- Collection booking requests sent directly to the office
- Online quote acceptance or decline
- Live job tracking links
- POD access
- Invoice print/PDF view
- Saved addresses and favourite routes
- Customer-to-office messages

### Office features
- Link a customer login from **Settings → Customer Portal Access**
- Review new requests in **Customer Portal**
- Approve a request and create the job in one action
- Reject requests without creating a job
- Customer records remain separated using Supabase row-level security

## Required Supabase step
Before testing the portal, run:

`SUPABASE-v31-CUSTOMER-PORTAL.sql`

in the Supabase SQL Editor.

Then ask the customer to create a login using their email address. In the office app, open **Settings**, select their customer record, enter the same email, and press **Enable Customer Portal**.

Commit summary: `Release v31.0 – Activate secure customer portal and self-service bookings`
