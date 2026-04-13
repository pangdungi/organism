/**
 * 서버 pull·hydrate 진입점 추적 — 콘솔 필터: [LP-PULL]
 * 켜기: localStorage.setItem("debug_lp_pull", "1"); 새로고침
 * 끄기: localStorage.removeItem("debug_lp_pull"); 또는 "0"
 */

export function lpPullDebug(scope, detail = {}) {
  try {
    if (typeof localStorage === "undefined" || localStorage.getItem("debug_lp_pull") !== "1") return;
  } catch (_) {}
  try {
    console.info("[LP-PULL]", scope, { t: Date.now(), ...detail });
  } catch (_) {}
}
