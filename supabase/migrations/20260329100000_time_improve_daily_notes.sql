-- 시간 사용 개선하기: 날짜별 서술형 답변 (집중력/계획/중요일/투자 사분면)

create table if not exists public.time_improve_daily_notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  root_cause text not null default '',
  countermeasures text not null default '',
  plan_reality text not null default '',
  important_invest text not null default '',
  invest_reduce text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);

comment on table public.time_improve_daily_notes is '시간가계부 3. 시간 사용 개선하기: 일자별 메모';

create index if not exists time_improve_daily_notes_user_date_idx
  on public.time_improve_daily_notes (user_id, entry_date desc);

alter table public.time_improve_daily_notes enable row level security;

drop policy if exists "time_improve_daily_notes_select_own" on public.time_improve_daily_notes;
create policy "time_improve_daily_notes_select_own"
  on public.time_improve_daily_notes for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "time_improve_daily_notes_insert_own" on public.time_improve_daily_notes;
create policy "time_improve_daily_notes_insert_own"
  on public.time_improve_daily_notes for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "time_improve_daily_notes_update_own" on public.time_improve_daily_notes;
create policy "time_improve_daily_notes_update_own"
  on public.time_improve_daily_notes for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "time_improve_daily_notes_delete_own" on public.time_improve_daily_notes;
create policy "time_improve_daily_notes_delete_own"
  on public.time_improve_daily_notes for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.time_improve_daily_notes to authenticated;

create or replace function public.set_time_improve_daily_notes_updated_at()
  returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists time_improve_daily_notes_updated_at on public.time_improve_daily_notes;
create trigger time_improve_daily_notes_updated_at
  before update on public.time_improve_daily_notes
  for each row execute function public.set_time_improve_daily_notes_updated_at();
