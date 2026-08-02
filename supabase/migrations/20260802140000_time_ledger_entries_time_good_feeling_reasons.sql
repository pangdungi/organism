-- 비생산적 작업 4~5점 — 좋았던 점
alter table public.time_ledger_entries
  add column if not exists time_good_feeling_reasons jsonb not null default '[]'::jsonb;

comment on column public.time_ledger_entries.time_good_feeling_reasons is
  '비생산적 작업 4~5점 시 선택한 좋았던 점 id 배열';
