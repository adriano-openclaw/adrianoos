-- Decouple normal login from the one-time setup token while preserving legacy hashes.

create or replace function public.adrianoos_setup(p_token_name text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  existing integer;
  sid uuid;
begin
  select count(*) into existing from public.app_secret;
  if existing > 0 then
    return jsonb_build_object('ok', false, 'error', 'App is already set up.');
  end if;
  if length(coalesce(p_token_name, '')) < 3 or length(coalesce(p_password, '')) < 8 then
    return jsonb_build_object('ok', false, 'error', 'Token name and 8+ character password required.');
  end if;
  insert into public.app_secret (password_hash) values (crypt(p_password, gen_salt('bf', 12)));
  insert into public.app_state (id, state_json) values (1, '{}'::jsonb) on conflict (id) do nothing;
  insert into public.app_sessions default values returning id into sid;
  return jsonb_build_object('ok', true, 'session_id', sid);
end;
$$;

create or replace function public.adrianoos_login_password(p_password text, p_legacy_token text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  sid uuid;
  secret_row record;
begin
  select * into secret_row from public.app_secret order by created_at asc limit 1;
  if secret_row.id is null then
    return jsonb_build_object('ok', false);
  end if;

  if secret_row.password_hash = crypt(coalesce(p_password, ''), secret_row.password_hash) then
    insert into public.app_sessions default values returning id into sid;
    return jsonb_build_object('ok', true, 'session_id', sid, 'migrated', false);
  end if;

  if coalesce(p_legacy_token, '') <> ''
     and secret_row.password_hash = crypt(p_legacy_token || ':' || coalesce(p_password, ''), secret_row.password_hash) then
    update public.app_secret
    set password_hash = crypt(p_password, gen_salt('bf', 12)), updated_at = now()
    where id = secret_row.id;
    insert into public.app_sessions default values returning id into sid;
    return jsonb_build_object('ok', true, 'session_id', sid, 'migrated', true);
  end if;

  return jsonb_build_object('ok', false);
end;
$$;

grant execute on function public.adrianoos_setup(text, text) to anon;
grant execute on function public.adrianoos_login_password(text, text) to anon;
