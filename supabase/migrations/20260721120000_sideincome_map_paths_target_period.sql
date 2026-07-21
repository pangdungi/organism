-- 부수입 경로(시급 상승 목표): 목표 기간(시작·마감일) — path id별 저장

alter table public.sideincome_map_paths
  add column if not exists target_start_date text not null default '';

alter table public.sideincome_map_paths
  add column if not exists target_deadline text not null default '';

comment on column public.sideincome_map_paths.target_start_date is
  '목표 기간 시작일 YYYY-MM-DD (빈 문자열 허용)';

comment on column public.sideincome_map_paths.target_deadline is
  '목표 기간 마감일 YYYY-MM-DD (빈 문자열 허용)';
