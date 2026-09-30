-- 캘린더 날짜 직접 추가 스탬프 사진 (사용자 폴더 / 날짜당 1장)
-- Supabase SQL Editor에 통째로 실행.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'calendar-day-stamps',
  'calendar-day-stamps',
  false,
  1048576,
  array['image/webp', 'image/png']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "calendar_day_stamps_select_own" on storage.objects;
create policy "calendar_day_stamps_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'calendar-day-stamps'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "calendar_day_stamps_insert_own" on storage.objects;
create policy "calendar_day_stamps_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'calendar-day-stamps'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "calendar_day_stamps_update_own" on storage.objects;
create policy "calendar_day_stamps_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'calendar-day-stamps'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'calendar-day-stamps'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "calendar_day_stamps_delete_own" on storage.objects;
create policy "calendar_day_stamps_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'calendar-day-stamps'
    and split_part(name, '/', 1) = auth.uid()::text
  );
