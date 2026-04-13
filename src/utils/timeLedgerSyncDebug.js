/**
 * 시간가계부(time_ledger_entries) 서버 반영·pull 추적 — 기본 꺼짐.
 * 켜기: localStorage.setItem('debug_time_ledger_sync', '1') 후 새로고침
 */

export const TIME_LEDGER_SYNC_DEBUG_FLAG = "debug_time_ledger_sync";

export function timeLedgerSyncDebugEnabled() {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(TIME_LEDGER_SYNC_DEBUG_FLAG) === "1";
  } catch (_) {
    return false;
  }
}

/**
 * @param {string} phase
 * @param {Record<string, unknown> | string | number | null | undefined} [detail]
 */
export function timeLedgerSyncLog(phase, detail) {
  if (!timeLedgerSyncDebugEnabled()) return;
  try {
    console.info("[time-ledger-sync]", phase, detail != null ? detail : "");
  } catch (_) {}
}
