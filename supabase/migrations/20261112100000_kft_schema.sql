-- KFT order page backend. Lives in its own schema inside a shared Supabase project.
-- Tables are NOT exposed through the REST API; the browser only calls the kft_* RPCs below.
-- Money is stored as whole Iraqi dinars (bigint), never floats.

create schema if not exists kft;
revoke all on schema kft from public, anon, authenticated;

create table kft.settings (
  id               int primary key default 1 check (id = 1),
  shop_open        boolean not null default true,
  closed_message   text    not null default 'الطلبات متوقفة مؤقتاً، راسلنا على الواتساب.',
  announcement     text    not null default '',
  whatsapp         text    not null default '9647801273388' check (whatsapp ~ '^964\d{10}$'),
  delivery_fee     bigint  not null default 5000 check (delivery_fee between 0 and 100000),
  free_delivery_from bigint not null default 0 check (free_delivery_from >= 0),
  wholesale_from   int     not null default 10 check (wholesale_from between 2 and 10000),
  discount_active  boolean not null default false,
  discount_type    text    not null default 'percent' check (discount_type in ('percent','amount')),
  discount_value   bigint  not null default 0 check (discount_value >= 0),
  discount_min     bigint  not null default 0 check (discount_min >= 0),
  discount_label   text    not null default '',
  updated_at       timestamptz not null default now(),
  constraint pct_range check (discount_type <> 'percent' or discount_value <= 90)
);
insert into kft.settings (id) values (1);

create table kft.products (
  id          uuid primary key default gen_random_uuid(),
  name        text   not null check (length(name) between 2 and 80),
  description text   not null default '' check (length(description) <= 160),
  price       bigint not null check (price between 250 and 10000000),
  old_price   bigint check (old_price is null or old_price > 0),
  pair_price  bigint check (pair_price is null or pair_price > 0),
  sizes       jsonb  not null default '[]',   -- [{"n":"XL","ok":true}]
  colours     jsonb  not null default '[]',   -- [{"n":"أسود","ok":true}]
  free_colour boolean not null default false, -- customer types the colour
  note        text   not null default '' check (length(note) <= 120),
  active      boolean not null default true,
  sort        int    not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index products_listing on kft.products (sort) where deleted_at is null;

create table kft.orders (
  id            uuid primary key default gen_random_uuid(),
  ref           text not null unique,
  idem_key      text not null unique,
  items         jsonb  not null,
  pieces        int    not null,
  subtotal      bigint not null,
  discount      bigint not null default 0,
  delivery      bigint not null,
  total         bigint not null,
  is_wholesale  boolean not null,
  has_custom    boolean not null,
  customer_name text not null,
  phone         text not null,
  governorate   text not null,
  address       text not null,
  weight        text not null default '',
  height        text not null default '',
  note          text not null default '',
  status        text not null default 'new'
                check (status in ('new','confirmed','shipped','delivered','returned','cancelled')),
  staff_note    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index orders_recent on kft.orders (created_at desc);
create index orders_status on kft.orders (status, created_at desc);
create index orders_phone on kft.orders (phone, created_at desc);

create table kft.admin_users (
  id         uuid primary key default gen_random_uuid(),
  username   text not null unique,
  pass_hash  text not null,
  created_at timestamptz not null default now()
);
create table kft.admin_sessions (
  token_hash text primary key,
  user_id    uuid not null references kft.admin_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table kft.login_attempts (
  id bigserial primary key, username text not null, ok boolean not null, at timestamptz not null default now()
);
create index login_attempts_recent on kft.login_attempts (username, at desc);
create table kft.audit_log (
  id bigserial primary key, at timestamptz not null default now(),
  actor text not null, action text not null, entity text not null, entity_id text, data jsonb
);

alter table kft.settings enable row level security;
alter table kft.products enable row level security;
alter table kft.orders enable row level security;
alter table kft.admin_users enable row level security;
alter table kft.admin_sessions enable row level security;
alter table kft.login_attempts enable row level security;
alter table kft.audit_log enable row level security;
revoke all on all tables in schema kft from public, anon, authenticated;

-- Seed catalogue (prices in IQD).
insert into kft.products (name, description, price, pair_price, sizes, colours, free_colour, note, sort) values
('بولو Huko شتوي','جاكار قطن 100%',22000,null,
 '[{"n":"L","ok":true},{"n":"XL","ok":true},{"n":"2XL","ok":true},{"n":"3XL","ok":true},{"n":"4XL","ok":true},{"n":"5XL","ok":true},{"n":"6XL","ok":true},{"n":"7XL","ok":true}]',
 '[]', true, 'من وزن 70 لحد 150 كيلو', 10),
('بولو FF الموسم','6 ألوان',20000,null,
 '[{"n":"L","ok":true},{"n":"XL","ok":true},{"n":"2XL","ok":true},{"n":"3XL","ok":true}]',
 '[{"n":"بيج","ok":true},{"n":"رصاصي","ok":true},{"n":"أسود","ok":true},{"n":"نيلي","ok":true},{"n":"سمائي","ok":true},{"n":"أوف وايت","ok":true}]', false, '', 20),
('بولو بجيب','قطن 100%',18000,35000,
 '[{"n":"L","ok":true},{"n":"XL","ok":true},{"n":"2XL","ok":true},{"n":"3XL","ok":true},{"n":"4XL","ok":true},{"n":"5XL","ok":true},{"n":"6XL","ok":true},{"n":"7XL","ok":true}]',
 '[{"n":"أسود","ok":true},{"n":"رصاصي فاتح","ok":true},{"n":"رصاصي غامق","ok":true},{"n":"بيجي","ok":true},{"n":"سمائي","ok":true},{"n":"زيتوني","ok":true},{"n":"فيروزي","ok":true}]', false, 'من وزن 75 لحد 150 كيلو', 30),
('قميص جينز تنسل','ياخة عظم ودگم خشب',20000,null,
 '[{"n":"L","ok":true},{"n":"XL","ok":true},{"n":"2XL","ok":true},{"n":"3XL","ok":true}]',
 '[{"n":"كحلي","ok":true},{"n":"بحري","ok":true},{"n":"رصاصي","ok":true},{"n":"نيلي طوخ","ok":true}]', false, '', 40),
('قميص تنسل بجيب واحد','شكل الجينز',20000,null,
 '[{"n":"L","ok":true},{"n":"XL","ok":true},{"n":"2XL","ok":true},{"n":"3XL","ok":true}]',
 '[{"n":"نيلي","ok":true},{"n":"رصاصي","ok":true},{"n":"كحلي","ok":true},{"n":"بحري","ok":true}]', false, '', 50),
('قميص تنسل مقلّم','فول ليكرا',20000,null,
 '[{"n":"L","ok":true},{"n":"XL","ok":true},{"n":"2XL","ok":true},{"n":"3XL","ok":true}]',
 '[{"n":"بحري","ok":true},{"n":"نيلي","ok":true},{"n":"رصاصي","ok":true},{"n":"أسود كحلي","ok":true}]', false, '', 60),
('قميص تنسل ألوان','بيه ليكرا',20000,null,
 '[{"n":"L","ok":true},{"n":"XL","ok":true},{"n":"2XL","ok":true},{"n":"3XL","ok":true}]',
 '[{"n":"سمائي","ok":true},{"n":"أسود","ok":true},{"n":"قهوائي","ok":true},{"n":"جوزي","ok":true},{"n":"نيلي","ok":true}]', false, '', 70),
('قميص تروكة جاكار شتوي','يلبس قميص وتروكة',25000,null,
 '[{"n":"L","ok":true},{"n":"XL","ok":true},{"n":"2XL","ok":true},{"n":"3XL","ok":true}]',
 '[{"n":"قهوائي","ok":true},{"n":"بحري","ok":true},{"n":"رصاصي","ok":true},{"n":"أزرق","ok":true},{"n":"نيلي","ok":true},{"n":"أسود كحلي","ok":true}]', false, 'من وزن 70 لغاية 105 كيلو', 80);
