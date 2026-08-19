-- 캘린더 할일/일정 — 모바일에서 기본 숨길 「캘린더일기」 표시

alter table public.calendar_section_tasks
  add column if not exists is_calendar_diary boolean not null default false;

comment on column public.calendar_section_tasks.is_calendar_diary is
  'true면 모바일 캘린더에서 기본 숨김(일기 보기 토글로 표시)';
