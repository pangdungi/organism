-- 회원 탈퇴 기록(관리자 조회용). auth.users 삭제 전 Edge Function에서 insert.

create table public.user_deletion_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  email text not null default '',
  deleted_at timestamptz not null default now()
);

comment on table public.user_deletion_log is '탈퇴한 회원 이메일·UID·탈퇴 시각(관리자 전용 조회)';

create index user_deletion_log_deleted_at_idx on public.user_deletion_log (deleted_at desc);
create index user_deletion_log_email_lower_idx on public.user_deletion_log (lower(email));

alter table public.user_deletion_log enable row level security;

revoke all on public.user_deletion_log from public;
grant select, insert on public.user_deletion_log to service_role;

create or replace function public.lp_admin_list_user_deletions ()
  returns table (
    id bigint,
    user_id uuid,
    email text,
    deleted_at timestamptz
  )
  language plpgsql
  security definer
  set search_path = public, auth
as $func$
begin
  if not public.lp_is_app_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
    select d.id, d.user_id, d.email, d.deleted_at
    from public.user_deletion_log d
    order by d.deleted_at desc, d.id desc;
end;
$func$;

revoke all on function public.lp_admin_list_user_deletions() from public;
grant execute on function public.lp_admin_list_user_deletions() to authenticated;
