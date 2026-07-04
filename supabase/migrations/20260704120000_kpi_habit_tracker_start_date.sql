-- 매일하기 KPI — 습관 트랙커 시작일(추가일)

alter table public.health_map_kpis
  add column if not exists habit_tracker_start_date text not null default '';

alter table public.happiness_map_kpis
  add column if not exists habit_tracker_start_date text not null default '';

alter table public.dream_map_kpis
  add column if not exists habit_tracker_start_date text not null default '';

alter table public.sideincome_map_kpis
  add column if not exists habit_tracker_start_date text not null default '';

comment on column public.health_map_kpis.habit_tracker_start_date is
  '매일하기 KPI 습관 트랙커 시작일 YYYY-MM-DD';
comment on column public.happiness_map_kpis.habit_tracker_start_date is
  '매일하기 KPI 습관 트랙커 시작일 YYYY-MM-DD';
comment on column public.dream_map_kpis.habit_tracker_start_date is
  '매일하기 KPI 습관 트랙커 시작일 YYYY-MM-DD';
comment on column public.sideincome_map_kpis.habit_tracker_start_date is
  '매일하기 KPI 습관 트랙커 시작일 YYYY-MM-DD';
