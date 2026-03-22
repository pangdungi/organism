-- 근무표: 하루 근무시간, 근무유형(N), 근무 행(N) — 로컬 localStorage와 동기화

create table if not exists public.work_schedule_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  daily_work_hours numeric not null default 8.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.work_schedule_settings is '근무표: 유저당 하루 근무시간(시간 단위, 예 8.5)';

create table if not exists public.work_schedule_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  start_time text not null default '',
  end_time text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_schedule_types_user_name_unique unique (user_id, name)
);

comment on table public.work_schedule_types is '근무표: 근무유형(이름·시작·마감·정렬)';

create index if not exists work_schedule_types_user_sort_idx
  on public.work_schedule_types (user_id, sort_order, name);

create table if not exists public.work_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  work_date date not null,
  start_time text not null default '',
  end_time text not null default '',
  work_type text not null default '',
  memo text not null default '',
  hours text not null default '',
  hours_worked text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.work_schedule_entries is '근무표: 날짜별 행(유형·메모·시간적립 등; 시간가계부 실근무와 별도)';

create index if not exists work_schedule_entries_user_date_idx
  on public.work_schedule_entries (user_id, work_date desc);

alter table public.work_schedule_settings enable row level security;
alter table public.work_schedule_types enable row level security;
alter table public.work_schedule_entries enable row level security;

-- settings
drop policy if exists "work_schedule_settings_select_own" on public.work_schedule_settings;
create policy "work_schedule_settings_select_own"
  on public.work_schedule_settings for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "work_schedule_settings_insert_own" on public.work_schedule_settings;
create policy "work_schedule_settings_insert_own"
  on public.work_schedule_settings for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "work_schedule_settings_update_own" on public.work_schedule_settings;
create policy "work_schedule_settings_update_own"
  on public.work_schedule_settings for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "work_schedule_settings_delete_own" on public.work_schedule_settings;
create policy "work_schedule_settings_delete_own"
  on public.work_schedule_settings for delete to authenticated
  using (auth.uid() = user_id);

-- types
drop policy if exists "work_schedule_types_select_own" on public.work_schedule_types;
create policy "work_schedule_types_select_own"
  on public.work_schedule_types for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "work_schedule_types_insert_own" on public.work_schedule_types;
create policy "work_schedule_types_insert_own"
  on public.work_schedule_types for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "work_schedule_types_update_own" on public.work_schedule_types;
create policy "work_schedule_types_update_own"
  on public.work_schedule_types for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "work_schedule_types_delete_own" on public.work_schedule_types;
create policy "work_schedule_types_delete_own"
  on public.work_schedule_types for delete to authenticated
  using (auth.uid() = user_id);

-- entries
drop policy if exists "work_schedule_entries_select_own" on public.work_schedule_entries;
create policy "work_schedule_entries_select_own"
  on public.work_schedule_entries for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "work_schedule_entries_insert_own" on public.work_schedule_entries;
create policy "work_schedule_entries_insert_own"
  on public.work_schedule_entries for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "work_schedule_entries_update_own" on public.work_schedule_entries;
create policy "work_schedule_entries_update_own"
  on public.work_schedule_entries for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "work_schedule_entries_delete_own" on public.work_schedule_entries;
create policy "work_schedule_entries_delete_own"
  on public.work_schedule_entries for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.work_schedule_settings to authenticated;
grant select, insert, update, delete on public.work_schedule_types to authenticated;
grant select, insert, update, delete on public.work_schedule_entries to authenticated;

create or replace function public.set_work_schedule_settings_updated_at()
  returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists work_schedule_settings_set_updated_at on public.work_schedule_settings;
create trigger work_schedule_settings_set_updated_at
  before update on public.work_schedule_settings
  for each row execute function public.set_work_schedule_settings_updated_at();

create or replace function public.set_work_schedule_types_updated_at()
  returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists work_schedule_types_set_updated_at on public.work_schedule_types;
create trigger work_schedule_types_set_updated_at
  before update on public.work_schedule_types
  for each row execute function public.set_work_schedule_types_updated_at();

create or replace function public.set_work_schedule_entries_updated_at()
  returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists work_schedule_entries_set_updated_at on public.work_schedule_entries;
create trigger work_schedule_entries_set_updated_at
  before update on public.work_schedule_entries
  for each row execute function public.set_work_schedule_entries_updated_at();
