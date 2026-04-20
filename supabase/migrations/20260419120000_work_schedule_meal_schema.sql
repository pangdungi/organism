-- 근무·식단표 (2025 앱 모델 정렬)
-- Supabase SQL Editor에 통째로 붙여넣어 실행 가능 (여러 번 실행해도 안전).
--
-- 저장 구조:
--   work_schedule_settings   : 유저당 하루 근무시간
--   work_schedule_types      : 근무유형·식단 유형 목록 (name, 시간, sort_order, kind)
--   work_schedule_entries    : 날짜별 근무/식단 행 (work_type 문자열이 types.name과 대응)

-- ── 유형: kind (work | diet) ─────────────────────────────────────────
alter table public.work_schedule_types
  add column if not exists kind text not null default 'work';

update public.work_schedule_types
set kind = case
  when lower(trim(kind)) = 'diet' then 'diet'
  else 'work'
end
where kind is null or trim(kind) = '' or lower(trim(kind)) not in ('work', 'diet');

alter table public.work_schedule_types
  drop constraint if exists work_schedule_types_kind_check;

alter table public.work_schedule_types
  add constraint work_schedule_types_kind_check
  check (kind in ('work', 'diet'));

comment on table public.work_schedule_types is '근무·식단표: 유형(이름·시작·마감·정렬·근무/식단 구분)';
comment on column public.work_schedule_types.kind is 'work: 근무유형, diet: 식단유형';

create index if not exists work_schedule_types_user_kind_idx
  on public.work_schedule_types (user_id, kind);

-- ── 행·설정 (기존 정의 유지, 주석만) ─────────────────────────────────
comment on table public.work_schedule_entries is '근무·식단표: 날짜별 행(work_type은 work_schedule_types.name과 동일 이름)';
comment on table public.work_schedule_settings is '근무·식단표: 유저당 하루 근무시간(시간 단위)';
