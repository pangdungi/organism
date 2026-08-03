/** @typedef {"png"|"svg"} ToolbarIconExt */

export const TOOLBAR_ICON_EXT = "png";

/** public/sw.js ASSET_CACHE 와 함께 올리면 구 아이콘 URL·SW 캐시 무력화 */
export const TOOLBAR_ICON_CACHE_VERSION = "61";

/** public/sw.js ASSET_CACHE — 클라이언트 warmIconPathInSwCache 와 동일 버킷 */
export const SW_ASSET_CACHE = "tip-assets-v74";

/** 로그인 화면 두들이 로고 — index.html·sw precache 와 동일 */
export const LOGIN_BRAND_LOGO_V = "doodle-login-brand-2";

export function loginBrandLogoUrl() {
  return `/login-brand-logo.png?v=${LOGIN_BRAND_LOGO_V}`;
}

/** 상단 브랜드(데스크탑 대시보드) — PWA 앱 아이콘과 동일 */
export const APP_BRAND_LOGO_V = "doodle-calendar-1";

export function appBrandLogoUrl() {
  return `/icon-512.png?v=${APP_BRAND_LOGO_V}`;
}

/** @param {string} url */
export function withToolbarIconCacheVersion(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  const qIdx = u.indexOf("?");
  const path = qIdx >= 0 ? u.slice(0, qIdx) : u;
  return `${path}?v=${TOOLBAR_ICON_CACHE_VERSION}`;
}

/**
 * @param {string} name 파일명(확장자 없음). 하위 폴더는 "time-task-picker/book" 형태.
 * @param {ToolbarIconExt} [ext]
 */
export function toolbarIconUrl(name, ext = TOOLBAR_ICON_EXT) {
  const base = String(name || "").replace(/^\//, "").replace(/\.(png|svg)$/i, "");
  if (!base) return "";
  return withToolbarIconCacheVersion(`/toolbaricons/${base}.${ext}`);
}

/** @param {string} name */
export function toolbarIconPng(name) {
  return toolbarIconUrl(name, "png");
}

/** @param {string} name */
export function toolbarIconSvg(name) {
  return toolbarIconUrl(name, "svg");
}

/**
 * PNG 로드 실패 시 같은 경로의 SVG로 한 번만 폴백.
 * @param {HTMLImageElement} img
 * @param {string} pngSrc
 */
export function attachIconPngFallback(img, pngSrc) {
  if (!img || !pngSrc) return;
  const svgSrc = pngSrc.replace(/\.png(\?.*)?$/i, ".svg$1");
  if (svgSrc === pngSrc) return;
  img.addEventListener(
    "error",
    () => {
      if (img.dataset.lpIconFallback === "1") return;
      img.dataset.lpIconFallback = "1";
      img.src = svgSrc;
    },
    { once: true }
  );
}

/**
 * SVG 로드 실패 시 같은 이름 PNG로 한 번만 폴백(화면 표시용).
 * @param {HTMLImageElement} img
 * @param {string} svgSrc
 */
export function attachIconSvgFallback(img, svgSrc) {
  if (!img || !svgSrc) return;
  const pngSrc = svgSrc.replace(/\.svg(\?.*)?$/i, ".png$1");
  if (pngSrc === svgSrc) return;
  img.addEventListener(
    "error",
    () => {
      if (img.dataset.lpIconFallback === "1") return;
      img.dataset.lpIconFallback = "1";
      img.src = pngSrc;
    },
    { once: true }
  );
}
