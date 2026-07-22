# KLS SameDay Office

A mobile-friendly office system for KLS SameDay / Kings Logistics Services Ltd.

## Included
- Secure login through Supabase
- Large **NEW JOB** button
- Customer database
- Job booking and status tracking
- Suggested pricing by vehicle and mileage, with full manual override
- Quote and invoice PDF creation
- Payment tracking
- Business settings and bank details
- Dashboard totals and estimated profit

## Vehicle pricing currently built in
- Small Van: £65 call-out, then £1.30/mile after 10 miles
- LWB: £80 call-out, then £1.70/mile after 10 miles
- XLWB: £85 call-out, then £1.80/mile after 10 miles
- Luton Curtainsider with Tail Lift: £95 call-out, then £2.15/mile after 10 miles

The suggested price is rounded up to the nearest £5 and can always be changed manually.

## Supabase setup
1. Open your Supabase project.
2. Run `supabase/schema.sql` in SQL Editor.
3. In Authentication, add your login user.
4. Copy `.env.example` to `.env` and insert your Supabase URL and anon key.

## Run locally
```bash
npm install
npm run dev
```

## Vercel
Add these environment variables in Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then deploy.
