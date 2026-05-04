-- PRD follow-ups: latest-review weak cards, idempotent card saves, and completion/maxed cron reports.

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
    select f.id, f.card_json, latest.rating, d.day_index
    from public.flashcards f
    join public.learning_days d on d.id = f.learning_day_id
    join lateral (
      select r.rating, r.reviewed_at
      from public.flashcard_reviews r
      where r.flashcard_id = f.id
      order by r.reviewed_at desc
      limit 1
    ) latest on true
    where f.sprint_id = sprint_row.id
      and latest.rating in ('wrong','unsure')
    order by latest.reviewed_at desc
    limit 10
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into review_cards
  from (
    select f.id, f.card_json, coalesce(latest.rating, 'unreviewed') as rating, d.day_index
    from public.flashcards f
    join public.learning_days d on d.id = f.learning_day_id
    left join lateral (
      select r.rating, r.reviewed_at
      from public.flashcard_reviews r
      where r.flashcard_id = f.id
      order by r.reviewed_at desc
      limit 1
    ) latest on true
    where f.sprint_id = sprint_row.id
      and d.day_index < sprint_row.current_day_index
      and coalesce(latest.rating, 'unreviewed') not in ('wrong','unsure')
    order by latest.reviewed_at desc nulls last, f.created_at desc
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
  existing_card_id uuid;
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

  delete from public.flashcards f
  where f.learning_day_id = day_id
    and not exists (select 1 from public.flashcard_reviews r where r.flashcard_id = f.id)
    and coalesce(f.card_json->>'id', '') not in (
      select coalesce(incoming.card->>'id', '')
      from jsonb_array_elements(p_flashcards_json) as incoming(card)
    );

  for card in select * from jsonb_array_elements(p_flashcards_json) loop
    existing_card_id := null;
    if coalesce(card->>'id', '') <> '' then
      select f.id into existing_card_id
      from public.flashcards f
      where f.learning_day_id = day_id and f.card_json->>'id' = card->>'id'
      order by f.created_at
      limit 1;
    end if;

    if existing_card_id is not null then
      update public.flashcards
      set card_json = card,
          type = card->>'type',
          difficulty = coalesce(card->>'difficulty','medium'),
          tags = coalesce(array(select jsonb_array_elements_text(coalesce(card->'tags','[]'::jsonb))), '{}'),
          updated_at = now()
      where id = existing_card_id;
    else
      insert into public.flashcards(sprint_id, learning_day_id, card_json, type, difficulty, tags)
      values (p_sprint_id, day_id, card, card->>'type', coalesce(card->>'difficulty','medium'), coalesce(array(select jsonb_array_elements_text(coalesce(card->'tags','[]'::jsonb))), '{}'));
    end if;
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

create or replace function public.adrianoos_save_cron_report(
  p_secret text,
  p_sprint_id uuid,
  p_day_index integer,
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

  select id, status, message_id into existing_report
  from public.cron_reports
  where learning_day_id = day_id and report_date = v_today and report_type = p_report_type
  limit 1;

  if existing_report.id is not null and existing_report.status = 'sent' then
    return jsonb_build_object('ok', true, 'alreadySent', true, 'reportId', existing_report.id, 'messageId', existing_report.message_id);
  end if;

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

grant execute on function public.adrianoos_cron_active_state(text) to anon;
grant execute on function public.adrianoos_save_day_content(text,uuid,integer,jsonb,jsonb,text,text) to anon;
grant execute on function public.adrianoos_save_cron_report(text,uuid,integer,text,text) to anon;
