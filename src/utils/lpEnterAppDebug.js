/** 로그인→메인 진입 구간 소요 시간 (콘솔). 켜기: localStorage.setItem('debug_lp_enter_app','1') 후 새로고침 */
const FLAG = "debug_lp_enter_app";
const LOG = "[lp enter-app]";

export function isLpEnterAppDebugEnabled() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(FLAG) === "1";
  } catch (_) {
    return false;
  }
}

/** @param {string} step @param {number} [t0] performance.now() 기준점 */
export function lpEnterAppDebugMark(step, t0 = performance.now()) {
  if (!isLpEnterAppDebugEnabled()) return;
  const ms = Math.round(performance.now() - t0);
  console.log(LOG, step, `${ms}ms`);
}

export function lpEnterAppDebugSummary(rows) {
  if (!isLpEnterAppDebugEnabled() || !rows?.length) return;
  console.table(rows.map((r) => ({ 단계: r.label, ms: r.ms })));
}
