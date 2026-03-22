-- 시간가계부 과제 기록 (행 단위). 방해기록은 focus_events jsonb 배열 [{ "time", "type" }, ...]

create table if not exists public.time_ledger_entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  task_id uuid references public.time_ledger_tasks (id) on delete set null,
  task_name text not null default '',
  start_time text not null default '',
  end_time text not null default '',
  productivity text not null default '',
  category text not null default '',
  time_tracked text not null default '',
  focus_events jsonb not null default '[]',
  memo text not null default '',
  memo_tags jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

comment on table public.time_ledger_entries is '시간가계부 기록 행: 메모·태그·방해기록(복수는 JSON 배열)';

create index if not exists time_ledger_entries_user_date_idx
  on public.time_ledger_entries (user_id, entry_date desc);

create index if not exists time_ledger_entries_user_id_idx
  on public.time_ledger_entries (user_id);

alter table public.time_ledger_entries enable row level security;

drop policy if exists "time_ledger_entries_select_own" on public.time_ledger_entries;
create policy "time_ledger_entries_select_own"
  on public.time_ledger_entries for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "time_ledger_entries_insert_own" on public.time_ledger_entries;
create policy "time_ledger_entries_insert_own"
  on public.time_ledger_entries for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "time_ledger_entries_update_own" on public.time_ledger_entries;
create policy "time_ledger_entries_update_own"
  on public.time_ledger_entries for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "time_ledger_entries_delete_own" on public.time_ledger_entries;
create policy "time_ledger_entries_delete_own"
  on public.time_ledger_entries for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.time_ledger_entries to authenticated;

create or replace function public.set_time_ledger_entries_updated_at()
  returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists time_ledger_entries_updated_at on public.time_ledger_entries;
create trigger time_ledger_entries_updated_at
  before update on public.time_ledger_entries
  for each row execute function public.set_time_ledger_entries_updated_at();
