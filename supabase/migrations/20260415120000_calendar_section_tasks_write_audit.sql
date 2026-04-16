-- calendar_section_tasks 에 누가 INSERT/UPDATE/DELETE 했는지 추적 (디버그용)
-- 해석: jwt_user 가 있으면 보통 앱에서 로그인 사용자 JWT 로 온 요청.
--       jwt_user 가 null 이면 Supabase SQL Editor(postgres)·service_role·내부 작업 등 가능성.
-- 앱 배포 후: supabase db push / 대시보드 SQL 로 적용 → Table Editor 에서 이 테이블 조회.

create table if not exists public.calendar_section_tasks_write_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  task_id uuid not null,
  task_user_id uuid,
  jwt_user uuid,
  db_user text,
  client_addr text
);

comment on table public.calendar_section_tasks_write_audit is
  'calendar_section_tasks 변경 감사(디버그). jwt_user: 로그인 사용자; null: 대시보드 SQL·service_role 등';

create index if not exists calendar_section_tasks_write_audit_at_idx
  on public.calendar_section_tasks_write_audit (at desc);

create index if not exists calendar_section_tasks_write_audit_task_id_idx
  on public.calendar_section_tasks_write_audit (task_id);

-- 감사 테이블은 RLS 끔 + 일반 클라이언트는 SELECT 만 (INSERT 는 트리거 전용)
alter table public.calendar_section_tasks_write_audit disable row level security;

revoke all on public.calendar_section_tasks_write_audit from public, anon, authenticated;
grant select on public.calendar_section_tasks_write_audit to authenticated;

create or replace function public.log_calendar_section_tasks_write_audit ()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_jwt uuid;
  v_op text;
  v_task_id uuid;
  v_task_user uuid;
  v_claims text;
begin
  v_jwt := auth.uid ();
  if v_jwt is null then
    begin
      v_claims := nullif (trim (both from current_setting ('request.jwt.claims', true)), '');
      if v_claims is not null and v_claims <> '' then
        v_jwt := (v_claims::json->>'sub')::uuid;
      end if;
    exception
      when others then
        v_jwt := null;
    end;
  end if;

  if tg_op = 'DELETE' then
    v_op := 'DELETE';
    v_task_id := old.id;
    v_task_user := old.user_id;
  elsif tg_op = 'UPDATE' then
    v_op := 'UPDATE';
    v_task_id := new.id;
    v_task_user := new.user_id;
  else
    v_op := 'INSERT';
    v_task_id := new.id;
    v_task_user := new.user_id;
  end if;

  insert into public.calendar_section_tasks_write_audit (
    op,
    task_id,
    task_user_id,
    jwt_user,
    db_user,
    client_addr
  )
  values (
    v_op,
    v_task_id,
    v_task_user,
    v_jwt,
    session_user::text,
    coalesce (inet_client_addr ()::text, '')
  );

  return coalesce (new, old);
end;
$$;

drop trigger if exists calendar_section_tasks_write_audit_trg on public.calendar_section_tasks;
create trigger calendar_section_tasks_write_audit_trg
  after insert or update or delete on public.calendar_section_tasks
  for each row
  execute function public.log_calendar_section_tasks_write_audit ();
