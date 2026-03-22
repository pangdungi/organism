-- 할일/일정: 고정 5섹션(todo-section-tasks) + 사용자 정의 섹션(todo-custom-section-tasks) 할 일 행
-- KPI 맵(꿈/부수입 등 JSON)은 포함하지 않음

create table if not exists public.calendar_section_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  section_key text not null,
  is_custom_section boolean not null default false,
  sort_order int not null default 0,
  name text not null default '',
  start_date date null,
  due_date date null,
  start_time text not null default '',
  end_time text not null default '',
  reminder_date date null,
  reminder_time text not null default '',
  eisenhower text not null default '',
  done boolean not null default false,
  item_type text not null default 'todo',
  updated_at timestamptz not null default now()
);

comment on table public.calendar_section_tasks is '할일/일정 리스트별 할 일(브레인덤프·5고정·커스텀); KPI 태스크 제외';

create index if not exists calendar_section_tasks_user_section_idx
  on public.calendar_section_tasks (user_id, is_custom_section, section_key, sort_order);

alter table public.calendar_section_tasks enable row level security;

drop policy if exists "calendar_section_tasks_select_own" on public.calendar_section_tasks;
create policy "calendar_section_tasks_select_own"
  on public.calendar_section_tasks for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "calendar_section_tasks_insert_own" on public.calendar_section_tasks;
create policy "calendar_section_tasks_insert_own"
  on public.calendar_section_tasks for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "calendar_section_tasks_update_own" on public.calendar_section_tasks;
create policy "calendar_section_tasks_update_own"
  on public.calendar_section_tasks for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "calendar_section_tasks_delete_own" on public.calendar_section_tasks;
create policy "calendar_section_tasks_delete_own"
  on public.calendar_section_tasks for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.calendar_section_tasks to authenticated;

create or replace function public.set_calendar_section_tasks_updated_at ()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists calendar_section_tasks_updated_at on public.calendar_section_tasks;
create trigger calendar_section_tasks_updated_at
  before update on public.calendar_section_tasks
  for each row
  execute function public.set_calendar_section_tasks_updated_at();
