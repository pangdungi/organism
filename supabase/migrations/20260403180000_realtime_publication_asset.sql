-- 자산관리: Realtime postgres_changes 구독용 publication (시간가계부·KPI와 동일 패턴)

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.asset_user_expense_transactions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.asset_user_expense_classifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.asset_user_payment_options;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.asset_user_net_worth_bundle;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.asset_user_net_worth_goal;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.asset_user_plan_monthly_goals;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.asset_user_stock_category_options;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
