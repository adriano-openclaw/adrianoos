# AdrianoOS MVP Notes

Current production MVP status:

- Next.js 16 + TypeScript + App Router + Tailwind 4.
- Mobile-first calm reading UI using the requested blue/white/navy palette.
- Private single-user setup/login uses Supabase-backed hashed password storage and HTTP-only session cookies.
- First setup requires the one-time deployment setup token; later login requires only the password.
- Topic intake creates a fixed 7-day sprint overview with adaptive max duration of 14 days.
- Today view renders structured learnable JSON with references at the bottom.
- Flashcards support Basic, multiple-choice, cloze, and scenario cards with Correct / Wrong / Unsure grading.
- Progress chart tracks none/started/lesson-only/cards-only/complete/missed/catch-up states and current-day outline.
- Import/export supports browser JSON snapshots; import restores overview and included learnable/flashcard content when present.
- `/api/cron/daily` is the 5 AM Asia/Manila cron integration seam.
- `/api/adriano/generation-context` and `/api/adriano/day-content` are protected OpenClaw/Adriano generation handoff endpoints.
- Supabase migrations live in `supabase/migrations/` with RLS enabled and deny-by-default table policies.
