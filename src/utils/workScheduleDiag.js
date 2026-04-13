/**
 * 근무표 진단 로그 — 아래 중 하나면 켜짐:
 * - localStorage 또는 sessionStorage `debug_work_schedule` === "1"
 * - Vite 개발 빌드(import.meta.env.DEV)
 *
 * PWA(폰)에서는 Safari 원격 디버깅 등으로 sessionStorage만 넣고 새로고침해도 됩니다.
 */

export function workScheduleDiagEnabled() {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("debug_work_schedule") === "1") {
      return true;
    }
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("debug_work_schedule") === "1") {
      return true;
    }
  } catch (_) {}
  try {
    return import.meta.env.DEV === true;
  } catch (_) {
    return false;
  }
}

export function workScheduleDiagLog(...args) {
  if (!workScheduleDiagEnabled()) return;
  try {
    console.log("[work-schedule]", { t: Date.now() }, ...args);
  } catch (_) {}
}
