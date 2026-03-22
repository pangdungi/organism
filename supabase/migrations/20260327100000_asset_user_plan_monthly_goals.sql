-- 자산관리계획: 구역별(수입 / 투자·저축 / 소비) 분류·월 목표 금액

create table if not exists public.asset_user_plan_monthly_goals (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_section text not null
    constraint asset_user_plan_goals_section_check
      check (plan_section in ('income', 'invest_savings', 'expense')),
  category text not null,
  classification text not null,
  monthly_goal_amount numeric(18, 2) not null default 0,
  sort_order int not null default 0,
  updated_at timestamptz not null default now (),
  constraint asset_user_plan_goals_user_natural unique (user_id, plan_section, category, classification)
);

comment on table public.asset_user_plan_monthly_goals is '자산관리계획: 카테고리·분류별 월 목표 금액';

create index if not exists asset_user_plan_goals_user_section_idx
  on public.asset_user_plan_monthly_goals (user_id, plan_section, sort_order);

alter table public.asset_user_plan_monthly_goals enable row level security;

drop policy if exists "asset_user_plan_goals_select_own" on public.asset_user_plan_monthly_goals;
create policy "asset_user_plan_goals_select_own"
  on public.asset_user_plan_monthly_goals for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "asset_user_plan_goals_insert_own" on public.asset_user_plan_monthly_goals;
create policy "asset_user_plan_goals_insert_own"
  on public.asset_user_plan_monthly_goals for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "asset_user_plan_goals_update_own" on public.asset_user_plan_monthly_goals;
create policy "asset_user_plan_goals_update_own"
  on public.asset_user_plan_monthly_goals for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "asset_user_plan_goals_delete_own" on public.asset_user_plan_monthly_goals;
create policy "asset_user_plan_goals_delete_own"
  on public.asset_user_plan_monthly_goals for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.asset_user_plan_monthly_goals to authenticated;

create or replace function public.set_asset_user_plan_monthly_goals_updated_at ()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists asset_user_plan_goals_set_updated_at on public.asset_user_plan_monthly_goals;
create trigger asset_user_plan_goals_set_updated_at
  before update on public.asset_user_plan_monthly_goals
  for each row
  execute function public.set_asset_user_plan_monthly_goals_updated_at ();
