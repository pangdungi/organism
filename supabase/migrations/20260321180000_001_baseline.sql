-- Baseline: 로컬 `supabase db reset` 시 마이그레이션 적용 여부 확인용.
-- 다음 마이그레이션에서 실제 앱 테이블을 하나씩 추가하면 됩니다.

create table if not exists public._migration_local_ok (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

comment on table public._migration_local_ok is 'Local migration smoke test; drop in a later migration if undesired.';

alter table public._migration_local_ok enable row level security;
