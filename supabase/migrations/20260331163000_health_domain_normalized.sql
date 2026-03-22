-- 건강 KPI: JSON payload 대신 엔티티별 테이블 (로컬 kpi-health-map 과 동일 정보)

-- 건강 탭(카테고리)
create table if not exists public.health_map_categories (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null default '',
  sort_order int not null default 0,
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

comment on table public.health_map_categories is '건강 상위 탭(운동 등); 로컬 healths[]';

create index if not exists health_map_categories_user_idx on public.health_map_categories (user_id);

-- KPI 카드
create table if not exists public.health_map_kpis (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  health_id text not null,
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

comment on table public.health_map_kpis is '건강 KPI; 로컬 kpis[]';

create index if not exists health_map_kpis_user_health_idx on public.health_map_kpis (user_id, health_id);

-- 수치 로그
create table if not exists public.health_map_kpi_logs (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  kpi_id text not null,
  health_id text not null default '',
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

comment on table public.health_map_kpi_logs is 'KPI 수치 로그; 로컬 kpiLogs[]';

create index if not exists health_map_kpi_logs_user_kpi_idx on public.health_map_kpi_logs (user_id, kpi_id);

-- KPI 할 일(할일 목록)
create table if not exists public.health_map_kpi_todos (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  kpi_id text not null,
  text text not null default '',
  completed boolean not null default false,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

comment on table public.health_map_kpi_todos is 'KPI 할일 목록; 로컬 kpiTodos[] (extra=마감·아이젠하워 등)';

create index if not exists health_map_kpi_todos_user_kpi_idx on public.health_map_kpi_todos (user_id, kpi_id);

-- 매일 반복 할 일
create table if not exists public.health_map_kpi_daily_todos (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  kpi_id text not null,
  text text not null default '',
  completed boolean not null default false,
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

comment on table public.health_map_kpi_daily_todos is '매일 반복 할일; 로컬 kpiDailyRepeatTodos[]';

create index if not exists health_map_kpi_daily_todos_user_kpi_idx on public.health_map_kpi_daily_todos (user_id, kpi_id);

-- KPI 정렬·시간가계부 과제명 동기화
create table if not exists public.health_map_meta (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kpi_order jsonb not null default '{}'::jsonb,
  kpi_task_sync jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now ()
);

comment on table public.health_map_meta is 'kpiOrder, kpiTaskSync (로컬과 동일 키)';

-- RLS
alter table public.health_map_categories enable row level security;
alter table public.health_map_kpis enable row level security;
alter table public.health_map_kpi_logs enable row level security;
alter table public.health_map_kpi_todos enable row level security;
alter table public.health_map_kpi_daily_todos enable row level security;
alter table public.health_map_meta enable row level security;

-- categories
drop policy if exists "health_map_cat_select" on public.health_map_categories;
create policy "health_map_cat_select" on public.health_map_categories for select to authenticated using (auth.uid() = user_id);
drop policy if exists "health_map_cat_insert" on public.health_map_categories;
create policy "health_map_cat_insert" on public.health_map_categories for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "health_map_cat_update" on public.health_map_categories;
create policy "health_map_cat_update" on public.health_map_categories for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "health_map_cat_delete" on public.health_map_categories;
create policy "health_map_cat_delete" on public.health_map_categories for delete to authenticated using (auth.uid() = user_id);

-- kpis
drop policy if exists "health_map_kpi_select" on public.health_map_kpis;
create policy "health_map_kpi_select" on public.health_map_kpis for select to authenticated using (auth.uid() = user_id);
drop policy if exists "health_map_kpi_insert" on public.health_map_kpis;
create policy "health_map_kpi_insert" on public.health_map_kpis for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "health_map_kpi_update" on public.health_map_kpis;
create policy "health_map_kpi_update" on public.health_map_kpis for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "health_map_kpi_delete" on public.health_map_kpis;
create policy "health_map_kpi_delete" on public.health_map_kpis for delete to authenticated using (auth.uid() = user_id);

-- logs
drop policy if exists "health_map_log_select" on public.health_map_kpi_logs;
create policy "health_map_log_select" on public.health_map_kpi_logs for select to authenticated using (auth.uid() = user_id);
drop policy if exists "health_map_log_insert" on public.health_map_kpi_logs;
create policy "health_map_log_insert" on public.health_map_kpi_logs for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "health_map_log_update" on public.health_map_kpi_logs;
create policy "health_map_log_update" on public.health_map_kpi_logs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "health_map_log_delete" on public.health_map_kpi_logs;
create policy "health_map_log_delete" on public.health_map_kpi_logs for delete to authenticated using (auth.uid() = user_id);

-- todos
drop policy if exists "health_map_todo_select" on public.health_map_kpi_todos;
create policy "health_map_todo_select" on public.health_map_kpi_todos for select to authenticated using (auth.uid() = user_id);
drop policy if exists "health_map_todo_insert" on public.health_map_kpi_todos;
create policy "health_map_todo_insert" on public.health_map_kpi_todos for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "health_map_todo_update" on public.health_map_kpi_todos;
create policy "health_map_todo_update" on public.health_map_kpi_todos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "health_map_todo_delete" on public.health_map_kpi_todos;
create policy "health_map_todo_delete" on public.health_map_kpi_todos for delete to authenticated using (auth.uid() = user_id);

-- daily todos
drop policy if exists "health_map_daily_select" on public.health_map_kpi_daily_todos;
create policy "health_map_daily_select" on public.health_map_kpi_daily_todos for select to authenticated using (auth.uid() = user_id);
drop policy if exists "health_map_daily_insert" on public.health_map_kpi_daily_todos;
create policy "health_map_daily_insert" on public.health_map_kpi_daily_todos for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "health_map_daily_update" on public.health_map_kpi_daily_todos;
create policy "health_map_daily_update" on public.health_map_kpi_daily_todos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "health_map_daily_delete" on public.health_map_kpi_daily_todos;
create policy "health_map_daily_delete" on public.health_map_kpi_daily_todos for delete to authenticated using (auth.uid() = user_id);

-- meta
drop policy if exists "health_map_meta_select" on public.health_map_meta;
create policy "health_map_meta_select" on public.health_map_meta for select to authenticated using (auth.uid() = user_id);
drop policy if exists "health_map_meta_insert" on public.health_map_meta;
create policy "health_map_meta_insert" on public.health_map_meta for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "health_map_meta_update" on public.health_map_meta;
create policy "health_map_meta_update" on public.health_map_meta for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "health_map_meta_delete" on public.health_map_meta;
create policy "health_map_meta_delete" on public.health_map_meta for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.health_map_categories to authenticated;
grant select, insert, update, delete on public.health_map_kpis to authenticated;
grant select, insert, update, delete on public.health_map_kpi_logs to authenticated;
grant select, insert, update, delete on public.health_map_kpi_todos to authenticated;
grant select, insert, update, delete on public.health_map_kpi_daily_todos to authenticated;
grant select, insert, update, delete on public.health_map_meta to authenticated;
