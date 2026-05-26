-- Web Push / 할일 리마인더 기능 제거 (미사용)

drop trigger if exists user_push_subscriptions_updated_at on public.user_push_subscriptions;

drop function if exists public.set_user_push_subscriptions_updated_at ();

drop table if exists public.reminder_push_log;

drop table if exists public.user_push_subscriptions;
