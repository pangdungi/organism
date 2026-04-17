/**
 * renderMain 호출 추적 (콘솔 비활성)
 */

export function lpRenderDebugOn() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("debug_lp_render") === "1";
  } catch (_) {
    return false;
  }
}

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

/** @param {string} _source @param {Record<string, unknown>} [_detail] */
export function logLpRender(_source, _detail = {}) {}

/** @param {string} _label @param {Record<string, unknown>} [_extra] */
export function logLpRenderStack(_label, _extra = {}) {}
