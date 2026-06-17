-- 생산적 시간기록 1~2점 — 몰입 방해요소(복수)
alter table public.time_ledger_entries
  add column if not exists time_flow_disruptors jsonb not null default '[]'::jsonb;

comment on column public.time_ledger_entries.time_flow_disruptors is
  '생산적 과제 1~2점 시 선택한 몰입 방해요소 id 배열';
