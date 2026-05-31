-- 건강 목표: 목표값·단위 + 목표 로그 (부수입 paths/path_logs 패턴)

alter table public.health_map_categories
  add column if not exists target_value text not null default '',
  add column if not exists unit text not null default '',
  add column if not exists track_target_value boolean not null default false;

update public.health_map_categories
  set track_target_value = true
  where trim(coalesce(target_value, '')) <> ''
     or trim(coalesce(unit, '')) <> '';

comment on column public.health_map_categories.target_value is '건강 목표 목표값';
comment on column public.health_map_categories.unit is '건강 목표 단위 (kg, 회 등)';
comment on column public.health_map_categories.track_target_value is 'true면 목표값·로그 UI 표시';

create table if not exists public.health_map_goal_logs (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  health_id text not null,
  date_display text not null default '',
  date_raw text not null default '',
  value text not null default '',
  status text not null default '',
  memo text not null default '',
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

comment on table public.health_map_goal_logs is '건강 목표 수치 로그; 로컬 healthGoalLogs[]';

create index if not exists health_map_goal_logs_user_health_idx
  on public.health_map_goal_logs (user_id, health_id);

alter table public.health_map_goal_logs enable row level security;

drop policy if exists "health_map_glog_select" on public.health_map_goal_logs;
create policy "health_map_glog_select"
  on public.health_map_goal_logs for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "health_map_glog_insert" on public.health_map_goal_logs;
create policy "health_map_glog_insert"
  on public.health_map_goal_logs for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "health_map_glog_update" on public.health_map_goal_logs;
create policy "health_map_glog_update"
  on public.health_map_goal_logs for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "health_map_glog_delete" on public.health_map_goal_logs;
create policy "health_map_glog_delete"
  on public.health_map_goal_logs for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.health_map_goal_logs to authenticated;
