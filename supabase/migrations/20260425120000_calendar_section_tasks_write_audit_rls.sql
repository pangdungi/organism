-- calendar_section_tasks_write_audit: RLS 활성화
-- 이전: RLS 비활성 → authenticated 에게 SELECT 가 열려 있으면 다른 사용자 감사 행까지 읽을 수 있음.
-- 이후: 본인 할일 소유자(task_user_id = auth.uid())인 감사 행만 SELECT.
-- 감사 INSERT 는 log_calendar_section_tasks_write_audit (SECURITY DEFINER) 트리거가 수행.

alter table public.calendar_section_tasks_write_audit enable row level security;

drop policy if exists "calendar_section_tasks_write_audit_select_own"
  on public.calendar_section_tasks_write_audit;
create policy "calendar_section_tasks_write_audit_select_own"
  on public.calendar_section_tasks_write_audit
  for select
  to authenticated
  using (
    task_user_id is not null
    and auth.uid() = task_user_id
  );

comment on table public.calendar_section_tasks_write_audit is
  'calendar_section_tasks 변경 감사(디버그). RLS: 본인 task_user_id 행만 조회.';
