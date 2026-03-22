-- 순자산 탭: 목표 순자산(원). 행 없음 = 클라우드 미동기화(로컬 유지). target_amount null = 사용자가 비움.

create table if not exists public.asset_user_net_worth_goal (
  user_id uuid primary key references auth.users (id) on delete cascade,
  target_amount numeric(18, 2),
  updated_at timestamptz not null default now()
);

comment on table public.asset_user_net_worth_goal is '자산 순자산: 목표 순자산 금액(원)';

alter table public.asset_user_net_worth_goal enable row level security;

drop policy if exists "asset_user_nw_goal_select_own" on public.asset_user_net_worth_goal;
create policy "asset_user_nw_goal_select_own"
  on public.asset_user_net_worth_goal for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "asset_user_nw_goal_insert_own" on public.asset_user_net_worth_goal;
create policy "asset_user_nw_goal_insert_own"
  on public.asset_user_net_worth_goal for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "asset_user_nw_goal_update_own" on public.asset_user_net_worth_goal;
create policy "asset_user_nw_goal_update_own"
  on public.asset_user_net_worth_goal for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "asset_user_nw_goal_delete_own" on public.asset_user_net_worth_goal;
create policy "asset_user_nw_goal_delete_own"
  on public.asset_user_net_worth_goal for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.asset_user_net_worth_goal to authenticated;

create or replace function public.set_asset_user_net_worth_goal_updated_at ()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists asset_user_nw_goal_set_updated_at on public.asset_user_net_worth_goal;

create trigger asset_user_nw_goal_set_updated_at
  before update on public.asset_user_net_worth_goal
  for each row
  execute function public.set_asset_user_net_worth_goal_updated_at ();
