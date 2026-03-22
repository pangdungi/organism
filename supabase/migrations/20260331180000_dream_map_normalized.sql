-- 꿈 KPI: 로컬 kpi-dream-map (dreams, goals, tasks, desiredLife, kpis…)

create table if not exists public.dream_map_categories (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null default '',
  sort_order int not null default 0,
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

comment on table public.dream_map_categories is '꿈 상위 탭; 로컬 dreams[]';

create index if not exists dream_map_categories_user_idx on public.dream_map_categories (user_id);

create table if not exists public.dream_map_kpis (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  dream_id text not null,
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

comment on table public.dream_map_kpis is '꿈 KPI; 로컬 kpis[] (dreamId)';

create index if not exists dream_map_kpis_user_parent_idx on public.dream_map_kpis (user_id, dream_id);

create table if not exists public.dream_map_kpi_logs (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  kpi_id text not null,
  dream_id text not null default '',
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

comment on table public.dream_map_kpi_logs is '꿈 KPI 로그';

create index if not exists dream_map_kpi_logs_user_kpi_idx on public.dream_map_kpi_logs (user_id, kpi_id);

create table if not exists public.dream_map_kpi_todos (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  kpi_id text not null,
  text text not null default '',
  completed boolean not null default false,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

comment on table public.dream_map_kpi_todos is '꿈 KPI 할일';

create index if not exists dream_map_kpi_todos_user_kpi_idx on public.dream_map_kpi_todos (user_id, kpi_id);

create table if not exists public.dream_map_kpi_daily_todos (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  kpi_id text not null,
  text text not null default '',
  completed boolean not null default false,
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

comment on table public.dream_map_kpi_daily_todos is '꿈 매일 반복 할일';

create index if not exists dream_map_kpi_daily_todos_user_kpi_idx on public.dream_map_kpi_daily_todos (user_id, kpi_id);

create table if not exists public.dream_map_meta (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kpi_order jsonb not null default '{}'::jsonb,
  kpi_task_sync jsonb not null default '{}'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  desired_life text not null default '',
  updated_at timestamptz not null default now ()
);

comment on table public.dream_map_meta is '꿈 kpiOrder, kpiTaskSync, goals, tasks, desiredLife';

alter table public.dream_map_categories enable row level security;
alter table public.dream_map_kpis enable row level security;
alter table public.dream_map_kpi_logs enable row level security;
alter table public.dream_map_kpi_todos enable row level security;
alter table public.dream_map_kpi_daily_todos enable row level security;
alter table public.dream_map_meta enable row level security;

drop policy if exists "dream_map_cat_select" on public.dream_map_categories;
create policy "dream_map_cat_select" on public.dream_map_categories for select to authenticated using (auth.uid() = user_id);
drop policy if exists "dream_map_cat_insert" on public.dream_map_categories;
create policy "dream_map_cat_insert" on public.dream_map_categories for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "dream_map_cat_update" on public.dream_map_categories;
create policy "dream_map_cat_update" on public.dream_map_categories for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dream_map_cat_delete" on public.dream_map_categories;
create policy "dream_map_cat_delete" on public.dream_map_categories for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "dream_map_kpi_select" on public.dream_map_kpis;
create policy "dream_map_kpi_select" on public.dream_map_kpis for select to authenticated using (auth.uid() = user_id);
drop policy if exists "dream_map_kpi_insert" on public.dream_map_kpis;
create policy "dream_map_kpi_insert" on public.dream_map_kpis for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "dream_map_kpi_update" on public.dream_map_kpis;
create policy "dream_map_kpi_update" on public.dream_map_kpis for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dream_map_kpi_delete" on public.dream_map_kpis;
create policy "dream_map_kpi_delete" on public.dream_map_kpis for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "dream_map_log_select" on public.dream_map_kpi_logs;
create policy "dream_map_log_select" on public.dream_map_kpi_logs for select to authenticated using (auth.uid() = user_id);
drop policy if exists "dream_map_log_insert" on public.dream_map_kpi_logs;
create policy "dream_map_log_insert" on public.dream_map_kpi_logs for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "dream_map_log_update" on public.dream_map_kpi_logs;
create policy "dream_map_log_update" on public.dream_map_kpi_logs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dream_map_log_delete" on public.dream_map_kpi_logs;
create policy "dream_map_log_delete" on public.dream_map_kpi_logs for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "dream_map_todo_select" on public.dream_map_kpi_todos;
create policy "dream_map_todo_select" on public.dream_map_kpi_todos for select to authenticated using (auth.uid() = user_id);
drop policy if exists "dream_map_todo_insert" on public.dream_map_kpi_todos;
create policy "dream_map_todo_insert" on public.dream_map_kpi_todos for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "dream_map_todo_update" on public.dream_map_kpi_todos;
create policy "dream_map_todo_update" on public.dream_map_kpi_todos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dream_map_todo_delete" on public.dream_map_kpi_todos;
create policy "dream_map_todo_delete" on public.dream_map_kpi_todos for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "dream_map_daily_select" on public.dream_map_kpi_daily_todos;
create policy "dream_map_daily_select" on public.dream_map_kpi_daily_todos for select to authenticated using (auth.uid() = user_id);
drop policy if exists "dream_map_daily_insert" on public.dream_map_kpi_daily_todos;
create policy "dream_map_daily_insert" on public.dream_map_kpi_daily_todos for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "dream_map_daily_update" on public.dream_map_kpi_daily_todos;
create policy "dream_map_daily_update" on public.dream_map_kpi_daily_todos for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dream_map_daily_delete" on public.dream_map_kpi_daily_todos;
create policy "dream_map_daily_delete" on public.dream_map_kpi_daily_todos for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "dream_map_meta_select" on public.dream_map_meta;
create policy "dream_map_meta_select" on public.dream_map_meta for select to authenticated using (auth.uid() = user_id);
drop policy if exists "dream_map_meta_insert" on public.dream_map_meta;
create policy "dream_map_meta_insert" on public.dream_map_meta for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "dream_map_meta_update" on public.dream_map_meta;
create policy "dream_map_meta_update" on public.dream_map_meta for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dream_map_meta_delete" on public.dream_map_meta;
create policy "dream_map_meta_delete" on public.dream_map_meta for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.dream_map_categories to authenticated;
grant select, insert, update, delete on public.dream_map_kpis to authenticated;
grant select, insert, update, delete on public.dream_map_kpi_logs to authenticated;
grant select, insert, update, delete on public.dream_map_kpi_todos to authenticated;
grant select, insert, update, delete on public.dream_map_kpi_daily_todos to authenticated;
grant select, insert, update, delete on public.dream_map_meta to authenticated;
