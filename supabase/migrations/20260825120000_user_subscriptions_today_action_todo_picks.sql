-- 오늘의 행동에서 고른 오늘 할 일 — 기기 로컬이 아니라 계정(서버)에 둠

alter table public.user_subscriptions
  add column if not exists today_action_todo_picks jsonb;

comment on column public.user_subscriptions.today_action_todo_picks is
  '{ ymd: YYYY-MM-DD, picks: { [kpiId]: todoId[] } } — 그날 고른 할일';

create or replace function public.set_my_today_action_todo_picks (p_picks jsonb)
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
  set today_action_todo_picks = p_picks
  where user_id = auth.uid();
end;
$$;

revoke all on function public.set_my_today_action_todo_picks (jsonb) from public;
grant execute on function public.set_my_today_action_todo_picks (jsonb) to authenticated;
