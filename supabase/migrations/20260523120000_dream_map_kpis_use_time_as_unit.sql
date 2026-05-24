-- 꿈 KPI: 단위 「시간」 모드 (목표 시간 = 필요시간, 시간가계부 누적만 표시)

alter table public.dream_map_kpis
  add column if not exists use_time_as_unit boolean not null default false;

comment on column public.dream_map_kpis.use_time_as_unit is
  'true면 단위=시간·목표 시간=target_time_required·누적 시간 KPI 카드 표시';
