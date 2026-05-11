-- 식단·메뉴 메모 (건강/비건강 식사·준비 과제용, 회고·표 열과 연동)

alter table public.time_ledger_entries
  add column if not exists meal_detail text not null default '';

comment on column public.time_ledger_entries.meal_detail is
  '건강·비건강 식사(및 준비) 기록 시 메뉴/식단 설명 (과제 메모와 별도)';
