-- 가계부 지출 id는 memo_tags와 분리 (메모·아카이브 표시와 겹치지 않게)

alter table public.time_ledger_entries
  add column if not exists linked_expense_ids jsonb not null default '[]'::jsonb;

comment on column public.time_ledger_entries.linked_expense_ids is
  '시간 행에 연결된 가계부 지출 행 uuid 문자열 배열 (memo_tags와 별도)';
