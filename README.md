# OneBoard

OneBoard is a real-time classroom thinking wall with separate Teacher and Student interfaces.

## Stack

- Frontend: Next.js (React, TypeScript)
- Backend: Node.js + Express + Socket.io
- Database: SQLite (`better-sqlite3`)
- Auth: Teacher email/password login

## Deployment Files

- `render.yaml` (Render backend service + persistent disk)
- `server/.env.example` (server env template)

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

## Deploy To Render + Vercel (Step By Step)

### 1. Push code to GitHub

- Push your latest `main` branch to `JamesBrittainCode/OneBoard`.

### 2. Deploy backend on Render

1. Go to [Render](https://render.com) -> `New` -> `Blueprint`.
2. Select your GitHub repo (`JamesBrittainCode/OneBoard`).
3. Render detects `render.yaml` and creates service `oneboard-api`.
4. In service `Environment`, set:
   - `CLIENT_ORIGIN=https://YOUR_VERCEL_DOMAIN`
   - `AUTH_SECRET=LONG_RANDOM_SECRET_STRING`
   - `ALLOW_VERCEL_PREVIEW=true`
5. Confirm persistent disk is attached:
   - Mount path should be `/opt/render/project/src/data`
6. Deploy and copy backend URL, e.g.:
   - `https://oneboard-api.onrender.com`
7. Verify health endpoint:
   - `https://oneboard-api.onrender.com/health`

### 3. Deploy frontend on Vercel

1. Go to [Vercel](https://vercel.com) -> `Add New` -> `Project`.
2. Import `JamesBrittainCode/OneBoard`.
3. Set **Root Directory** to `client`.
4. Add env variables:
   - `NEXT_PUBLIC_API_URL=https://YOUR_RENDER_BACKEND_URL`
   - `NEXT_PUBLIC_SOCKET_URL=https://YOUR_RENDER_BACKEND_URL`
5. Deploy and copy Vercel URL, e.g.:
   - `https://oneboard.vercel.app`

### 4. Final CORS wiring

- Go back to Render env vars and update `CLIENT_ORIGIN` to your real Vercel domains.
- You can comma-separate multiple domains, example:

```text
https://oneboard.vercel.app,https://oneboard-git-main-jamesbrittaincode.vercel.app
```

- Redeploy Render service.

### 5. Verify production

1. Open Vercel URL.
2. Teacher page -> create account/login.
3. Launch a session.
4. Student page -> join with code -> submit response.
5. Confirm live updates on teacher board.

## Required Environment Variables

### Render (server)

- `CLIENT_ORIGIN`
- `AUTH_SECRET`
- `ALLOW_VERCEL_PREVIEW`

### Vercel (client)

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SOCKET_URL`

## Notes

- Teacher actions are protected by account auth + session ownership checks.
- Students join by code only (as designed).
- SQLite data persists because of the Render disk mount.
- If usage grows, migrate from SQLite to Postgres.
