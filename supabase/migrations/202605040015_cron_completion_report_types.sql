-- Allow explicit completion and max-limit cron report types.

alter table public.cron_reports
  drop constraint if exists cron_reports_report_type_check;

alter table public.cron_reports
  add constraint cron_reports_report_type_check
  check (report_type in ('daily','catchup','idle','error','completed','maxed'));
