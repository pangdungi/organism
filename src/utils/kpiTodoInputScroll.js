/**
 * KPI 할일 추가·수정·삭제 후 상세를 다시 그릴 때 스크롤 위치 유지
 */

/**
 * @param {Element | null | undefined} fromEl
 * @returns {HTMLElement | null}
 */
export function findKpiDetailScrollContainer(fromEl) {
  let node = fromEl instanceof Element ? fromEl : null;
  while (node && node !== document.documentElement) {
    if (node instanceof HTMLElement) {
      const style = window.getComputedStyle(node);
      const oy = style.overflowY;
      if (
        (oy === "auto" || oy === "scroll" || oy === "overlay") &&
        node.scrollHeight > node.clientHeight + 1
      ) {
        return node;
      }
    }
    node = node.parentElement;
  }
  const main = document.querySelector(".app-main");
  return main instanceof HTMLElement ? main : null;
}

/**
 * @param {Element | null | undefined} fromEl
 * @returns {{ el: HTMLElement, top: number } | null}
 */
export function captureKpiDetailScroll(fromEl) {
  const el = findKpiDetailScrollContainer(fromEl);
  if (!el) return null;
  return { el, top: el.scrollTop };
}

/**
 * @param {{ el: HTMLElement, top: number } | null | undefined} snapshot
 */
export function restoreKpiDetailScroll(snapshot) {
  if (!snapshot?.el) return;
  const { el, top } = snapshot;
  const t = Math.max(0, Math.round(Number(top) || 0));
  const apply = () => {
    if (!el.isConnected) return;
    el.scrollTop = t;
  };
  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

/** @param {Element} [_fieldEl] */
export function scrollKpiFieldIntoView(_fieldEl) {}

/**
 * @param {HTMLElement | null} [_historyWrapEl]
 * @param {{ el: HTMLElement, top: number } | null} [snapshot]
 */
export function afterKpiTodoListMutationScroll(_historyWrapEl, snapshot) {
  restoreKpiDetailScroll(snapshot ?? null);
}

/** @param {HTMLElement} [_inputEl] */
export function attachKpiTodoInputScrollIntoView(_inputEl) {}
