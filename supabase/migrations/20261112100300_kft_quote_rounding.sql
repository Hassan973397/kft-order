-- Round discounts to 250 IQD and clearer colour errors.
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
      perform kft.fail(case when exists (select 1 from jsonb_array_elements(pr.colours) e where e->>'n' = colour)
        then 'لون ' || colour || ' من ' || pr.name || ' خلص' else 'اختار لون ' || pr.name || ' من القائمة' end);
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
    discount := (discount / 250) * 250;  -- round down to a payable amount
  end if;
  delivery := case when s.free_delivery_from > 0 and subtotal >= s.free_delivery_from then 0 else s.delivery_fee end;

  return jsonb_build_object('items', out_items, 'pieces', pieces, 'subtotal', subtotal, 'discount', discount,
    'delivery', delivery, 'total', subtotal - discount + delivery,
    'is_wholesale', pieces >= s.wholesale_from, 'has_custom', has_custom);
end $$;

