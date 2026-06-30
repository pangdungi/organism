-- calendar_section_tasks — 기간 pull(미완료·완료 구간) 조회 가속
create index if not exists calendar_section_tasks_user_done_idx
  on public.calendar_section_tasks (user_id, done);

create index if not exists calendar_section_tasks_user_due_date_idx
  on public.calendar_section_tasks (user_id, due_date);

create index if not exists calendar_section_tasks_user_start_due_idx
  on public.calendar_section_tasks (user_id, start_date, due_date);
