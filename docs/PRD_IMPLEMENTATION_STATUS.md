# AdrianoOS PRD Implementation Status

Last checked: 2026-05-04, Asia/Manila
Production URL: https://adrianoos.vercel.app
Repo: https://github.com/adriano-openclaw/adrianoos

This file is the durable checkpoint for PRD comparison. Start here before re-auditing the codebase.

## Status legend

- **Implemented / prod deployed**: code is committed, pushed, deployed to production, and smoke-tested.
- **Implemented / DB applied, pending app deploy**: Supabase change has been applied live, but local repo changes still need commit/push/Vercel deploy.
- **Configured outside repo**: durable OpenClaw runtime config exists outside the app repository.
- **Needs verification**: implemented, but needs first real runtime run or deeper end-to-end proof.

## Implemented features

### 1. App foundation and production deployment

Status: **Implemented / prod deployed**

- Next.js 16.2.4 + TypeScript + App Router + Tailwind.
- Mobile-first calm blue/white/navy UI inspired by the requested palette.
- Production deployment is available at `https://adrianoos.vercel.app`.
- Vercel project is Git-linked to the `main` branch.
- `vercel.json` schedules app cron at `0 21 * * *` UTC = 5:00 AM Asia/Manila.
- `npm run lint`, `npm run build`, and `npm audit --audit-level=moderate` have passed in the latest local verification cycle.

### 2. Private single-user setup/login

Status: **Implemented / prod deployed**

- First setup uses env-backed one-time setup token plus chosen password.
- Password is hashed in Supabase; plaintext password is not stored.
- Normal login requires password only after setup.
- Session is stored in a secure HTTP-only cookie.
- Routes implemented:
  - `POST /api/setup`
  - `GET /api/setup-status`
  - `POST /api/login`
  - `GET /api/session`
  - `POST /api/logout`
- Login was decoupled from setup-token requirement via `adrianoos_login_password`.
- Public unauthenticated sprint action routes return clean `401` responses.

### 3. Supabase normalized schema and security posture

Status: **Implemented / prod deployed**

- Normalized tables exist for:
  - `app_secret`
  - `app_sessions`
  - `app_config`
  - `learning_topics`
  - `learning_sprints`
  - `learning_days`
  - `flashcards`
  - `flashcard_reviews`
  - `daily_progress`
  - `cron_reports`
  - `generation_requests`
- RLS is enabled on 11/11 checked public tables.
- Tables use deny-by-default policies; app access goes through server routes/security-definer RPCs.
- Cron/app internal routes validate `Authorization: Bearer <ADRIANOOS_CRON_SECRET>`.
- `adrianoos_set_cron_secret` has been hardened in Supabase migration `202605040018_final_prd_security_and_day1.sql` so existing cron secret rotation requires the current secret. This is applied to Supabase, committed, pushed, and production deployed.

### 4. Topic intake

Status: **Implemented / prod deployed**

- Intake form captures:
  - topic/concept name
  - description/context
  - current level
  - learning goal
  - target outcome/work use case
  - daily study time: 30, 60, or 90 minutes
  - optional urgency/deadline
- Sprint length is fixed to default 7 days in the UI, with adaptive max 14.
- Route: `POST /api/sprints`.

### 5. Sprint overview generation and draft lifecycle

Status: **Implemented / prod deployed**

- Intake generates a 7-day sprint overview upfront.
- Overview includes day index, title, objective, expected outcome, focus, and difficulty.
- Sprint creation now creates a `draft` sprint rather than immediately active.
- `Start sprint` persists draft → active transition via `POST /api/sprints/start`.
- Starting a sprint no longer generates Day 1 content directly; daily content is left to cron/research flow.
- Latest completed sprint remains visible instead of making the app blank.
- `Regenerate overview` exists before start and regenerates the current draft in-place through:
  - `POST /api/sprints/regenerate`
  - Supabase RPC `adrianoos_regenerate_draft_overview`
- Regenerate in-place migration is `202605040017_regenerate_draft_overview.sql` and has been applied/deployed.

### 6. Sprint overview page actions

Status: **Implemented / prod deployed**

Overview page supports:

- Start sprint.
- Export JSON.
- Import JSON.
- Regenerate overview before start.
- Shows topic summary, sprint status, current day pointer, target/max dates, and the 7-day overview.

### 7. Today / daily learnable viewer

Status: **Implemented / prod deployed**

- Today view renders structured learnable JSON.
- Supports lesson sections including overview, explanation, example, visual/diagram, review/reflection sections.
- References are shown at the bottom.
- Catch-up warning is shown when behind.
- Lesson completion is persisted via `POST /api/days/[id]/lesson-complete`.
- Mini progress chart appears in Today.
- Current day is highlighted.

### 8. Daily content generation quality

Status: **Implemented as deterministic fallback + protected external research handoff; autonomous worker configured outside repo; first real worker run still needs verification**

- Deterministic fallback generator creates substantial content for 30/60/90 minute study blocks.
- 90-minute lessons include multiple reading sections, diagrams/concept flows, examples, common mistake walkthrough, MCQ checkpoint, written checkpoint, and references.
- App contains no LLM provider key.
- Protected handoff endpoints exist for Adriano/OpenClaw generation:
  - `GET /api/adriano/generation-context`
  - `POST /api/adriano/overview`
  - `POST /api/adriano/day-content`
- Supabase RPCs exist for generation context and researched overview save:
  - `adrianoos_generation_context`
  - `adrianoos_save_researched_overview`
- OpenClaw cron job exists outside the repo:
  - name: `adrianoos-research-generation`
  - schedule: `30 4 * * *` Asia/Manila
  - session: isolated
  - delivery: none
  - purpose: run before 5 AM app cron, fetch context, research externally, then post researched overview/day content back through protected endpoints.
- Worker instructions are documented in `scripts/adrianoos-research-worker.md`.
- Remaining proof needed: first successful scheduled or manual OpenClaw worker run that posts researched content.

### 9. Flashcards

Status: **Implemented / prod deployed**

- Flashcard types supported:
  - basic
  - multiple choice
  - cloze
  - scenario
- Grading options:
  - Correct
  - Wrong
  - Unsure
- Flashcard review persisted via `POST /api/flashcards/[id]/reviews`.
- Daily completion requires both lesson and flashcards.
- Flashcard completion summary shows Correct/Wrong/Unsure counts.
- Weak/review cards are marked visually.
- Card volume adapts by study time:
  - 30 minutes: 8 cards
  - 60 minutes: 12 cards
  - 90 minutes: 15 cards
- Wrong/unsure cards return first; cumulative review cards can return across later days.

### 10. Adaptive learning behavior

Status: **Implemented / prod deployed**, heuristic-based

- Weak/wrong/unsure cards are included in later generation context and prioritized first.
- Cumulative review cards are included from prior days.
- Strong performance heuristic exists:
  - if there are no weak cards and at least 3 correct review cards, generation enters `strong` mode.
  - strong mode reduces beginner scaffolding, increases difficulty, adds senior-depth prompts, and tags ramped cards.
- Catch-up mode is strict and prevents skipping ahead.
- Later days emphasize tradeoffs, debugging, operational signals, building/decision-making, and work scenarios.

### 11. Missed day, catch-up, and sprint extension

Status: **Implemented / prod deployed**

- Cron uses Asia/Manila date logic.
- If prior generated work is incomplete after schedule, sprint stays on the current learning day and assigns catch-up.
- Missed scheduled day and catch-up day are tracked separately in `daily_progress`.
- UI maps `daily_progress` back into the progress chart so missed/catch-up states show correctly.
- Sprint target end date extends within max end date when needed.
- Max sprint length is 14 days.
- At Day 14/max date with incomplete work, cron returns/sends a `maxed` recommendation: essentials-only, continuation sprint, or archive/restart.
- Final DB migration `202605040018_final_prd_security_and_day1.sql` fixes first Day 1/current-day cron generation so an ungenerated same-day assignment is reported as normal `generate`, not falsely as catch-up. This migration is applied to Supabase, committed, pushed, and production deployed.

### 12. Progress and streak tracking

Status: **Implemented / prod deployed**

- GitHub-like contribution chart exists.
- Tracks separate states:
  - none/not started
  - started
  - lesson done
  - cards done
  - complete
  - missed
  - catch-up
- Current day is outlined/highlighted.
- Counts shown include completion, partial, missed, and weak-card stats.
- Streak uses consecutive full completions, not just total complete days.

### 13. 5 AM Discord report

Status: **Implemented / prod deployed**

- Vercel cron route: `GET /api/cron/daily`.
- Production cron requires Bearer secret.
- Manual/local trigger is allowed only outside production with a special header.
- Cron decides among idle, generate, catch-up, advance, completed, and maxed states.
- Cron saves generated learnable/cards/report to Supabase.
- Cron sends report to Discord channel `1500687653798940822` through `DISCORD_BOT_TOKEN`.
- Delivery state is persisted in `cron_reports` with status, `sent_at`, `message_id`, and `delivery_attempted_at` fields.
- Discord sends are idempotent per learning day/report type/date.
- A real Discord smoke message was previously sent and report status persisted.
- Public unauthenticated cron returns `401`.

### 14. Import/export

Status: **Implemented / prod deployed**, acceptable MVP but still combined-snapshot style

- Export route: `GET /api/export`.
- Import route: `POST /api/import`.
- Export includes snapshot data for active sprint, overview, days, flashcards, reviews/progress context.
- Import validates schema version and required overview/day shapes.
- Import creates a fresh sprint and restores included daily learnables/flashcards when present.
- Caveat: export is one combined snapshot file, not three separate buttons/files for overview/daily content/flashcards. This has been treated as acceptable MVP coverage so far, but it is a possible PRD strictness check item.

### 15. API route inventory

Status: **Implemented / prod deployed unless noted**

- `POST /api/setup`
- `GET /api/setup-status`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/session`
- `POST /api/sprints`
- `GET /api/sprints/active`
- `POST /api/sprints/start`
- `POST /api/sprints/regenerate`
- `POST /api/days/[id]/lesson-complete`
- `POST /api/flashcards/[id]/reviews`
- `GET /api/export`
- `POST /api/import`
- `GET /api/cron/daily`
- `GET /api/adriano/generation-context`
- `POST /api/adriano/overview`
- `POST /api/adriano/day-content`
- Legacy/compat: `GET /api/state`

## Known remaining todo / verification queue

1. **Verify first normal Day 1 app cron behavior**
   - DB function inspection confirms a newly assigned same-day Day 1/current day with no `learnable_json` returns `action: generate`, not `catchup`.
   - Still useful to run a controlled end-to-end fixture or observe the next real cron run.

2. **Verify autonomous OpenClaw worker first run**
   - Cron job exists and is enabled outside repo, but first successful run has not yet been observed.
   - Job ID: `6eecbb53-f355-4783-a252-5c1f2ad20110`.
   - Name: `adrianoos-research-generation`.
   - Schedule: 4:30 AM Asia/Manila.
   - Next step: run manually once or wait for scheduled run, then inspect logs/output and Supabase `generation_requests`.

3. **Final PRD strictness audit**
   - After the above, compare this file against the PRD again.
   - Pay special attention to strict import/export interpretation: combined snapshot vs separate overview/daily/flashcard exports.
