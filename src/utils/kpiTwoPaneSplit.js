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

const KPI_HEADER_BACK_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M15 6 9 12l6 6"/></svg>';

/**
 * 제목 줄 왼쪽 뒤로가기(넓은 화면용). 모바일은 CSS로 숨김.
 * @param {HTMLElement} titleRow
 * @param {{ onBack?: () => void, label?: string }} [opts]
 */
export function ensureKpiHeaderBackButton(titleRow, opts = {}) {
  if (!(titleRow instanceof HTMLElement)) return null;
  let btn = titleRow.querySelector("[data-lp-kpi-header-back]");
  if (!(btn instanceof HTMLButtonElement)) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dream-view-header-back";
    btn.setAttribute("data-lp-kpi-header-back", "");
    btn.innerHTML = KPI_HEADER_BACK_SVG;
    titleRow.insertBefore(btn, titleRow.firstChild);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof opts.onBack === "function") {
        opts.onBack();
        return;
      }
      try {
        document.querySelector("[data-lp-app-footer-back]")?.click();
      } catch (_) {}
    });
  }
  const label = String(opts.label || "뒤로").trim() || "뒤로";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  return btn;
}
