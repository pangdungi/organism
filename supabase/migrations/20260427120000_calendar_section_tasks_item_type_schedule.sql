-- item_type: 기본 'todo' = 할 일(완료·완료 일괄 제거), 'schedule' = 일정(동그라미 표시, 완료 일괄 DELETE 제외)
comment on column public.calendar_section_tasks.item_type is
  'todo | schedule — schedule 행은 완료 체크 UI 없음, deleteCompleted 시 서버에서 제외';
