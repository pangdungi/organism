/**
 * 시간가계부(time_ledger_entries) 서버 반영·pull 추적 — 기본은 콘솔에 출력함.
 * 끄기: localStorage.setItem('debug_time_ledger_sync', '0') 후 새로고침
 * (다시 켜기: removeItem 또는 '1')
 */

export const TIME_LEDGER_SYNC_DEBUG_FLAG = "debug_time_ledger_sync";

export function timeLedgerSyncDebugEnabled() {
  try {
    if (typeof localStorage === "undefined") return true;
    const v = localStorage.getItem(TIME_LEDGER_SYNC_DEBUG_FLAG);
    if (v === "0") return false;
    return true;
  } catch (_) {
    return true;
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
