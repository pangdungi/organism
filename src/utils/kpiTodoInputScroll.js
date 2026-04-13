/**
 * 모바일 KPI 할일: 키보드·하단 고정 탭에 입력이 가려지지 않도록 보정
 * — App 전역에서 --vv-keyboard 로 .app-main 패딩을 늘리고, 여기서는 .app-main 을 직접 스크롤
 */

import { syncVisualViewportKeyboardInset } from "./mobileViewportKeyboard.js";

/**
 * @param {Element} fieldEl
 */
export function scrollKpiFieldIntoView(fieldEl) {
  if (!fieldEl || typeof fieldEl.getBoundingClientRect !== "function") return;
  syncVisualViewportKeyboardInset();

  const vv = window.visualViewport;
  const marginTop = 12;
  const marginBottom = 24;
  const topBound = vv ? vv.offsetTop + marginTop : marginTop;
  const bottomBound = vv ? vv.offsetTop + vv.height - marginBottom : window.innerHeight - marginBottom;

  const rect = fieldEl.getBoundingClientRect();
  let delta = 0;
  if (rect.bottom > bottomBound) {
    delta = rect.bottom - bottomBound + 6;
  } else if (rect.top < topBound) {
    delta = rect.top - topBound - 4;
  }

  const main = fieldEl.closest?.(".app-main");
  if (main && Math.abs(delta) >= 1) {
    main.scrollTop += delta;
  } else if (Math.abs(delta) >= 1) {
    try {
      window.scrollBy({ top: delta, left: 0, behavior: "auto" });
    } catch {
      window.scrollBy(0, delta);
    }
  }

  requestAnimationFrame(() => {
    syncVisualViewportKeyboardInset();
    try {
      fieldEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch (_) {}
  });
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
    syncVisualViewportKeyboardInset();
    requestAnimationFrame(scroll);
    setTimeout(scroll, 30);
    setTimeout(scroll, 90);
    setTimeout(scroll, 200);
    setTimeout(scroll, 450);
    setTimeout(scroll, 750);
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
