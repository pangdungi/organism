-- 일간 시간 예산(오늘 해치우기 1·3·4): 날짜별 goals JSON + 제외 과제명 배열 — localStorage time_daily_budget_goals / time_budget_excluded 와 대응

create table if not exists public.time_daily_budget_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_date date not null,
  goals jsonb not null default '{}',
  excluded_names jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_date)
);

comment on table public.time_daily_budget_days is '일간 시간 배치: 과제명→{ goalTime, scheduledTimes, isInvest } JSON + 해당 날짜 제외 과제명 배열';

create index if not exists time_daily_budget_days_user_date_idx
  on public.time_daily_budget_days (user_id, plan_date desc);

alter table public.time_daily_budget_days enable row level security;

drop policy if exists "time_daily_budget_days_select_own" on public.time_daily_budget_days;
create policy "time_daily_budget_days_select_own"
  on public.time_daily_budget_days for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "time_daily_budget_days_insert_own" on public.time_daily_budget_days;
create policy "time_daily_budget_days_insert_own"
  on public.time_daily_budget_days for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "time_daily_budget_days_update_own" on public.time_daily_budget_days;
create policy "time_daily_budget_days_update_own"
  on public.time_daily_budget_days for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "time_daily_budget_days_delete_own" on public.time_daily_budget_days;
create policy "time_daily_budget_days_delete_own"
  on public.time_daily_budget_days for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.time_daily_budget_days to authenticated;

create or replace function public.set_time_daily_budget_days_updated_at ()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists time_daily_budget_days_updated_at on public.time_daily_budget_days;
create trigger time_daily_budget_days_updated_at
  before update on public.time_daily_budget_days
  for each row
  execute function public.set_time_daily_budget_days_updated_at();
