# AdrianoOS Research Generation Worker

Run as an OpenClaw cron agent job before the Vercel 5 AM Asia/Manila app cron.

## Goal

Autonomously perform the PRD-required Adriano/OpenClaw research-generation handoff without adding any app-side LLM provider key.

## Runtime contract

1. Work from `/root/Projects/adrianoos`.
2. Load local env with `set -a; . ./.env.local; set +a` in shell commands, but never print secrets.
3. Fetch protected context:
   - `GET https://adrianoos.vercel.app/api/adriano/generation-context`
   - Header: `Authorization: Bearer $ADRIANOOS_CRON_SECRET`
4. If `context.generationTask` is `idle`, stop quietly.
5. If `research_sprint_overview`:
   - Research the topic/current level/goal using web search and source pages.
   - Produce a 7-day `SprintOverview` JSON with exactly 7 sequential days.
   - POST to `https://adrianoos.vercel.app/api/adriano/overview` with the same Bearer secret.
6. If `research_daily_content`:
   - Research focused source material for the current day/topic.
   - Produce substantial `DailyLearnable` JSON scaled to the configured study minutes, with examples, diagrams, MCQ checkpoints, and references.
   - Produce 8–20 flashcards, including weak/review cards first when context includes them.
   - POST to `https://adrianoos.vercel.app/api/adriano/day-content` with the same Bearer secret.
7. Do not send Discord messages yourself. The app cron handles Discord report persistence/delivery.
8. Do not commit/push from this worker.
9. If blocked by missing secret or invalid endpoint response, report a concise blocker in the cron run output only.
