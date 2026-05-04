-- Protected Adriano/OpenClaw research handoff for sprint overview generation.

create or replace function public.adrianoos_generation_context(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  sprint_row record;
  days_json jsonb;
  cards_json jsonb;
  progress_json jsonb;
  weak_cards jsonb := '[]'::jsonb;
  review_cards jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.app_config where key = 'cron_secret' and value_hash = crypt(p_secret, value_hash)) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select s.*, t.title as topic_title, t.description, t.current_level, t.goal, t.target_outcome, t.daily_study_minutes, t.sprint_days, t.urgency
    into sprint_row
  from public.learning_sprints s
  join public.learning_topics t on t.id = s.topic_id
  where s.status in ('draft','active')
  order by case when s.status = 'draft' then 0 else 1 end, s.updated_at desc nulls last, s.created_at desc
  limit 1;

  if sprint_row.id is null then
    return jsonb_build_object('ok', true, 'activeSprint', null, 'generationTask', 'idle');
  end if;

  select coalesce(jsonb_agg(to_jsonb(d) order by d.day_index), '[]'::jsonb) into days_json
  from public.learning_days d where d.sprint_id = sprint_row.id;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) into cards_json
  from public.flashcards c where c.sprint_id = sprint_row.id;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.date), '[]'::jsonb) into progress_json
  from public.daily_progress p where p.sprint_id = sprint_row.id;

  if sprint_row.status = 'active' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into weak_cards
    from (
      select f.id, f.card_json, latest.rating, d.day_index
      from public.flashcards f
      join public.learning_days d on d.id = f.learning_day_id
      join lateral (
        select r.rating, r.reviewed_at from public.flashcard_reviews r where r.flashcard_id = f.id order by r.reviewed_at desc limit 1
      ) latest on true
      where f.sprint_id = sprint_row.id and latest.rating in ('wrong','unsure')
      order by latest.reviewed_at desc
      limit 10
    ) x;

    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into review_cards
    from (
      select f.id, f.card_json, coalesce(latest.rating, 'unreviewed') as rating, d.day_index
      from public.flashcards f
      join public.learning_days d on d.id = f.learning_day_id
      left join lateral (
        select r.rating, r.reviewed_at from public.flashcard_reviews r where r.flashcard_id = f.id order by r.reviewed_at desc limit 1
      ) latest on true
      where f.sprint_id = sprint_row.id
        and d.day_index < sprint_row.current_day_index
        and coalesce(latest.rating, 'unreviewed') not in ('wrong','unsure')
      order by latest.reviewed_at desc nulls last, f.created_at desc
      limit least(8, greatest(0, sprint_row.current_day_index + 1))
    ) x;
  end if;

  return jsonb_build_object(
    'ok', true,
    'generationTask', case when sprint_row.status = 'draft' then 'research_sprint_overview' else 'research_daily_content' end,
    'activeSprint', to_jsonb(sprint_row),
    'days', days_json,
    'flashcards', cards_json,
    'progress', progress_json,
    'weakCards', weak_cards,
    'reviewCards', review_cards,
    'researchRequirements', jsonb_build_object(
      'mustUseExternalResearch', true,
      'noAppSideProviderKey', true,
      'overview', 'Research the topic/current level/goal, then produce a 7-day sprint overview with objectives, outcomes, focus, and difficulty.',
      'daily', 'Research focused source material before producing substantial daily learnable JSON, examples, diagrams, MCQ checkpoints, references, and flashcards.'
    )
  );
end;
$$;

grant execute on function public.adrianoos_generation_context(text) to anon;

create or replace function public.adrianoos_save_researched_overview(
  p_secret text,
  p_sprint_id uuid,
  p_overview_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  s record;
  v_day jsonb;
begin
  if not exists (select 1 from public.app_config where key = 'cron_secret' and value_hash = crypt(p_secret, value_hash)) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select * into s from public.learning_sprints where id = p_sprint_id and status = 'draft';
  if s.id is null then
    return jsonb_build_object('ok', false, 'error', 'Only draft sprint overviews can be replaced by researched output.');
  end if;

  if jsonb_typeof(p_overview_json->'days') <> 'array' or jsonb_array_length(p_overview_json->'days') <> 7 then
    return jsonb_build_object('ok', false, 'error', 'Researched overview must contain exactly 7 days.');
  end if;

  update public.learning_sprints
    set overview_json = jsonb_set(p_overview_json, '{defaultDays}', '7'::jsonb, true),
        generation_status = 'research_ready',
        updated_at = now()
    where id = p_sprint_id;

  delete from public.learning_days where sprint_id = p_sprint_id;
  for v_day in select * from jsonb_array_elements(p_overview_json -> 'days') loop
    insert into public.learning_days(sprint_id, day_index, scheduled_date, title, objective, overview_json, status)
    values (p_sprint_id, (v_day->>'dayIndex')::int, null, v_day->>'title', v_day->>'objective', v_day, 'not_started');
  end loop;

  insert into public.generation_requests(request_type, topic_id, sprint_id, input_json, output_json, status, completed_at)
  values ('researched_sprint_overview', s.topic_id, p_sprint_id, s.overview_json, p_overview_json, 'completed', now());

  return jsonb_build_object('ok', true, 'sprintId', p_sprint_id, 'status', 'research_ready');
end;
$$;

grant execute on function public.adrianoos_save_researched_overview(text,uuid,jsonb) to anon;
