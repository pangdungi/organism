-- 순자산 탭: 대출·예적금·부동산·주식·보험·연금 행 JSON (로컬 키와 동일 구조)

create table if not exists public.asset_user_net_worth_bundle (
  user_id uuid primary key references auth.users (id) on delete cascade,
  debt_rows jsonb not null default '[]'::jsonb,
  deposit_savings_rows jsonb not null default '[]'::jsonb,
  real_estate_rows jsonb not null default '[]'::jsonb,
  stock_rows jsonb not null default '[]'::jsonb,
  insurance_rows jsonb not null default '[]'::jsonb,
  annuity_rows jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now ()
);

comment on table public.asset_user_net_worth_bundle is '순자산: 대출·예적금·부동산·주식·보험·연금 테이블 행 배열(JSON)';

alter table public.asset_user_net_worth_bundle enable row level security;

drop policy if exists "asset_user_nw_bundle_select_own" on public.asset_user_net_worth_bundle;
create policy "asset_user_nw_bundle_select_own"
  on public.asset_user_net_worth_bundle for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "asset_user_nw_bundle_insert_own" on public.asset_user_net_worth_bundle;
create policy "asset_user_nw_bundle_insert_own"
  on public.asset_user_net_worth_bundle for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "asset_user_nw_bundle_update_own" on public.asset_user_net_worth_bundle;
create policy "asset_user_nw_bundle_update_own"
  on public.asset_user_net_worth_bundle for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "asset_user_nw_bundle_delete_own" on public.asset_user_net_worth_bundle;
create policy "asset_user_nw_bundle_delete_own"
  on public.asset_user_net_worth_bundle for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.asset_user_net_worth_bundle to authenticated;

create or replace function public.set_asset_user_net_worth_bundle_updated_at ()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists asset_user_nw_bundle_set_updated_at on public.asset_user_net_worth_bundle;
create trigger asset_user_nw_bundle_set_updated_at
  before update on public.asset_user_net_worth_bundle
  for each row
  execute function public.set_asset_user_net_worth_bundle_updated_at ();
