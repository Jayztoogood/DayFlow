-- DAYFLOW initial database schema
-- Run in the Supabase SQL editor after creating a project.
-- Row Level Security ensures users can only access their own records.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text default 'America/Chicago',
  created_at timestamptz not null default now()
);

-- One private JSON document stores the current workspace snapshot per signed-in
-- or anonymous Supabase user. RLS keeps each guest/account isolated.
create table if not exists public.user_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.user_workspaces to authenticated;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 300),
  details text,
  due_at timestamptz,
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  category text default 'Personal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled note',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  period text not null default 'monthly' check (period in ('weekly','monthly')),
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  spent_at date not null default current_date,
  category text default 'Other',
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_workspaces enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.budgets enable row level security;
alter table public.expenses enable row level security;
alter table public.documents enable row level security;

drop policy if exists "profiles own row" on public.profiles;
drop policy if exists "workspace own row" on public.user_workspaces;
drop policy if exists "tasks own rows" on public.tasks;
drop policy if exists "notes own rows" on public.notes;
drop policy if exists "conversations own rows" on public.conversations;
drop policy if exists "messages own rows" on public.messages;
drop policy if exists "budgets own rows" on public.budgets;
drop policy if exists "expenses own rows" on public.expenses;
drop policy if exists "documents own rows" on public.documents;
create policy "profiles own row" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "workspace own row" on public.user_workspaces for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks own rows" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notes own rows" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversations own rows" on public.conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "messages own rows" on public.messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budgets own rows" on public.budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "expenses own rows" on public.expenses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "documents own rows" on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private storage bucket for user documents. Apply equivalent user-folder policies
-- in Supabase Storage before enabling document uploads.
