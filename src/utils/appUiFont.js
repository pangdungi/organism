/**
 * 앱 전역 UI 글꼴 — 그리운 코코최윤체 고정 (--lp-app-font-family)
 */

export const LP_APP_FONT_STACK =
  '"LP Griun Cocochoitoon", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** 일정·캘린더 월 표시(June 등) — Hello Scratchy 고정, 그리운 폰트와 분리 */
export const LP_CALENDAR_MONTH_FONT_STACK =
  '"Hello Scratchy Outlines", sans-serif';

/** html·--lp-app-font-family 에 고정 글꼴 적용 */
export function applyAppFont() {
  try {
    const root = document.documentElement;
    root.style.setProperty("--lp-app-font-family", LP_APP_FONT_STACK);
    root.style.setProperty(
      "--lp-calendar-month-abbr-font-family",
      LP_CALENDAR_MONTH_FONT_STACK,
    );
    root.style.fontFamily = LP_APP_FONT_STACK;
  } catch (_) {}
}

/** 월 표시 폰트 선로드 — 그리운→스케치y 깜빡임 방지 */
export function preloadCalendarMonthFont() {
  applyAppFont();
  try {
    if (document.fonts?.load) {
      return document.fonts.load('16px "Hello Scratchy Outlines"');
    }
  } catch (_) {}
  return Promise.resolve();
}
