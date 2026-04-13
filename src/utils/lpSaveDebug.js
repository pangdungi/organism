/**
 * 자산·시간 소비 저장 경로 디버그 — 콘솔 필터: [LP-SAVE]
 * 끄기: localStorage.setItem('debug_lp_save', '0') 후 새로고침
 * (다른 디버그 로그는 기본 비활성이며, 이 모듈만 원할 때 필터하기 쉽게 접두사 고정)
 */

export function lpSaveDebug(...args) {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("debug_lp_save") === "0") return;
  } catch (_) {}
  console.info("[LP-SAVE]", ...args);
}
