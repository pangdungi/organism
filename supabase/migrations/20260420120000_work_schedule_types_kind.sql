-- 근무-식단표: 유형에 work | diet 구분
alter table public.work_schedule_types
  add column if not exists kind text not null default 'work';

comment on column public.work_schedule_types.kind is 'work: 근무유형, diet: 식단유형';
