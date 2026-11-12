-- Fix: a failed login used to raise, which rolled back the login_attempts insert,
-- so the 5-failures lockout never triggered. Failures now RETURN an error object
-- (transaction commits, attempt is recorded) and are slowed down slightly.

create or replace function public.kft_admin_login(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = kft, extensions, pg_temp as $$
declare u kft.admin_users; tok text; uname text := lower(btrim(coalesce(p_username,'')));
begin
  if (select count(*) from kft.login_attempts where username = uname and not ok
      and at > now() - interval '15 minutes') >= 5 then
    return jsonb_build_object('error', 'محاولات كثيرة، انتظر ربع ساعة وجرب مرة ثانية');
  end if;
  select * into u from kft.admin_users where username = uname;
  if not found or crypt(coalesce(p_password,''), u.pass_hash) <> u.pass_hash then
    insert into kft.login_attempts (username, ok) values (uname, false);
    perform pg_sleep(0.6);
    return jsonb_build_object('error', 'اسم المستخدم أو كلمة السر غلط');
  end if;
  insert into kft.login_attempts (username, ok) values (uname, true);
  delete from kft.admin_sessions where expires_at < now();
  delete from kft.login_attempts where at < now() - interval '7 days';
  tok := encode(gen_random_bytes(32), 'hex');
  insert into kft.admin_sessions (token_hash, user_id, expires_at)
    values (encode(digest(tok, 'sha256'), 'hex'), u.id, now() + interval '12 hours');
  perform kft.audit(uname, 'admin.login', 'session', null, null);
  return jsonb_build_object('token', tok, 'username', uname, 'expires_at', now() + interval '12 hours');
end $$;

-- Same pattern for the current-password check when changing the password.
drop function if exists public.kft_admin_change_password(text, text, text);
create or replace function public.kft_admin_change_password(p_token text, p_old text, p_new text) returns jsonb
language plpgsql security definer set search_path = kft, extensions, pg_temp as $$
declare actor text := kft.session_actor(p_token); u kft.admin_users;
begin
  if (select count(*) from kft.login_attempts where username = actor and not ok
      and at > now() - interval '15 minutes') >= 5 then
    return jsonb_build_object('error', 'محاولات كثيرة، انتظر ربع ساعة');
  end if;
  select * into u from kft.admin_users where username = actor;
  if crypt(coalesce(p_old,''), u.pass_hash) <> u.pass_hash then
    insert into kft.login_attempts (username, ok) values (actor, false);
    perform pg_sleep(0.6);
    return jsonb_build_object('error', 'كلمة السر الحالية غلط');
  end if;
  if length(coalesce(p_new,'')) < 8 then return jsonb_build_object('error', 'كلمة السر الجديدة لازم 8 أحرف أو أكثر'); end if;
  update kft.admin_users set pass_hash = crypt(p_new, gen_salt('bf', 12)) where id = u.id;
  delete from kft.admin_sessions where user_id = u.id and token_hash <> encode(digest(p_token, 'sha256'), 'hex');
  perform kft.audit(actor, 'admin.password', 'admin_user', u.id::text, null);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.kft_admin_login(text, text) from public;
grant execute on function public.kft_admin_login(text, text) to anon, authenticated;
revoke all on function public.kft_admin_change_password(text, text, text) from public;
grant execute on function public.kft_admin_change_password(text, text, text) to anon, authenticated;
