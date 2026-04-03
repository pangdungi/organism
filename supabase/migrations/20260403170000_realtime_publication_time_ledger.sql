-- 시간가계부·일간 예산: Realtime postgres_changes 구독용 publication (KPI·할일과 동일 패턴)

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.time_ledger_entries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.time_ledger_tasks;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.time_daily_budget_days;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
