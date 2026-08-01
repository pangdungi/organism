-- 비생산적 작업 1~3점 — 별로였던 이유
alter table public.time_ledger_entries
  add column if not exists time_bad_feeling_reasons jsonb not null default '[]'::jsonb;

comment on column public.time_ledger_entries.time_bad_feeling_reasons is
  '비생산적 작업 1~3점 시 선택한 별로였던 이유 id 배열';
