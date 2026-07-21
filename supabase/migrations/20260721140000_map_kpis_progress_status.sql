-- 건강·행복·시급상승 KPI: 과제 상태 (진행 전 / 진행중 / 완료)

alter table public.health_map_kpis
  add column if not exists progress_status text not null default 'active';

alter table public.happiness_map_kpis
  add column if not exists progress_status text not null default 'active';

alter table public.sideincome_map_kpis
  add column if not exists progress_status text not null default 'active';

alter table public.health_map_kpis
  drop constraint if exists health_map_kpis_progress_status_check;
alter table public.health_map_kpis
  add constraint health_map_kpis_progress_status_check
  check (progress_status in ('pending', 'active', 'completed'));

alter table public.happiness_map_kpis
  drop constraint if exists happiness_map_kpis_progress_status_check;
alter table public.happiness_map_kpis
  add constraint happiness_map_kpis_progress_status_check
  check (progress_status in ('pending', 'active', 'completed'));

alter table public.sideincome_map_kpis
  drop constraint if exists sideincome_map_kpis_progress_status_check;
alter table public.sideincome_map_kpis
  add constraint sideincome_map_kpis_progress_status_check
  check (progress_status in ('pending', 'active', 'completed'));

comment on column public.health_map_kpis.progress_status is
  '과제 상태: pending=진행 전, active=진행중, completed=완료';
comment on column public.happiness_map_kpis.progress_status is
  '과제 상태: pending=진행 전, active=진행중, completed=완료';
comment on column public.sideincome_map_kpis.progress_status is
  '과제 상태: pending=진행 전, active=진행중, completed=완료';
