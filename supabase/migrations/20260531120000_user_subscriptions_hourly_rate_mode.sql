-- 나의 시급 입력 방식: calc(계산) | direct(직접입력)

alter table public.user_subscriptions
  add column if not exists hourly_rate_mode text;

comment on column public.user_subscriptions.hourly_rate_mode is '시급 입력 방식: calc | direct';

alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_hourly_rate_mode_check;

alter table public.user_subscriptions
  add constraint user_subscriptions_hourly_rate_mode_check
  check (hourly_rate_mode is null or hourly_rate_mode in ('calc', 'direct'));

drop function if exists public.set_my_hourly_rate (numeric);

create or replace function public.set_my_hourly_rate (
  p_rate numeric default null,
  p_mode text default null
)
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
      when p_rate is not null and p_rate <= 0 then null
      else hourly_rate
    end,
    hourly_rate_mode = case
      when p_mode in ('calc', 'direct') then p_mode
      else hourly_rate_mode
    end
  where user_id = auth.uid();
end;
$$;

revoke all on function public.set_my_hourly_rate (numeric, text) from public;
grant execute on function public.set_my_hourly_rate (numeric, text) to authenticated;
