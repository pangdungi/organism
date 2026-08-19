-- 회원가입: 아임웹 최초 이용권(66) 미적용 주문이 있는 이메일만 허용
-- (갱신 67은 기존 회원용 · 관리자 이메일은 예외)

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
      and g.prod_no = public.lp_imweb_target_prod_no()
      and g.grant_applied_at is null
      and coalesce(lower(trim(g.grant_status)), 'pending') <> 'ignored'
  );
end;
$$;

comment on function public.lp_can_signup_with_email (text) is
  '아임웹 66번 미적용 주문이 있거나 관리자 이메일이면 가입 가능';

revoke all on function public.lp_can_signup_with_email (text) from public;
grant execute on function public.lp_can_signup_with_email (text) to anon, authenticated;

create or replace function public.lp_enforce_imweb_signup_email ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, auth
as $$
begin
  if public.lp_can_signup_with_email(coalesce(new.email, '')) then
    return new;
  end if;
  raise exception 'signup_email_not_purchased'
    using errcode = 'P0001',
      message = '구매한 이메일로만 가입할 수 있어요.';
end;
$$;

drop trigger if exists on_auth_user_before_insert_require_imweb on auth.users;
create trigger on_auth_user_before_insert_require_imweb
  before insert on auth.users
  for each row
  execute function public.lp_enforce_imweb_signup_email ();
