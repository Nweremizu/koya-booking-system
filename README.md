# Clinic booking

- **API** (repo root): Express + TypeScript, deployed on Render. Spec: koyaacademy.com/assessment-api.
- **Web app** (`web/`): React + Tailwind + shadcn/ui, deployed on Vercel. It talks to the API through
  `web/api/proxy.ts`, which adds the API key server-side, so the key never reaches the browser.

## Storage

`DATABASE_URL` set → Postgres (Neon, Supabase, or any Postgres). Unset → `db.json` in the working directory.
The Postgres schema is created on startup (`src/store/postgres.ts`, `SCHEMA`). A unique index on
confirmed bookings per slot is what stops double-booking.

Use Postgres in production: Render's free disk is wiped on every redeploy and restart.

## Run locally

```bash
cp .env.example .env              # set API_KEY (and DATABASE_URL to use Postgres)
npm install && npm run dev        # API on http://localhost:8703

cd web
cp .env.example .env              # API_URL=http://localhost:8703, same API_KEY
npm install && npm run dev        # web app on http://localhost:5173
```

Check every level against any deployment. **This calls /reset and wipes all bookings:**

```bash
BASE_URL=https://your-api.onrender.com API_KEY=... node check.mjs
```

## Deploy

1. **Database**: create a Neon or Supabase project and copy its connection string.
   - Neon: the default connection string (it includes `sslmode=require`).
   - Supabase: Project Settings → Database → Connection string. Either pooler works.
2. **API on Render**: New → Web Service from this repo, root directory left blank.
   - Build: `npm install && npm run build` · Start: `npm start`
   - Env: `API_KEY`, `DATABASE_URL`
3. **Web on Vercel**: New Project from this repo, **Root Directory `web`** (framework: Vite).
   - Env: `API_URL=https://<your-api>.onrender.com`, `API_KEY` (same as Render)
4. Seed slots: `POST /reset` straight to the Render URL with your key. The web proxy blocks `/reset`.

Idempotency keys and rate-limit counters live in API memory, which is fine for one Render instance.
Move them to Postgres or Redis before running more than one.
