/**
 * 브라우저 native title(호버 툴팁) 전역 차단.
 * 시간가계부 「타임박스」 칸만 예외(잘린 글자 확인용 커스텀 팁 유지).
 */

const TIMEBOX_ALLOW_SEL =
  ".time-ledger-day-timebox-scroll, .time-ledger-day-timebox-matrix, #time-ledger-timebox-hover-tip";

function isInsideAllowedTimebox(el) {
  if (!(el instanceof Element)) return false;
  if (el.id === "time-ledger-timebox-hover-tip") return true;
  return !!el.closest?.(TIMEBOX_ALLOW_SEL);
}

function stripTitleAttr(el) {
  if (!(el instanceof Element)) return;
  if (isInsideAllowedTimebox(el)) return;
  if (el.hasAttribute("title")) el.removeAttribute("title");
}

function stripTitlesInTree(root) {
  if (!(root instanceof Element)) return;
  stripTitleAttr(root);
  root.querySelectorAll?.("[title]")?.forEach(stripTitleAttr);
}

/** 앱 부팅 시 1회 — 이후 추가·변경되는 title도 제거 */
export function installGlobalTitleTooltipSuppression() {
  if (typeof document === "undefined") return;
  if (document.documentElement.dataset.lpNoNativeTitleTips === "1") return;
  document.documentElement.dataset.lpNoNativeTitleTips = "1";

  stripTitlesInTree(document.documentElement);

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "title") {
        stripTitleAttr(m.target);
        continue;
      }
      if (m.type !== "childList") continue;
      m.addedNodes.forEach((n) => {
        if (n instanceof Element) stripTitlesInTree(n);
      });
    }
  });

  mo.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["title"],
  });
}
