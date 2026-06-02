-- 시간기록 모달 «이 시간 평가» 1~5점 (미선택=null)
alter table public.time_ledger_entries
  add column if not exists time_rating smallint;

alter table public.time_ledger_entries
  drop constraint if exists time_ledger_entries_time_rating_check;

alter table public.time_ledger_entries
  add constraint time_ledger_entries_time_rating_check
  check (time_rating is null or (time_rating >= 1 and time_rating <= 5));

comment on column public.time_ledger_entries.time_rating is
  '시간기록 모달에서 사용자가 매긴 1~5점 평가(미선택 null)';
