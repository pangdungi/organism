-- 스탬프 캘린더 전용 (근무표·식단표 work_schedule_* 대체)
-- Supabase SQL Editor에 통째로 실행 (여러 번 실행해도 안전).

create table if not exists public.stamp_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stamp_types_user_name_unique unique (user_id, name)
);

comment on table public.stamp_types is '스탬프 캘린더: 사용자별 스탬프 정의(이름·정렬·기본 여부)';
comment on column public.stamp_types.is_builtin is '연차·휴가·정규근무 등 기본 스탬프';

create index if not exists stamp_types_user_sort_idx
  on public.stamp_types (user_id, sort_order, name);

create table if not exists public.stamp_calendar_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stamp_id uuid not null references public.stamp_types (id) on delete restrict,
  entry_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stamp_calendar_entries is '스탬프 캘린더: 날짜별 찍힌 스탬프(stamp_id FK)';

create index if not exists stamp_calendar_entries_user_date_idx
  on public.stamp_calendar_entries (user_id, entry_date desc);

create index if not exists stamp_calendar_entries_stamp_idx
  on public.stamp_calendar_entries (user_id, stamp_id);

alter table public.stamp_types enable row level security;
alter table public.stamp_calendar_entries enable row level security;

-- stamp_types RLS
drop policy if exists "stamp_types_select_own" on public.stamp_types;
create policy "stamp_types_select_own"
  on public.stamp_types for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "stamp_types_insert_own" on public.stamp_types;
create policy "stamp_types_insert_own"
  on public.stamp_types for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "stamp_types_update_own" on public.stamp_types;
create policy "stamp_types_update_own"
  on public.stamp_types for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "stamp_types_delete_own" on public.stamp_types;
create policy "stamp_types_delete_own"
  on public.stamp_types for delete to authenticated
  using (auth.uid() = user_id);

-- stamp_calendar_entries RLS
drop policy if exists "stamp_calendar_entries_select_own" on public.stamp_calendar_entries;
create policy "stamp_calendar_entries_select_own"
  on public.stamp_calendar_entries for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "stamp_calendar_entries_insert_own" on public.stamp_calendar_entries;
create policy "stamp_calendar_entries_insert_own"
  on public.stamp_calendar_entries for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "stamp_calendar_entries_update_own" on public.stamp_calendar_entries;
create policy "stamp_calendar_entries_update_own"
  on public.stamp_calendar_entries for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "stamp_calendar_entries_delete_own" on public.stamp_calendar_entries;
create policy "stamp_calendar_entries_delete_own"
  on public.stamp_calendar_entries for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.stamp_types to authenticated;
grant select, insert, update, delete on public.stamp_calendar_entries to authenticated;

create or replace function public.set_stamp_types_updated_at()
  returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists stamp_types_set_updated_at on public.stamp_types;
create trigger stamp_types_set_updated_at
  before update on public.stamp_types
  for each row execute function public.set_stamp_types_updated_at();

create or replace function public.set_stamp_calendar_entries_updated_at()
  returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists stamp_calendar_entries_set_updated_at on public.stamp_calendar_entries;
create trigger stamp_calendar_entries_set_updated_at
  before update on public.stamp_calendar_entries
  for each row execute function public.set_stamp_calendar_entries_updated_at();
