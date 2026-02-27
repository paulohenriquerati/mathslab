# NiniMath Brain Lab

A separate Next.js 16 web app for mental math practice (subtraction, multiplication, division), inspired by Ninimath.

## Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS v4
- Framer Motion
- GSAP
- Supabase (optional leaderboard/session persistence)

## Run

1. Install dependencies
   - `npm install`
2. Start dev server
   - `npm run dev`
3. Open `http://localhost:3000`

## Supabase (Optional)

1. Copy `.env.example` to `.env.local`
2. Fill:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Apply migration:
   - `supabase db push`
   - or run `supabase/migrations/202602220001_create_math_sessions.sql`

If Supabase is not configured, the app still works and stores leaderboard data locally in browser storage.
