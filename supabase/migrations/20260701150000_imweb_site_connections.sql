-- 아임웹 OAuth 연동완료 후 사이트별 토큰 저장

create table if not exists public.imweb_site_connections (
  site_code text primary key,
  access_token text not null,
  refresh_token text,
  scope text,
  integration_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.imweb_site_connections is
  '아임웹 연동완료(OAuth) 후 사이트별 access token';

alter table public.imweb_site_connections enable row level security;

revoke all on table public.imweb_site_connections from public;
revoke all on table public.imweb_site_connections from anon;
revoke all on table public.imweb_site_connections from authenticated;
