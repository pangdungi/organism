/**
 * 근무표 진단 로그 — localStorage 또는 sessionStorage `debug_work_schedule` === "1" 일 때만.
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
  return false;
}

export function workScheduleDiagLog(...args) {
  if (!workScheduleDiagEnabled()) return;
  try {
    console.log("[work-schedule]", { t: Date.now() }, ...args);
  } catch (_) {}
}
