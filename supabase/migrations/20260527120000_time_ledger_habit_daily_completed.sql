-- 시간기록 행별 매일할일 체크(과제 기록 모달) — KPI 로그 pull과 무관하게 수정 모달 복원용
alter table public.time_ledger_entries
  add column if not exists habit_daily_completed jsonb not null default '[]'::jsonb;

comment on column public.time_ledger_entries.habit_daily_completed is
  '과제 기록 모달에서 체크한 매일할일 [{id,text}] — 해당 시간기록 행 기준';
