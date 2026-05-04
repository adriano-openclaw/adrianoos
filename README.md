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
- `/api/cron/daily`, `/api/adriano/generation-context`, and `/api/adriano/day-content` require `Authorization: Bearer <ADRIANOOS_CRON_SECRET>` in production.
- Tables stay locked down with RLS; exposed access goes through security-definer RPCs.

## Current generation model

The app does **not** embed an LLM provider key. It supports an Adriano/OpenClaw external research-generation handoff plus a deterministic fallback so the app never goes blank.

1. Adriane submits topic details in the app.
2. Server persists a draft sprint and fallback 7-day overview in normalized Supabase rows.
3. OpenClaw can fetch protected generation context from `GET /api/adriano/generation-context` with `Authorization: Bearer <ADRIANOOS_CRON_SECRET>`.
4. If the context says `research_sprint_overview`, OpenClaw researches externally and saves the researched 7-day overview through `POST /api/adriano/overview`.
5. When Adriane starts the draft, Day 1 learnable/cards are generated so Today is usable.
6. For active sprints, OpenClaw can research and save daily learnable/cards through `POST /api/adriano/day-content` with the same Bearer secret.
7. JSON import restores sprint overview plus any included daily learnables/flashcards.
8. Vercel Cron checks progress at 5 AM PH.
9. If prior work is incomplete, cron marks missed/partial progress, assigns catch-up, and does not skip ahead.
10. If complete, cron advances/generates or reuses the next day.
11. Reports are persisted and Discord sends are idempotent.

## Verification

```bash
npm run lint
npm run build
npm audit --audit-level=moderate
```
