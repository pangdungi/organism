-- ============================================================================
-- [한 번에 복사해서 실행]
--
-- 하는 일
--   diary_daily_entries 테이블에서
--   (user_id, diary_kind, entry_date) 조합이 겹치지 못하게 막던 유일 제약을 없앱니다.
--   → 같은 날·같은 종류 일기를 여러 개 저장할 수 있게 됩니다.
--
-- 쓰는 법 (웹 대시보드)
--   1) 이 파일 내용 전체 선택 → 복사
--   2) Supabase → SQL Editor → 붙여넣기 → Run (또는 Ctrl+Enter)
--
-- 다시 실행해도 됨
--   아래에 `if exists` 가 있어서, 이미 제약이 없으면 그냥 넘어갑니다.
--   comment 도 같은 문장으로 덮어쓰기만 하므로 여러 번 실행해도 됩니다.
--
-- (CLI로 배포할 때는 그대로 마이그레이션 파일로도 적용됩니다.)
-- ============================================================================

alter table public.diary_daily_entries
  drop constraint if exists diary_daily_entries_user_kind_date_unique;

comment on table public.diary_daily_entries is '감정일기: 탭별 일기 행 (id PK, 같은 날짜 여러 행 가능)';
