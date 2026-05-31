-- 캘린더 월간 뷰: 날짜별 장식 아이콘(과제 설정 picker 아이콘과 동일 key)

create table if not exists public.calendar_day_icons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day_date date not null,
  icon_key text not null default '',
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.calendar_day_icons is '캘린더 월간 뷰 날짜별 아이콘(할일과 별도)';

create index if not exists calendar_day_icons_user_day_idx
  on public.calendar_day_icons (user_id, day_date, sort_order);

create unique index if not exists calendar_day_icons_user_day_unique
  on public.calendar_day_icons (user_id, day_date);

alter table public.calendar_day_icons enable row level security;

drop policy if exists "calendar_day_icons_select_own" on public.calendar_day_icons;
create policy "calendar_day_icons_select_own"
  on public.calendar_day_icons for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "calendar_day_icons_insert_own" on public.calendar_day_icons;
create policy "calendar_day_icons_insert_own"
  on public.calendar_day_icons for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "calendar_day_icons_update_own" on public.calendar_day_icons;
create policy "calendar_day_icons_update_own"
  on public.calendar_day_icons for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "calendar_day_icons_delete_own" on public.calendar_day_icons;
create policy "calendar_day_icons_delete_own"
  on public.calendar_day_icons for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.calendar_day_icons to authenticated;

create or replace function public.set_calendar_day_icons_updated_at ()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists calendar_day_icons_updated_at on public.calendar_day_icons;
create trigger calendar_day_icons_updated_at
  before update on public.calendar_day_icons
  for each row
  execute function public.set_calendar_day_icons_updated_at();
