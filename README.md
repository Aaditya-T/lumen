# Lumen

**Lumen** is a collaborative pixel board: a shared `64×64` grid where authenticated users paint together and see each other’s changes in real time. The backend is [Supabase](https://supabase.com) (Postgres + Auth + Realtime); the UI is a [Next.js](https://nextjs.org) app. Painting is enforced on the server with a **rolling rate limit** so clients cannot cheat the cooldown.

## Features

- **Shared canvas** — One global board; each cell is a `#RRGGBB` color keyed by `(x, y)` with `0 ≤ x, y < 64`.
- **Realtime sync** — Subscribes to Postgres changes on `pixel_cells`; when anyone paints, other tabs update without refresh.
- **Presence** — Realtime presence channel counts **peer connections** (tabs) and **distinct online users** for a lightweight “who’s here” signal.
- **Auth** — Email/password **sign-in** and **sign-up** on `/login`; unauthenticated visitors are redirected away from the board.
- **Rate limiting** — At most **5 paints per rolling 60 seconds** per user, enforced inside Postgres by the `place_pixel` RPC (counts recent rows in `pixel_events`). The UI mirrors this with a local window and progress bar for instant feedback; the server remains authoritative.
- **Security** — Row Level Security (RLS): authenticated users can **read** the board and **read their own** paint history rows; **insert/update** on `pixel_cells` and `pixel_events` from the client are denied—only the security-definer RPC writes those tables.
- **Palette** — Preset swatches plus a native color picker.

## What it does (user flow)

1. Sign up or sign in on `/login`.
2. The home page loads the current board from Postgres (server component).
3. Click a cell to paint with the selected color; the app calls `place_pixel`.
4. On success, Realtime broadcasts the row change; all subscribers merge it into local state.
5. After five paints in one minute, further paints fail until the window rolls forward; the footer shows cooldown and remaining quota.

## How it works (architecture)

| Layer | Role |
|--------|------|
| **`src/proxy.ts`** | Next.js **proxy** (edge): refreshes the Supabase session from cookies on each matched request so SSR and the browser stay aligned. |
| **`src/app/page.tsx`** | Server component: requires a session, loads `pixel_cells` into `initialCells`, renders `PixelBoard`. |
| **`src/components/pixel-board.tsx`** | Client component: grid UI, `place_pixel` RPC, Realtime channel on `pixel_cells`, presence channel, optional reads of own `pixel_events` to refresh the local rate-limit window. |
| **`supabase/schema.sql`** | Defines `pixel_cells` (current board), `pixel_events` (append-only audit + rate window), RLS policies, and **`place_pixel`** (validation + cooldown + upsert). |

**Data model (short):** `pixel_cells` holds the live grid (primary key `(x, y)`). Each successful paint appends to `pixel_events` and upserts `pixel_cells`. Cooldown logic counts `pixel_events` for `auth.uid()` in the last minute.

## Tech stack

| Area | Choices |
|------|---------|
| **Framework** | Next.js 16 (App Router), React 19 |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS v4 |
| **Auth & DB** | Supabase Auth, Supabase client (`@supabase/supabase-js`), SSR helpers (`@supabase/ssr`) |
| **Realtime** | Supabase Realtime (Postgres changes + presence) |
| **Database** | PostgreSQL (via Supabase), RLS, `plpgsql` RPC (`security definer`) |

**Repository highlights**

- `src/lib/supabase/` — Browser and server Supabase clients; middleware helper used by the proxy for cookie/session refresh.
- `src/lib/constants.ts` — Board size (`64`), rate limit (`5` / `60s`), shared types.
- `src/app/login/` — Login and sign-up form.

## 1) Configure environment

Copy `.env.example` to `.env.local` and fill in your project values:

```bash
cp .env.example .env.local
```

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional (recommended for auth email links):
- `NEXT_PUBLIC_SITE_URL` (for example `https://your-deployed-domain.com`)

## 2) Create database schema

Run the SQL in `supabase/schema.sql` using Supabase SQL Editor.

Then enable Realtime for `public.pixel_cells`:
- Supabase Dashboard -> Database -> Replication
- Add `public.pixel_cells` to `supabase_realtime` publication

## 3) Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- You must add `public.pixel_cells` to the **`supabase_realtime`** publication (see step 2); without it, the UI will not receive live updates.
- `NEXT_PUBLIC_SITE_URL` matters when Supabase sends email confirmation or magic links—set it to your deployed origin in production.

## Manual Validation Checklist

1. Open the app in two browser windows and sign in with two users.
2. Paint from window A and confirm the same pixel updates in window B immediately.
3. Paint 5 pixels within 1 minute using one user, then attempt a 6th paint.
4. Confirm the 6th paint is rejected with a cooldown message.
5. Wait until cooldown expires, then confirm painting succeeds again.
