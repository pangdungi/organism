/**
 * 전체 탭 renderMain / __lpRenderMain 호출 추적.
 * 브라우저 콘솔에서 한 번 실행 후 새로고침:
 *   localStorage.setItem("debug_lp_render", "1");
 * 끄기: localStorage.removeItem("debug_lp_render"); 또는 "0"
 *
 * 추가:
 *   localStorage.setItem("debug_lp_render_trace", "1");
 *   → renderMain마다 console.trace (호출 스택 전체)
 *
 *   localStorage.setItem("debug_lp_render_deep", "1");
 *   → logLpRenderStack 시 스택 줄 수 확장
 *
 *   localStorage.setItem("debug_dom_pulse", "1");
 *   → body DOM 변화 요약 (App 마운트 시, debounce) — 아무 입력 없이 깜빡일 때 원인 후보 확인
 */

export function lpRenderDebugOn() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("debug_lp_render") === "1";
  } catch (_) {
    return false;
  }
}

/** renderMain 진입 시 console.trace 까지 출력 */
export function lpRenderTraceOn() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("debug_lp_render_trace") === "1";
  } catch (_) {
    return false;
  }
}

export function lpRenderDeepStackOn() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("debug_lp_render_deep") === "1";
  } catch (_) {
    return false;
  }
}

/**
 * @param {string} source — 호출 위치 식별자
 * @param {Record<string, unknown>} [detail]
 */
export function logLpRender(source, detail = {}) {
  if (!lpRenderDebugOn()) return;
  try {
    console.log("[lp-render]", source, { t: Date.now(), ...detail });
  } catch (_) {}
}

/**
 * renderMain 진입 시 스택 상단 몇 줄 (추측 없이 누가 불렀는지 확인)
 */
export function logLpRenderStack(label, extra = {}) {
  if (!lpRenderDebugOn()) return;
  try {
    const err = new Error("lp-render-stack");
    const depth = lpRenderDeepStackOn() ? 18 : 8;
    const lines = (err.stack || "").split("\n").slice(1, depth);
    console.log("[lp-render]", label, { ...extra, stack: lines });
  } catch (_) {}
}
