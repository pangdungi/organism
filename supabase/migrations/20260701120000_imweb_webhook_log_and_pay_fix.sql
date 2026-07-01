-- 아임웹 실주문: 수신 기록 항상 남김 + 결제 판정 완화(카드·totalPaymentPrice)

alter table public.imweb_order_grants
  add column if not exists grant_status text,
  add column if not exists ignore_reason text;

comment on column public.imweb_order_grants.grant_status is
  'applied | pending | ignored';
comment on column public.imweb_order_grants.ignore_reason is
  'ignored 일 때 사유(not_target_product 등)';

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
  v_prod_ok boolean := false;
  v_pay_ok boolean := false;
  v_user_id uuid;
  v_until timestamptz;
  v_target bigint := public.lp_imweb_target_prod_no();
  v_existing public.imweb_order_grants%rowtype;
  v_paid_price numeric;
  v_ignore text;
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

  select g.*
  into v_existing
  from public.imweb_order_grants g
  where g.order_no = v_order_no;

  if found and v_existing.grant_applied_at is not null then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'order_no', v_order_no,
      'access_until', v_existing.access_until_after
    );
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_payload -> 'sections', '[]'::jsonb)) sec,
      jsonb_array_elements(
        coalesce(sec -> 'sectionItems', sec -> 'orderSectionItems', '[]'::jsonb)
      ) item
    where coalesce(
      nullif(item -> 'productInfo' ->> 'prodNo', ''),
      nullif(item ->> 'prodNo', '')
    )::bigint = v_target
  )
  into v_prod_ok;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_payload -> 'payments', '[]'::jsonb)) pay
    where upper(coalesce(pay ->> 'paymentStatus', '')) = 'PAYMENT_COMPLETE'
  )
  into v_pay_ok;

  v_paid_price := nullif(trim(coalesce(p_payload ->> 'totalPaymentPrice', '')), '')::numeric;
  if not v_pay_ok and coalesce(v_paid_price, 0) > 0 then
    v_pay_ok := true;
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
    v_target,
    v_site_code,
    p_payload,
    case
      when not v_prod_ok or not v_pay_ok then 'ignored'
      else 'pending'
    end,
    case
      when not v_prod_ok then 'not_target_product'
      when not v_pay_ok then 'payment_not_complete'
      else null
    end
  )
  on conflict (order_no) do update
  set
    orderer_email = excluded.orderer_email,
    site_code = coalesce(excluded.site_code, public.imweb_order_grants.site_code),
    raw_payload = excluded.raw_payload,
    grant_status = excluded.grant_status,
    ignore_reason = excluded.ignore_reason
  where public.imweb_order_grants.grant_applied_at is null;

  if not v_prod_ok or not v_pay_ok then
    v_ignore := case
      when not v_prod_ok then 'not_target_product'
      else 'payment_not_complete'
    end;
    return jsonb_build_object(
      'ok', true,
      'ignored', true,
      'reason', v_ignore,
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
    v_until := public.grant_one_year_access_for_user(v_user_id, v_email);
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
    'email', v_email
  );
end;
$$;

revoke all on function public.process_imweb_order_webhook (jsonb) from public;

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
      and g.prod_no = public.lp_imweb_target_prod_no()
    order by g.created_at asc, g.order_no asc
    for update of g
  loop
    v_until := public.grant_one_year_access_for_user(v_user_id, v_email);
    update public.imweb_order_grants g
    set
      grant_applied_at = now(),
      user_id = v_user_id,
      access_until_after = v_until,
      grant_status = 'applied',
      ignore_reason = null
    where g.order_no = v_row.order_no;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.apply_pending_imweb_grants_for_email (text) from public;
