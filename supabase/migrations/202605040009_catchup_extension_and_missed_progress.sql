-- Distinguish missed scheduled days from today's catch-up day and extend target end date within max_end_date.

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
  scheduled date;
  original_status text;
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

  scheduled := coalesce(d.scheduled_date, v_today);

  if d.lesson_completed_at is null or d.flashcards_completed_at is null then
    update public.learning_days set status='catchup', scheduled_date = least(scheduled, v_today), updated_at=now() where id=d.id and status <> 'complete';
    update public.learning_sprints
      set target_end_date = least(max_end_date, greatest(coalesce(target_end_date, v_today), v_today) + 1),
          updated_at = now()
      where id = s.id;

    original_status := case
      when d.lesson_completed_at is not null then 'lesson_done'
      when d.flashcards_completed_at is not null then 'cards_done'
      when scheduled < v_today then 'missed'
      else 'catchup'
    end;

    insert into public.daily_progress(sprint_id, date, status, lesson_completed, flashcards_completed, is_catchup)
    values (s.id, scheduled, original_status, d.lesson_completed_at is not null, d.flashcards_completed_at is not null, false)
    on conflict (sprint_id, date) do update
      set status = excluded.status,
          lesson_completed = excluded.lesson_completed,
          flashcards_completed = excluded.flashcards_completed,
          is_catchup = false,
          updated_at=now();

    if scheduled < v_today then
      insert into public.daily_progress(sprint_id, date, status, lesson_completed, flashcards_completed, is_catchup)
      values (s.id, v_today, 'catchup', false, false, true)
      on conflict (sprint_id, date) do update
        set status='catchup', is_catchup=true, updated_at=now();
    end if;

    return jsonb_build_object('ok', true, 'action', 'catchup', 'dayIndex', d.day_index, 'sprintId', s.id, 'scheduledDate', scheduled, 'catchupDate', v_today);
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
        updated_at=now()
    where id=s.id;

  update public.learning_days
    set scheduled_date = v_today,
        status = case when status = 'complete' then 'complete' else 'assigned' end,
        updated_at = now()
    where sprint_id = s.id and day_index = next_idx;

  return jsonb_build_object('ok', true, 'action', 'advance', 'dayIndex', next_idx, 'sprintId', s.id);
end;
$$;

grant execute on function public.adrianoos_cron_advance_if_complete(text) to anon;
