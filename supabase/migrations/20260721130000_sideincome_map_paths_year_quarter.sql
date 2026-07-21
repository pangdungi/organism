-- 부수입 경로(시급 상승 목표): 연도·분기 — path id별, 목록을 분기별로 배열

alter table public.sideincome_map_paths
  add column if not exists target_year int not null default 0;

alter table public.sideincome_map_paths
  add column if not exists target_quarter int not null default 0;

comment on column public.sideincome_map_paths.target_year is
  '목표 연도 (예: 2026). 0이면 미지정';

comment on column public.sideincome_map_paths.target_quarter is
  '목표 분기 1~4. 0이면 미지정';
