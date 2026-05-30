-- KPI 목표 방식: 태스크 완료 기준 진행률
alter table public.dream_map_kpis
  add column if not exists use_task_completion_goal boolean not null default false;

alter table public.happiness_map_kpis
  add column if not exists use_task_completion_goal boolean not null default false;

alter table public.health_map_kpis
  add column if not exists use_task_completion_goal boolean not null default false;

alter table public.sideincome_map_kpis
  add column if not exists use_task_completion_goal boolean not null default false;

comment on column public.dream_map_kpis.use_task_completion_goal is
  'KPI 할일 완료 비율로 진행률 표시';
