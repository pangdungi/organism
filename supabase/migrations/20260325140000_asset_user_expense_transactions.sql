-- 가계부 거래 행: 자산관리·향후 시간가계부 등 동일 스키마로 CRUD

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

comment on table public.asset_user_expense_transactions is '가계부: 거래일·금액·입출·분류·결제수단 등 (카테고리 스냅샷 포함)';

create index if not exists asset_user_expense_tx_user_date_idx
  on public.asset_user_expense_transactions (user_id, transaction_date desc, created_at desc);

alter table public.asset_user_expense_transactions enable row level security;

drop policy if exists "asset_user_expense_tx_select_own" on public.asset_user_expense_transactions;
create policy "asset_user_expense_tx_select_own"
  on public.asset_user_expense_transactions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "asset_user_expense_tx_insert_own" on public.asset_user_expense_transactions;
create policy "asset_user_expense_tx_insert_own"
  on public.asset_user_expense_transactions for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "asset_user_expense_tx_update_own" on public.asset_user_expense_transactions;
create policy "asset_user_expense_tx_update_own"
  on public.asset_user_expense_transactions for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "asset_user_expense_tx_delete_own" on public.asset_user_expense_transactions;
create policy "asset_user_expense_tx_delete_own"
  on public.asset_user_expense_transactions for delete to authenticated
  using (auth.uid() = user_id);

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
