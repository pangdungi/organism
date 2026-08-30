/** 앱 전역 통일 로딩·스플래시 UI */

export const LP_UNIFIED_LOADING_MESSAGE = "Good things are coming";
export const LP_SPLASH_SCREEN_URL =
  "/toolbaricons/splash/splash-screen.png?v=splash-paper-1";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderLpUnifiedLoadingInnerMarkup() {
  return `
    <img
      class="lp-unified-loading__screen-img"
      src="${LP_SPLASH_SCREEN_URL}"
      alt=""
      width="1046"
      height="1609"
      decoding="async"
      fetchpriority="high"
    />
  `;
}

/**
 * @param {{ variant?: 'fullscreen' | 'inline' | 'overlay', extraClass?: string }} [opts]
 */
export function renderLpUnifiedLoadingMarkup(opts = {}) {
  const variant = opts.variant || "inline";
  const extraClass = String(opts.extraClass || "").trim();
  const msg = LP_UNIFIED_LOADING_MESSAGE;
  const classes = [
    "lp-unified-loading",
    `lp-unified-loading--${variant}`,
    extraClass,
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div
      class="${classes}"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="${escapeHtml(msg)}"
    >
      ${renderLpUnifiedLoadingInnerMarkup()}
    </div>
  `;
}
