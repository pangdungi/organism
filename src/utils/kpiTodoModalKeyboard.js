import {
  lockPageScrollForModalKeyboard,
  resetViewportKeyboardBaseline,
  syncVisualViewportKeyboardInset,
} from "./mobileViewportKeyboard.js";

export const KPI_TODO_MODAL_HTML_OPEN_CLASS = "lp-kpi-todo-modal-open";

/**
 * KPI 할 일 추가·수정 모달 — 모바일 키보드가 입력란을 가리지 않게 visualViewport에 맞춤.
 * @param {HTMLElement} modal
 * @param {HTMLElement} inputEl
 * @returns {() => void}
 */
export function bindKpiTodoModalMobileKeyboard(modal, inputEl) {
  const ac = new AbortController();
  const { signal } = ac;

  try {
    document.documentElement.classList.add(KPI_TODO_MODAL_HTML_OPEN_CLASS);
  } catch (_) {}

  function scrollInputIntoView() {
    const scrollRoot = modal.querySelector(
      ".dream-kpi-form-body, [data-legacy~='time-task-setup-body']",
    );
    if (!(scrollRoot instanceof HTMLElement) || !(inputEl instanceof HTMLElement)) {
      return;
    }
    const vv = window.visualViewport;
    const visibleTop = vv?.offsetTop || 0;
    const visibleBottom =
      vv && vv.height > 0 ? vv.height + visibleTop : window.innerHeight;
    const margin = 28;
    const rect = inputEl.getBoundingClientRect();
    if (rect.bottom > visibleBottom - margin) {
      scrollRoot.scrollTop += rect.bottom - (visibleBottom - margin);
    }
    if (rect.top < visibleTop + margin) {
      scrollRoot.scrollTop -= visibleTop + margin - rect.top;
    }
  }

  function run() {
    syncVisualViewportKeyboardInset();
    lockPageScrollForModalKeyboard();
    if (document.activeElement === inputEl) {
      scrollInputIntoView();
    }
  }

  function scheduleScrollPasses() {
    run();
    requestAnimationFrame(run);
    for (const ms of [50, 120, 250, 450, 700]) {
      window.setTimeout(run, ms);
    }
  }

  resetViewportKeyboardBaseline();
  modal.addEventListener("focusin", run, { capture: true, signal });
  window.visualViewport?.addEventListener("resize", run, { passive: true, signal });
  window.visualViewport?.addEventListener("scroll", run, { passive: true, signal });
  inputEl.addEventListener(
    "focus",
    () => {
      modal.classList.add("is-keyboard-open");
      scheduleScrollPasses();
    },
    { signal },
  );
  inputEl.addEventListener(
    "blur",
    () => {
      window.setTimeout(() => {
        if (document.activeElement !== inputEl) {
          modal.classList.remove("is-keyboard-open");
        }
      }, 0);
    },
    { signal },
  );
  run();

  return () => {
    ac.abort();
    try {
      document.documentElement.classList.remove(KPI_TODO_MODAL_HTML_OPEN_CLASS);
    } catch (_) {}
    modal.classList.remove("is-keyboard-open");
  };
}
