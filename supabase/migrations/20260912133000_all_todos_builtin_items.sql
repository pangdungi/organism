-- 전체 할일 — KPI가 아닌 시간기록 기본 과제의 할일 목록 (계정·서버 기준)

create table if not exists public.all_todos_builtin_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  list_key text not null,
  text text not null default '',
  completed boolean not null default false,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.all_todos_builtin_items is
  '전체 할일 기본 목록(근무하기·소비·외출·대화·독서노트·시간관리). KPI 아님';

create index if not exists all_todos_builtin_items_user_list_idx
  on public.all_todos_builtin_items (user_id, list_key);

alter table public.all_todos_builtin_items enable row level security;

drop policy if exists "all_todos_builtin_select" on public.all_todos_builtin_items;
create policy "all_todos_builtin_select" on public.all_todos_builtin_items
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "all_todos_builtin_insert" on public.all_todos_builtin_items;
create policy "all_todos_builtin_insert" on public.all_todos_builtin_items
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "all_todos_builtin_update" on public.all_todos_builtin_items;
create policy "all_todos_builtin_update" on public.all_todos_builtin_items
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "all_todos_builtin_delete" on public.all_todos_builtin_items;
create policy "all_todos_builtin_delete" on public.all_todos_builtin_items
  for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.all_todos_builtin_items to authenticated;
