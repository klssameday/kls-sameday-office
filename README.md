# KLS SameDay Office v26.35

Complete static web application for GitHub and Vercel deployment.

## v26.35 addition

A new **Business Intelligence Dashboard** has been added without removing the existing Dashboard or Business Reports. It includes:

- 3, 6, 9 and 12-month commercial trend views
- booked revenue, cash received, costs and cash-result KPIs
- quote conversion and job completion rates
- average job value and revenue-per-mile analysis
- customer concentration and repeat-customer metrics
- vehicle performance ranking
- next-month outlook using recent run rate and open sales pipeline
- automatic decision alerts for revenue decline, low conversion, overdue invoices, concentration risk and unassigned jobs

## Configure Supabase

Edit `config.js` and enter the same Supabase project URL and anonymous public key used by the existing v26.33 deployment. Do not use the service-role key.

## Test locally

```bash
npm test
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Deploy to Vercel

Import this folder/repository as a Vercel project. No build command or output directory is required because this is a static application.

## v26.35 addition
- Job Profit Control dashboard
- Estimated fuel, wear, labour and fixed costs per job
- Target-margin warnings and safer minimum-price guidance
- Vehicle profitability comparison
- Adjustable assumptions saved locally per device
