-- 행복·건강·부수입 KPI 맵: 삭제 id 목록(다중 기기 병합용)
alter table public.happiness_map_meta
  add column if not exists deleted_refs jsonb not null default '{}'::jsonb;

alter table public.health_map_meta
  add column if not exists deleted_refs jsonb not null default '{}'::jsonb;

alter table public.sideincome_map_meta
  add column if not exists deleted_refs jsonb not null default '{}'::jsonb;
