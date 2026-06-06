-- ui_font_id: 온글잎 박다현·류뚱·Adultkid 추가. parkdahyun → bakdahyun

comment on column public.user_subscriptions.ui_font_id is
  '앱 화면 글꼴 id; system | kyobohandwriting | bakdahyun | ryuddung | adultkid';

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
  if v_id = 'parkdahyun' then
    v_id := 'bakdahyun';
  end if;
  if v_id in ('pakyongjun', 'leeseoyun') then
    v_id := 'kyobohandwriting';
  end if;
  if v_id not in (
    'system',
    'kyobohandwriting',
    'bakdahyun',
    'ryuddung',
    'adultkid'
  ) then
    v_id := 'kyobohandwriting';
  end if;
  update public.user_subscriptions
  set ui_font_id = v_id
  where user_id = auth.uid();
end;
$$;

update public.user_subscriptions
set ui_font_id = 'bakdahyun'
where ui_font_id = 'parkdahyun';

update public.user_subscriptions
set ui_font_id = 'kyobohandwriting'
where ui_font_id in ('pakyongjun', 'leeseoyun');
