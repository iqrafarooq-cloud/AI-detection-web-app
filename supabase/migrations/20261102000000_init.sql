-- TextWise AI - initial schema
-- Every user-owned table has RLS enabled; users can only access their own rows.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) <= 120),
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_preferences (one row per user)
-- ---------------------------------------------------------------------------
create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  preferred_writing_style text not null default 'natural'
    check (preferred_writing_style in ('natural','academic','simple','formal','friendly','business','student')),
  language text not null default 'en' check (char_length(language) between 2 and 16),
  -- Consent flags: nothing is saved unless the user opts in.
  save_history boolean not null default false,
  store_original_text boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- analysis_history
-- ---------------------------------------------------------------------------
create table public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  original_text text check (original_text is null or char_length(original_text) <= 60000),
  analysis_result jsonb not null,
  detection_provider text,
  created_at timestamptz not null default now()
);
create index analysis_history_user_created_idx on public.analysis_history (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- humanization_history
-- ---------------------------------------------------------------------------
create table public.humanization_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  original_text text check (original_text is null or char_length(original_text) <= 30000),
  improved_text text not null check (char_length(improved_text) <= 60000),
  writing_style text not null,
  created_at timestamptz not null default now()
);
create index humanization_history_user_created_idx on public.humanization_history (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- usage_tracking (one row per user, feature and day)
-- ---------------------------------------------------------------------------
create table public.usage_tracking (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature_type text not null check (feature_type in ('analysis','humanization')),
  request_count integer not null default 0 check (request_count >= 0),
  usage_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, feature_type, usage_date)
);
create index usage_tracking_user_date_idx on public.usage_tracking (user_id, usage_date desc);

-- ---------------------------------------------------------------------------
-- contact_messages (write-only from the public site; read via dashboard/SQL)
-- ---------------------------------------------------------------------------
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  message text not null check (char_length(message) between 1 and 5000),
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.analysis_history enable row level security;
alter table public.humanization_history enable row level security;
alter table public.usage_tracking enable row level security;
alter table public.contact_messages enable row level security;

-- profiles: rows are created by the signup trigger; users read/update/delete their own.
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

-- Generic own-row policies for user_id tables.
do $$
declare t text;
begin
  foreach t in array array['user_preferences','analysis_history','humanization_history','usage_tracking'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
  end loop;
end $$;

-- contact_messages: anyone may submit; nobody can read through the API.
create policy "contact_insert_anyone" on public.contact_messages
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- Table privileges (RLS still applies on top of these).
revoke all on public.contact_messages from anon, authenticated;
grant insert on public.contact_messages to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signup trigger: create profile + default preferences
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''));
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when a user changes their email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Usage counter. SECURITY INVOKER: runs as the caller, so RLS applies.
-- ---------------------------------------------------------------------------
create or replace function public.increment_usage(p_feature text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.usage_tracking (user_id, feature_type, request_count, usage_date)
  values ((select auth.uid()), p_feature, 1, current_date)
  on conflict (user_id, feature_type, usage_date)
  do update set request_count = public.usage_tracking.request_count + 1;
$$;

revoke execute on function public.increment_usage(text) from public, anon;
grant execute on function public.increment_usage(text) to authenticated;
