-- 시간가계부 과제 ↔ KPI(id) 연동: pull 시 map_kpis.name으로 표시명 맞추기 위해 저장
alter table public.time_ledger_tasks
  add column if not exists kpi_id text not null default '';

comment on column public.time_ledger_tasks.kpi_id is
  '연동 KPI id (dream/health/happiness/sideincome *_map_kpis.id); 빈 문자열이면 비연동 과제';

create index if not exists time_ledger_tasks_user_kpi_id_idx
  on public.time_ledger_tasks (user_id, kpi_id)
  where kpi_id <> '';
