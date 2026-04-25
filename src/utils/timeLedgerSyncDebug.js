/**
 * 시간가계부 서버 반영·pull (콘솔 비활성)
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
 * @param {unknown} [detail]
 */
export function timeLedgerSyncLog(phase, detail) {
  if (!timeLedgerSyncDebugEnabled()) return;
  try {
    if (typeof console !== "undefined" && console.log) {
      console.log(`[lp-time-ledger-sync] ${phase}`, detail);
    }
  } catch (_) {}
}
