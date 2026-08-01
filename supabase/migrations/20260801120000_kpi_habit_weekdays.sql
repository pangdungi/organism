-- 매일하기 KPI — 하는 요일 (월=0 … 일=6, jsonb 배열). 비어 있으면 앱에서 월~일 전부로 취급.
alter table public.dream_map_kpis
  add column if not exists habit_weekdays jsonb not null default '[0,1,2,3,4,5,6]'::jsonb;

alter table public.happiness_map_kpis
  add column if not exists habit_weekdays jsonb not null default '[0,1,2,3,4,5,6]'::jsonb;

alter table public.health_map_kpis
  add column if not exists habit_weekdays jsonb not null default '[0,1,2,3,4,5,6]'::jsonb;

alter table public.sideincome_map_kpis
  add column if not exists habit_weekdays jsonb not null default '[0,1,2,3,4,5,6]'::jsonb;

comment on column public.dream_map_kpis.habit_weekdays is
  '매일하기 하는 요일 월=0…일=6 jsonb 배열';
comment on column public.happiness_map_kpis.habit_weekdays is
  '매일하기 하는 요일 월=0…일=6 jsonb 배열';
comment on column public.health_map_kpis.habit_weekdays is
  '매일하기 하는 요일 월=0…일=6 jsonb 배열';
comment on column public.sideincome_map_kpis.habit_weekdays is
  '매일하기 하는 요일 월=0…일=6 jsonb 배열';
