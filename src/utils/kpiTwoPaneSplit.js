/**
 * 건강·행복 — 넓은 가로 화면 2분할 (목록 | 상세). 모바일·세로는 스택 유지.
 */

export const KPI_TWOPANE_SPLIT_MQ =
  "(min-width: 64rem) and (orientation: landscape)";

export function isKpiTwoPaneSplitViewport() {
  try {
    return window.matchMedia(KPI_TWOPANE_SPLIT_MQ).matches;
  } catch (_) {
    return false;
  }
}

export function kpiTwoPanePlaceholderHtml(message) {
  const safe = String(message || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<p class="kpi-twopane-split-placeholder">${safe}</p>`;
}

/**
 * @param {HTMLElement} footerBack
 * @param {boolean} visible
 */
export function setKpiFooterBackVisible(footerBack, visible) {
  if (!(footerBack instanceof HTMLElement)) return;
  if (visible) {
    footerBack.hidden = false;
    footerBack.removeAttribute("aria-hidden");
    footerBack.style.removeProperty("display");
  } else {
    footerBack.hidden = true;
    footerBack.setAttribute("aria-hidden", "true");
    footerBack.style.setProperty("display", "none", "important");
  }
}
