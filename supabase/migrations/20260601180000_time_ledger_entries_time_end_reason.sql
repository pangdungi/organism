-- 생산적 시간기록 — 별점 선택 시 «작업 종료 이유»(미선택=null)
alter table public.time_ledger_entries
  add column if not exists time_end_reason text;

comment on column public.time_ledger_entries.time_end_reason is
  '생산적 작업 시간기록 모달에서 별점 선택 후 고른 종료 이유 id(hunger|sleepy|…, 미선택 null)';
