-- ============================================================
-- Supabase 웹 → SQL Editor → New query → 전체 복사 후 Run
-- (같은 프로젝트에 보통 한 번만 실행하면 됩니다.)
-- ============================================================

create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  subscription_status text not null default 'inactive'
    constraint user_subscriptions_status_check
      check (subscription_status in ('inactive', 'active')),
  signup_at timestamptz not null,
  access_until timestamptz not null,
  hourly_rate numeric(14, 2)
);

comment on table public.user_subscriptions is 'UID별 구독 상태; 가입 시 7일 trial';

create index if not exists user_subscriptions_email_lower_idx
  on public.user_subscriptions (lower(email));

alter table public.user_subscriptions enable row level security;

drop policy if exists "user_subscriptions_select_own" on public.user_subscriptions;
create policy "user_subscriptions_select_own"
  on public.user_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.user_subscriptions to authenticated;

create or replace function public.handle_new_user_subscription ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.user_subscriptions (user_id, email, subscription_status, signup_at, access_until)
  values (
    new.id,
    lower(trim(coalesce(new.email, ''))),
    'inactive',
    coalesce(new.created_at, now()),
    coalesce(new.created_at, now()) + interval '7 days'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row
  execute function public.handle_new_user_subscription ();

insert into public.user_subscriptions (user_id, email, subscription_status, signup_at, access_until)
select
  u.id,
  lower(trim(coalesce(u.email, ''))),
  'inactive',
  coalesce(u.created_at, now()),
  coalesce(u.created_at, now()) + interval '7 days'
from auth.users u
where not exists (
  select 1 from public.user_subscriptions s where s.user_id = u.id
);

-- 이미 예전 스크립트로 테이블만 만든 경우: 컬럼·RPC 추가
alter table public.user_subscriptions
  add column if not exists hourly_rate numeric(14, 2);

comment on column public.user_subscriptions.hourly_rate is '나의 시급(원)';

create or replace function public.set_my_hourly_rate (p_rate numeric)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.user_subscriptions
  set
    hourly_rate = case
      when p_rate is not null and p_rate > 0 then round(p_rate, 2)
      else null
    end
  where user_id = auth.uid();
end;
$$;

revoke all on function public.set_my_hourly_rate (numeric) from public;
grant execute on function public.set_my_hourly_rate (numeric) to authenticated;

alter table public.user_subscriptions
  add column if not exists appearance jsonb;

comment on column public.user_subscriptions.appearance is 'sectionColors, timeCategoryColors, taskCategoryColors';

create or replace function public.set_my_appearance (p_appearance jsonb)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.user_subscriptions
  set appearance = p_appearance
  where user_id = auth.uid();
end;
$$;

revoke all on function public.set_my_appearance (jsonb) from public;
grant execute on function public.set_my_appearance (jsonb) to authenticated;

-- 가계부 사용자 설정(분류·결제수단 추가분) — migrations/20260324130000_asset_expense_user_prefs.sql 과 동일
create table if not exists public.asset_user_expense_classifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expense_category text not null,
  label text not null,
  color text not null default 'expense-cls-teal',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_user_expense_classifications_user_cat_label unique (user_id, expense_category, label)
);
create index if not exists asset_user_expense_classifications_user_cat_idx
  on public.asset_user_expense_classifications (user_id, expense_category, sort_order);
create table if not exists public.asset_user_payment_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_user_payment_options_user_label unique (user_id, label)
);
create index if not exists asset_user_payment_options_user_sort_idx
  on public.asset_user_payment_options (user_id, sort_order);
alter table public.asset_user_expense_classifications enable row level security;
alter table public.asset_user_payment_options enable row level security;
drop policy if exists "asset_user_cls_select_own" on public.asset_user_expense_classifications;
create policy "asset_user_cls_select_own" on public.asset_user_expense_classifications for select to authenticated using (auth.uid() = user_id);
drop policy if exists "asset_user_cls_insert_own" on public.asset_user_expense_classifications;
create policy "asset_user_cls_insert_own" on public.asset_user_expense_classifications for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "asset_user_cls_update_own" on public.asset_user_expense_classifications;
create policy "asset_user_cls_update_own" on public.asset_user_expense_classifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "asset_user_cls_delete_own" on public.asset_user_expense_classifications;
create policy "asset_user_cls_delete_own" on public.asset_user_expense_classifications for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "asset_user_pay_select_own" on public.asset_user_payment_options;
create policy "asset_user_pay_select_own" on public.asset_user_payment_options for select to authenticated using (auth.uid() = user_id);
drop policy if exists "asset_user_pay_insert_own" on public.asset_user_payment_options;
create policy "asset_user_pay_insert_own" on public.asset_user_payment_options for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "asset_user_pay_update_own" on public.asset_user_payment_options;
create policy "asset_user_pay_update_own" on public.asset_user_payment_options for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "asset_user_pay_delete_own" on public.asset_user_payment_options;
create policy "asset_user_pay_delete_own" on public.asset_user_payment_options for delete to authenticated using (auth.uid() = user_id);

-- 가계부 거래 행 — migrations/20260325140000_asset_user_expense_transactions.sql 과 동일
create table if not exists public.asset_user_expense_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_date date not null,
  amount numeric(15, 2) not null
    constraint asset_user_expense_tx_amount_nonneg check (amount >= 0),
  flow_type text not null
    constraint asset_user_expense_tx_flow_check
      check (flow_type in ('입금', '지출')),
  expense_category text not null default '',
  classification text not null default '',
  name text not null default '',
  payment_label text not null default '',
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists asset_user_expense_tx_user_date_idx
  on public.asset_user_expense_transactions (user_id, transaction_date desc, created_at desc);
alter table public.asset_user_expense_transactions enable row level security;
drop policy if exists "asset_user_expense_tx_select_own" on public.asset_user_expense_transactions;
create policy "asset_user_expense_tx_select_own" on public.asset_user_expense_transactions for select to authenticated using (auth.uid() = user_id);
drop policy if exists "asset_user_expense_tx_insert_own" on public.asset_user_expense_transactions;
create policy "asset_user_expense_tx_insert_own" on public.asset_user_expense_transactions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "asset_user_expense_tx_update_own" on public.asset_user_expense_transactions;
create policy "asset_user_expense_tx_update_own" on public.asset_user_expense_transactions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "asset_user_expense_tx_delete_own" on public.asset_user_expense_transactions;
create policy "asset_user_expense_tx_delete_own" on public.asset_user_expense_transactions for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.asset_user_expense_transactions to authenticated;
create or replace function public.set_asset_user_expense_transactions_updated_at ()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists asset_user_expense_tx_set_updated_at on public.asset_user_expense_transactions;
create trigger asset_user_expense_tx_set_updated_at
  before update on public.asset_user_expense_transactions
  for each row
  execute function public.set_asset_user_expense_transactions_updated_at ();

-- 순자산 목표 — migrations/20260325160000_asset_user_net_worth_goal.sql 과 동일
create table if not exists public.asset_user_net_worth_goal (
  user_id uuid primary key references auth.users (id) on delete cascade,
  target_amount numeric(18, 2),
  updated_at timestamptz not null default now()
);
alter table public.asset_user_net_worth_goal enable row level security;
drop policy if exists "asset_user_nw_goal_select_own" on public.asset_user_net_worth_goal;
create policy "asset_user_nw_goal_select_own" on public.asset_user_net_worth_goal for select to authenticated using (auth.uid() = user_id);
drop policy if exists "asset_user_nw_goal_insert_own" on public.asset_user_net_worth_goal;
create policy "asset_user_nw_goal_insert_own" on public.asset_user_net_worth_goal for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "asset_user_nw_goal_update_own" on public.asset_user_net_worth_goal;
create policy "asset_user_nw_goal_update_own" on public.asset_user_net_worth_goal for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "asset_user_nw_goal_delete_own" on public.asset_user_net_worth_goal;
create policy "asset_user_nw_goal_delete_own" on public.asset_user_net_worth_goal for delete to authenticated using (auth.uid() = user_id);
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

-- 주식분류 사용자 추가 — migrations/20260326130000_asset_user_stock_category_options.sql 과 동일
create table if not exists public.asset_user_stock_category_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_user_stock_cat_user_label unique (user_id, label)
);
create index if not exists asset_user_stock_cat_user_sort_idx
  on public.asset_user_stock_category_options (user_id, sort_order);
alter table public.asset_user_stock_category_options enable row level security;
drop policy if exists "asset_user_stock_cat_select_own" on public.asset_user_stock_category_options;
create policy "asset_user_stock_cat_select_own" on public.asset_user_stock_category_options for select to authenticated using (auth.uid() = user_id);
drop policy if exists "asset_user_stock_cat_insert_own" on public.asset_user_stock_category_options;
create policy "asset_user_stock_cat_insert_own" on public.asset_user_stock_category_options for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "asset_user_stock_cat_update_own" on public.asset_user_stock_category_options;
create policy "asset_user_stock_cat_update_own" on public.asset_user_stock_category_options for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "asset_user_stock_cat_delete_own" on public.asset_user_stock_category_options;
create policy "asset_user_stock_cat_delete_own" on public.asset_user_stock_category_options for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.asset_user_stock_category_options to authenticated;
create or replace function public.set_asset_user_stock_category_options_updated_at ()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists asset_user_stock_cat_set_updated_at on public.asset_user_stock_category_options;
create trigger asset_user_stock_cat_set_updated_at
  before update on public.asset_user_stock_category_options
  for each row
  execute function public.set_asset_user_stock_category_options_updated_at ();
