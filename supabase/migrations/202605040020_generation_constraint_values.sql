-- Allow PRD research/regeneration generation metadata values used by current RPCs.

alter table public.learning_sprints
  drop constraint if exists learning_sprints_generation_status_check;

alter table public.learning_sprints
  add constraint learning_sprints_generation_status_check
  check (generation_status in ('pending_adriano', 'ready', 'failed', 'regenerated', 'research_ready'));

alter table public.generation_requests
  drop constraint if exists generation_requests_request_type_check;

alter table public.generation_requests
  add constraint generation_requests_request_type_check
  check (request_type in ('sprint_overview', 'daily_learnable', 'sprint_overview_regenerate', 'researched_sprint_overview'));
