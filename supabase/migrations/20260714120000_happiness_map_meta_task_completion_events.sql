-- 행복 KPI 태스크 완료형 — 체크 시점 이벤트(이번 주 처리 수) meta 저장

alter table public.happiness_map_meta
  add column if not exists kpi_task_completion_events jsonb not null default '[]'::jsonb;

comment on column public.happiness_map_meta.kpi_task_completion_events is
  '태스크 완료형 KPI 체크 이벤트; 잡무 처리하기 등 이번 주 처리 수 집계용';
