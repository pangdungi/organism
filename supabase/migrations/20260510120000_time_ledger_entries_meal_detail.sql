-- 건강하지 않은 식사 등 식단 한 줄(또는 목록 문자열)을 메모와 분리 저장

alter table public.time_ledger_entries
  add column if not exists meal_detail text not null default '';

comment on column public.time_ledger_entries.meal_detail is
  '시간기록 식단(건강하지 않은 식사 등): 메모(memo)와 별도 저장. 구버전은 memo의 [식단] 접두 한 줄을 이 열로 옮김.';

-- 기존 행: memo가 "[식단] …" 로 시작하면 meal_detail·memo 분리
update public.time_ledger_entries e
set
  meal_detail = case
    when strpos(e.memo, E'\n') > 0
    then trim(both from substr(e.memo, length('[식단] ') + 1, strpos(e.memo, E'\n') - length('[식단] ') - 1))
    else trim(both from substr(e.memo, length('[식단] ') + 1))
  end,
  memo = case
    when strpos(e.memo, E'\n') > 0
    then trim(both from substr(e.memo, strpos(e.memo, E'\n') + 1))
    else ''
  end
where e.memo like '[식단] %'
  and coalesce(trim(e.meal_detail), '') = '';
