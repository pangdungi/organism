-- 부수입: 경로(목표금액·단위) + 경로 금액 로그(pathLogs) + KPI·KPI로그·할일 (로컬 kpi-sideincome-paths)

create table if not exists public.sideincome_map_paths (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null default '',
  target_amount text not null default '',
  unit text not null default '',
  sort_order int not null default 0,
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

comment on table public.sideincome_map_paths is '부수입 경로 탭; paths[] (name, targetAmount, unit)';

create index if not exists sideincome_map_paths_user_idx on public.sideincome_map_paths (user_id);

create table if not exists public.sideincome_map_path_logs (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  path_id text not null,
  date_display text not null default '',
  date_raw text not null default '',
  value text not null default '',
  status text not null default '',
  memo text not null default '',
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

comment on table public.sideincome_map_path_logs is '경로 목표 대비 금액 로그; pathLogs[]';

create index if not exists sideincome_map_path_logs_user_path_idx on public.sideincome_map_path_logs (user_id, path_id);

create table if not exists public.sideincome_map_kpis (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  path_id text not null,
  name text not null default '',
  unit text not null default '',
  target_value text not null default '',
  target_start_date text not null default '',
  target_deadline text not null default '',
  target_time_required text not null default '',
  need_habit_tracker boolean not null default false,
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

comment on table public.sideincome_map_kpis is '부수입 KPI; kpis[] (pathId)';

create index if not exists sideincome_map_kpis_user_path_idx on public.sideincome_map_kpis (user_id, path_id);

create table if not exists public.sideincome_map_kpi_logs (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  kpi_id text not null,
  path_id text not null default '',
  date_display text not null default '',
  date_raw text not null default '',
  value text not null default '',
  status text not null default '',
  memo text not null default '',
  daily_completed jsonb not null default '[]'::jsonb,
  daily_incomplete jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

comment on table public.sideincome_map_kpi_logs is 'KPI 수치 로그; kpiLogs[]';

create index if not exists sideincome_map_kpi_logs_user_kpi_idx on public.sideincome_map_kpi_logs (user_id, kpi_id);

create table if not exists public.sideincome_map_kpi_todos (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  kpi_id text not null,
  text text not null default '',
  completed boolean not null default false,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

create index if not exists sideincome_map_kpi_todos_user_kpi_idx on public.sideincome_map_kpi_todos (user_id, kpi_id);

create table if not exists public.sideincome_map_kpi_daily_todos (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  kpi_id text not null,
  text text not null default '',
  completed boolean not null default false,
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

create index if not exists sideincome_map_kpi_daily_todos_user_kpi_idx on public.sideincome_map_kpi_daily_todos (user_id, kpi_id);

create table if not exists public.sideincome_map_meta (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kpi_order jsonb not null default '{}'::jsonb,
  kpi_task_sync jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now ()
);

comment on table public.sideincome_map_meta is 'kpiOrder, kpiTaskSync';

alter table public.sideincome_map_paths enable row level security;
alter table public.sideincome_map_path_logs enable row level security;
alter table public.sideincome_map_kpis enable row level security;
alter table public.sideincome_map_kpi_logs enable row level security;
alter table public.sideincome_map_kpi_todos enable row level security;
alter table public.sideincome_map_kpi_daily_todos enable row level security;
alter table public.sideincome_map_meta enable row level security;

-- paths
drop policy if exists "sideincome_map_paths_select" on public.sideincome_map_paths;
create policy "sideincome_map_paths_select" on public.sideincome_map_paths for select to authenticated using (auth.uid() = user_id);
drop policy if exists "sideincome_map_paths_insert" on public.sideincome_map_paths;
create policy "sideincome_map_paths_insert" on public.sideincome_map_paths for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_paths_update" on public.sideincome_map_paths;
create policy "sideincome_map_paths_update" on public.sideincome_map_paths for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_paths_delete" on public.sideincome_map_paths;
create policy "sideincome_map_paths_delete" on public.sideincome_map_paths for delete to authenticated using (auth.uid() = user_id);

-- path_logs
drop policy if exists "sideincome_map_plog_select" on public.sideincome_map_path_logs;
create policy "sideincome_map_plog_select" on public.sideincome_map_path_logs for select to authenticated using (auth.uid() = user_id);
drop policy if exists "sideincome_map_plog_insert" on public.sideincome_map_path_logs;
create policy "sideincome_map_plog_insert" on public.sideincome_map_path_logs for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_plog_update" on public.sideincome_map_path_logs;
create policy "sideincome_map_plog_update" on public.sideincome_map_path_logs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_plog_delete" on public.sideincome_map_path_logs;
create policy "sideincome_map_plog_delete" on public.sideincome_map_path_logs for delete to authenticated using (auth.uid() = user_id);

-- kpis
drop policy if exists "sideincome_map_kpi_select" on public.sideincome_map_kpis;
create policy "sideincome_map_kpi_select" on public.sideincome_map_kpis for select to authenticated using (auth.uid() = user_id);
drop policy if exists "sideincome_map_kpi_insert" on public.sideincome_map_kpis;
create policy "sideincome_map_kpi_insert" on public.sideincome_map_kpis for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_kpi_update" on public.sideincome_map_kpis;
create policy "sideincome_map_kpi_update" on public.sideincome_map_kpis for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_kpi_delete" on public.sideincome_map_kpis;
create policy "sideincome_map_kpi_delete" on public.sideincome_map_kpis for delete to authenticated using (auth.uid() = user_id);

-- kpi_logs
drop policy if exists "sideincome_map_klog_select" on public.sideincome_map_kpi_logs;
create policy "sideincome_map_klog_select" on public.sideincome_map_kpi_logs for select to authenticated using (auth.uid() = user_id);
drop policy if exists "sideincome_map_klog_insert" on public.sideincome_map_kpi_logs;
create policy "sideincome_map_klog_insert" on public.sideincome_map_kpi_logs for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_klog_update" on public.sideincome_map_kpi_logs;
create policy "sideincome_map_klog_update" on public.sideincome_map_kpi_logs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_klog_delete" on public.sideincome_map_kpi_logs;
create policy "sideincome_map_klog_delete" on public.sideincome_map_kpi_logs for delete to authenticated using (auth.uid() = user_id);

-- todos
drop policy if exists "sideincome_map_todo_select" on public.sideincome_map_kpi_todos;
create policy "sideincome_map_todo_select" on public.sideincome_map_kpi_todos for select to authenticated using (auth.uid() = user_id);
drop policy if exists "sideincome_map_todo_insert" on public.sideincome_map_kpi_todos;
create policy "sideincome_map_todo_insert" on public.sideincome_map_kpi_todos for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_todo_update" on public.sideincome_map_kpi_todos;
create policy "sideincome_map_todo_update" on public.sideincome_map_kpi_todos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_todo_delete" on public.sideincome_map_kpi_todos;
create policy "sideincome_map_todo_delete" on public.sideincome_map_kpi_todos for delete to authenticated using (auth.uid() = user_id);

-- daily
drop policy if exists "sideincome_map_daily_select" on public.sideincome_map_kpi_daily_todos;
create policy "sideincome_map_daily_select" on public.sideincome_map_kpi_daily_todos for select to authenticated using (auth.uid() = user_id);
drop policy if exists "sideincome_map_daily_insert" on public.sideincome_map_kpi_daily_todos;
create policy "sideincome_map_daily_insert" on public.sideincome_map_kpi_daily_todos for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_daily_update" on public.sideincome_map_kpi_daily_todos;
create policy "sideincome_map_daily_update" on public.sideincome_map_kpi_daily_todos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_daily_delete" on public.sideincome_map_kpi_daily_todos;
create policy "sideincome_map_daily_delete" on public.sideincome_map_kpi_daily_todos for delete to authenticated using (auth.uid() = user_id);

-- meta
drop policy if exists "sideincome_map_meta_select" on public.sideincome_map_meta;
create policy "sideincome_map_meta_select" on public.sideincome_map_meta for select to authenticated using (auth.uid() = user_id);
drop policy if exists "sideincome_map_meta_insert" on public.sideincome_map_meta;
create policy "sideincome_map_meta_insert" on public.sideincome_map_meta for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_meta_update" on public.sideincome_map_meta;
create policy "sideincome_map_meta_update" on public.sideincome_map_meta for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "sideincome_map_meta_delete" on public.sideincome_map_meta;
create policy "sideincome_map_meta_delete" on public.sideincome_map_meta for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.sideincome_map_paths to authenticated;
grant select, insert, update, delete on public.sideincome_map_path_logs to authenticated;
grant select, insert, update, delete on public.sideincome_map_kpis to authenticated;
grant select, insert, update, delete on public.sideincome_map_kpi_logs to authenticated;
grant select, insert, update, delete on public.sideincome_map_kpi_todos to authenticated;
grant select, insert, update, delete on public.sideincome_map_kpi_daily_todos to authenticated;
grant select, insert, update, delete on public.sideincome_map_meta to authenticated;
