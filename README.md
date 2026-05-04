# AdrianoOS

Private single-user learning sprint app for Adriane.

## Production architecture

- Next.js App Router + TypeScript + Tailwind
- Supabase Postgres with RLS enabled and deny-all table policies
- Server/RPC access only for app data
- Normalized learning tables: topics, sprints, days, flashcards, reviews, progress, cron reports
- Daily Vercel Cron at 5 AM Asia/Manila (`0 21 * * *` UTC)
- Discord report channel: `1500687653798940822`

## Required environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
ADRIANOOS_SETUP_TOKEN=
ADRIANOOS_CRON_SECRET=
CRON_SECRET= # same value as ADRIANOOS_CRON_SECRET for Vercel Cron Authorization header
DISCORD_LEARNABLES_CHANNEL_ID=1500687653798940822
DISCORD_BOT_TOKEN=
```

## Setup/security notes

- First setup requires `ADRIANOOS_SETUP_TOKEN` and stores only a bcrypt hash in Supabase.
- `ADRIANOOS_CRON_SECRET` is hashed in `app_config` via `adrianoos_set_cron_secret`.
- `/api/cron/daily` requires `Authorization: Bearer <ADRIANOOS_CRON_SECRET>` in production.
- Tables stay locked down with RLS; exposed access goes through security-definer RPCs.

## Current generation model

The app does **not** embed an LLM provider key. Sprint/day generation is server-side deterministic scaffolding for now, designed as the handoff point for Adriano-operated generation. The durable flow is:

1. Adriane submits topic details in the app.
2. Server persists normalized topic/sprint/day rows in Supabase.
3. Day 1 learnable/cards are generated immediately so Today is usable.
4. Vercel Cron checks progress at 5 AM PH.
5. If prior work is incomplete, cron assigns catch-up and does not skip ahead.
6. If complete, cron advances/generates the next day.
7. Reports are persisted and Discord sends are idempotent.

## Verification

```bash
npm run lint
npm run build
npm audit --audit-level=moderate
```
