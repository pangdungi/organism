-- map_kpis(생꿈·건강·행복·부수입) 행과 시간가계부 과제(time_ledger_tasks) 자동 동기화
-- 앱은 pull 시 time_ledger_tasks 만 보면 KPI 과제명·분류가 서버와 일치함.

-- (user_id, kpi_id) 당 연동 과제 1행 (kpi_id 비어 있지 않을 때)
with keepers as (
  select distinct on (t.user_id, t.kpi_id) t.ctid
  from public.time_ledger_tasks t
  where t.kpi_id is not null
    and t.kpi_id <> ''
  order by t.user_id, t.kpi_id, t.updated_at desc nulls last, t.created_at desc nulls last
)
delete from public.time_ledger_tasks d
where d.kpi_id is not null
  and d.kpi_id <> ''
  and not exists (select 1 from keepers k where k.ctid = d.ctid);

create unique index if not exists time_ledger_tasks_user_kpi_id_uidx
  on public.time_ledger_tasks (user_id, kpi_id)
  where kpi_id is not null
    and kpi_id <> '';

comment on index public.time_ledger_tasks_user_kpi_id_uidx is
  'KPI 연동 과제: 사용자당 kpi_id 하나에 time_ledger_tasks 한 행 (트리거 upsert용)';

create or replace function public.tg_map_kpi_row_to_time_ledger_task()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  ledger_cat text;
  next_sort int;
begin
  if tg_op = 'DELETE' then
    delete from public.time_ledger_tasks t
    where t.user_id = old.user_id
      and t.kpi_id = old.id
      and t.kpi_id <> '';
    return old;
  end if;

  if tg_table_name = 'health_map_kpis' then
    ledger_cat := 'health';
  elsif tg_table_name = 'dream_map_kpis' then
    ledger_cat := 'dream';
  elsif tg_table_name = 'happiness_map_kpis' then
    ledger_cat := 'happiness';
  elsif tg_table_name = 'sideincome_map_kpis' then
    ledger_cat := 'sideincome';
  else
    raise exception 'tg_map_kpi_row_to_time_ledger_task: unknown table %', tg_table_name;
  end if;

  select coalesce(max(sort_order), -1) + 1
  into next_sort
  from public.time_ledger_tasks t
  where t.user_id = new.user_id;

  insert into public.time_ledger_tasks (
    id,
    user_id,
    name,
    productivity,
    category,
    memo,
    sort_order,
    is_system,
    kpi_id
  )
  values (
    gen_random_uuid(),
    new.user_id,
    new.name,
    'productive',
    ledger_cat,
    '',
    next_sort,
    false,
    new.id
  )
  on conflict (user_id, kpi_id) where (kpi_id <> '') do update
  set
    name = excluded.name,
    category = excluded.category,
    productivity = excluded.productivity,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.tg_map_kpi_row_to_time_ledger_task() from public;
grant execute on function public.tg_map_kpi_row_to_time_ledger_task() to authenticated;
grant execute on function public.tg_map_kpi_row_to_time_ledger_task() to service_role;

-- 기존 KPI → 과제 행 채움 (트리거 생성 전). 사용자별 sort_order 는 기존 max 뒤에 이어 붙임.
insert into public.time_ledger_tasks (
  id, user_id, name, productivity, category, memo, sort_order, is_system, kpi_id
)
select
  gen_random_uuid(),
  u.user_id,
  u.name,
  'productive',
  u.ledger_cat,
  '',
  m.base_max + u.g_rn,
  false,
  u.kpi_id
from (
  select
    s.user_id,
    s.kpi_id,
    s.name,
    s.ledger_cat,
    row_number() over (
      partition by s.user_id
      order by s.ledger_cat, s.updated_at nulls last, s.kpi_id
    ) as g_rn
  from (
    select k.user_id, k.id as kpi_id, k.name, k.updated_at, 'health'::text as ledger_cat
    from public.health_map_kpis k
    union all
    select k.user_id, k.id, k.name, k.updated_at, 'dream'::text
    from public.dream_map_kpis k
    union all
    select k.user_id, k.id, k.name, k.updated_at, 'happiness'::text
    from public.happiness_map_kpis k
    union all
    select k.user_id, k.id, k.name, k.updated_at, 'sideincome'::text
    from public.sideincome_map_kpis k
  ) s
) u
cross join lateral (
  select coalesce(max(t.sort_order), -1) as base_max
  from public.time_ledger_tasks t
  where t.user_id = u.user_id
) m
on conflict (user_id, kpi_id) where (kpi_id <> '') do update
set
  name = excluded.name,
  category = excluded.category,
  productivity = excluded.productivity,
  updated_at = now();

drop trigger if exists trg_health_map_kpis_to_time_ledger on public.health_map_kpis;
create trigger trg_health_map_kpis_to_time_ledger
  after insert or update or delete on public.health_map_kpis
  for each row execute function public.tg_map_kpi_row_to_time_ledger_task();

drop trigger if exists trg_dream_map_kpis_to_time_ledger on public.dream_map_kpis;
create trigger trg_dream_map_kpis_to_time_ledger
  after insert or update or delete on public.dream_map_kpis
  for each row execute function public.tg_map_kpi_row_to_time_ledger_task();

drop trigger if exists trg_happiness_map_kpis_to_time_ledger on public.happiness_map_kpis;
create trigger trg_happiness_map_kpis_to_time_ledger
  after insert or update or delete on public.happiness_map_kpis
  for each row execute function public.tg_map_kpi_row_to_time_ledger_task();

drop trigger if exists trg_sideincome_map_kpis_to_time_ledger on public.sideincome_map_kpis;
create trigger trg_sideincome_map_kpis_to_time_ledger
  after insert or update or delete on public.sideincome_map_kpis
  for each row execute function public.tg_map_kpi_row_to_time_ledger_task();
