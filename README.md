# KLS SameDay Office

A real React + Supabase business system for KLS SameDay.

## Included

- Secure email/password login
- Dashboard
- Customer database
- Job management
- Automatic job numbers
- Quote PDF generator
- Invoice PDF generator
- Payment tracking
- Profit and outstanding balance figures
- Business and bank settings
- Responsive layout for Mac and phone
- Supabase Row Level Security

## Set up

### 1. Install Node.js

Install the current LTS version of Node.js.

### 2. Create Supabase

1. Create a Supabase project.
2. Open SQL Editor.
3. Paste and run `supabase/schema.sql`.
4. In Authentication > Users, create your login user.
5. In Project Settings > API, copy the Project URL and anon public key.

### 3. Configure the app

Copy `.env.example` to `.env`, then enter:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### 4. Run it

```bash
npm install
npm run dev
```

Open the local address shown in Terminal.

## Put it online with Vercel

1. Upload this folder to a GitHub repository.
2. Import the repository into Vercel.
3. Add the two environment variables in Vercel.
4. Deploy.
5. Add `office.klssameday.co.uk` in Vercel Domains.
6. Add the DNS record Vercel shows you at FastHosts.

## Important

Do not put the Supabase service-role key in the app. Only use the anon/public key. Row Level Security is enabled in the included SQL.
