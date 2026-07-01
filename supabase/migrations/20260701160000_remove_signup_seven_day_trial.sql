-- 가입 시 7일 체험 제거: 결제(아임웹) 없으면 이용 권한 없음(inactive, access_until = 가입 시각)
-- pending 아임웹 주문은 가입 직후 apply_pending_imweb_grants_for_email 로 1년 부여

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
    coalesce(new.created_at, now())
  );

  perform public.apply_pending_imweb_grants_for_email(lower(trim(coalesce(new.email, ''))));

  return new;
end;
$$;

comment on table public.user_subscriptions is
  'UID별 구독; inactive=이용권 없음, active=1년 이용권(아임웹·관리자 부여)';
