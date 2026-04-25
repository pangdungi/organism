-- 관리자(앱 기본 관리자 이메일)만 user_subscriptions 전체 열람·수정 RPC.
-- adminAccess.js 의 DEFAULT_APP_ADMIN_EMAIL 과 동기화(변경 시 둘 다 수정).
-- VITE_APP_ADMIN_EMAIL 은 UI 메뉴용이며, 서버 측 권한은 이 마이그레이션의 이메일·함수에 의존합니다.

-- 단일 기준(비밀번호/개인정보 아님 — 공개 앱이면 누구나 코드에서 볼 수 있음)
create or replace function public.lp_app_admin_email ()
  returns text
  language sql
  immutable
  parallel safe
as $func$
  select 'dbsgpwls416@gmail.com'::text;
$func$;

create or replace function public.lp_is_app_admin ()
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = public, auth
as $func$
begin
  return lower(trim(coalesce((auth.jwt() ->> 'email')::text, '')))
    = lower(trim(public.lp_app_admin_email()));
end;
$func$;

comment on function public.lp_is_app_admin is 'JWT 이메일이 앱 기본 관리자와 같으면 true(클라이언트 isAppAdminUser 와 DB 권한 일치 권장)';

create or replace function public.lp_admin_list_subscriptions ()
  returns setof public.user_subscriptions
  language plpgsql
  security definer
  set search_path = public, auth
as $func$
begin
  if not public.lp_is_app_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
    select s.*
    from public.user_subscriptions s
    order by lower(s.email) asc nulls last, s.user_id;
end;
$func$;

create or replace function public.lp_admin_grant_one_year (p_user_id uuid)
  returns public.user_subscriptions
  language plpgsql
  security definer
  set search_path = public, auth
as $func$
declare
  r public.user_subscriptions%rowtype;
begin
  if not public.lp_is_app_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'invalid user id' using errcode = '22023';
  end if;

  update public.user_subscriptions s
  set
    subscription_status = 'active',
    access_until = s.signup_at + interval '1 year'
  where s.user_id = p_user_id
  returning s.* into strict r;
  return r;
exception
  when no_data_found then
    raise exception 'user_subscriptions not found' using errcode = 'P0002';
end;
$func$;

create or replace function public.lp_admin_set_subscription (
  p_user_id uuid,
  p_subscription_status text,
  p_access_until timestamptz
)
  returns public.user_subscriptions
  language plpgsql
  security definer
  set search_path = public, auth
as $func$
declare
  st text;
  r public.user_subscriptions%rowtype;
begin
  if not public.lp_is_app_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_user_id is null or p_access_until is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  st := lower(trim(coalesce(p_subscription_status, '')));
  if st not in ('active', 'inactive') then
    raise exception 'invalid subscription status' using errcode = '22023';
  end if;

  update public.user_subscriptions s
  set
    subscription_status = st,
    access_until = p_access_until
  where s.user_id = p_user_id
  returning s.* into strict r;
  return r;
exception
  when no_data_found then
    raise exception 'user_subscriptions not found' using errcode = 'P0002';
end;
$func$;

revoke all on function public.lp_app_admin_email() from public;
revoke all on function public.lp_is_app_admin() from public;
revoke all on function public.lp_admin_list_subscriptions() from public;
revoke all on function public.lp_admin_grant_one_year(uuid) from public;
revoke all on function public.lp_admin_set_subscription(uuid, text, timestamptz) from public;

grant execute on function public.lp_app_admin_email() to service_role;
grant execute on function public.lp_is_app_admin() to authenticated;
grant execute on function public.lp_admin_list_subscriptions() to authenticated;
grant execute on function public.lp_admin_grant_one_year(uuid) to authenticated;
grant execute on function public.lp_admin_set_subscription(uuid, text, timestamptz) to authenticated;
