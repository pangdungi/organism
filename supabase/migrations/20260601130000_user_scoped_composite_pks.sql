-- 사용자별 행 분리: id 단독 PK → (user_id, id)
-- Supabase SQL Editor: 이 파일만 실행해도 됨 (tasks PK 포함)

-- ① time_ledger_tasks 복합 PK (FK 대상 — 반드시 먼저)
alter table public.time_ledger_entries
  drop constraint if exists time_ledger_entries_task_id_fkey;

alter table public.time_ledger_entries
  drop constraint if exists time_ledger_entries_task_fkey;

alter table public.time_ledger_tasks
  drop constraint if exists time_ledger_tasks_pkey;

alter table public.time_ledger_tasks
  add constraint time_ledger_tasks_pkey primary key (user_id, id);

-- ② time_ledger_entries
alter table public.time_ledger_entries
  drop constraint if exists time_ledger_entries_pkey;

alter table public.time_ledger_entries
  add constraint time_ledger_entries_pkey primary key (user_id, id);

-- 과제 행이 없는 task_id 참조 정리 (옛 id 충돌·삭제된 과제 — task_name 은 유지)
update public.time_ledger_entries e
set task_id = null
where e.task_id is not null
  and not exists (
    select 1
    from public.time_ledger_tasks t
    where t.user_id = e.user_id
      and t.id = e.task_id
  );

alter table public.time_ledger_entries
  add constraint time_ledger_entries_task_fkey
  foreign key (user_id, task_id)
  references public.time_ledger_tasks (user_id, id)
  on delete set null;

-- ③ calendar_section_tasks
alter table public.calendar_section_tasks
  drop constraint if exists calendar_section_tasks_pkey;

alter table public.calendar_section_tasks
  add constraint calendar_section_tasks_pkey primary key (user_id, id);

-- ④ diary_daily_entries
alter table public.diary_daily_entries
  drop constraint if exists diary_daily_entries_pkey;

alter table public.diary_daily_entries
  add constraint diary_daily_entries_pkey primary key (user_id, id);

-- ⑤ stamp_types → stamp_calendar_entries
alter table public.stamp_calendar_entries
  drop constraint if exists stamp_calendar_entries_stamp_id_fkey;

alter table public.stamp_types
  drop constraint if exists stamp_types_pkey;

alter table public.stamp_types
  add constraint stamp_types_pkey primary key (user_id, id);

alter table public.stamp_calendar_entries
  drop constraint if exists stamp_calendar_entries_pkey;

alter table public.stamp_calendar_entries
  add constraint stamp_calendar_entries_pkey primary key (user_id, id);

delete from public.stamp_calendar_entries e
where not exists (
  select 1
  from public.stamp_types t
  where t.user_id = e.user_id
    and t.id = e.stamp_id
);

alter table public.stamp_calendar_entries
  add constraint stamp_calendar_entries_stamp_fkey
  foreign key (user_id, stamp_id)
  references public.stamp_types (user_id, id)
  on delete restrict;

-- ⑥ work_schedule (레거시)
alter table public.work_schedule_types
  drop constraint if exists work_schedule_types_pkey;

alter table public.work_schedule_types
  add constraint work_schedule_types_pkey primary key (user_id, id);

alter table public.work_schedule_entries
  drop constraint if exists work_schedule_entries_pkey;

alter table public.work_schedule_entries
  add constraint work_schedule_entries_pkey primary key (user_id, id);
