/**
 * 앱 전역 UI 글꼴 — localStorage + --lp-app-font-family
 * Corsica 전용 구간은 lp-corsica-display.css 의 font-family !important 가 우선합니다.
 */

export const LP_APP_UI_FONT_STORAGE_KEY = "lp_app_ui_font_id";

/** 시스템·애플 계열 기본 스택 (한글 보조: 산돌고딕/Noto) */
export const LP_APP_SYSTEM_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", Roboto, sans-serif';

const LP_APP_FONT_FALLBACK =
  '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

/** @typedef {{ id: string, label: string, stack: string }} LpAppFontOption */

/** @type {LpAppFontOption[]} */
export const LP_APP_FONT_OPTIONS = [
  { id: "system", label: "시스템 기본 (애플)", stack: LP_APP_SYSTEM_FONT_STACK },
  {
    id: "donoun",
    label: "Donoun Medium",
    stack: `"LP Donoun Medium", ${LP_APP_FONT_FALLBACK}`,
  },
  {
    id: "adultkid",
    label: "Adultkid",
    stack: `"LP Adultkid", ${LP_APP_FONT_FALLBACK}`,
  },
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
