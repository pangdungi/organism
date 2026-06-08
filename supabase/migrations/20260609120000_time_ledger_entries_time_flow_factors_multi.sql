-- 멀입 요소: 단일 text(time_flow_factor) → 복수 jsonb(time_flow_factors)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'time_ledger_entries'
      and column_name = 'time_flow_factor'
      and data_type = 'text'
  ) then
    alter table public.time_ledger_entries
      add column if not exists time_flow_factors jsonb not null default '[]'::jsonb;

    update public.time_ledger_entries
    set time_flow_factors = jsonb_build_array(time_flow_factor)
    where time_flow_factor is not null
      and btrim(time_flow_factor) <> '';

    alter table public.time_ledger_entries drop column time_flow_factor;
  elsif not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'time_ledger_entries'
      and column_name = 'time_flow_factors'
  ) then
    alter table public.time_ledger_entries
      add column if not exists time_flow_factors jsonb not null default '[]'::jsonb;
  end if;
end $$;

comment on column public.time_ledger_entries.time_flow_factors is
  '생산적 작업 시간기록 모달에서 5점 선택 후 고른 몰입 요소 id 배열(empty_stomach|caffeine|…, 미선택 [])';
