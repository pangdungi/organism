-- 감정일기: Realtime postgres_changes 구독용 publication

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.diary_daily_entries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
