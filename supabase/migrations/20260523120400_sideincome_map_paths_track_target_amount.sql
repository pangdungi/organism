-- 부수입 경로: 목표 금액 추적 옵션 (체크 시에만 금액 카드·로그 표시)

alter table public.sideincome_map_paths
  add column if not exists track_target_amount boolean not null default false;

update public.sideincome_map_paths
  set track_target_amount = true
  where trim(coalesce(target_amount, '')) <> ''
     or trim(coalesce(unit, '')) <> '';

comment on column public.sideincome_map_paths.track_target_amount is
  'true면 목표 부수입(원) 입력·상단 금액 카드·로그 표시';
