-- 건강 탭: 건강 목록·KPI·로그·할 일·매일반복할일·kpiOrder·kpiTaskSync (로컬 kpi-health-map 과 동일 구조 JSON)

create table if not exists public.health_user_kpi_map (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now ()
);

comment on table public.health_user_kpi_map is '건강 KPI 맵 전체(JSON): healths, kpis, kpiLogs, kpiTodos, kpiDailyRepeatTodos, kpiOrder, kpiTaskSync';

alter table public.health_user_kpi_map enable row level security;

drop policy if exists "health_user_kpi_map_select_own" on public.health_user_kpi_map;
create policy "health_user_kpi_map_select_own"
  on public.health_user_kpi_map for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "health_user_kpi_map_insert_own" on public.health_user_kpi_map;
create policy "health_user_kpi_map_insert_own"
  on public.health_user_kpi_map for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "health_user_kpi_map_update_own" on public.health_user_kpi_map;
create policy "health_user_kpi_map_update_own"
  on public.health_user_kpi_map for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "health_user_kpi_map_delete_own" on public.health_user_kpi_map;
create policy "health_user_kpi_map_delete_own"
  on public.health_user_kpi_map for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.health_user_kpi_map to authenticated;

create or replace function public.set_health_user_kpi_map_updated_at ()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists health_user_kpi_map_set_updated_at on public.health_user_kpi_map;
create trigger health_user_kpi_map_set_updated_at
  before update on public.health_user_kpi_map
  for each row
  execute function public.set_health_user_kpi_map_updated_at ();
