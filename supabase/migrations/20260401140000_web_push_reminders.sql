-- Web Push 구독(기기별) + 리마인더 발송 중복 방지 로그
-- Edge Function(send-reminder-pushes)이 service role로만 reminder_push_log에 쓰기

create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

comment on table public.user_push_subscriptions is '할일 리마인더 Web Push 구독(브라우저 PushSubscription)';

create index if not exists user_push_subscriptions_user_id_idx
  on public.user_push_subscriptions (user_id);

alter table public.user_push_subscriptions enable row level security;

drop policy if exists "user_push_subscriptions_select_own" on public.user_push_subscriptions;
create policy "user_push_subscriptions_select_own"
  on public.user_push_subscriptions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_push_subscriptions_insert_own" on public.user_push_subscriptions;
create policy "user_push_subscriptions_insert_own"
  on public.user_push_subscriptions for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_push_subscriptions_update_own" on public.user_push_subscriptions;
create policy "user_push_subscriptions_update_own"
  on public.user_push_subscriptions for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_push_subscriptions_delete_own" on public.user_push_subscriptions;
create policy "user_push_subscriptions_delete_own"
  on public.user_push_subscriptions for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_push_subscriptions to authenticated;

create or replace function public.set_user_push_subscriptions_updated_at ()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_push_subscriptions_updated_at on public.user_push_subscriptions;
create trigger user_push_subscriptions_updated_at
  before update on public.user_push_subscriptions
  for each row
  execute function public.set_user_push_subscriptions_updated_at();

-- 동일 할일·동일 슬롯(분)에 푸시 1회만 (Asia/Seoul 기준 slot_key)
create table if not exists public.reminder_push_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.calendar_section_tasks (id) on delete cascade,
  slot_key text not null,
  created_at timestamptz not null default now(),
  unique (task_id, slot_key)
);

comment on table public.reminder_push_log is '리마인더 Web Push 발송 기록(중복 방지); Edge Function 전용';

create index if not exists reminder_push_log_user_created_idx
  on public.reminder_push_log (user_id, created_at desc);

alter table public.reminder_push_log enable row level security;
-- authenticated 정책 없음 → 일반 사용자는 접근 불가; Edge Function은 service_role로 RLS 우회
