-- 시급·건강·꿈 KPI — 할일 체크 완료 기록. 완료 목록을 지워도 레포트 집계는 남김.

alter table public.health_map_meta
  add column if not exists kpi_task_completion_events jsonb not null default '[]'::jsonb;

alter table public.dream_map_meta
  add column if not exists kpi_task_completion_events jsonb not null default '[]'::jsonb;

alter table public.sideincome_map_meta
  add column if not exists kpi_task_completion_events jsonb not null default '[]'::jsonb;

comment on column public.health_map_meta.kpi_task_completion_events is
  '할일 체크 완료 기록. 목록 삭제와 분리해 월·년 레포트에 씀';
comment on column public.dream_map_meta.kpi_task_completion_events is
  '할일 체크 완료 기록. 목록 삭제와 분리해 월·년 레포트에 씀';
comment on column public.sideincome_map_meta.kpi_task_completion_events is
  '할일 체크 완료 기록. 목록 삭제와 분리해 월·년 레포트에 씀';
