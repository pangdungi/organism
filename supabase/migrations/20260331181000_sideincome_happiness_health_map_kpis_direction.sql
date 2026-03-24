-- 부수입·행복·건강 KPI: 높을수록 좋음(higher) / 낮을수록 좋음(lower) — dream_map_kpis와 동일
alter table public.sideincome_map_kpis
  add column if not exists direction text not null default 'higher';

alter table public.happiness_map_kpis
  add column if not exists direction text not null default 'higher';

alter table public.health_map_kpis
  add column if not exists direction text not null default 'higher';

comment on column public.sideincome_map_kpis.direction is 'higher=누적 목표, lower=상한 이하(최근 로그 기준)';
comment on column public.happiness_map_kpis.direction is 'higher=누적 목표, lower=상한 이하(최근 로그 기준)';
comment on column public.health_map_kpis.direction is 'higher=누적 목표, lower=상한 이하(최근 로그 기준)';
