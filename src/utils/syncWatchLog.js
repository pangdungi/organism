/**
 * 동기화·pull·Realtime 감시 (콘솔 비활성)
 */

const KEY = "debug_sync_watch";

export function syncWatchOn() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
  } catch (_) {
    return false;
  }
}

/** @param {string} _tag @param {Record<string, unknown>} [_detail] */
export function syncWatchLog(_tag, _detail) {}

export function printSyncWatchHelp() {}
