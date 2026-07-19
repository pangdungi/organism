-- KPI 기록 — 메모당 태그 여러 개(tag_ids)

alter table public.sideincome_map_kpi_notes
  add column if not exists tag_ids jsonb not null default '[]'::jsonb;

comment on column public.sideincome_map_kpi_notes.tag_ids is 'sideincome_map_kpi_note_tags.id 배열 — 한 메모에 연결된 태그';

update public.sideincome_map_kpi_notes
set tag_ids = jsonb_build_array(tag_id)
where coalesce(tag_id, '') <> ''
  and (tag_ids is null or tag_ids = '[]'::jsonb);
