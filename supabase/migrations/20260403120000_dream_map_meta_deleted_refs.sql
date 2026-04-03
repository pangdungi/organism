-- 꿈 KPI: 기기에서 삭제한 id 목록(서버 병합 시 제외용, 멀티디바이스 삭제 반영)
alter table public.dream_map_meta
  add column if not exists deleted_refs jsonb not null default '{}'::jsonb;

comment on column public.dream_map_meta.deleted_refs is '삭제된 dream/kpi/로그 등 id (동기화 병합·고아 삭제 시 사용)';
