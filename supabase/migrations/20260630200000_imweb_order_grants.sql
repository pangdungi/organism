-- 아임웹 결제 웹훅 → 1년 이용권 자동 부여 (prodNo 66)

create table if not exists public.imweb_order_grants (
  order_no bigint primary key,
  orderer_email text not null,
  prod_no bigint not null default 66,
  site_code text,
  event_type text,
  user_id uuid references auth.users (id) on delete set null,
  grant_applied_at timestamptz,
  access_until_after timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists imweb_order_grants_email_pending_idx
  on public.imweb_order_grants (lower(orderer_email))
  where grant_applied_at is null;

comment on table public.imweb_order_grants is
  '아임웹 주문 웹훅 기록; order_no 중복 방지, 미가입 시 grant_applied_at null 로 대기';

alter table public.imweb_order_grants enable row level security;

revoke all on table public.imweb_order_grants from public;
revoke all on table public.imweb_order_grants from anon;
revoke all on table public.imweb_order_grants from authenticated;

create or replace function public.lp_imweb_target_prod_no ()
  returns bigint
  language sql
  immutable
as $$
  select 66::bigint;
$$;

/** access_until = max(현재 만료, 지금) + 1년, active */
create or replace function public.grant_one_year_access_for_user (
  p_user_id uuid,
  p_email text default null
)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = public, auth
as $$
declare
  v_base timestamptz;
  v_until timestamptz;
begin
  if p_user_id is null then
    raise exception 'invalid user id' using errcode = '22023';
  end if;

  select s.access_until
  into v_base
  from public.user_subscriptions s
  where s.user_id = p_user_id;

  if not found then
    raise exception 'user_subscriptions not found' using errcode = 'P0002';
  end if;

  v_until := greatest(coalesce(v_base, now()), now()) + interval '1 year';

  update public.user_subscriptions s
  set
    subscription_status = 'active',
    access_until = v_until,
    email = lower(trim(coalesce(nullif(trim(p_email), ''), s.email)))
  where s.user_id = p_user_id;

  return v_until;
end;
$$;

revoke all on function public.grant_one_year_access_for_user (uuid, text) from public;

/** 가입·웹훅 공통 — 해당 이메일의 미적용 아임웹 주문을 순서대로 1년씩 연장 */
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
      and g.prod_no = public.lp_imweb_target_prod_no()
    order by g.created_at asc, g.order_no asc
    for update of g
  loop
    v_until := public.grant_one_year_access_for_user(v_user_id, v_email);
    update public.imweb_order_grants g
    set
      grant_applied_at = now(),
      user_id = v_user_id,
      access_until_after = v_until
    where g.order_no = v_row.order_no;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.apply_pending_imweb_grants_for_email (text) from public;

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

  if not v_prod_ok or not v_pay_ok then
    return jsonb_build_object(
      'ok', true,
      'ignored', true,
      'reason', case
        when not v_prod_ok then 'not_target_product'
        else 'payment_not_complete'
      end,
      'order_no', v_order_no
    );
  end if;

  insert into public.imweb_order_grants (
    order_no,
    orderer_email,
    prod_no,
    site_code,
    raw_payload
  )
  values (
    v_order_no,
    v_email,
    v_target,
    v_site_code,
    p_payload
  )
  on conflict (order_no) do update
  set
    orderer_email = excluded.orderer_email,
    site_code = coalesce(excluded.site_code, public.imweb_order_grants.site_code),
    raw_payload = excluded.raw_payload
  where public.imweb_order_grants.grant_applied_at is null;

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
      access_until_after = v_until
    where g.order_no = v_order_no;
    return jsonb_build_object(
      'ok', true,
      'applied', true,
      'order_no', v_order_no,
      'user_id', v_user_id,
      'access_until', v_until
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'pending', true,
    'order_no', v_order_no,
    'email', v_email
  );
end;
$$;

revoke all on function public.process_imweb_order_webhook (jsonb) from public;

create or replace function public.handle_new_user_subscription ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, auth
as $$
begin
  insert into public.user_subscriptions (
    user_id,
    email,
    subscription_status,
    signup_at,
    access_until
  )
  values (
    new.id,
    lower(trim(coalesce(new.email, ''))),
    'inactive',
    coalesce(new.created_at, now()),
    coalesce(new.created_at, now()) + interval '7 days'
  );

  perform public.apply_pending_imweb_grants_for_email(lower(trim(coalesce(new.email, ''))));

  return new;
end;
$$;
