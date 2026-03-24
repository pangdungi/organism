-- 꿈 KPI: 높을수록 좋음(higher) / 낮을수록 좋음(lower)
alter table public.dream_map_kpis
  add column if not exists direction text not null default 'higher';

comment on column public.dream_map_kpis.direction is 'higher=누적 목표, lower=상한 이하(최근 로그 기준)';
