-- 20260601130000 실행 중 stamp_types_pkey 에서 멈춘 경우 — ⑤⑥만 이어서 실행
-- (앞 ①~④는 이미 적용됐다고 가정)

alter table public.stamp_calendar_entries
  drop constraint if exists stamp_calendar_entries_stamp_id_fkey;

alter table public.stamp_calendar_entries
  drop constraint if exists stamp_calendar_entries_stamp_fkey;

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

alter table public.work_schedule_types
  drop constraint if exists work_schedule_types_pkey;

alter table public.work_schedule_types
  add constraint work_schedule_types_pkey primary key (user_id, id);

alter table public.work_schedule_entries
  drop constraint if exists work_schedule_entries_pkey;

alter table public.work_schedule_entries
  add constraint work_schedule_entries_pkey primary key (user_id, id);
