-- ui_font_id: 어비 찌바체, 그리운 옥수니·묘은또박체

update public.user_subscriptions
set ui_font_id = 'mitmi'
where ui_font_id in ('uhbeerice', 'fromsol');

comment on column public.user_subscriptions.ui_font_id is
  '앱 UI 글꼴 id; mitmi | gongbujahana | myeoneunheulrim | leeseoyun | uhbeezziba | oksooni | myoeunddobak (+ legacy ids)';

create or replace function public.set_my_ui_font_id (p_font_id text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id text;
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_id := lower(trim(coalesce(p_font_id, '')));
  if v_id = 'parkdahyun' then
    v_id := 'bakdahyun';
  end if;
  if v_id = 'pakyongjun' then
    v_id := 'kyobohandwriting';
  end if;
  if v_id in ('ryuryu', 'cocochoitoon', 'mongtori', 'cherryspoon', 'uhbeerice', 'fromsol') then
    v_id := 'mitmi';
  end if;
  if v_id not in (
    'system',
    'kyobohandwriting',
    'bakdahyun',
    'ryuddung',
    'adultkid',
    'leeseoyun',
    'gongbujahana',
    'myeoneunheulrim',
    'mitmi',
    'uhbeezziba',
    'oksooni',
    'myoeunddobak'
  ) then
    v_id := 'mitmi';
  end if;

  update public.user_subscriptions
  set ui_font_id = v_id
  where user_id = v_uid;

  if not found then
    insert into public.user_subscriptions (
      user_id,
      email,
      subscription_status,
      signup_at,
      access_until,
      ui_font_id
    )
    select
      u.id,
      lower(trim(coalesce(u.email, ''))),
      'inactive',
      coalesce(u.created_at, now()),
      coalesce(u.created_at, now()) + interval '7 days',
      v_id
    from auth.users u
    where u.id = v_uid;
  end if;
end;
$$;

revoke all on function public.set_my_ui_font_id (text) from public;
grant execute on function public.set_my_ui_font_id (text) to authenticated;
