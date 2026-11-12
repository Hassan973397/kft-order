-- Pricing (single source of truth for money) + public catalogue + order placement.

create or replace function kft.fail(msg text) returns void language plpgsql as $$
begin raise exception using errcode = 'P0001', message = msg; end $$;

create or replace function kft.public_settings() returns jsonb
language sql stable set search_path = kft, pg_temp as $$
  select jsonb_build_object(
    'shop_open', shop_open, 'closed_message', closed_message, 'announcement', announcement,
    'whatsapp', whatsapp, 'delivery_fee', delivery_fee, 'free_delivery_from', free_delivery_from,
    'wholesale_from', wholesale_from, 'discount_active', discount_active, 'discount_type', discount_type,
    'discount_value', discount_value, 'discount_min', discount_min, 'discount_label', discount_label)
  from kft.settings where id = 1 $$;

create or replace function kft.product_json(p kft.products) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'price', p.price,
    'old_price', p.old_price, 'pair_price', p.pair_price, 'sizes', p.sizes, 'colours', p.colours,
    'free_colour', p.free_colour, 'note', p.note, 'active', p.active, 'sort', p.sort) $$;

-- Validates a basket and prices it. Raises a customer-readable Arabic error on bad input.
create or replace function kft.quote(p_items jsonb) returns jsonb
language plpgsql stable set search_path = kft, pg_temp as $$
declare
  s kft.settings; pr kft.products; line jsonb; out_items jsonb := '[]'; counts jsonb := '{}';
  qty int; colour text; size text; nm text; k text; n int;
  subtotal bigint := 0; pieces int := 0; has_custom boolean := false;
  discount bigint := 0; delivery bigint; unknown constant text := 'ما أعرف';
begin
  select * into s from kft.settings where id = 1;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then perform kft.fail('الطلب فارغ'); end if;
  if jsonb_array_length(p_items) > 40 then perform kft.fail('الطلب بيه أكثر من 40 سطر'); end if;

  for line in select * from jsonb_array_elements(p_items) loop
    if coalesce(line->>'qty','') !~ '^\d{1,3}$' then perform kft.fail('العدد غير صحيح'); end if;
    qty := (line->>'qty')::int;
    if qty < 1 or qty > 500 then perform kft.fail('العدد لازم يكون بين 1 و 500'); end if;
    colour := left(btrim(coalesce(line->>'colour','')), 40);
    size := left(btrim(coalesce(line->>'size','')), 20);
    pieces := pieces + qty;

    if coalesce((line->>'custom')::boolean, false) then
      nm := left(btrim(coalesce(line->>'name','')), 120);
      if length(nm) < 3 then perform kft.fail('اكتب وصف القطعة الخاصة'); end if;
      has_custom := true;
      out_items := out_items || jsonb_build_object('custom', true, 'name', nm, 'colour', colour, 'size', size, 'qty', qty);
      continue;
    end if;

    if coalesce(line->>'pid','') !~ '^[0-9a-f-]{36}$' then perform kft.fail('منتج غير معروف'); end if;
    select * into pr from kft.products where id = (line->>'pid')::uuid and active and deleted_at is null;
    if not found then perform kft.fail('قطعة من طلبك صارت غير متوفرة، حدّث الصفحة'); end if;
    if pr.free_colour then
      if colour = '' then perform kft.fail('اكتب لون ' || pr.name); end if;
    elsif colour <> 'لون ثاني' and not exists (select 1 from jsonb_array_elements(pr.colours) e
          where e->>'n' = colour and coalesce((e->>'ok')::boolean, false)) then
      perform kft.fail('لون ' || colour || ' من ' || pr.name || ' خلص');
    end if;
    if size <> unknown and not exists (select 1 from jsonb_array_elements(pr.sizes) e
          where e->>'n' = size and coalesce((e->>'ok')::boolean, false)) then
      perform kft.fail('قياس ' || size || ' من ' || pr.name || ' غير متوفر');
    end if;
    counts := jsonb_set(counts, array[pr.id::text], to_jsonb(coalesce((counts->>pr.id::text)::int, 0) + qty));
    out_items := out_items || jsonb_build_object('pid', pr.id, 'name', pr.name, 'colour', colour,
                   'size', size, 'qty', qty, 'unit', pr.price);
  end loop;

  for k, n in select key, value::int from jsonb_each_text(counts) loop
    select * into pr from kft.products where id = k::uuid;
    subtotal := subtotal + case when pr.pair_price is not null
                  then (n / 2) * pr.pair_price + (n % 2) * pr.price else n * pr.price end;
  end loop;

  if s.discount_active and s.discount_value > 0 and subtotal > 0 and subtotal >= s.discount_min then
    discount := case when s.discount_type = 'percent' then (subtotal * s.discount_value) / 100
                     else least(s.discount_value, subtotal) end;
  end if;
  delivery := case when s.free_delivery_from > 0 and subtotal >= s.free_delivery_from then 0 else s.delivery_fee end;

  return jsonb_build_object('items', out_items, 'pieces', pieces, 'subtotal', subtotal, 'discount', discount,
    'delivery', delivery, 'total', subtotal - discount + delivery,
    'is_wholesale', pieces >= s.wholesale_from, 'has_custom', has_custom);
end $$;

create or replace function public.kft_catalog() returns jsonb
language sql stable security definer set search_path = kft, pg_temp as $$
  select jsonb_build_object('settings', kft.public_settings(),
    'products', coalesce((select jsonb_agg(kft.product_json(p) order by p.sort, p.created_at)
      from kft.products p where p.active and p.deleted_at is null), '[]'::jsonb)) $$;

create or replace function public.kft_quote(p_items jsonb) returns jsonb
language sql stable security definer set search_path = kft, pg_temp as $$ select kft.quote(p_items) $$;

create or replace function public.kft_place_order(p_order jsonb) returns jsonb
language plpgsql security definer set search_path = kft, extensions, pg_temp as $$
declare
  s kft.settings; q jsonb; existing kft.orders; ref text; tries int := 0;
  idem text := coalesce(p_order->>'idem', '');
  nm text := left(btrim(coalesce(p_order->>'name','')), 80);
  ph text := coalesce(p_order->>'phone','');
  gov text := btrim(coalesce(p_order->>'governorate',''));
  addr text := left(btrim(coalesce(p_order->>'address','')), 200);
begin
  if idem !~ '^[A-Za-z0-9-]{16,64}$' then perform kft.fail('طلب غير صالح'); end if;
  select * into existing from kft.orders where idem_key = idem;
  if found then
    return jsonb_build_object('ref', existing.ref, 'pieces', existing.pieces, 'subtotal', existing.subtotal,
      'discount', existing.discount, 'delivery', existing.delivery, 'total', existing.total,
      'is_wholesale', existing.is_wholesale, 'has_custom', existing.has_custom, 'items', existing.items);
  end if;

  select * into s from kft.settings where id = 1;
  if not s.shop_open then perform kft.fail(s.closed_message); end if;
  if length(nm) < 2 then perform kft.fail('اكتب الاسم'); end if;
  if ph !~ '^07\d{9}$' then perform kft.fail('رقم الهاتف غير صحيح'); end if;
  if gov not in ('النجف','بغداد','كربلاء','بابل','البصرة','ذي قار','الديوانية','واسط','ميسان','المثنى',
                 'ديالى','صلاح الدين','كركوك','الأنبار','نينوى','أربيل','السليمانية','دهوك','حلبجة') then
    perform kft.fail('اختار المحافظة'); end if;
  if length(addr) < 3 then perform kft.fail('اكتب العنوان'); end if;
  if (select count(*) from kft.orders where phone = ph and created_at > now() - interval '1 hour') >= 10 then
    perform kft.fail('وصلت حد الطلبات لهالساعة، راسلنا على الواتساب'); end if;

  q := kft.quote(p_order->'items');
  loop
    tries := tries + 1;
    ref := 'KFT-' || to_char(now() at time zone 'Asia/Baghdad', 'MMDD') || '-' || (1000 + floor(random() * 9000))::int;
    begin
      insert into kft.orders (ref, idem_key, items, pieces, subtotal, discount, delivery, total, is_wholesale,
        has_custom, customer_name, phone, governorate, address, weight, height, note)
      values (ref, idem, q->'items', (q->>'pieces')::int, (q->>'subtotal')::bigint, (q->>'discount')::bigint,
        (q->>'delivery')::bigint, (q->>'total')::bigint, (q->>'is_wholesale')::boolean, (q->>'has_custom')::boolean,
        nm, ph, gov, addr, left(coalesce(p_order->>'weight',''), 10), left(coalesce(p_order->>'height',''), 10),
        left(btrim(coalesce(p_order->>'note','')), 500));
      exit;
    exception when unique_violation then
      if tries >= 5 then raise; end if;
      if exists (select 1 from kft.orders where idem_key = idem) then
        return public.kft_place_order(p_order);
      end if;
    end;
  end loop;
  insert into kft.audit_log (actor, action, entity, entity_id, data)
    values ('customer:' || ph, 'order.create', 'order', ref, jsonb_build_object('total', q->'total', 'pieces', q->'pieces'));
  return q || jsonb_build_object('ref', ref);
end $$;
