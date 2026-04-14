/**
 * 동기화·pull·Realtime 감시용 콘솔 로그 (필터: [동기화감시])
 *
 * 켜기: localStorage.setItem('debug_sync_watch', '1') 후 새로고침
 * 끄기: localStorage.removeItem('debug_sync_watch')
 *
 * 참고 (코드 기준):
 * - 꿈·행복·건강·부수입 KPI 맵 pull은 서버 스냅샷만 localStorage에 반영 (merge*Payload 제거됨).
 * - Realtime은 postgres_changes 수신 후 디바운스(ms는 supabaseRealtimeSync 상수) 뒤에 pull 묶음 실행 — 1초 setInterval 폴링 아님.
 * - KPI Realtime 구독 테이블은 meta/categories/kpis 중심이며, dream_map_kpi_todos 등 할일 전용 테이블은 목록에 없을 수 있음.
 *   → 다른 기기에서 할일 행만 바뀐 경우 즉시 Realtime으로 안 잡힐 수 있고, 포커스 복귀·수동 새로고침·메타 변경 시 pull로 맞춤.
 * - 할일 목록(섹션별 calendar_section_tasks 등)은 todoSectionTasksSupabase 쪽 별도 로직.
 */

const KEY = "debug_sync_watch";

export function syncWatchOn() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
  } catch (_) {
    return false;
  }
}

/**
 * @param {string} tag
 * @param {Record<string, unknown>} [detail]
 */
export function syncWatchLog(tag, detail) {
  if (!syncWatchOn()) return;
  try {
    const base = { t: new Date().toISOString() };
    if (detail != null && typeof detail === "object") {
      console.info("[동기화감시]", tag, { ...base, ...detail });
    } else {
      console.info("[동기화감시]", tag, base);
    }
  } catch (_) {}
}

/** 콘솔에서 한 번에 도움말 출력 */
export function printSyncWatchHelp() {
  console.info(
    `[동기화감시] 켜기: localStorage.setItem('${KEY}','1')  |  끄기: removeItem('${KEY}')  |  필터: [동기화감시]`,
  );
}
