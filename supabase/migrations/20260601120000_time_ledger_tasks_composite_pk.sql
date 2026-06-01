-- time_ledger_tasks: PK (user_id, id) — 기본 과제도 사용자별 행
-- ※ time_ledger_entries FK·PK는 20260601130000 에서 처리 (tasks PK 선행 필요)

alter table public.time_ledger_entries
  drop constraint if exists time_ledger_entries_task_id_fkey;

alter table public.time_ledger_entries
  drop constraint if exists time_ledger_entries_task_fkey;

alter table public.time_ledger_tasks
  drop constraint if exists time_ledger_tasks_pkey;

alter table public.time_ledger_tasks
  add constraint time_ledger_tasks_pkey primary key (user_id, id);

comment on table public.time_ledger_tasks is
  '시간가계부 과제 설정: (user_id, id) 복합 PK — 기본 과제 id는 앱에서 결정적이나 사용자별 행';
