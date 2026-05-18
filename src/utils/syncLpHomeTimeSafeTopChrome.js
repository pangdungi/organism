/** 메인(오늘)·시간가계부: 노치 상단 줄 배경 — html/body 클래스로만 처리 (main.css) */
const CLASS = "lp-home-time-safe-top-navy";

export function syncLpHomeTimeSafeTopChrome(tabId) {
  const on = tabId === "home" || tabId === "time";
  try {
    document.documentElement.classList.toggle(CLASS, on);
    document.body?.classList.toggle(CLASS, on);
  } catch (_) {}
}

export function clearLpHomeTimeSafeTopChrome() {
  try {
    document.documentElement.classList.remove(CLASS);
    document.body?.classList.remove(CLASS);
  } catch (_) {}
}
