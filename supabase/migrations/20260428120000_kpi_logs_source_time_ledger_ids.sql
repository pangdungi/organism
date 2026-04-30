-- KPI 로그: 출처(직접 입력 / 시간가계부) · 시간기록 행 id 목록(삭제 시 연동 제거용)

alter table public.dream_map_kpi_logs
  add column if not exists kpi_log_source text not null default 'manual',
  add column if not exists time_ledger_entry_ids jsonb not null default '[]'::jsonb;

alter table public.health_map_kpi_logs
  add column if not exists kpi_log_source text not null default 'manual',
  add column if not exists time_ledger_entry_ids jsonb not null default '[]'::jsonb;

alter table public.happiness_map_kpi_logs
  add column if not exists kpi_log_source text not null default 'manual',
  add column if not exists time_ledger_entry_ids jsonb not null default '[]'::jsonb;

alter table public.sideincome_map_kpi_logs
  add column if not exists kpi_log_source text not null default 'manual',
  add column if not exists time_ledger_entry_ids jsonb not null default '[]'::jsonb;

comment on column public.dream_map_kpi_logs.kpi_log_source is 'manual | time_ledger';
comment on column public.dream_map_kpi_logs.time_ledger_entry_ids is '연동된 time_ledger_entries.id(uuid) 문자열 배열';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dream_map_kpi_logs_source_check'
  ) then
    alter table public.dream_map_kpi_logs
      add constraint dream_map_kpi_logs_source_check
      check (kpi_log_source in ('manual', 'time_ledger'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'health_map_kpi_logs_source_check') then
    alter table public.health_map_kpi_logs
      add constraint health_map_kpi_logs_source_check
      check (kpi_log_source in ('manual', 'time_ledger'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'happiness_map_kpi_logs_source_check') then
    alter table public.happiness_map_kpi_logs
      add constraint happiness_map_kpi_logs_source_check
      check (kpi_log_source in ('manual', 'time_ledger'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sideincome_map_kpi_logs_source_check') then
    alter table public.sideincome_map_kpi_logs
      add constraint sideincome_map_kpi_logs_source_check
      check (kpi_log_source in ('manual', 'time_ledger'));
  end if;
end $$;
