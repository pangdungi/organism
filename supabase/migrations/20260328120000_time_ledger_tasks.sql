-- 시간가계부 과제 마스터 (고유 id · 이름·분류 동기화)

create table if not exists public.time_ledger_tasks (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  productivity text not null
    constraint time_ledger_tasks_productivity_check
      check (productivity in ('productive', 'nonproductive', 'other')),
  category text not null default '',
  memo text not null default '',
  sort_order int not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.time_ledger_tasks is '시간가계부 과제 설정: id 불변, 표시명·분류 수정 가능';

create index if not exists time_ledger_tasks_user_sort_idx
  on public.time_ledger_tasks (user_id, sort_order, id);

alter table public.time_ledger_tasks enable row level security;

drop policy if exists "time_ledger_tasks_select_own" on public.time_ledger_tasks;
create policy "time_ledger_tasks_select_own"
  on public.time_ledger_tasks for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "time_ledger_tasks_insert_own" on public.time_ledger_tasks;
create policy "time_ledger_tasks_insert_own"
  on public.time_ledger_tasks for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "time_ledger_tasks_update_own" on public.time_ledger_tasks;
create policy "time_ledger_tasks_update_own"
  on public.time_ledger_tasks for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "time_ledger_tasks_delete_own" on public.time_ledger_tasks;
create policy "time_ledger_tasks_delete_own"
  on public.time_ledger_tasks for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.time_ledger_tasks to authenticated;

create or replace function public.set_time_ledger_tasks_updated_at()
  returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists time_ledger_tasks_updated_at on public.time_ledger_tasks;
create trigger time_ledger_tasks_updated_at
  before update on public.time_ledger_tasks
  for each row execute function public.set_time_ledger_tasks_updated_at();
