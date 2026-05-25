-- 시간가계부 과제별 사용자 지정 아이콘 (png slug 또는 svg:파일명)
alter table public.time_ledger_tasks
  add column if not exists icon_key text not null default '';

comment on column public.time_ledger_tasks.icon_key is
  '과제 설정 아이콘 key: PNG slug(work) 또는 svg:wind 등; 빈 문자열이면 과제명·카테고리 기본 아이콘';
