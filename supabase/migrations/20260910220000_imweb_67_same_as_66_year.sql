-- 67번 = 책 없는 1년 이용권. 66번(책 묶음 1년)과 동일하게 1년 부여·가입 허용.
-- 이미 회원이면 66·67 모두 남은 기간(또는 오늘) + 1년. 68 체험 후 66/67도 1년.

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
begin
  if p_user_id is null then
    raise exception 'invalid user id' using errcode = '22023';
  end if;

  if p_prod_no = public.lp_imweb_trial_prod_no() then
    return public.grant_trial_week_access_for_user(p_user_id, p_email);
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
        public.lp_imweb_renewal_prod_no(),
        public.lp_imweb_trial_prod_no()
      )
      and g.grant_applied_at is null
      and coalesce(lower(trim(g.grant_status)), 'pending') <> 'ignored'
  );
end;
$$;

comment on function public.lp_can_signup_with_email (text) is
  '아임웹 66·67(1년) 또는 68(체험) 미적용 주문이 있거나 관리자 이메일이면 가입 가능';

comment on function public.lp_imweb_renewal_prod_no () is
  '아임웹 책 없는 1년 이용권 상품 번호 (67). 부여 규칙은 66과 동일';

grant execute on function public.lp_can_signup_with_email (text) to anon, authenticated;

create or replace function public.process_imweb_order_webhook (p_payload jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, auth
as $$
declare
  v_order_no bigint;
  v_email text;
  v_site_code text;
  v_matched_prod bigint;
  v_prod_ok boolean := false;
  v_user_id uuid;
  v_until timestamptz;
  v_existing public.imweb_order_grants%rowtype;
begin
  v_order_no := nullif(trim(coalesce(p_payload ->> 'orderNo', '')), '')::bigint;
  v_email := lower(trim(coalesce(
    nullif(p_payload ->> 'ordererEmail', ''),
    nullif(p_payload ->> 'memberUid', ''),
    ''
  )));
  v_site_code := nullif(trim(coalesce(p_payload ->> 'siteCode', '')), '');

  if v_order_no is null or v_email = '' or v_email !~ '@' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_payload');
  end if;

  v_matched_prod := public.lp_imweb_extract_grant_prod_no(p_payload);
  v_prod_ok := v_matched_prod is not null;

  select g.*
  into v_existing
  from public.imweb_order_grants g
  where g.order_no = v_order_no;

  if found and v_existing.grant_applied_at is not null then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'order_no', v_order_no,
      'prod_no', v_existing.prod_no,
      'access_until', v_existing.access_until_after
    );
  end if;

  insert into public.imweb_order_grants (
    order_no,
    orderer_email,
    prod_no,
    site_code,
    raw_payload,
    grant_status,
    ignore_reason
  )
  values (
    v_order_no,
    v_email,
    coalesce(v_matched_prod, public.lp_imweb_target_prod_no()),
    v_site_code,
    p_payload,
    case when not v_prod_ok then 'ignored' else 'pending' end,
    case when not v_prod_ok then 'not_target_product' else null end
  )
  on conflict (order_no) do update
  set
    orderer_email = excluded.orderer_email,
    prod_no = excluded.prod_no,
    site_code = coalesce(excluded.site_code, public.imweb_order_grants.site_code),
    raw_payload = excluded.raw_payload,
    grant_status = excluded.grant_status,
    ignore_reason = excluded.ignore_reason
  where public.imweb_order_grants.grant_applied_at is null;

  if not v_prod_ok then
    return jsonb_build_object(
      'ok', true,
      'ignored', true,
      'reason', 'not_target_product',
      'order_no', v_order_no,
      'logged', true
    );
  end if;

  select u.id
  into v_user_id
  from auth.users u
  where lower(trim(coalesce(u.email, ''))) = v_email
  limit 1;

  if v_user_id is not null then
    begin
      v_until := public.grant_imweb_prod_for_user(
        v_user_id,
        v_email,
        v_matched_prod
      );
    exception
      when others then
        update public.imweb_order_grants g
        set
          grant_status = 'ignored',
          ignore_reason = 'renewal_not_eligible'
        where g.order_no = v_order_no;
        return jsonb_build_object(
          'ok', true,
          'ignored', true,
          'reason', 'renewal_not_eligible',
          'order_no', v_order_no,
          'prod_no', v_matched_prod
        );
    end;

    update public.imweb_order_grants g
    set
      grant_applied_at = now(),
      user_id = v_user_id,
      access_until_after = v_until,
      grant_status = 'applied',
      ignore_reason = null
    where g.order_no = v_order_no;

    return jsonb_build_object(
      'ok', true,
      'applied', true,
      'order_no', v_order_no,
      'prod_no', v_matched_prod,
      'user_id', v_user_id,
      'access_until', v_until
    );
  end if;

  update public.imweb_order_grants g
  set grant_status = 'pending'
  where g.order_no = v_order_no;

  return jsonb_build_object(
    'ok', true,
    'pending', true,
    'order_no', v_order_no,
    'prod_no', v_matched_prod,
    'email', v_email
  );
end;
$$;

revoke all on function public.process_imweb_order_webhook (jsonb) from public;
