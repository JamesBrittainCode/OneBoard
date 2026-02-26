# OneBoard

OneBoard is a real-time classroom thinking wall with separate Teacher and Student interfaces.

## Stack

- Frontend: Next.js (React, TypeScript)
- Backend: Node.js + Express + Socket.io
- Database: SQLite (`better-sqlite3`)
- Auth: Teacher email/password login

## Files Added For Deployment

- `railway.json` (backend deploy/start/healthcheck config)
- `server/.env.example` (includes production env variables)

## Local Run

1. Install dependencies:

```bash
npm install
```

2. Create env files:

- Copy `server/.env.example` to `server/.env`
- Copy `client/.env.local.example` to `client/.env.local`

3. Start both apps:

```bash
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`

## Deploy To Railway + Vercel (Step By Step)

### A. Push your code to GitHub

1. Create a GitHub repo.
2. Push this project to that repo.

### B. Deploy backend on Railway

1. Go to Railway and create a new project.
2. Choose **Deploy from GitHub repo** and select this repo.
3. In Railway service settings, set the **Root Directory** to repo root (where `railway.json` is).
4. Add environment variables:
   - `CLIENT_ORIGIN=https://YOUR_VERCEL_DOMAIN`
   - `AUTH_SECRET=LONG_RANDOM_SECRET_STRING`
   - `ALLOW_VERCEL_PREVIEW=true` (optional but recommended)
5. Add a persistent volume for SQLite:
   - Create volume and mount to `/app/server/data`
   - This keeps `oneboard.db` across restarts/deploys.
6. Deploy. Confirm health check passes at `/health`.
7. Copy your Railway backend URL, for example:
   - `https://oneboard-api-production.up.railway.app`

### C. Deploy frontend on Vercel

1. Go to Vercel and import the same GitHub repo.
2. In project settings:
   - Set **Root Directory** to `client`
3. Add environment variables:
   - `NEXT_PUBLIC_API_URL=https://YOUR_RAILWAY_BACKEND_URL`
   - `NEXT_PUBLIC_SOCKET_URL=https://YOUR_RAILWAY_BACKEND_URL`
4. Deploy.
5. Copy your Vercel domain, for example:
   - `https://oneboard.vercel.app`

### D. Wire CORS correctly (important)

1. Go back to Railway env vars.
2. Set `CLIENT_ORIGIN` to your Vercel URL (or multiple, comma-separated), e.g.:

```text
https://oneboard.vercel.app,https://oneboard-git-main-yourname.vercel.app
```

3. Redeploy Railway.

### E. Verify production

1. Open Vercel app URL.
2. Go to Teacher page.
3. Create a teacher account and sign in.
4. Start a session.
5. Open Student page in another browser/device.
6. Join with code and submit response.
7. Confirm live updates appear on teacher board.

## Required Environment Variables

### Railway (server)

- `CLIENT_ORIGIN`
- `AUTH_SECRET`
- `ALLOW_VERCEL_PREVIEW` (`true` or `false`)
- `PORT` is provided by Railway automatically.

### Vercel (client)

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SOCKET_URL`

## Notes

- Teacher operations are protected by account auth and session ownership checks.
- Students still join only with join code (as intended).
- SQLite is acceptable if mounted on a persistent Railway volume.
- If usage grows, migrate DB to Postgres.
