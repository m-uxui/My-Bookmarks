-- Run this in Supabase: Project → SQL Editor → New query → paste → Run.
-- Safe to run more than once (every statement is idempotent).
-- This version scopes every row to the logged-in user (auth.uid()) —
-- each person who signs in only ever sees and edits their own bookmarks.

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table categories add column if not exists user_id uuid references auth.users(id) on delete cascade;

create table if not exists bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text not null default '',
  category_id uuid references categories(id) on delete cascade,
  image text not null default '',
  note text not null default '',
  favicon text not null default '',
  sort_order numeric not null default 0,
  created_at timestamptz not null default now()
);
alter table bookmarks add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table bookmarks add column if not exists favicon text not null default '';

create index if not exists categories_user_id_idx on categories(user_id);
create index if not exists bookmarks_user_id_idx on bookmarks(user_id);

-- Prevents the first-login seed from ever creating a duplicate "01_AI"
-- category if onAuthStateChange happens to fire twice in a race.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'categories_user_id_name_key'
  ) then
    alter table categories add constraint categories_user_id_name_key unique (user_id, name);
  end if;
end $$;

alter table categories enable row level security;
alter table bookmarks enable row level security;

-- Drop any older, pre-auth "public" policies from an earlier version of this schema.
drop policy if exists "public read categories" on categories;
drop policy if exists "public write categories" on categories;
drop policy if exists "public update categories" on categories;
drop policy if exists "public delete categories" on categories;
drop policy if exists "public read bookmarks" on bookmarks;
drop policy if exists "public write bookmarks" on bookmarks;
drop policy if exists "public update bookmarks" on bookmarks;
drop policy if exists "public delete bookmarks" on bookmarks;

-- Per-user policies: everyone can only see/change their own rows.
drop policy if exists "own categories select" on categories;
create policy "own categories select" on categories for select using (auth.uid() = user_id);
drop policy if exists "own categories insert" on categories;
create policy "own categories insert" on categories for insert with check (auth.uid() = user_id);
drop policy if exists "own categories update" on categories;
create policy "own categories update" on categories for update using (auth.uid() = user_id);
drop policy if exists "own categories delete" on categories;
create policy "own categories delete" on categories for delete using (auth.uid() = user_id);

drop policy if exists "own bookmarks select" on bookmarks;
create policy "own bookmarks select" on bookmarks for select using (auth.uid() = user_id);
drop policy if exists "own bookmarks insert" on bookmarks;
create policy "own bookmarks insert" on bookmarks for insert with check (auth.uid() = user_id);
drop policy if exists "own bookmarks update" on bookmarks;
create policy "own bookmarks update" on bookmarks for update using (auth.uid() = user_id);
drop policy if exists "own bookmarks delete" on bookmarks;
create policy "own bookmarks delete" on bookmarks for delete using (auth.uid() = user_id);

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
