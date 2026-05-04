-- In-place draft overview regeneration for PRD Overview action.

create or replace function public.adrianoos_regenerate_draft_overview(
  p_session_id uuid,
  p_overview_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
  v_day jsonb;
begin
  if not public.adrianoos_validate_session(p_session_id) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select * into s from public.learning_sprints where status = 'draft' order by created_at desc limit 1;
  if s.id is null then
    return jsonb_build_object('ok', false, 'error', 'No draft sprint to regenerate.');
  end if;

  if jsonb_typeof(p_overview_json->'days') <> 'array' or jsonb_array_length(p_overview_json->'days') <> 7 then
    return jsonb_build_object('ok', false, 'error', 'Regenerated overview must contain exactly 7 days.');
  end if;

  update public.learning_sprints
    set overview_json = jsonb_set(p_overview_json, '{defaultDays}', '7'::jsonb, true),
        generation_status = 'regenerated',
        updated_at = now()
    where id = s.id;

  delete from public.learning_days where sprint_id = s.id;
  for v_day in select * from jsonb_array_elements(p_overview_json -> 'days') loop
    insert into public.learning_days(sprint_id, day_index, scheduled_date, title, objective, overview_json, status)
    values (s.id, (v_day->>'dayIndex')::int, null, v_day->>'title', v_day->>'objective', v_day, 'not_started');
  end loop;

  insert into public.generation_requests(request_type, topic_id, sprint_id, input_json, output_json, status, completed_at)
  values ('sprint_overview_regenerate', s.topic_id, s.id, s.overview_json, p_overview_json, 'completed', now());

  return jsonb_build_object('ok', true, 'sprintId', s.id, 'status', 'draft');
end;
$$;

grant execute on function public.adrianoos_regenerate_draft_overview(uuid,jsonb) to anon;
