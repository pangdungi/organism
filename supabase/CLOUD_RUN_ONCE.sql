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
  access_until timestamptz not null
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
