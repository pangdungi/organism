-- 앱 전역 UI 글꼴 id (system | leeseoyun | pakyongjun)

alter table public.user_subscriptions
  add column if not exists ui_font_id text;

comment on column public.user_subscriptions.ui_font_id is
  '앱 화면 글꼴 id; system | leeseoyun | pakyongjun';

create or replace function public.set_my_ui_font_id (p_font_id text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  v_id := lower(trim(coalesce(p_font_id, '')));
  if v_id not in ('system', 'leeseoyun', 'pakyongjun') then
    v_id := 'system';
  end if;
  update public.user_subscriptions
  set ui_font_id = v_id
  where user_id = auth.uid();
end;
$$;

revoke all on function public.set_my_ui_font_id (text) from public;
grant execute on function public.set_my_ui_font_id (text) to authenticated;
