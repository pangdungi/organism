-- 매일 반복 할 일: 정렬용 extra (일반 kpi_todos 와 동일 패턴)

alter table public.happiness_map_kpi_daily_todos
  add column if not exists extra jsonb not null default '{}'::jsonb;

alter table public.health_map_kpi_daily_todos
  add column if not exists extra jsonb not null default '{}'::jsonb;

alter table public.dream_map_kpi_daily_todos
  add column if not exists extra jsonb not null default '{}'::jsonb;

alter table public.sideincome_map_kpi_daily_todos
  add column if not exists extra jsonb not null default '{}'::jsonb;
