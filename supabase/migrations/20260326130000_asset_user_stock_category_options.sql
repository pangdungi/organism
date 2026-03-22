-- 주식분류: 기본 6종은 앱 코드, DB에는 사용자 추가분만 (가계부 결제수단과 동일 패턴)

create table if not exists public.asset_user_stock_category_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_user_stock_cat_user_label unique (user_id, label)
);

comment on table public.asset_user_stock_category_options is '순자산 주식: 사용자 추가 주식분류 라벨';

create index if not exists asset_user_stock_cat_user_sort_idx
  on public.asset_user_stock_category_options (user_id, sort_order);

alter table public.asset_user_stock_category_options enable row level security;

drop policy if exists "asset_user_stock_cat_select_own" on public.asset_user_stock_category_options;
create policy "asset_user_stock_cat_select_own"
  on public.asset_user_stock_category_options for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "asset_user_stock_cat_insert_own" on public.asset_user_stock_category_options;
create policy "asset_user_stock_cat_insert_own"
  on public.asset_user_stock_category_options for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "asset_user_stock_cat_update_own" on public.asset_user_stock_category_options;
create policy "asset_user_stock_cat_update_own"
  on public.asset_user_stock_category_options for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "asset_user_stock_cat_delete_own" on public.asset_user_stock_category_options;
create policy "asset_user_stock_cat_delete_own"
  on public.asset_user_stock_category_options for delete to authenticated
  using (auth.uid() = user_id);

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
