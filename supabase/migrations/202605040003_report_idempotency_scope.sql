-- Scope daily report idempotency to the specific learning day instead of the whole date.
-- This allows replacing/archiving an active sprint and immediately generating Day 1 content on the same calendar day.

alter table public.cron_reports drop constraint if exists cron_reports_unique_date;
drop index if exists cron_reports_unique_day_date_type;
create unique index if not exists cron_reports_unique_day_date_type
  on public.cron_reports(learning_day_id, report_date, report_type);

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
begin
  if not exists (select 1 from public.app_config where key = 'cron_secret' and value_hash = crypt(p_secret, value_hash)) then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select id into day_id from public.learning_days where sprint_id = p_sprint_id and day_index = p_day_index;
  if day_id is null then
    return jsonb_build_object('ok', false, 'error', 'Day not found');
  end if;

  select id, status, discord_message_id
    into existing_report
  from public.cron_reports
  where learning_day_id = day_id and report_date = current_date and report_type = p_report_type
  limit 1;

  if existing_report.id is not null and existing_report.status = 'sent' then
    return jsonb_build_object('ok', true, 'alreadySent', true, 'reportId', existing_report.id, 'messageId', existing_report.discord_message_id);
  end if;

  update public.learning_days
  set learnable_json = p_learnable_json, generated_at = now(), status = case when status = 'complete' then status else 'assigned' end, updated_at = now()
  where id = day_id;

  delete from public.flashcards where learning_day_id = day_id and not exists (select 1 from public.flashcard_reviews r where r.flashcard_id = flashcards.id);
  for card in select * from jsonb_array_elements(p_flashcards_json) loop
    insert into public.flashcards(sprint_id, learning_day_id, card_json, type, difficulty, tags)
    values (p_sprint_id, day_id, card, card->>'type', coalesce(card->>'difficulty','medium'), coalesce(array(select jsonb_array_elements_text(coalesce(card->'tags','[]'::jsonb))), '{}'));
  end loop;

  insert into public.generation_requests(request_type, topic_id, sprint_id, learning_day_id, input_json, output_json, status, completed_at)
  select 'daily_learnable', s.topic_id, p_sprint_id, day_id,
         jsonb_build_object('dayIndex', p_day_index, 'reportType', p_report_type),
         jsonb_build_object('learnable', p_learnable_json, 'flashcards', p_flashcards_json),
         'completed', now()
  from public.learning_sprints s
  where s.id = p_sprint_id;

  insert into public.cron_reports(sprint_id, learning_day_id, report_date, report_type, discord_channel_id, report_markdown, status)
  values (p_sprint_id, day_id, current_date, p_report_type, '1500687653798940822', p_report_markdown, 'created')
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

grant execute on function public.adrianoos_save_day_content(text,uuid,integer,jsonb,jsonb,text,text) to anon;
