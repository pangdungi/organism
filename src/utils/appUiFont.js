/**
 * 앱 전역 UI 글꼴 — localStorage + --lp-app-font-family
 * Corsica 전용 구간은 lp-corsica-display.css 의 font-family !important 가 우선합니다.
 */

export const LP_APP_UI_FONT_STORAGE_KEY = "lp_app_ui_font_id";

/** 앱에서 「시스템 기본」: 폰트 설정 도입 전 모달에 쓰던 스택과 동일 */
export const LP_APP_SYSTEM_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';

/** 커스텀 글꼴 뒤에 붙는 공통 폴백 */
const LP_APP_FONT_FALLBACK = LP_APP_SYSTEM_FONT_STACK;

/** @typedef {{ id: string, label: string, stack: string }} LpAppFontOption */

/** @type {LpAppFontOption[]} */
export const LP_APP_FONT_OPTIONS = [
  { id: "system", label: "시스템 기본", stack: LP_APP_SYSTEM_FONT_STACK },
  {
    id: "leeseoyun",
    label: "Lee Seoyun",
    stack: `"LP Lee Seoyun", ${LP_APP_FONT_FALLBACK}`,
  },
  {
    id: "omu",
    label: "오뮤 다예쁨체",
    stack: `"LP Omu Dayeppemche", ${LP_APP_FONT_FALLBACK}`,
  },
  {
    id: "imhyemin",
    label: "아이엠 혜민체",
    stack: `"LP IM Hyemin", ${LP_APP_FONT_FALLBACK}`,
  },
];

/**
 * @param {string} id
 * @returns {string}
 */
export function getAppFontStackForId(id) {
  const opt = LP_APP_FONT_OPTIONS.find((o) => o.id === id);
  return opt ? opt.stack : LP_APP_SYSTEM_FONT_STACK;
}

/**
 * @returns {string}
 */
export function getStoredAppFontId() {
  try {
    const v = localStorage.getItem(LP_APP_UI_FONT_STORAGE_KEY);
    if (v && LP_APP_FONT_OPTIONS.some((o) => o.id === v)) return v;
  } catch (_) {}
  return "system";
}

export function applyAppFont() {
  try {
    const id = getStoredAppFontId();
    const stack = getAppFontStackForId(id);
    document.documentElement.style.setProperty("--lp-app-font-family", stack);
    document.documentElement.style.setProperty("--app-font-family", stack);
  } catch (_) {}
}

/**
 * @param {string} id
 */
export function setAppFontId(id) {
  const ok = LP_APP_FONT_OPTIONS.some((o) => o.id === id);
  const use = ok ? id : "system";
  try {
    localStorage.setItem(LP_APP_UI_FONT_STORAGE_KEY, use);
  } catch (_) {}
  applyAppFont();
  try {
    window.dispatchEvent(
      new CustomEvent("lp-app-font-changed", { detail: { id: use } }),
    );
  } catch (_) {}
}
