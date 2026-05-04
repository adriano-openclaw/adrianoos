-- Lock legacy one-argument cron secret seed RPC.
-- Only the two-argument rotate-with-current-secret RPC should be executable.

revoke all on function public.adrianoos_set_cron_secret(text) from public;
revoke all on function public.adrianoos_set_cron_secret(text) from anon;
revoke all on function public.adrianoos_set_cron_secret(text) from authenticated;

revoke all on function public.adrianoos_set_cron_secret(text, text) from public;
revoke all on function public.adrianoos_set_cron_secret(text, text) from anon;
revoke all on function public.adrianoos_set_cron_secret(text, text) from authenticated;
grant execute on function public.adrianoos_set_cron_secret(text, text) to anon;
