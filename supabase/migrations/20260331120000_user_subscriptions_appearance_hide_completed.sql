-- appearance jsonb: 리스트/시간/작업 카테고리 색상 외 할일 '완료 항목 숨기기'(hideCompleted boolean) 포함

comment on column public.user_subscriptions.appearance is
  'sectionColors, timeCategoryColors, taskCategoryColors, hideCompleted (boolean, json)';
