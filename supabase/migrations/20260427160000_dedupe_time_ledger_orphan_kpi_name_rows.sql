-- KPI 연동 행(kpi_id 있음)과 같은 표시명인 옛 행(kpi_id 빈 클라/레거시) 정리
-- 트리거로 생긴 행은 유지, 이름만 같은 중복 1행 삭제

delete from public.time_ledger_tasks t
where coalesce(nullif(trim(t.kpi_id), ''), '') = ''
  and exists (
    select 1
    from public.time_ledger_tasks k
    where k.user_id = t.user_id
      and coalesce(nullif(trim(k.kpi_id), ''), '') <> ''
      and trim(k.name) = trim(t.name)
  );
