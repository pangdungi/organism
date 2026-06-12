/**
 * 앱 전역 UI 글꼴 — 그리운 코코최윤체 고정 (--lp-app-font-family)
 */

export const LP_APP_FONT_STACK =
  '"LP Griun Cocochoitoon", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** html·--lp-app-font-family 에 고정 글꼴 적용 */
export function applyAppFont() {
  try {
    const root = document.documentElement;
    root.style.setProperty("--lp-app-font-family", LP_APP_FONT_STACK);
    root.style.fontFamily = LP_APP_FONT_STACK;
  } catch (_) {}
}
