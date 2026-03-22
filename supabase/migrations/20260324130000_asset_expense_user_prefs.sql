-- 가계부: 사용자가 추가한 소비/수입 분류(카테고리별) · 결제수단 — 기본 목록은 앱 코드, DB에는 사용자 추가분만

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

comment on table public.asset_user_expense_classifications is '가계부: 카테고리(고정비 등)별 사용자 추가 소비/수입 분류';

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

comment on table public.asset_user_payment_options is '가계부: 기본(신용카드·체크카드·현금) 외 사용자 추가 결제수단';

create index if not exists asset_user_payment_options_user_sort_idx
  on public.asset_user_payment_options (user_id, sort_order);

alter table public.asset_user_expense_classifications enable row level security;
alter table public.asset_user_payment_options enable row level security;

-- classifications
drop policy if exists "asset_user_cls_select_own" on public.asset_user_expense_classifications;
create policy "asset_user_cls_select_own"
  on public.asset_user_expense_classifications for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "asset_user_cls_insert_own" on public.asset_user_expense_classifications;
create policy "asset_user_cls_insert_own"
  on public.asset_user_expense_classifications for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "asset_user_cls_update_own" on public.asset_user_expense_classifications;
create policy "asset_user_cls_update_own"
  on public.asset_user_expense_classifications for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "asset_user_cls_delete_own" on public.asset_user_expense_classifications;
create policy "asset_user_cls_delete_own"
  on public.asset_user_expense_classifications for delete to authenticated
  using (auth.uid() = user_id);

-- payment options
drop policy if exists "asset_user_pay_select_own" on public.asset_user_payment_options;
create policy "asset_user_pay_select_own"
  on public.asset_user_payment_options for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "asset_user_pay_insert_own" on public.asset_user_payment_options;
create policy "asset_user_pay_insert_own"
  on public.asset_user_payment_options for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "asset_user_pay_update_own" on public.asset_user_payment_options;
create policy "asset_user_pay_update_own"
  on public.asset_user_payment_options for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "asset_user_pay_delete_own" on public.asset_user_payment_options;
create policy "asset_user_pay_delete_own"
  on public.asset_user_payment_options for delete to authenticated
  using (auth.uid() = user_id);
