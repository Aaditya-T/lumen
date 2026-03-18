# Supabase Realtime Pixel Painter

Collaborative `64x64` pixel board with:
- Supabase Auth (email/password)
- Supabase Postgres backend
- Realtime canvas updates
- Rolling cooldown: `5` paints per `1` minute per user

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

- Unauthenticated users are redirected to `/login`.
- Painting is performed via `place_pixel` RPC to enforce cooldown on the server.
- Direct client writes to pixel tables are blocked by RLS policies.

## Manual Validation Checklist

1. Open the app in two browser windows and sign in with two users.
2. Paint from window A and confirm the same pixel updates in window B immediately.
3. Paint 5 pixels within 1 minute using one user, then attempt a 6th paint.
4. Confirm the 6th paint is rejected with a cooldown message.
5. Wait until cooldown expires, then confirm painting succeeds again.
