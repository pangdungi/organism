-- 68번 = 체험권 (가입 허용 · 7일). 66 최초 1년 · 67 갱신은 그대로.

create or replace function public.lp_imweb_trial_prod_no ()
  returns bigint
  language sql
  immutable
  set search_path = public
as $$
  select 68::bigint;
$$;

comment on function public.lp_imweb_trial_prod_no () is
  '아임웹 체험권 상품 번호 (기본 68)';

create or replace function public.lp_imweb_is_grant_eligible_prod (p_prod_no bigint)
  returns boolean
  language sql
  immutable
  set search_path = public
as $$
  select p_prod_no in (
    public.lp_imweb_target_prod_no(),
    public.lp_imweb_renewal_prod_no(),
    public.lp_imweb_trial_prod_no()
  );
$$;

/** 체험권: inactive + 지금으로부터 7일. 이미 1년(active)이면 기한을 줄이지 않음. */
create or replace function public.grant_trial_week_access_for_user (
  p_user_id uuid,
  p_email text default null
)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = public, auth
as $$
declare
  v_status text;
  v_until timestamptz;
begin
  if p_user_id is null then
    raise exception 'invalid user id' using errcode = '22023';
  end if;

  select s.subscription_status, s.access_until
  into v_status, v_until
  from public.user_subscriptions s
  where s.user_id = p_user_id;

  if not found then
    raise exception 'user_subscriptions not found' using errcode = 'P0002';
  end if;

  if lower(trim(coalesce(v_status, ''))) = 'active' then
    return v_until;
  end if;

  v_until := now() + interval '7 days';

  update public.user_subscriptions s
  set
    subscription_status = 'inactive',
    access_until = v_until,
    email = lower(trim(coalesce(nullif(trim(p_email), ''), s.email)))
  where s.user_id = p_user_id;

  return v_until;
end;
$$;

revoke all on function public.grant_trial_week_access_for_user (uuid, text) from public;

create or replace function public.grant_imweb_prod_for_user (
  p_user_id uuid,
  p_email text,
  p_prod_no bigint
)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = public, auth
as $$
declare
  v_status text;
begin
  if p_user_id is null then
    raise exception 'invalid user id' using errcode = '22023';
  end if;

  if p_prod_no = public.lp_imweb_trial_prod_no() then
    return public.grant_trial_week_access_for_user(p_user_id, p_email);
  end if;

  if p_prod_no = public.lp_imweb_renewal_prod_no() then
    select s.subscription_status
    into v_status
    from public.user_subscriptions s
    where s.user_id = p_user_id;

    if not found or lower(trim(coalesce(v_status, ''))) <> 'active' then
      raise exception 'renewal_requires_active_subscription' using errcode = '22023';
    end if;
  end if;

  return public.grant_one_year_access_for_user(p_user_id, p_email);
end;
$$;

create or replace function public.lp_can_signup_with_email (p_email text)
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' or v_email !~ '@' then
    return false;
  end if;

  if v_email = lower(trim(public.lp_app_admin_email())) then
    return true;
  end if;

  return exists (
    select 1
    from public.imweb_order_grants g
    where lower(trim(g.orderer_email)) = v_email
      and g.prod_no in (
        public.lp_imweb_target_prod_no(),
        public.lp_imweb_trial_prod_no()
      )
      and g.grant_applied_at is null
      and coalesce(lower(trim(g.grant_status)), 'pending') <> 'ignored'
  );
end;
$$;

comment on function public.lp_can_signup_with_email (text) is
  '아임웹 66(1년) 또는 68(체험) 미적용 주문이 있거나 관리자 이메일이면 가입 가능';

grant execute on function public.lp_can_signup_with_email (text) to anon, authenticated;
