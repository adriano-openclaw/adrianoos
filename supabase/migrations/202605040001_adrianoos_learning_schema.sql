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
-- Production normalized RPC layer for AdrianoOS.

alter table public.learning_topics add column if not exists sprint_days integer not null default 7 check (sprint_days between 1 and 14);
alter table public.learning_sprints add column if not exists generation_status text not null default 'ready' check (generation_status in ('pending_adriano','ready','failed'));
alter table public.learning_days add column if not exists report_sent_at timestamptz;
alter table public.cron_reports add column if not exists status text not null default 'created' check (status in ('created','sent','failed','skipped'));
alter table public.cron_reports add column if not exists report_type text not null default 'daily' check (report_type in ('daily','catchup','idle','error'));
alter table public.cron_reports add constraint cron_reports_unique_date unique (report_date, report_type);

create table if not exists public.generation_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('sprint_overview','daily_learnable')),
  topic_id uuid references public.learning_topics(id) on delete cascade,
  sprint_id uuid references public.learning_sprints(id) on delete cascade,
  learning_day_id uuid references public.learning_days(id) on delete cascade,
  input_json jsonb not null,
  output_json jsonb,
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.generation_requests enable row level security;
do $$ begin create policy "deny all generation_requests" on public.generation_requests for all using (false) with check (false); exception when duplicate_object then null; end $$;
create index if not exists idx_generation_requests_status on public.generation_requests(status, created_at);
create unique index if not exists idx_one_active_sprint on public.learning_sprints(status) where status = 'active';

create or replace function public.adrianoos_validate_session(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists(select 1 from public.app_sessions where id = p_session_id and expires_at > now());
$$;

create or replace function public.adrianoos_active_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  sprint_row record;
  days_json jsonb;
  cards_json jsonb;
  progress_json jsonb;
begin
  if not public.adrianoos_validate_session(p_session_id) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select s.*, t.title as topic_title, t.description, t.current_level, t.goal, t.target_outcome, t.daily_study_minutes, t.sprint_days, t.urgency
    into sprint_row
  from public.learning_sprints s
  join public.learning_topics t on t.id = s.topic_id
  where s.status = 'active'
  order by s.created_at desc
  limit 1;

  if sprint_row.id is null then
    return jsonb_build_object('ok', true, 'activeSprint', null);
  end if;

  select coalesce(jsonb_agg(to_jsonb(d) order by d.day_index), '[]'::jsonb) into days_json
  from public.learning_days d where d.sprint_id = sprint_row.id;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) into cards_json
  from public.flashcards c where c.sprint_id = sprint_row.id;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.date), '[]'::jsonb) into progress_json
  from public.daily_progress p where p.sprint_id = sprint_row.id;

  return jsonb_build_object(
    'ok', true,
    'activeSprint', to_jsonb(sprint_row),
    'days', days_json,
    'flashcards', cards_json,
    'progress', progress_json
  );
end;
$$;

create or replace function public.adrianoos_create_sprint(p_session_id uuid,p_topic text,p_description text,p_current_level text,p_goal text,p_target_outcome text,p_daily_study_minutes integer,p_sprint_days integer,p_urgency text,p_overview_json jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_topic_id uuid; v_sprint_id uuid; v_day jsonb;
begin
  if not public.adrianoos_validate_session(p_session_id) then return jsonb_build_object('ok', false, 'error', 'Unauthorized'); end if;
  update public.learning_sprints set status = 'archived', updated_at = now() where status = 'active';
  insert into public.learning_topics(title, description, current_level, goal, target_outcome, daily_study_minutes, sprint_days, urgency, status)
  values (p_topic, p_description, p_current_level, p_goal, p_target_outcome, p_daily_study_minutes, p_sprint_days, nullif(p_urgency,''), 'active') returning id into v_topic_id;
  insert into public.learning_sprints(topic_id, title, overview_json, status, start_date, target_end_date, max_end_date, current_day_index, generation_status)
  values (v_topic_id, p_topic, p_overview_json, 'active', current_date, current_date + (p_sprint_days - 1), current_date + 13, 1, 'ready') returning id into v_sprint_id;
  for v_day in select * from jsonb_array_elements(p_overview_json -> 'days') loop
    insert into public.learning_days(sprint_id, day_index, scheduled_date, title, objective, overview_json, status)
    values (v_sprint_id, (v_day->>'dayIndex')::int, current_date + (((v_day->>'dayIndex')::int) - 1), v_day->>'title', v_day->>'objective', v_day, case when (v_day->>'dayIndex')::int = 1 then 'assigned' else 'not_started' end);
  end loop;
  insert into public.daily_progress(sprint_id, date, status) values (v_sprint_id, current_date, 'started') on conflict (sprint_id, date) do nothing;
  insert into public.generation_requests(request_type, topic_id, sprint_id, input_json, output_json, status, completed_at) values ('sprint_overview', v_topic_id, v_sprint_id, p_overview_json, p_overview_json, 'completed', now());
  return jsonb_build_object('ok', true, 'sprintId', v_sprint_id, 'topicId', v_topic_id);
end;
$$;

create or replace function public.adrianoos_save_day_content(
  p_secret text,
  p_sprint_id uuid,
  p_day_index integer,
  p_learnable_json jsonb,
  p_flashcards_json jsonb,
  p_report_markdown text,
  p_report_type text default 'daily'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  day_id uuid;
  card jsonb;
  report_id uuid;
begin
  if not exists (select 1 from public.app_config where key = 'cron_secret' and value_hash = crypt(p_secret, value_hash)) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select id into day_id from public.learning_days where sprint_id = p_sprint_id and day_index = p_day_index;
  if day_id is null then
    return jsonb_build_object('ok', false, 'error', 'Day not found');
  end if;

  update public.learning_days
  set learnable_json = p_learnable_json, generated_at = now(), status = case when status = 'complete' then status else 'assigned' end, updated_at = now()
  where id = day_id;

  delete from public.flashcards where learning_day_id = day_id and not exists (select 1 from public.flashcard_reviews r where r.flashcard_id = flashcards.id);
  for card in select * from jsonb_array_elements(p_flashcards_json) loop
    insert into public.flashcards(sprint_id, learning_day_id, card_json, type, difficulty, tags)
    values (p_sprint_id, day_id, card, card->>'type', coalesce(card->>'difficulty','medium'), coalesce(array(select jsonb_array_elements_text(coalesce(card->'tags','[]'::jsonb))), '{}'));
  end loop;

  insert into public.cron_reports(sprint_id, learning_day_id, report_date, report_type, discord_channel_id, report_markdown, status)
  values (p_sprint_id, day_id, current_date, p_report_type, '1500687653798940822', p_report_markdown, 'created')
  on conflict (report_date, report_type) do update set report_markdown = excluded.report_markdown, status = 'created'
  returning id into report_id;

  return jsonb_build_object('ok', true, 'learningDayId', day_id, 'reportId', report_id);
end;
$$;

create or replace function public.adrianoos_mark_lesson_complete(p_session_id uuid, p_learning_day_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s_id uuid;
  d_date date;
  cards_done boolean;
begin
  if not public.adrianoos_validate_session(p_session_id) then return jsonb_build_object('ok', false, 'error', 'Unauthorized'); end if;
  select sprint_id, coalesce(scheduled_date, current_date) into s_id, d_date from public.learning_days where id = p_learning_day_id;
  if s_id is null then return jsonb_build_object('ok', false, 'error', 'Day not found'); end if;
  update public.learning_days set lesson_completed_at = now(), status = case when flashcards_completed_at is not null then 'complete' else 'lesson_done' end, updated_at = now() where id = p_learning_day_id;
  select flashcards_completed_at is not null into cards_done from public.learning_days where id = p_learning_day_id;
  insert into public.daily_progress(sprint_id, date, status, lesson_completed, flashcards_completed)
  values (s_id, d_date, case when cards_done then 'complete' else 'lesson_done' end, true, cards_done)
  on conflict (sprint_id, date) do update set lesson_completed = true, flashcards_completed = cards_done, status = case when cards_done then 'complete' else 'lesson_done' end, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.adrianoos_review_card(p_session_id uuid, p_flashcard_id uuid, p_rating text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s_id uuid;
  d_id uuid;
  d_date date;
  all_reviewed boolean;
  lesson_done boolean;
begin
  if not public.adrianoos_validate_session(p_session_id) then return jsonb_build_object('ok', false, 'error', 'Unauthorized'); end if;
  if p_rating not in ('correct','wrong','unsure') then return jsonb_build_object('ok', false, 'error', 'Invalid rating'); end if;
  select sprint_id, learning_day_id into s_id, d_id from public.flashcards where id = p_flashcard_id;
  if s_id is null then return jsonb_build_object('ok', false, 'error', 'Card not found'); end if;
  insert into public.flashcard_reviews(flashcard_id, sprint_id, learning_day_id, rating) values (p_flashcard_id, s_id, d_id, p_rating);
  select not exists (select 1 from public.flashcards f where f.learning_day_id = d_id and not exists (select 1 from public.flashcard_reviews r where r.flashcard_id = f.id)) into all_reviewed;
  select lesson_completed_at is not null, coalesce(scheduled_date,current_date) into lesson_done, d_date from public.learning_days where id = d_id;
  if all_reviewed then
    update public.learning_days set flashcards_completed_at = now(), status = case when lesson_done then 'complete' else 'cards_done' end, updated_at = now() where id = d_id;
  end if;
  insert into public.daily_progress(sprint_id, date, status, lesson_completed, flashcards_completed)
  values (s_id, d_date, case when lesson_done and all_reviewed then 'complete' when all_reviewed then 'cards_done' else 'started' end, lesson_done, all_reviewed)
  on conflict (sprint_id, date) do update set lesson_completed = lesson_done, flashcards_completed = all_reviewed, status = case when lesson_done and all_reviewed then 'complete' when all_reviewed then 'cards_done' when lesson_done then 'lesson_done' else 'started' end, updated_at = now();
  return jsonb_build_object('ok', true, 'allReviewed', all_reviewed);
end;
$$;

create or replace function public.adrianoos_cron_active_state(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  sprint_row record;
  yesterday_day record;
  today_day record;
  weak_cards jsonb;
begin
  if not exists (select 1 from public.app_config where key = 'cron_secret' and value_hash = crypt(p_secret, value_hash)) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select s.*, t.title as topic_title, t.description, t.current_level, t.goal, t.target_outcome, t.daily_study_minutes, t.sprint_days, t.urgency
    into sprint_row
  from public.learning_sprints s join public.learning_topics t on t.id = s.topic_id
  where s.status = 'active'
  order by s.created_at desc limit 1;

  if sprint_row.id is null then return jsonb_build_object('ok', true, 'activeSprint', null); end if;

  select * into today_day from public.learning_days where sprint_id = sprint_row.id and day_index = sprint_row.current_day_index;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into weak_cards
  from (
    select f.id, f.card_json, r.rating from public.flashcards f join public.flashcard_reviews r on r.flashcard_id = f.id
    where f.sprint_id = sprint_row.id and r.rating in ('wrong','unsure')
    order by r.reviewed_at desc limit 10
  ) x;

  return jsonb_build_object('ok', true, 'activeSprint', to_jsonb(sprint_row), 'currentDay', to_jsonb(today_day), 'weakCards', weak_cards);
end;
$$;

create or replace function public.adrianoos_cron_advance_if_complete(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  s record;
  d record;
  next_idx integer;
begin
  if not exists (select 1 from public.app_config where key = 'cron_secret' and value_hash = crypt(p_secret, value_hash)) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;
  select * into s from public.learning_sprints where status='active' order by created_at desc limit 1;
  if s.id is null then return jsonb_build_object('ok', true, 'action', 'idle'); end if;
  select * into d from public.learning_days where sprint_id=s.id and day_index=s.current_day_index;
  if d.lesson_completed_at is null or d.flashcards_completed_at is null then
    update public.learning_days set status='catchup', updated_at=now() where id=d.id and status <> 'complete';
    return jsonb_build_object('ok', true, 'action', 'catchup', 'dayIndex', d.day_index, 'sprintId', s.id);
  end if;
  next_idx := least(s.current_day_index + 1, 14);
  update public.learning_sprints set current_day_index=next_idx, updated_at=now() where id=s.id;
  insert into public.learning_days(sprint_id, day_index, scheduled_date, title, objective, overview_json, status)
  values (s.id, next_idx, current_date, 'Extension / review day', 'Continue essentials or review weak areas.', '{}'::jsonb, 'assigned')
  on conflict (sprint_id, day_index) do update set status = case when learning_days.status = 'complete' then 'complete' else 'assigned' end, updated_at=now();
  return jsonb_build_object('ok', true, 'action', 'advance', 'dayIndex', next_idx, 'sprintId', s.id);
end;
$$;

grant execute on function public.adrianoos_active_snapshot(uuid) to anon;
grant execute on function public.adrianoos_create_sprint(uuid,text,text,text,text,text,integer,integer,text,jsonb) to anon;
grant execute on function public.adrianoos_save_day_content(text,uuid,integer,jsonb,jsonb,text,text) to anon;
grant execute on function public.adrianoos_mark_lesson_complete(uuid,uuid) to anon;
grant execute on function public.adrianoos_review_card(uuid,uuid,text) to anon;
grant execute on function public.adrianoos_cron_active_state(text) to anon;
grant execute on function public.adrianoos_cron_advance_if_complete(text) to anon;

-- Idempotent cron delivery and report status update helpers.
-- See applied migration adrianoos_cron_idempotency_delivery for function bodies.
