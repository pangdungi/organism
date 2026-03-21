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
