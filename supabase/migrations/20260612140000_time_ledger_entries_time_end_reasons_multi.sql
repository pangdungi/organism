-- 작업 종료 이유: 단일 text(time_end_reason) → 복수 jsonb(time_end_reasons)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'time_ledger_entries'
      and column_name = 'time_end_reason'
      and data_type = 'text'
  ) then
    alter table public.time_ledger_entries
      add column if not exists time_end_reasons jsonb not null default '[]'::jsonb;

    update public.time_ledger_entries
    set time_end_reasons = jsonb_build_array(time_end_reason)
    where time_end_reason is not null
      and btrim(time_end_reason) <> '';

    alter table public.time_ledger_entries drop column time_end_reason;
  elsif not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'time_ledger_entries'
      and column_name = 'time_end_reasons'
  ) then
    alter table public.time_ledger_entries
      add column if not exists time_end_reasons jsonb not null default '[]'::jsonb;
  end if;
end $$;

comment on column public.time_ledger_entries.time_end_reasons is
  '생산적 작업 시간기록 모달에서 별점 선택 후 고른 종료 이유 id 배열(hunger|sleepy|…, 미선택 [])';
