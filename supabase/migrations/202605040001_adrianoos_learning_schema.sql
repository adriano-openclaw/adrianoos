-- AdrianoOS Personal Learning OS MVP schema
-- Review before applying to Supabase production.

create extension if not exists pgcrypto;

create table if not exists public.app_secret (
  id uuid primary key default gen_random_uuid(),
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  current_level text not null,
  goal text not null,
  target_outcome text not null,
  daily_study_minutes integer not null check (daily_study_minutes in (30, 60, 90)),
  urgency text,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_sprints (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.learning_topics(id) on delete cascade,
  title text not null,
  overview_json jsonb not null,
  status text not null default 'draft' check (status in ('draft','active','completed','archived')),
  start_date date,
  target_end_date date,
  max_end_date date,
  current_day_index integer not null default 1 check (current_day_index between 1 and 14),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_days (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.learning_sprints(id) on delete cascade,
  day_index integer not null check (day_index between 1 and 14),
  scheduled_date date,
  title text not null,
  objective text not null,
  overview_json jsonb not null,
  learnable_json jsonb,
  status text not null default 'not_started' check (status in ('not_started','assigned','started','lesson_done','cards_done','complete','missed','catchup')),
  generated_at timestamptz,
  lesson_completed_at timestamptz,
  flashcards_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sprint_id, day_index)
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.learning_sprints(id) on delete cascade,
  learning_day_id uuid not null references public.learning_days(id) on delete cascade,
  card_json jsonb not null,
  type text not null check (type in ('basic','multiple_choice','cloze','scenario')),
  difficulty text not null check (difficulty in ('beginner','easy','medium','advanced')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  sprint_id uuid not null references public.learning_sprints(id) on delete cascade,
  learning_day_id uuid not null references public.learning_days(id) on delete cascade,
  rating text not null check (rating in ('correct','wrong','unsure')),
  reviewed_at timestamptz not null default now()
);

create table if not exists public.daily_progress (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.learning_sprints(id) on delete cascade,
  date date not null,
  status text not null default 'none' check (status in ('none','started','lesson_done','cards_done','complete','missed','catchup')),
  lesson_completed boolean not null default false,
  flashcards_completed boolean not null default false,
  is_partial boolean generated always as ((lesson_completed or flashcards_completed) and not (lesson_completed and flashcards_completed)) stored,
  is_catchup boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sprint_id, date)
);

create table if not exists public.cron_reports (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid references public.learning_sprints(id) on delete cascade,
  learning_day_id uuid references public.learning_days(id) on delete set null,
  report_date date not null,
  discord_channel_id text not null default '1500687653798940822',
  message_id text,
  report_markdown text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_learning_sprints_status on public.learning_sprints(status);
create index if not exists idx_learning_days_sprint_status on public.learning_days(sprint_id, status);
create index if not exists idx_flashcard_reviews_card_reviewed on public.flashcard_reviews(flashcard_id, reviewed_at desc);
create index if not exists idx_daily_progress_sprint_date on public.daily_progress(sprint_id, date desc);

alter table public.app_secret enable row level security;
alter table public.learning_topics enable row level security;
alter table public.learning_sprints enable row level security;
alter table public.learning_days enable row level security;
alter table public.flashcards enable row level security;
alter table public.flashcard_reviews enable row level security;
alter table public.daily_progress enable row level security;
alter table public.cron_reports enable row level security;

-- Single-user private MVP: deny browser/client access by default.
-- Server routes should use service role or direct Postgres connection only.
create policy "deny all app_secret" on public.app_secret for all using (false) with check (false);
create policy "deny all learning_topics" on public.learning_topics for all using (false) with check (false);
create policy "deny all learning_sprints" on public.learning_sprints for all using (false) with check (false);
create policy "deny all learning_days" on public.learning_days for all using (false) with check (false);
create policy "deny all flashcards" on public.flashcards for all using (false) with check (false);
create policy "deny all flashcard_reviews" on public.flashcard_reviews for all using (false) with check (false);
create policy "deny all daily_progress" on public.daily_progress for all using (false) with check (false);
create policy "deny all cron_reports" on public.cron_reports for all using (false) with check (false);

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create table if not exists public.app_state (
  id integer primary key default 1 check (id = 1),
  state_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_sessions enable row level security;
alter table public.app_state enable row level security;
create policy "deny all app_sessions" on public.app_sessions for all using (false) with check (false);
create policy "deny all app_state" on public.app_state for all using (false) with check (false);

create or replace function public.adrianoos_setup(p_token_name text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  existing integer;
  sid uuid;
begin
  select count(*) into existing from public.app_secret;
  if existing > 0 then
    return jsonb_build_object('ok', false, 'error', 'App is already set up.');
  end if;
  if length(coalesce(p_token_name, '')) < 3 or length(coalesce(p_password, '')) < 8 then
    return jsonb_build_object('ok', false, 'error', 'Token name and 8+ character password required.');
  end if;
  insert into public.app_secret (password_hash) values (crypt(p_token_name || ':' || p_password, gen_salt('bf', 12)));
  insert into public.app_state (id, state_json) values (1, '{}'::jsonb) on conflict (id) do nothing;
  insert into public.app_sessions default values returning id into sid;
  return jsonb_build_object('ok', true, 'session_id', sid);
end;
$$;

create or replace function public.adrianoos_login(p_token_name text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  sid uuid;
begin
  if exists (select 1 from public.app_secret where password_hash = crypt(p_token_name || ':' || p_password, password_hash)) then
    insert into public.app_sessions default values returning id into sid;
    return jsonb_build_object('ok', true, 'session_id', sid);
  end if;
  return jsonb_build_object('ok', false);
end;
$$;

create or replace function public.adrianoos_get_state(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  current_state jsonb;
begin
  if not exists (select 1 from public.app_sessions where id = p_session_id and expires_at > now()) then
    return jsonb_build_object('ok', false);
  end if;
  select state_json into current_state from public.app_state where id = 1;
  return jsonb_build_object('ok', true, 'state', coalesce(current_state, '{}'::jsonb));
end;
$$;

create or replace function public.adrianoos_save_state(p_session_id uuid, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not exists (select 1 from public.app_sessions where id = p_session_id and expires_at > now()) then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.app_state (id, state_json, updated_at) values (1, p_state, now())
  on conflict (id) do update set state_json = excluded.state_json, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.adrianoos_setup(text, text) to anon;
grant execute on function public.adrianoos_login(text, text) to anon;
grant execute on function public.adrianoos_get_state(uuid) to anon;
grant execute on function public.adrianoos_save_state(uuid, jsonb) to anon;

create or replace function public.adrianoos_setup_status()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('setup_complete', exists(select 1 from public.app_secret));
$$;

grant execute on function public.adrianoos_setup_status() to anon;

create table if not exists public.app_config (
  key text primary key,
  value_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
do $$ begin create policy "deny all app_config" on public.app_config for all using (false) with check (false); exception when duplicate_object then null; end $$;
-- Cron secret functions are applied separately with the secret seeded out-of-band.
