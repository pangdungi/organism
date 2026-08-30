/**
 * KPI 할일 추가·수정·삭제 후 상세를 다시 그릴 때 스크롤 위치 유지
 */

/**
 * @param {Element | null | undefined} el
 */
function isEffectivelyHidden(el) {
  if (!(el instanceof HTMLElement)) return true;
  if (el.hidden) return true;
  if (el.closest("[hidden]")) return true;
  const panel = el.closest(".dream-kpi-bottom-seg-panel");
  if (panel instanceof HTMLElement && panel.hidden) return true;
  return false;
}

/**
 * @param {Element | null | undefined} listEl
 * @returns {"daily" | "todo"}
 */
function kpiTodoListKind(listEl) {
  if (
    listEl instanceof Element &&
    listEl.closest(".dream-kpi-bottom-seg-panel--daily")
  ) {
    return "daily";
  }
  return "todo";
}

/**
 * @param {Element | null | undefined} root
 * @returns {HTMLElement[]}
 */
function queryVisibleKpiTodoLists(root) {
  if (!(root instanceof Element)) return [];
  return [...root.querySelectorAll(".dream-kpi-todo-list")].filter(
    (el) => el instanceof HTMLElement && !isEffectivelyHidden(el),
  );
}

/**
 * @param {Element | null | undefined} fromEl
 * @returns {Element | null}
 */
function resolveKpiDetailRoot(fromEl) {
  if (fromEl instanceof Element) {
    return (
      fromEl.closest(".dream-kpi-detail-wrap") ||
      fromEl.closest(".dream-kpi-history-wrap") ||
      fromEl
    );
  }
  return (
    document.querySelector(".dream-kpi-detail-wrap") ||
    document.querySelector(".dream-kpi-history-wrap")
  );
}

/**
 * @param {Element | null | undefined} fromEl
 * @returns {HTMLElement | null}
 */
export function findKpiDetailScrollContainer(fromEl) {
  const root = resolveKpiDetailRoot(fromEl);
  const lists = queryVisibleKpiTodoLists(root);
  const overflowing = lists.find(
    (el) => el.scrollHeight > el.clientHeight + 1,
  );
  if (overflowing) return overflowing;
  if (lists[0]) return lists[0];

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
 * @returns {{
 *   el: HTMLElement | null,
 *   top: number,
 *   listTops: Array<{ kind: "todo" | "daily", top: number }>,
 *   pageTop: number,
 * } | null}
 */
export function captureKpiDetailScroll(fromEl) {
  const root = resolveKpiDetailRoot(fromEl);
  const lists = queryVisibleKpiTodoLists(root);
  const listTops = lists.map((el) => ({
    kind: kpiTodoListKind(el),
    top: el.scrollTop,
  }));
  const el = findKpiDetailScrollContainer(fromEl);
  if (!el && !listTops.length) return null;
  let page = null;
  let node = fromEl instanceof Element ? fromEl : el;
  while (node && node !== document.documentElement) {
    if (
      node instanceof HTMLElement &&
      node !== el &&
      (node.classList.contains("app-main") ||
        node.classList.contains("dream-content-wrap"))
    ) {
      page = node;
      break;
    }
    node = node.parentElement;
  }
  let windowTop = 0;
  try {
    windowTop = window.scrollY || document.documentElement.scrollTop || 0;
  } catch (_) {
    windowTop = 0;
  }
  return {
    el,
    top: el ? el.scrollTop : 0,
    listTops,
    pageTop: page ? page.scrollTop : 0,
    windowTop,
  };
}

/**
 * @param {{
 *   el?: HTMLElement | null,
 *   top?: number,
 *   listTops?: Array<{ kind: "todo" | "daily", top: number }>,
 *   pageTop?: number,
 * } | null | undefined} snapshot
 * @param {Element | null | undefined} [afterRoot]
 */
export function restoreKpiDetailScroll(snapshot, afterRoot) {
  if (!snapshot) return;
  const apply = () => {
    const root = resolveKpiDetailRoot(
      afterRoot instanceof Element && afterRoot.isConnected
        ? afterRoot
        : snapshot.el?.isConnected
          ? snapshot.el
          : null,
    );
    const lists = queryVisibleKpiTodoLists(root);
    if (snapshot.listTops?.length) {
      for (const rec of snapshot.listTops) {
        const t = Math.max(0, Math.round(Number(rec.top) || 0));
        const match =
          rec.kind === "daily"
            ? lists.find((el) => kpiTodoListKind(el) === "daily")
            : lists.find((el) => kpiTodoListKind(el) === "todo");
        const target = match || lists[0];
        if (target) target.scrollTop = t;
      }
    } else {
      const t = Math.max(0, Math.round(Number(snapshot.top) || 0));
      if (lists[0]) lists[0].scrollTop = t;
      else if (snapshot.el?.isConnected) snapshot.el.scrollTop = t;
    }
    const pageTop = Math.max(0, Math.round(Number(snapshot.pageTop) || 0));
    if (pageTop > 0) {
      const main = document.querySelector(".app-main");
      if (main instanceof HTMLElement) main.scrollTop = pageTop;
    }
    if (typeof snapshot.windowTop === "number") {
      const wt = Math.max(0, Math.round(Number(snapshot.windowTop) || 0));
      try {
        window.scrollTo(0, wt);
      } catch (_) {}
    }
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
 * @param {{ el?: HTMLElement | null, top?: number } | null} [snapshot]
 */
export function afterKpiTodoListMutationScroll(_historyWrapEl, snapshot) {
  restoreKpiDetailScroll(snapshot ?? null, _historyWrapEl);
}

/** @param {HTMLElement} [_inputEl] */
export function attachKpiTodoInputScrollIntoView(_inputEl) {}
