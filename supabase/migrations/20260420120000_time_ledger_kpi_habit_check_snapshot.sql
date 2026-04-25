-- 과제 기록(매일 할 일) → KPI daily_completed id 보관(행 삭제 시 제거)
alter table public.time_ledger_entries
  add column if not exists kpi_habit_check_snapshot jsonb;

comment on column public.time_ledger_entries.kpi_habit_check_snapshot is
  'KPI 매일할일 체크에 기여한 todo id ( storageKey, kpiId, dateRaw, completedTodoIds )';
