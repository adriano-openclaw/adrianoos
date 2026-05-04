-- Include current day cards in cron/generation context so externally generated Adriano content is not blind.

create or replace function public.adrianoos_cron_active_state(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  sprint_row record;
  today_day record;
  today_cards jsonb;
  weak_cards jsonb;
  review_cards jsonb;
begin
  if not exists (select 1 from public.app_config where key = 'cron_secret' and value_hash = crypt(p_secret, value_hash)) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select s.*, t.title as topic_title, t.description, t.current_level, t.goal, t.target_outcome, t.daily_study_minutes, t.sprint_days, t.urgency
    into sprint_row
  from public.learning_sprints s
  join public.learning_topics t on t.id = s.topic_id
  where s.status = 'active'
  order by s.created_at desc limit 1;

  if sprint_row.id is null then
    return jsonb_build_object('ok', true, 'activeSprint', null);
  end if;

  select * into today_day from public.learning_days where sprint_id = sprint_row.id and day_index = sprint_row.current_day_index;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) into today_cards
  from public.flashcards c
  where c.learning_day_id = today_day.id;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into weak_cards
  from (
    select distinct on (f.id) f.id, f.card_json, r.rating, d.day_index
    from public.flashcards f
    join public.learning_days d on d.id = f.learning_day_id
    join public.flashcard_reviews r on r.flashcard_id = f.id
    where f.sprint_id = sprint_row.id
      and r.rating in ('wrong','unsure')
    order by f.id, r.reviewed_at desc
    limit 10
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into review_cards
  from (
    select distinct on (f.id) f.id, f.card_json, coalesce(r.rating, 'unreviewed') as rating, d.day_index
    from public.flashcards f
    join public.learning_days d on d.id = f.learning_day_id
    left join lateral (
      select rating, reviewed_at
      from public.flashcard_reviews rr
      where rr.flashcard_id = f.id
      order by reviewed_at desc
      limit 1
    ) r on true
    where f.sprint_id = sprint_row.id
      and d.day_index < sprint_row.current_day_index
      and f.id not in (
        select ff.id
        from public.flashcards ff
        join public.flashcard_reviews rr on rr.flashcard_id = ff.id
        where ff.sprint_id = sprint_row.id and rr.rating in ('wrong','unsure')
      )
    order by f.id, r.reviewed_at desc nulls last
    limit least(8, greatest(0, sprint_row.current_day_index + 1))
  ) x;

  return jsonb_build_object(
    'ok', true,
    'activeSprint', to_jsonb(sprint_row),
    'currentDay', to_jsonb(today_day),
    'currentDayCards', today_cards,
    'weakCards', weak_cards,
    'reviewCards', review_cards
  );
end;
$$;

grant execute on function public.adrianoos_cron_active_state(text) to anon;
