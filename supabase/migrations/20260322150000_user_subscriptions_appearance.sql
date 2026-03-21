-- 리스트/시간가계부/작업 카테고리 색상 JSON (클라이언트 todo-settings와 동일 구조)

alter table public.user_subscriptions
  add column if not exists appearance jsonb;

comment on column public.user_subscriptions.appearance is 'sectionColors, timeCategoryColors, taskCategoryColors (json)';

create or replace function public.set_my_appearance (p_appearance jsonb)
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
  set appearance = p_appearance
  where user_id = auth.uid();
end;
$$;

revoke all on function public.set_my_appearance (jsonb) from public;
grant execute on function public.set_my_appearance (jsonb) to authenticated;
