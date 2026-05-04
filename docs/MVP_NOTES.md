# AdrianoOS MVP Notes

Built as a tight personal MVP:

- Next.js 16 + TypeScript + App Router + Tailwind 4.
- Mobile-first calm reading UI using the requested blue/white/navy palette.
- Topic intake generates a 7-day sprint overview.
- Today view renders structured learnable JSON.
- Flashcards support Basic, multiple-choice, cloze, and scenario cards with Correct / Wrong / Unsure grading.
- Progress chart tracks partial/completed/catch-up states separately.
- Import/export works from browser JSON.
- `/api/cron/daily` is the 5 AM Asia/Manila integration seam.
- Supabase schema migration is in `supabase/migrations/202605040001_adrianoos_learning_schema.sql` with RLS enabled and denied by default.

Preview auth note: the current preview uses local browser storage so the UI can be tested without Supabase credentials. Production hardening should replace this with server-only setup/login using the `app_secret` table, a one-time setup token env var, bcrypt/Argon2id, and secure HTTP-only cookies.
