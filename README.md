# OneBoard

OneBoard is a real-time classroom thinking wall with separate Teacher and Student interfaces.

## Stack (Current)

- Frontend: Next.js (React, TypeScript)
- Backend services: Supabase (Auth + Postgres + Realtime)
- Hosting: Vercel (frontend)

## Quick Architecture

- Teacher auth uses Supabase Auth email/password.
- Session + response data is stored in Supabase Postgres.
- Realtime updates use Supabase Realtime channels:
  - Response insert/update events
  - Session ended updates
  - Presence-based student count

## Required Env Vars (Vercel + local)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Example file: `client/.env.local.example`

## One-Time Supabase Setup

1. Create a Supabase project.
2. In Supabase dashboard, open SQL Editor.
3. Run `supabase/schema.sql` from this repo.
   - Re-run this file when pulling new updates so schema migrations (new columns/policies) apply.
4. In Auth settings:
   - Enable Email/Password provider.
   - For easiest testing, disable email confirmation (optional).
5. In Database Replication / Realtime settings:
   - Ensure `sessions` and `responses` are included for realtime updates.

## Local Run

1. Install dependencies:

```bash
npm install
```

2. Set env vars:

- Copy `client/.env.local.example` -> `client/.env.local`
- Fill in your Supabase URL + anon key.

3. Start app:

```bash
npm run dev:client
```

Open `http://localhost:3000`.

## Deploy on Vercel (No Render/Railway Needed)

1. Import repo into Vercel.
2. Set **Root Directory** to `client`.
3. Add Vercel environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy.

## Verify Deployment

1. Open Vercel URL.
2. Go to Teacher page.
3. Create account/login.
4. Start session.
5. Open Student page in another browser/device.
6. Join with code and submit response.
7. Confirm teacher board updates instantly.
8. End session and confirm student sees "Session has ended."

## Notes

- Students can submit once per session (DB unique constraint).
- Teacher-only updates are enforced by Supabase RLS policies.
- CSV export is generated client-side on teacher board.
