-- 과제 기록 모달 «오늘의 수행값» — 해당 시간기록 행 기준 (수정 모달 복원·동기화)
alter table public.time_ledger_entries
  add column if not exists kpi_performed_value text not null default '';

comment on column public.time_ledger_entries.kpi_performed_value is
  'KPI 과제 기록 시 입력한 당일 수행값(목표·단위 있는 KPI)';
