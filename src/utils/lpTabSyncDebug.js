/**
 * 탭 전환·동기화 횟수 (콘솔 비활성, 카운트만 유지)
 */

const COUNTS = {
  tab_switch: 0,
  render_main: 0,
  boot_hydrate: 0,
  visibility_pull: 0,
  realtime_debounced_pull: 0,
  kpi_tab_pull: 0,
};

export function tabSyncDebugOn() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("debug_tab_sync") === "1";
  } catch (_) {
    return false;
  }
}

/**
 * @param {keyof typeof COUNTS | string} kind
 * @param {Record<string, unknown>} [_detail]
 */
export function logTabSync(kind, _detail = {}) {
  if (!tabSyncDebugOn()) return;
  const k = String(kind);
  COUNTS[k] = (COUNTS[k] || 0) + 1;
}

export function getTabSyncCounts() {
  return { ...COUNTS };
}
