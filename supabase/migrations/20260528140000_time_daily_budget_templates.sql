-- 일간 타임블록(예상 일정) 사용자 템플릿 — 하루 일정 묶음 저장·다른 날짜에 적용

create table if not exists public.time_daily_budget_templates (
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid not null default gen_random_uuid(),
  name text not null default '',
  blocks jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (user_id, template_id)
);

comment on table public.time_daily_budget_templates is '예상 일정 템플릿: blocks=[{taskName,startHhMm,endHhMm,memo,detail}]';

create index if not exists time_daily_budget_templates_user_updated_idx
  on public.time_daily_budget_templates (user_id, updated_at desc);

alter table public.time_daily_budget_templates enable row level security;

drop policy if exists "time_daily_budget_templates_select_own" on public.time_daily_budget_templates;
create policy "time_daily_budget_templates_select_own"
  on public.time_daily_budget_templates for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "time_daily_budget_templates_insert_own" on public.time_daily_budget_templates;
create policy "time_daily_budget_templates_insert_own"
  on public.time_daily_budget_templates for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "time_daily_budget_templates_update_own" on public.time_daily_budget_templates;
create policy "time_daily_budget_templates_update_own"
  on public.time_daily_budget_templates for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "time_daily_budget_templates_delete_own" on public.time_daily_budget_templates;
create policy "time_daily_budget_templates_delete_own"
  on public.time_daily_budget_templates for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.time_daily_budget_templates to authenticated;

create or replace function public.set_time_daily_budget_templates_updated_at ()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists time_daily_budget_templates_updated_at on public.time_daily_budget_templates;
create trigger time_daily_budget_templates_updated_at
  before update on public.time_daily_budget_templates
  for each row
  execute function public.set_time_daily_budget_templates_updated_at();
