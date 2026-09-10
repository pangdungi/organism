-- 가입 시: 이미 계정이 있으면 로그인으로 안내할 수 있게 조회

create or replace function public.lp_email_is_existing_member (p_email text)
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

  return exists (
    select 1
    from auth.users u
    where lower(trim(coalesce(u.email, ''))) = v_email
  );
end;
$$;

comment on function public.lp_email_is_existing_member (text) is
  '해당 이메일로 이미 가입된 계정이 있으면 true. 가입 화면 안내용.';

revoke all on function public.lp_email_is_existing_member (text) from public;
grant execute on function public.lp_email_is_existing_member (text) to anon, authenticated;

-- 이전에 만든 active 전용 조회도 같은 의미로 맞춤 (이미 실행한 경우 대비)
create or replace function public.lp_email_is_active_subscriber (p_email text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, auth
as $$
  select public.lp_email_is_existing_member(p_email);
$$;
