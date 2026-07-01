-- 67번 = 1년 갱신권 (기존 1년 이용권 active 회원만 +1년 연장)
-- 66번 = 최초 1년 이용권 (기존과 동일)

create or replace function public.lp_imweb_renewal_prod_no ()
  returns bigint
  language sql
  immutable
  set search_path = public
as $$
  select 67::bigint;
$$;

create or replace function public.lp_imweb_is_grant_eligible_prod (p_prod_no bigint)
  returns boolean
  language sql
  immutable
  set search_path = public
as $$
  select p_prod_no in (
    public.lp_imweb_target_prod_no(),
    public.lp_imweb_renewal_prod_no()
  );
$$;

/** 주문 payload 에서 66·67 중 매칭된 상품 번호 (없으면 null) */
create or replace function public.lp_imweb_extract_grant_prod_no (p_payload jsonb)
  returns bigint
  language plpgsql
  stable
  set search_path = public
as $$
declare
  v_prod bigint;
begin
  select coalesce(
    nullif(item -> 'productInfo' ->> 'prodNo', ''),
    nullif(item ->> 'prodNo', '')
  )::bigint
  into v_prod
  from jsonb_array_elements(coalesce(p_payload -> 'sections', '[]'::jsonb)) sec,
    jsonb_array_elements(
      coalesce(sec -> 'sectionItems', sec -> 'orderSectionItems', '[]'::jsonb)
    ) item
  where public.lp_imweb_is_grant_eligible_prod(
    coalesce(
      nullif(item -> 'productInfo' ->> 'prodNo', ''),
      nullif(item ->> 'prodNo', '')
    )::bigint
  )
  limit 1;

  return v_prod;
end;
$$;

/** 66·67 공통 — 갱신(67)은 subscription_status = active 일 때만 */
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

revoke all on function public.grant_imweb_prod_for_user (uuid, text, bigint) from public;

create or replace function public.apply_pending_imweb_grants_for_email (p_email text)
  returns integer
  language plpgsql
  security definer
  set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user_id uuid;
  v_row public.imweb_order_grants%rowtype;
  v_until timestamptz;
  v_count integer := 0;
begin
  if v_email = '' then
    return 0;
  end if;

  select u.id
  into v_user_id
  from auth.users u
  where lower(trim(coalesce(u.email, ''))) = v_email
  limit 1;

  if v_user_id is null then
    return 0;
  end if;

  for v_row in
    select g.*
    from public.imweb_order_grants g
    where lower(g.orderer_email) = v_email
      and g.grant_applied_at is null
      and coalesce(g.grant_status, 'pending') = 'pending'
      and public.lp_imweb_is_grant_eligible_prod(g.prod_no)
    order by g.created_at asc, g.order_no asc
    for update of g
  loop
    begin
      v_until := public.grant_imweb_prod_for_user(
        v_user_id,
        v_email,
        v_row.prod_no
      );
      update public.imweb_order_grants g
      set
        grant_applied_at = now(),
        user_id = v_user_id,
        access_until_after = v_until,
        grant_status = 'applied',
        ignore_reason = null
      where g.order_no = v_row.order_no;
      v_count := v_count + 1;
    exception
      when others then
        if sqlerrm like '%renewal_requires_active_subscription%' then
          update public.imweb_order_grants g
          set
            grant_status = 'ignored',
            ignore_reason = 'renewal_not_eligible'
          where g.order_no = v_row.order_no;
        else
          raise;
        end if;
    end;
  end loop;

  return v_count;
end;
$$;

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
  v_sub_status text;
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
    if v_matched_prod = public.lp_imweb_renewal_prod_no() then
      select s.subscription_status
      into v_sub_status
      from public.user_subscriptions s
      where s.user_id = v_user_id;

      if lower(trim(coalesce(v_sub_status, ''))) <> 'active' then
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
          'prod_no', v_matched_prod,
          'email', v_email
        );
      end if;
    end if;

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

comment on function public.lp_imweb_renewal_prod_no () is
  '아임웹 갱신권 상품 번호 (기본 67)';
