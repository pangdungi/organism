-- 시급상승 KPI 상세 — 태그·메모 기록 (사용자 액션별 upsert/delete, bulk push 대상 아님)

create table if not exists public.sideincome_map_kpi_notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  kpi_id text not null,
  tags jsonb not null default '[]'::jsonb,
  memo text not null default '',
  updated_at timestamptz not null default now (),
  primary key (user_id, id)
);

comment on table public.sideincome_map_kpi_notes is '시급상승 KPI별 아이디어·메모(태그+본문); 모달 저장·삭제 시에만 서버 갱신';

create index if not exists sideincome_map_kpi_notes_user_kpi_idx
  on public.sideincome_map_kpi_notes (user_id, kpi_id);

alter table public.sideincome_map_kpi_notes enable row level security;

drop policy if exists "sideincome_map_kpi_notes_select" on public.sideincome_map_kpi_notes;
create policy "sideincome_map_kpi_notes_select"
  on public.sideincome_map_kpi_notes for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "sideincome_map_kpi_notes_insert" on public.sideincome_map_kpi_notes;
create policy "sideincome_map_kpi_notes_insert"
  on public.sideincome_map_kpi_notes for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "sideincome_map_kpi_notes_update" on public.sideincome_map_kpi_notes;
create policy "sideincome_map_kpi_notes_update"
  on public.sideincome_map_kpi_notes for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "sideincome_map_kpi_notes_delete" on public.sideincome_map_kpi_notes;
create policy "sideincome_map_kpi_notes_delete"
  on public.sideincome_map_kpi_notes for delete to authenticated
  using (auth.uid() = user_id);
