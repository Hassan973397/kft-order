-- Owner panel: password login (bcrypt), opaque session tokens (stored hashed), audited writes.

create or replace function kft.session_actor(p_token text) returns text
language plpgsql security definer set search_path = kft, extensions, pg_temp as $$
declare u text;
begin
  select au.username into u from kft.admin_sessions s join kft.admin_users au on au.id = s.user_id
   where s.token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex') and s.expires_at > now();
  if u is null then raise exception using errcode = '28000', message = 'انتهت الجلسة، سجّل دخول من جديد'; end if;
  return u;
end $$;

create or replace function kft.audit(actor text, action text, entity text, entity_id text, data jsonb)
returns void language sql as $$
  insert into kft.audit_log (actor, action, entity, entity_id, data) values (actor, action, entity, entity_id, data) $$;

create or replace function public.kft_admin_login(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = kft, extensions, pg_temp as $$
declare u kft.admin_users; tok text; uname text := lower(btrim(coalesce(p_username,'')));
begin
  if (select count(*) from kft.login_attempts where username = uname and not ok
      and at > now() - interval '15 minutes') >= 5 then
    perform kft.fail('محاولات كثيرة، انتظر ربع ساعة وجرب مرة ثانية');
  end if;
  select * into u from kft.admin_users where username = uname;
  if not found or crypt(coalesce(p_password,''), u.pass_hash) <> u.pass_hash then
    insert into kft.login_attempts (username, ok) values (uname, false);
    perform kft.fail('اسم المستخدم أو كلمة السر غلط');
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

create or replace function public.kft_admin_logout(p_token text) returns void
language sql security definer set search_path = kft, extensions, pg_temp as $$
  delete from kft.admin_sessions where token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex') $$;

create or replace function public.kft_admin_data(p_token text) returns jsonb
language plpgsql security definer set search_path = kft, pg_temp as $$
declare actor text := kft.session_actor(p_token); day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad';
begin
  return jsonb_build_object(
    'username', actor,
    'settings', kft.public_settings(),
    'products', coalesce((select jsonb_agg(kft.product_json(p) order by p.sort, p.created_at)
                 from kft.products p where p.deleted_at is null), '[]'::jsonb),
    'stats', jsonb_build_object(
      'new', (select count(*) from kft.orders where status = 'new'),
      'today', (select count(*) from kft.orders where created_at >= day_start and status <> 'cancelled'),
      'today_total', (select coalesce(sum(total),0) from kft.orders where created_at >= day_start and status <> 'cancelled'),
      'today_pieces', (select coalesce(sum(pieces),0) from kft.orders where created_at >= day_start and status <> 'cancelled')));
end $$;

create or replace function public.kft_admin_orders(p_token text, p_status text default null, p_search text default null,
  p_limit int default 50, p_before timestamptz default null) returns jsonb
language plpgsql security definer set search_path = kft, pg_temp as $$
declare actor text := kft.session_actor(p_token); q text := nullif(btrim(coalesce(p_search,'')), '');
begin
  return coalesce((select jsonb_agg(to_jsonb(o) - 'idem_key' order by o.created_at desc) from (
    select * from kft.orders
     where (p_status is null or p_status = '' or status = p_status)
       and (q is null or ref ilike '%' || q || '%' or phone like '%' || q || '%' or customer_name ilike '%' || q || '%')
       and (p_before is null or created_at < p_before)
     order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) o), '[]'::jsonb);
end $$;

create or replace function public.kft_admin_order_status(p_token text, p_id uuid, p_status text, p_staff_note text default null)
returns jsonb language plpgsql security definer set search_path = kft, pg_temp as $$
declare actor text := kft.session_actor(p_token); o kft.orders;
begin
  if p_status not in ('new','confirmed','shipped','delivered','returned','cancelled') then perform kft.fail('حالة غير صحيحة'); end if;
  update kft.orders set status = p_status, staff_note = coalesce(left(p_staff_note, 500), staff_note), updated_at = now()
   where id = p_id returning * into o;
  if not found then perform kft.fail('الطلب غير موجود'); end if;
  perform kft.audit(actor, 'order.status', 'order', o.ref, jsonb_build_object('status', p_status));
  return to_jsonb(o) - 'idem_key';
end $$;

create or replace function kft.valid_options(arr jsonb, what text) returns jsonb
language plpgsql immutable as $$
declare e jsonb; out jsonb := '[]'; seen text[] := '{}'; nm text;
begin
  if jsonb_typeof(arr) <> 'array' then perform kft.fail(what || ' غير صحيحة'); end if;
  if jsonb_array_length(arr) > 30 then perform kft.fail('أكثر من 30 ' || what); end if;
  for e in select * from jsonb_array_elements(arr) loop
    nm := left(btrim(coalesce(e->>'n','')), 30);
    if nm = '' or nm = any(seen) then continue; end if;
    seen := seen || nm;
    out := out || jsonb_build_object('n', nm, 'ok', coalesce((e->>'ok')::boolean, true));
  end loop;
  return out;
end $$;

create or replace function public.kft_admin_save_product(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = kft, pg_temp as $$
declare actor text := kft.session_actor(p_token); r kft.products; v_sizes jsonb; v_colours jsonb;
begin
  v_sizes := kft.valid_options(coalesce(p->'sizes','[]'), 'القياسات');
  v_colours := kft.valid_options(coalesce(p->'colours','[]'), 'الألوان');
  if jsonb_array_length(v_sizes) = 0 then perform kft.fail('ضيف قياس واحد على الأقل'); end if;
  if jsonb_array_length(v_colours) = 0 and not coalesce((p->>'free_colour')::boolean, false) then
    perform kft.fail('ضيف لون واحد على الأقل، أو فعّل «الزبون يكتب اللون»'); end if;
  if coalesce(p->>'price','') !~ '^\d{3,8}$' then perform kft.fail('السعر غير صحيح'); end if;
  if nullif(p->>'old_price','') is not null and (p->>'old_price')::bigint <= (p->>'price')::bigint then
    perform kft.fail('السعر القديم لازم يكون أكبر من السعر الحالي'); end if;
  if nullif(p->>'pair_price','') is not null and (p->>'pair_price')::bigint >= 2 * (p->>'price')::bigint then
    perform kft.fail('سعر القطعتين لازم يكون أقل من سعر قطعتين عادي'); end if;

  if nullif(p->>'id','') is null then
    insert into kft.products (name, description, price, old_price, pair_price, sizes, colours, free_colour, note, active, sort)
    values (btrim(p->>'name'), btrim(coalesce(p->>'description','')), (p->>'price')::bigint,
      nullif(p->>'old_price','')::bigint, nullif(p->>'pair_price','')::bigint, v_sizes, v_colours,
      coalesce((p->>'free_colour')::boolean, false), btrim(coalesce(p->>'note','')), coalesce((p->>'active')::boolean, true),
      coalesce((select max(sort) + 10 from kft.products), 10))
    returning * into r;
    perform kft.audit(actor, 'product.create', 'product', r.id::text, p);
  else
    update kft.products set name = btrim(p->>'name'), description = btrim(coalesce(p->>'description','')),
      price = (p->>'price')::bigint, old_price = nullif(p->>'old_price','')::bigint,
      pair_price = nullif(p->>'pair_price','')::bigint, sizes = v_sizes, colours = v_colours,
      free_colour = coalesce((p->>'free_colour')::boolean, false), note = btrim(coalesce(p->>'note','')),
      active = coalesce((p->>'active')::boolean, true), updated_at = now()
     where id = (p->>'id')::uuid and deleted_at is null returning * into r;
    if not found then perform kft.fail('المنتج غير موجود'); end if;
    perform kft.audit(actor, 'product.update', 'product', r.id::text, p);
  end if;
  return kft.product_json(r);
end $$;

create or replace function public.kft_admin_delete_product(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = kft, pg_temp as $$
declare actor text := kft.session_actor(p_token);
begin
  update kft.products set deleted_at = now(), active = false, updated_at = now() where id = p_id and deleted_at is null;
  if not found then perform kft.fail('المنتج غير موجود'); end if;
  perform kft.audit(actor, 'product.delete', 'product', p_id::text, null);
end $$;

create or replace function public.kft_admin_reorder(p_token text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = kft, pg_temp as $$
declare actor text := kft.session_actor(p_token);
begin
  update kft.products p set sort = x.ord * 10, updated_at = now()
    from unnest(p_ids) with ordinality as x(id, ord) where p.id = x.id;
  perform kft.audit(actor, 'product.reorder', 'product', null, to_jsonb(p_ids));
end $$;

create or replace function public.kft_admin_save_settings(p_token text, s jsonb) returns jsonb
language plpgsql security definer set search_path = kft, pg_temp as $$
declare actor text := kft.session_actor(p_token);
begin
  update kft.settings set
    shop_open = coalesce((s->>'shop_open')::boolean, shop_open),
    closed_message = left(coalesce(s->>'closed_message', closed_message), 200),
    announcement = left(coalesce(s->>'announcement', announcement), 160),
    whatsapp = coalesce(s->>'whatsapp', whatsapp),
    delivery_fee = coalesce((s->>'delivery_fee')::bigint, delivery_fee),
    free_delivery_from = coalesce((s->>'free_delivery_from')::bigint, free_delivery_from),
    wholesale_from = coalesce((s->>'wholesale_from')::int, wholesale_from),
    discount_active = coalesce((s->>'discount_active')::boolean, discount_active),
    discount_type = coalesce(s->>'discount_type', discount_type),
    discount_value = coalesce((s->>'discount_value')::bigint, discount_value),
    discount_min = coalesce((s->>'discount_min')::bigint, discount_min),
    discount_label = left(coalesce(s->>'discount_label', discount_label), 60),
    updated_at = now()
  where id = 1;
  perform kft.audit(actor, 'settings.update', 'settings', '1', s);
  return kft.public_settings();
exception
  when check_violation then perform kft.fail('قيمة غير مقبولة بالإعدادات (راجع الأرقام)'); return null;
  when invalid_text_representation then perform kft.fail('اكتب أرقام بس بخانات الأسعار'); return null;
end $$;

create or replace function public.kft_admin_change_password(p_token text, p_old text, p_new text) returns void
language plpgsql security definer set search_path = kft, extensions, pg_temp as $$
declare actor text := kft.session_actor(p_token); u kft.admin_users;
begin
  select * into u from kft.admin_users where username = actor;
  if crypt(coalesce(p_old,''), u.pass_hash) <> u.pass_hash then perform kft.fail('كلمة السر الحالية غلط'); end if;
  if length(coalesce(p_new,'')) < 8 then perform kft.fail('كلمة السر الجديدة لازم 8 أحرف أو أكثر'); end if;
  update kft.admin_users set pass_hash = crypt(p_new, gen_salt('bf', 12)) where id = u.id;
  delete from kft.admin_sessions where user_id = u.id and token_hash <> encode(digest(p_token, 'sha256'), 'hex');
  perform kft.audit(actor, 'admin.password', 'admin_user', u.id::text, null);
end $$;

-- Only the RPC entry points are callable from the browser.
revoke all on all functions in schema kft from public, anon, authenticated;
do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'kft\_%' loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
