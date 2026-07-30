-- 수면 평가 5점 — 잘 잔 이유 / 1~2점 — 아쉬웠던 이유
alter table public.time_ledger_entries
  add column if not exists time_sleep_good_factors jsonb not null default '[]'::jsonb;

alter table public.time_ledger_entries
  add column if not exists time_sleep_poor_reasons jsonb not null default '[]'::jsonb;

comment on column public.time_ledger_entries.time_sleep_good_factors is
  '수면하기 5점 시 선택한 잘 잔 이유 id 배열';

comment on column public.time_ledger_entries.time_sleep_poor_reasons is
  '수면하기 1~2점 시 선택한 아쉬웠던 이유 id 배열';
