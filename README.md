# body-iq
All-in-one training and nutrition hub for triathlon and strength training. Pulls in Garmin activity data, tracks meals and macros, and connects workouts, recovery, and fueling in one place.

## Stack
- Next.js (App Router) + TypeScript + Tailwind, hosted on Vercel
- Supabase (Postgres, Auth, Row Level Security) via `@supabase/ssr`
- Passwordless email sign-in (magic link)

## What's here
- `/login`: magic-link sign-in
- `/dashboard`: latest body scan with change vs. the previous one, plus a placeholder for the unified health score
- `/scans`: log, list and delete body scans (InBody, DEXA, scale, manual)
- `supabase/migrations/`: schema with RLS (`profiles`, `body_scans`)
- `src/proxy.ts`: refreshes the session and sends signed-out visitors to `/login` (Next 16 renamed `middleware` to `proxy`)

## Setup

### 1. Database
Apply `supabase/migrations/20261125175810_init_profiles_body_scans.sql` to the Supabase project, either by merging to the branch the Supabase GitHub integration watches, or by pasting it into the Supabase SQL editor.

The migration enables RLS on every table and grants access to the `authenticated` role only, so it works whether or not "Grant API access to new tables automatically" was left on when the project was created.

### 2. Environment variables
Set these in Vercel (Project Settings > Environment Variables, for Production, Preview and Development) and in `.env.local` for local work. See `.env.example`.

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |

Never put the secret / service-role key in a `NEXT_PUBLIC_` variable or commit it.

### 3. Supabase Auth settings
In Supabase > Authentication > URL Configuration:
- **Site URL:** `https://body-iq-five.vercel.app`
- **Redirect URLs:** add `https://body-iq-five.vercel.app/**`, `http://localhost:3000/**`, and your Vercel preview wildcard (for example `https://body-iq-*-<your-vercel-team>.vercel.app/**`).

### 4. Email template (recommended for mobile; needs custom SMTP)
Supabase only allows editing email templates after custom SMTP is set up (Authentication > Emails > SMTP Settings, for example with Resend). Until then the default link is used, which works only in the browser that requested it. The default sender is also rate-limited and only delivers to project team members, so set up SMTP before inviting anyone else.

The default magic link only works in the same browser that requested it. On a phone, the link often opens in a different in-app browser, so use the token-hash flow instead. In Supabase > Authentication > Email Templates > **Magic Link**, change the link to:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in to Body IQ</a>
```

`/auth/confirm` handles both this format and the default `?code=` format.

## Local development
```bash
npm install
cp .env.example .env.local   # then add the publishable key
npm run dev
```

## Workflow
Work happens on branches and pull requests. Vercel builds a preview for every PR; merge to `main` to deploy to production.

## Roadmap
- Garmin export import (activities, sleep, HRV, resting HR)
- MyFitnessPal CSV import (calories, macros, sodium, sugar)
- Apple Health import
- Unified health score (nutrition 20, training 25, recovery 25, body composition 20, activity 10)
- Trainer-facing view that reads client data from the tools they already use
