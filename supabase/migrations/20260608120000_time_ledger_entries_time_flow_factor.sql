-- 생산적 시간기록 5점 — «몰입 요소»(복수 선택, 미선택=[])
alter table public.time_ledger_entries
  add column if not exists time_flow_factors jsonb not null default '[]'::jsonb;

comment on column public.time_ledger_entries.time_flow_factors is
  '생산적 작업 시간기록 모달에서 5점 선택 후 고른 몰입 요소 id 배열(empty_stomach|caffeine|…, 미선택 [])';
