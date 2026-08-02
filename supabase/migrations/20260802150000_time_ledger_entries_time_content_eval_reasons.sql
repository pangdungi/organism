-- 의식적·무의식적 콘텐츠 소비 — 시간평가 후 콘텐츠 평가 칩 id
alter table public.time_ledger_entries
  add column if not exists time_content_eval_reasons jsonb not null default '[]'::jsonb;

comment on column public.time_ledger_entries.time_content_eval_reasons is
  '콘텐츠 소비: 시간평가 1~3/4~5점 후 고른 콘텐츠 평가 id 배열';
