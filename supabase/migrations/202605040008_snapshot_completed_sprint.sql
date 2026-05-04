-- Keep the latest completed sprint visible after the active sprint finishes.
-- The app should not go blank the moment a 7-day sprint completes.

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
  where s.status in ('active','completed')
  order by case when s.status = 'active' then 0 else 1 end, s.updated_at desc nulls last, s.created_at desc
  limit 1;

  if sprint_row.id is null then
    return jsonb_build_object('ok', true, 'activeSprint', null);
  end if;

  select coalesce(jsonb_agg(to_jsonb(d) order by d.day_index), '[]'::jsonb) into days_json
  from public.learning_days d where d.sprint_id = sprint_row.id;

  select coalesce(jsonb_agg(
    to_jsonb(c) || jsonb_build_object(
      'latest_rating', (
        select r.rating
        from public.flashcard_reviews r
        where r.flashcard_id = c.id
        order by r.reviewed_at desc
        limit 1
      )
    )
    order by c.created_at
  ), '[]'::jsonb) into cards_json
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

grant execute on function public.adrianoos_active_snapshot(uuid) to anon;
