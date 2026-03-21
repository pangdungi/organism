-- 구독(이용기한): 상위 식별자 = auth.users.id → user_id
-- inactive: 가입 시 trial, access_until = signup + 7일 (UI에서는 기간 미표시, "작업중")
-- active: 관리자가 Supabase에서 수동 전환 시 signup_at 기준 +365일로 access_until 설정, UI에 1년 구간 표시

create table public.user_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  subscription_status text not null default 'inactive'
    constraint user_subscriptions_status_check
      check (subscription_status in ('inactive', 'active')),
  signup_at timestamptz not null,
  access_until timestamptz not null
);

comment on table public.user_subscriptions is 'UID별 구독 상태; 가입 시 7일 trial, active 시 가입일 기준 365일 이용권';

create index user_subscriptions_email_lower_idx on public.user_subscriptions (lower(email));

alter table public.user_subscriptions enable row level security;

create policy "user_subscriptions_select_own"
  on public.user_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.user_subscriptions to authenticated;

-- 가입 시 자동 행 생성: inactive, 종료일 = 가입 시각 + 7일
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

-- 이미 있는 Auth 사용자 백필 (트리거 이전 가입자)
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

-- 운영자 수동 구독 처리 예시 (대시보드 → SQL):
-- update public.user_subscriptions
-- set subscription_status = 'active',
--     access_until = signup_at + interval '365 days'
-- where user_id = '…' or lower(email) = 'buyer@example.com';
