-- Run this in Supabase: Project → SQL Editor → New query → paste → Run.
-- Safe to run more than once (every statement is idempotent).

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
drop policy if exists "public read categories" on categories;
create policy "public read categories" on categories for select using (true);
drop policy if exists "public write categories" on categories;
create policy "public write categories" on categories for insert with check (true);
drop policy if exists "public update categories" on categories;
create policy "public update categories" on categories for update using (true);
drop policy if exists "public delete categories" on categories;
create policy "public delete categories" on categories for delete using (true);

drop policy if exists "public read bookmarks" on bookmarks;
create policy "public read bookmarks" on bookmarks for select using (true);
drop policy if exists "public write bookmarks" on bookmarks;
create policy "public write bookmarks" on bookmarks for insert with check (true);
drop policy if exists "public update bookmarks" on bookmarks;
create policy "public update bookmarks" on bookmarks for update using (true);
drop policy if exists "public delete bookmarks" on bookmarks;
create policy "public delete bookmarks" on bookmarks for delete using (true);

-- realtime (so every open tab sees changes live)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table categories;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookmarks'
  ) then
    alter publication supabase_realtime add table bookmarks;
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
