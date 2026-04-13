/**
 * 탭 전환·동기화(pull) 횟수 추적 — 콘솔 필터: [LP-SYNC]
 * 켜기: localStorage.setItem("debug_tab_sync", "1"); 위치 새로고침
 * 끄기: localStorage.removeItem("debug_tab_sync"); 또는 "0"
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
 * @param {Record<string, unknown>} [detail]
 */
export function logTabSync(kind, detail = {}) {
  if (!tabSyncDebugOn()) return;
  const k = String(kind);
  COUNTS[k] = (COUNTS[k] || 0) + 1;
  try {
    console.info("[LP-SYNC]", k, { n: COUNTS[k], t: Date.now(), ...detail });
  } catch (_) {}
}

/** 콘솔에서 window.__lpTabSyncCounts() 로 누적 확인 */
export function getTabSyncCounts() {
  return { ...COUNTS };
}
