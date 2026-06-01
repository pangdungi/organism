-- 복합 FK (user_id, task_id) ON DELETE SET NULL 은 user_id 까지 null → 23502
-- 과제 삭제 전 트리거로 task_id 만 해제, FK 는 RESTRICT

alter table public.time_ledger_entries
  drop constraint if exists time_ledger_entries_task_fkey;

create or replace function public.nullify_time_ledger_entries_task_on_task_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.time_ledger_entries
  set task_id = null
  where user_id = old.user_id
    and task_id = old.id;
  return old;
end;
$$;

drop trigger if exists time_ledger_tasks_nullify_entries_on_delete on public.time_ledger_tasks;
create trigger time_ledger_tasks_nullify_entries_on_delete
  before delete on public.time_ledger_tasks
  for each row
  execute function public.nullify_time_ledger_entries_task_on_task_delete();

alter table public.time_ledger_entries
  add constraint time_ledger_entries_task_fkey
  foreign key (user_id, task_id)
  references public.time_ledger_tasks (user_id, id)
  on delete restrict;

comment on function public.nullify_time_ledger_entries_task_on_task_delete() is
  '과제 삭제 시 기록 행 task_id 만 해제 (task_name 유지). 복합 FK SET NULL 은 user_id NOT NULL 과 충돌.';
