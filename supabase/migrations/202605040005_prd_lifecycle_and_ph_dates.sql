-- PRD lifecycle/date hardening for AdrianoOS.
-- Uses Asia/Manila dates for sprint/progress/report decisions, preserves catch-up status,
-- completes a default sprint after planned days when all required work is done, and stops at Day 14.

create or replace function public.adrianoos_create_sprint(
  p_session_id uuid,
  p_topic text,
  p_description text,
  p_current_level text,
  p_goal text,
  p_target_outcome text,
  p_daily_study_minutes integer,
  p_sprint_days integer,
  p_urgency text,
  p_overview_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_topic_id uuid;
  v_sprint_id uuid;
  v_day jsonb;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_sprint_days integer := least(greatest(coalesce(p_sprint_days, 7), 1), 14);
begin
  if not public.adrianoos_validate_session(p_session_id) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  update public.learning_sprints set status = 'archived', updated_at = now() where status = 'active';

  insert into public.learning_topics(title, description, current_level, goal, target_outcome, daily_study_minutes, sprint_days, urgency, status)
  values (p_topic, p_description, p_current_level, p_goal, p_target_outcome, p_daily_study_minutes, v_sprint_days, nullif(p_urgency,''), 'active')
  returning id into v_topic_id;

  insert into public.learning_sprints(topic_id, title, overview_json, status, start_date, target_end_date, max_end_date, current_day_index, generation_status)
  values (v_topic_id, p_topic, p_overview_json, 'active', v_today, v_today + (v_sprint_days - 1), v_today + 13, 1, 'ready')
  returning id into v_sprint_id;

  for v_day in select * from jsonb_array_elements(p_overview_json -> 'days') loop
    insert into public.learning_days(sprint_id, day_index, scheduled_date, title, objective, overview_json, status)
    values (v_sprint_id, (v_day->>'dayIndex')::int, v_today + (((v_day->>'dayIndex')::int) - 1), v_day->>'title', v_day->>'objective', v_day, case when (v_day->>'dayIndex')::int = 1 then 'assigned' else 'not_started' end);
  end loop;

  insert into public.daily_progress(sprint_id, date, status)
  values (v_sprint_id, v_today, 'started')
  on conflict (sprint_id, date) do nothing;

  insert into public.generation_requests(request_type, topic_id, sprint_id, input_json, output_json, status, completed_at)
  values ('sprint_overview', v_topic_id, v_sprint_id, p_overview_json, p_overview_json, 'completed', now());

  return jsonb_build_object('ok', true, 'sprintId', v_sprint_id, 'topicId', v_topic_id);
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
  t record;
  next_idx integer;
  planned_days integer;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if not exists (select 1 from public.app_config where key = 'cron_secret' and value_hash = crypt(p_secret, value_hash)) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select * into s from public.learning_sprints where status='active' order by created_at desc limit 1;
  if s.id is null then return jsonb_build_object('ok', true, 'action', 'idle'); end if;

  select * into t from public.learning_topics where id = s.topic_id;
  planned_days := least(greatest(coalesce((s.overview_json->>'defaultDays')::int, t.sprint_days, 7), 1), 14);

  select * into d from public.learning_days where sprint_id=s.id and day_index=s.current_day_index;
  if d.id is null then return jsonb_build_object('ok', false, 'error', 'Current day not found'); end if;

  if d.lesson_completed_at is null or d.flashcards_completed_at is null then
    update public.learning_days set status='catchup', updated_at=now() where id=d.id and status <> 'complete';
    insert into public.daily_progress(sprint_id, date, status, lesson_completed, flashcards_completed, is_catchup)
    values (s.id, coalesce(d.scheduled_date, v_today), 'catchup', d.lesson_completed_at is not null, d.flashcards_completed_at is not null, true)
    on conflict (sprint_id, date) do update
      set status='catchup',
          lesson_completed = excluded.lesson_completed,
          flashcards_completed = excluded.flashcards_completed,
          is_catchup = true,
          updated_at=now();
    return jsonb_build_object('ok', true, 'action', 'catchup', 'dayIndex', d.day_index, 'sprintId', s.id);
  end if;

  if s.current_day_index >= planned_days then
    update public.learning_sprints set status='completed', updated_at=now() where id=s.id;
    return jsonb_build_object('ok', true, 'action', 'completed', 'dayIndex', d.day_index, 'sprintId', s.id);
  end if;

  if s.current_day_index >= 14 then
    update public.learning_sprints set status='completed', updated_at=now() where id=s.id;
    return jsonb_build_object('ok', true, 'action', 'maxed', 'recommendation', 'Start a continuation sprint or finish essentials-only wrap-up.', 'dayIndex', d.day_index, 'sprintId', s.id);
  end if;

  next_idx := s.current_day_index + 1;
  update public.learning_sprints
    set current_day_index=next_idx,
        target_end_date = least(max_end_date, greatest(coalesce(target_end_date, v_today), v_today + (planned_days - next_idx))),
        updated_at=now()
    where id=s.id;

  insert into public.learning_days(sprint_id, day_index, scheduled_date, title, objective, overview_json, status)
  values (s.id, next_idx, v_today, 'Extension / review day', 'Continue essentials or review weak areas.', '{}'::jsonb, 'assigned')
  on conflict (sprint_id, day_index) do update
    set status = case when learning_days.status = 'complete' then 'complete' else 'assigned' end,
        scheduled_date = coalesce(learning_days.scheduled_date, excluded.scheduled_date),
        updated_at=now();

  return jsonb_build_object('ok', true, 'action', 'advance', 'dayIndex', next_idx, 'sprintId', s.id);
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
  existing_report record;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if not exists (select 1 from public.app_config where key = 'cron_secret' and value_hash = crypt(p_secret, value_hash)) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select id into day_id from public.learning_days where sprint_id = p_sprint_id and day_index = p_day_index;
  if day_id is null then
    return jsonb_build_object('ok', false, 'error', 'Day not found');
  end if;

  select id, status, message_id
    into existing_report
  from public.cron_reports
  where learning_day_id = day_id and report_date = v_today and report_type = p_report_type
  limit 1;

  if existing_report.id is not null and existing_report.status = 'sent' then
    return jsonb_build_object('ok', true, 'alreadySent', true, 'reportId', existing_report.id, 'messageId', existing_report.message_id);
  end if;

  update public.learning_days
  set learnable_json = p_learnable_json,
      generated_at = now(),
      status = case when status = 'complete' then status when p_report_type = 'catchup' then 'catchup' else 'assigned' end,
      updated_at = now()
  where id = day_id;

  delete from public.flashcards where learning_day_id = day_id and not exists (select 1 from public.flashcard_reviews r where r.flashcard_id = flashcards.id);
  for card in select * from jsonb_array_elements(p_flashcards_json) loop
    insert into public.flashcards(sprint_id, learning_day_id, card_json, type, difficulty, tags)
    values (p_sprint_id, day_id, card, card->>'type', coalesce(card->>'difficulty','medium'), coalesce(array(select jsonb_array_elements_text(coalesce(card->'tags','[]'::jsonb))), '{}'));
  end loop;

  insert into public.generation_requests(request_type, topic_id, sprint_id, learning_day_id, input_json, output_json, status, completed_at)
  select 'daily_learnable', s.topic_id, p_sprint_id, day_id,
         jsonb_build_object('dayIndex', p_day_index, 'reportType', p_report_type, 'manilaDate', v_today),
         jsonb_build_object('learnable', p_learnable_json, 'flashcards', p_flashcards_json),
         'completed', now()
  from public.learning_sprints s
  where s.id = p_sprint_id;

  insert into public.cron_reports(sprint_id, learning_day_id, report_date, report_type, discord_channel_id, report_markdown, status)
  values (p_sprint_id, day_id, v_today, p_report_type, '1500687653798940822', p_report_markdown, 'created')
  on conflict (learning_day_id, report_date, report_type) do update
    set sprint_id = excluded.sprint_id,
        discord_channel_id = excluded.discord_channel_id,
        report_markdown = excluded.report_markdown,
        status = case when public.cron_reports.status = 'sent' then public.cron_reports.status else 'created' end,
        updated_at = now()
  returning id into report_id;

  return jsonb_build_object('ok', true, 'alreadySent', false, 'learningDayId', day_id, 'reportId', report_id);
end;
$$;

grant execute on function public.adrianoos_create_sprint(uuid,text,text,text,text,text,integer,integer,text,jsonb) to anon;
grant execute on function public.adrianoos_cron_advance_if_complete(text) to anon;
grant execute on function public.adrianoos_save_day_content(text,uuid,integer,jsonb,jsonb,text,text) to anon;
