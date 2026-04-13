/**
 * 모바일 KPI 할일: 키보드·내부 스크롤 영역에서 입력 필드가 가려지지 않도록 보정
 * (.app-main 등 부모 overflow 스크롤 + iOS visualViewport)
 */

function getScrollableAncestors(el) {
  const out = [];
  let p = el?.parentElement;
  while (p && p !== document.body) {
    const st = getComputedStyle(p);
    const oy = st.overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && p.scrollHeight > p.clientHeight + 1) {
      out.push(p);
    }
    p = p.parentElement;
  }
  return out;
}

/**
 * @param {Element} fieldEl
 */
export function scrollKpiFieldIntoView(fieldEl) {
  if (!fieldEl || typeof fieldEl.getBoundingClientRect !== "function") return;
  const vv = window.visualViewport;
  const marginTop = 10;
  const marginBottom = 28;
  const topBound = vv ? vv.offsetTop + marginTop : marginTop;
  const bottomBound = vv ? vv.offsetTop + vv.height - marginBottom : window.innerHeight - marginBottom;
  const rect = fieldEl.getBoundingClientRect();
  let delta = 0;
  if (rect.bottom > bottomBound) {
    delta = rect.bottom - bottomBound;
  } else if (rect.top < topBound) {
    delta = rect.top - topBound;
  }
  if (Math.abs(delta) < 1) return;

  const chain = getScrollableAncestors(fieldEl);
  if (chain.length > 0) {
    chain[0].scrollTop += delta;
  } else {
    try {
      window.scrollBy({ top: delta, left: 0, behavior: "auto" });
    } catch {
      window.scrollBy(0, delta);
    }
  }
}

/**
 * 할일 추가/삭제 등 DOM 갱신 직후 — 목록·입력 행이 보이도록 (맨 위로 튀는 현상 완화)
 * @param {HTMLElement | null} historyWrapEl .dream-kpi-history-wrap
 */
export function afterKpiTodoListMutationScroll(historyWrapEl) {
  if (!historyWrapEl || !historyWrapEl.isConnected) return;
  const run = () => {
    const addRows = historyWrapEl.querySelectorAll(".dream-kpi-todo-add-row");
    const lastAddRow = addRows.length ? addRows[addRows.length - 1] : null;
    const lastTodo = historyWrapEl.querySelector(".dream-kpi-todo-item:last-child");
    const target = lastAddRow || lastTodo || historyWrapEl;
    scrollKpiFieldIntoView(target);
  };
  requestAnimationFrame(run);
  setTimeout(run, 80);
  setTimeout(run, 280);
}

/**
 * @param {HTMLElement} inputEl input 또는 textarea
 */
export function attachKpiTodoInputScrollIntoView(inputEl) {
  if (!inputEl || typeof inputEl.addEventListener !== "function") return;
  let vvHandler = null;
  const scroll = () => scrollKpiFieldIntoView(inputEl);
  const onFocus = () => {
    requestAnimationFrame(scroll);
    setTimeout(scroll, 50);
    setTimeout(scroll, 160);
    setTimeout(scroll, 400);
    setTimeout(scroll, 700);
    if (window.visualViewport && !vvHandler) {
      vvHandler = () => scroll();
      window.visualViewport.addEventListener("resize", vvHandler);
      window.visualViewport.addEventListener("scroll", vvHandler);
    }
  };
  const onBlur = () => {
    if (vvHandler && window.visualViewport) {
      window.visualViewport.removeEventListener("resize", vvHandler);
      window.visualViewport.removeEventListener("scroll", vvHandler);
      vvHandler = null;
    }
  };
  inputEl.addEventListener("focus", onFocus);
  inputEl.addEventListener("blur", onBlur);
}
