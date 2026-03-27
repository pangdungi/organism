-- 감정일기: 사용자별 최근 수정 순 페이지 pull용 (updated_at desc, id desc)
create index if not exists diary_daily_entries_user_updated_id_idx
  on public.diary_daily_entries (user_id, updated_at desc, id desc);
