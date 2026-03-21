-- 사용자 시급(원): 구독 테이블에 두고, RPC로만 수정 (구독 필드는 클라이언트에서 못 바꿈)

alter table public.user_subscriptions
  add column if not exists hourly_rate numeric(14, 2);

comment on column public.user_subscriptions.hourly_rate is '나의 시급(원); 계산기로 확정한 값';

create or replace function public.set_my_hourly_rate (p_rate numeric)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.user_subscriptions
  set
    hourly_rate = case
      when p_rate is not null and p_rate > 0 then round(p_rate, 2)
      else null
    end
  where user_id = auth.uid();
end;
$$;

revoke all on function public.set_my_hourly_rate (numeric) from public;
grant execute on function public.set_my_hourly_rate (numeric) to authenticated;
