-- Run this once in Supabase: Project → SQL Editor → New query → paste → Run

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists bookmarks (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  title text not null default '',
  category_id uuid references categories(id) on delete cascade,
  image text not null default '',
  note text not null default '',
  sort_order numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table categories enable row level security;
alter table bookmarks enable row level security;

-- Personal-tool defaults: anyone holding the anon key (i.e. anyone with the
-- deployed URL) can read and write. Fine for a private link; tighten later
-- with Supabase Auth if you ever make this public.
create policy "public read categories" on categories for select using (true);
create policy "public write categories" on categories for insert with check (true);
create policy "public update categories" on categories for update using (true);
create policy "public delete categories" on categories for delete using (true);

create policy "public read bookmarks" on bookmarks for select using (true);
create policy "public write bookmarks" on bookmarks for insert with check (true);
create policy "public update bookmarks" on bookmarks for update using (true);
create policy "public delete bookmarks" on bookmarks for delete using (true);

-- realtime (so every open tab sees changes live)
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table bookmarks;
