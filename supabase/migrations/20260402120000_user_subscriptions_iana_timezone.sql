-- 리마인더 푸시: 사용자 기기(브라우저) 타임존과 동일한 IANA 존으로 "지금 날짜·시각" 비교
alter table public.user_subscriptions
  add column if not exists iana_timezone text;

comment on column public.user_subscriptions.iana_timezone is
  '리마인더 매칭용 IANA 타임존(예: Asia/Seoul); 클라이언트 Intl에서 동기화';

create or replace function public.set_my_iana_timezone (p_tz text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_tz text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  v_tz := trim(coalesce(p_tz, ''));
  if length(v_tz) > 100 then
    v_tz := left(v_tz, 100);
  end if;
  if v_tz = '' then
    v_tz := null;
  end if;
  update public.user_subscriptions
  set iana_timezone = v_tz
  where user_id = auth.uid();
end;
$$;

revoke all on function public.set_my_iana_timezone (text) from public;
grant execute on function public.set_my_iana_timezone (text) to authenticated;
