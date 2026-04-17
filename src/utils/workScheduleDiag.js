/**
 * 근무표 진단 (콘솔 비활성)
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

export function workScheduleDiagLog(..._args) {}
