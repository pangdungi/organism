-- 일기(자유·통제·감정): 사용자·종류·날짜당 1행, 본문은 jsonb payload
-- Supabase SQL Editor: 이 파일 전체 복사 → Run (한 번만; 재실행 시 policy는 drop 후 생성)

create table if not exists public.diary_daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  diary_kind text not null
    constraint diary_daily_entries_kind_check
      check (diary_kind in ('free', 'control', 'emotion')),
  entry_date date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diary_daily_entries_user_kind_date_unique unique (user_id, diary_kind, entry_date)
);

comment on table public.diary_daily_entries is '감정관리: 탭별 날짜 단위 일기 (payload에 탭별 필드)';

create index if not exists diary_daily_entries_user_id_entry_date_idx
  on public.diary_daily_entries (user_id, entry_date desc);

alter table public.diary_daily_entries enable row level security;

drop policy if exists "diary_daily_entries_select_own" on public.diary_daily_entries;
create policy "diary_daily_entries_select_own"
  on public.diary_daily_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "diary_daily_entries_insert_own" on public.diary_daily_entries;
create policy "diary_daily_entries_insert_own"
  on public.diary_daily_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "diary_daily_entries_update_own" on public.diary_daily_entries;
create policy "diary_daily_entries_update_own"
  on public.diary_daily_entries
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "diary_daily_entries_delete_own" on public.diary_daily_entries;
create policy "diary_daily_entries_delete_own"
  on public.diary_daily_entries
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.diary_daily_entries to authenticated;

create or replace function public.set_diary_daily_entries_updated_at()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists diary_daily_entries_set_updated_at on public.diary_daily_entries;

create trigger diary_daily_entries_set_updated_at
  before update on public.diary_daily_entries
  for each row
  execute function public.set_diary_daily_entries_updated_at();
