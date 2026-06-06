/** @typedef {"png"|"svg"} ToolbarIconExt */

export const TOOLBAR_ICON_EXT = "png";

/**
 * @param {string} name 파일명(확장자 없음). 하위 폴더는 "time-task-picker/book" 형태.
 * @param {ToolbarIconExt} [ext]
 */
export function toolbarIconUrl(name, ext = TOOLBAR_ICON_EXT) {
  const base = String(name || "").replace(/^\//, "").replace(/\.(png|svg)$/i, "");
  if (!base) return "";
  return `/toolbaricons/${base}.${ext}`;
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
  const svgSrc = pngSrc.replace(/\.png$/i, ".svg");
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
