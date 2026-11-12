-- Product photos: public bucket (read), uploads only through the kft-upload edge function
-- (service role, after checking the owner session). Products keep an ordered list of URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kft-products', 'kft-products', true, 2097152, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;

alter table kft.products add column if not exists images jsonb not null default '[]';

create or replace function kft.product_json(p kft.products) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'price', p.price,
    'old_price', p.old_price, 'pair_price', p.pair_price, 'sizes', p.sizes, 'colours', p.colours,
    'free_colour', p.free_colour, 'note', p.note, 'active', p.active, 'sort', p.sort, 'images', p.images) $$;

-- Only URLs from our own bucket, max 6, de-duplicated, order kept.
create or replace function kft.valid_images(arr jsonb) returns jsonb
language plpgsql immutable as $$
declare e text; out jsonb := '[]'; prefix constant text := 'https://cdqqcnohtcfhgotyjgnz.supabase.co/storage/v1/object/public/kft-products/';
begin
  if arr is null or jsonb_typeof(arr) <> 'array' then return '[]'; end if;
  for e in select jsonb_array_elements_text(arr) loop
    if left(e, length(prefix)) = prefix and e ~ '^[A-Za-z0-9:/._-]+$' and not out ? e then out := out || to_jsonb(e); end if;
    exit when jsonb_array_length(out) >= 6;
  end loop;
  return out;
end $$;

create or replace function kft.keep_images() returns trigger language plpgsql as $$
begin new.images := kft.valid_images(new.images); return new; end $$;
drop trigger if exists products_images on kft.products;
create trigger products_images before insert or update of images on kft.products
  for each row execute function kft.keep_images();

-- Save images separately so the product editor can attach photos right after upload.
create or replace function public.kft_admin_set_images(p_token text, p_id uuid, p_images jsonb) returns jsonb
language plpgsql security definer set search_path = kft, pg_temp as $$
declare actor text := kft.session_actor(p_token); r kft.products;
begin
  update kft.products set images = coalesce(p_images, '[]'), updated_at = now()
   where id = p_id and deleted_at is null returning * into r;
  if not found then perform kft.fail('المنتج غير موجود'); end if;
  perform kft.audit(actor, 'product.images', 'product', p_id::text, r.images);
  return kft.product_json(r);
end $$;

-- Used by the upload function to confirm the caller is a logged-in owner.
create or replace function public.kft_admin_whoami(p_token text) returns text
language sql security definer set search_path = kft, extensions, pg_temp as $$ select kft.session_actor(p_token) $$;

revoke all on function public.kft_admin_set_images(text, uuid, jsonb) from public;
grant execute on function public.kft_admin_set_images(text, uuid, jsonb) to anon, authenticated;
revoke all on function public.kft_admin_whoami(text) from public;
grant execute on function public.kft_admin_whoami(text) to anon, authenticated;
