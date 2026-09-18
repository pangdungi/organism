-- 관리자: 아임웹(자사몰) 이용권 주문만 조회
create or replace function public.lp_admin_list_imweb_order_grants ()
  returns table (
    order_no bigint,
    orderer_email text,
    prod_no bigint,
    user_id uuid,
    grant_status text,
    grant_applied_at timestamptz,
    access_until_after timestamptz,
    created_at timestamptz
  )
  language plpgsql
  security definer
  set search_path = public, auth
as $func$
begin
  if not public.lp_is_app_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
    select
      g.order_no,
      g.orderer_email,
      g.prod_no,
      g.user_id,
      g.grant_status,
      g.grant_applied_at,
      g.access_until_after,
      g.created_at
    from public.imweb_order_grants g
    where public.lp_imweb_is_grant_eligible_prod(g.prod_no)
    order by g.created_at desc nulls last, g.order_no desc;
end;
$func$;

revoke all on function public.lp_admin_list_imweb_order_grants() from public;
grant execute on function public.lp_admin_list_imweb_order_grants() to authenticated;
