/** 앱 전역 통일 로딩·스플래시 UI */

export const LP_UNIFIED_LOADING_MESSAGE = "조금만 기다리세요 다들 미안 ❤︎";
export const LP_SPLASH_PATTERN_URL =
  "/toolbaricons/splash/splash-pattern-wave.png";
export const LP_SPLASH_MASCOT_URL = "/toolbaricons/splash/splash-mascot.png";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderLpUnifiedLoadingInnerMarkup() {
  const msg = LP_UNIFIED_LOADING_MESSAGE;
  return `
    <div class="lp-unified-loading__pattern" aria-hidden="true"></div>
    <div class="lp-unified-loading__content">
      <div class="lp-unified-loading__mascot-shell">
        <img
          class="lp-unified-loading__mascot"
          src="${LP_SPLASH_MASCOT_URL}"
          alt=""
          width="192"
          height="192"
          decoding="async"
        />
      </div>
      <p class="lp-unified-loading__message">${escapeHtml(msg)}</p>
    </div>
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
