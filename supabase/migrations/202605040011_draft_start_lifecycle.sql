-- Draft/start lifecycle for PRD overview regenerate-before-start behavior.

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
  v_sprint_days integer := 7;
begin
  if not public.adrianoos_validate_session(p_session_id) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  -- A new overview replaces any unstarted draft and archives the currently active sprint.
  update public.learning_sprints set status = 'archived', updated_at = now() where status in ('active', 'draft');

  insert into public.learning_topics(title, description, current_level, goal, target_outcome, daily_study_minutes, sprint_days, urgency, status)
  values (p_topic, p_description, p_current_level, p_goal, p_target_outcome, p_daily_study_minutes, v_sprint_days, nullif(p_urgency,''), 'draft')
  returning id into v_topic_id;

  insert into public.learning_sprints(topic_id, title, overview_json, status, start_date, target_end_date, max_end_date, current_day_index, generation_status)
  values (v_topic_id, p_topic, jsonb_set(p_overview_json, '{defaultDays}', '7'::jsonb, true), 'draft', null, null, null, 1, 'ready')
  returning id into v_sprint_id;

  for v_day in select * from jsonb_array_elements(p_overview_json -> 'days') loop
    insert into public.learning_days(sprint_id, day_index, scheduled_date, title, objective, overview_json, status)
    values (v_sprint_id, (v_day->>'dayIndex')::int, null, v_day->>'title', v_day->>'objective', v_day, 'not_started');
  end loop;

  insert into public.generation_requests(request_type, topic_id, sprint_id, input_json, output_json, status, completed_at)
  values ('sprint_overview', v_topic_id, v_sprint_id, p_overview_json, p_overview_json, 'completed', now());

  return jsonb_build_object('ok', true, 'sprintId', v_sprint_id, 'topicId', v_topic_id, 'status', 'draft');
end;
$$;

grant execute on function public.adrianoos_create_sprint(uuid,text,text,text,text,text,integer,integer,text,jsonb) to anon;

create or replace function public.adrianoos_start_sprint(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_day record;
begin
  if not public.adrianoos_validate_session(p_session_id) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select * into s from public.learning_sprints where status = 'draft' order by created_at desc limit 1;
  if s.id is null then
    return jsonb_build_object('ok', false, 'error', 'No draft sprint to start.');
  end if;

  update public.learning_sprints
    set status = 'active',
        start_date = v_today,
        target_end_date = v_today + 6,
        max_end_date = v_today + 13,
        current_day_index = 1,
        updated_at = now()
    where id = s.id;

  update public.learning_topics set status = 'active', updated_at = now() where id = s.topic_id;

  for v_day in select * from public.learning_days where sprint_id = s.id order by day_index loop
    update public.learning_days
      set scheduled_date = v_today + (v_day.day_index - 1),
          status = case when v_day.day_index = 1 then 'assigned' else 'not_started' end,
          updated_at = now()
      where id = v_day.id;
  end loop;

  insert into public.daily_progress(sprint_id, date, status)
  values (s.id, v_today, 'started')
  on conflict (sprint_id, date) do nothing;

  return jsonb_build_object('ok', true, 'sprintId', s.id, 'topicId', s.topic_id, 'status', 'active', 'overview', s.overview_json);
end;
$$;

grant execute on function public.adrianoos_start_sprint(uuid) to anon;

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
  where s.status in ('draft','active','completed')
  order by case when s.status = 'draft' then 0 when s.status = 'active' then 1 else 2 end, s.updated_at desc nulls last, s.created_at desc
  limit 1;

  if sprint_row.id is null then
    return jsonb_build_object('ok', true, 'activeSprint', null);
  end if;

  select coalesce(jsonb_agg(to_jsonb(d) order by d.day_index), '[]'::jsonb) into days_json
  from public.learning_days d where d.sprint_id = sprint_row.id;

  select coalesce(jsonb_agg(
    to_jsonb(c) || jsonb_build_object(
      'latest_rating', (
        select r.rating from public.flashcard_reviews r where r.flashcard_id = c.id order by r.reviewed_at desc limit 1
      )
    )
    order by c.created_at
  ), '[]'::jsonb) into cards_json
  from public.flashcards c where c.sprint_id = sprint_row.id;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.date), '[]'::jsonb) into progress_json
  from public.daily_progress p where p.sprint_id = sprint_row.id;

  return jsonb_build_object('ok', true, 'activeSprint', to_jsonb(sprint_row), 'days', days_json, 'flashcards', cards_json, 'progress', progress_json);
end;
$$;

grant execute on function public.adrianoos_active_snapshot(uuid) to anon;
