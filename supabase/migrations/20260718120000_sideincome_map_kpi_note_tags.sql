-- 시급상승 KPI 기록 — 태그 정의(KPI별 id) + 메모는 tag_id 로 묶음

create table if not exists public.sideincome_map_kpi_note_tags (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  kpi_id text not null,
  label text not null default '',
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

comment on table public.sideincome_map_kpi_note_tags is '시급상승 KPI별 기록 태그(고유 id·표시 이름)';

create index if not exists sideincome_map_kpi_note_tags_user_kpi_idx
  on public.sideincome_map_kpi_note_tags (user_id, kpi_id);

alter table public.sideincome_map_kpi_note_tags enable row level security;

drop policy if exists "sideincome_map_kpi_note_tags_select" on public.sideincome_map_kpi_note_tags;
create policy "sideincome_map_kpi_note_tags_select"
  on public.sideincome_map_kpi_note_tags for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "sideincome_map_kpi_note_tags_insert" on public.sideincome_map_kpi_note_tags;
create policy "sideincome_map_kpi_note_tags_insert"
  on public.sideincome_map_kpi_note_tags for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "sideincome_map_kpi_note_tags_update" on public.sideincome_map_kpi_note_tags;
create policy "sideincome_map_kpi_note_tags_update"
  on public.sideincome_map_kpi_note_tags for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "sideincome_map_kpi_note_tags_delete" on public.sideincome_map_kpi_note_tags;
create policy "sideincome_map_kpi_note_tags_delete"
  on public.sideincome_map_kpi_note_tags for delete to authenticated
  using (auth.uid() = user_id);

alter table public.sideincome_map_kpi_notes
  add column if not exists tag_id text;

comment on column public.sideincome_map_kpi_notes.tag_id is 'sideincome_map_kpi_note_tags.id — KPI별 태그로 메모 묶음';

create index if not exists sideincome_map_kpi_notes_user_kpi_tag_idx
  on public.sideincome_map_kpi_notes (user_id, kpi_id, tag_id);
