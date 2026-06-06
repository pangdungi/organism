import {
  lockPageScrollForModalKeyboard,
  resetViewportKeyboardBaseline,
  syncVisualViewportKeyboardInset,
} from "./mobileViewportKeyboard.js";

/** documentElement — 모바일 키보드·모달 z-index·뷰포트 보정용 */
export const LP_MODAL_HTML_OPEN_CLASS = "lp-modal-open";

/**
 * 공통 모달 모바일 키보드 — visualViewport 기준으로 보이는 영역에 맞춤.
 * @param {HTMLElement} modal
 * @param {HTMLElement} inputEl
 * @param {{
 *   variant?: "compact" | "scrollable",
 *   scrollRootSelector?: string,
 *   htmlOpenClass?: string,
 * }} [opts]
 * @returns {() => void}
 */
export function bindLpModalMobileKeyboard(modal, inputEl, opts = {}) {
  const variant = opts.variant === "scrollable" ? "scrollable" : "compact";
  const scrollRootSelector =
    opts.scrollRootSelector ||
    ".dream-kpi-form-body, [data-legacy~='time-task-setup-body'], .todo-list-modal-body, [data-legacy~='todo-list-modal-body']";
  const htmlOpenClass = opts.htmlOpenClass || LP_MODAL_HTML_OPEN_CLASS;

  const ac = new AbortController();
  const { signal } = ac;

  try {
    document.documentElement.classList.add(htmlOpenClass);
  } catch (_) {}

  function scrollFocusedFieldIntoView() {
    if (variant !== "scrollable") return;
    const scrollRoot = modal.querySelector(scrollRootSelector);
    if (!(scrollRoot instanceof HTMLElement) || !(inputEl instanceof HTMLElement)) {
      return;
    }
    const vv = window.visualViewport;
    const visibleTop = vv?.offsetTop || 0;
    const visibleBottom =
      vv && vv.height > 0 ? vv.height + visibleTop : window.innerHeight;
    const margin = 24;
    const rect = inputEl.getBoundingClientRect();
    if (rect.bottom > visibleBottom - margin) {
      scrollRoot.scrollTop += rect.bottom - (visibleBottom - margin);
    }
    if (rect.top < visibleTop + margin) {
      scrollRoot.scrollTop -= visibleTop + margin - rect.top;
    }
  }

  function runWithLock() {
    syncVisualViewportKeyboardInset();
    lockPageScrollForModalKeyboard();
    if (document.activeElement === inputEl) {
      scrollFocusedFieldIntoView();
    }
  }

  function runInsetOnly() {
    syncVisualViewportKeyboardInset();
    if (document.activeElement === inputEl) {
      scrollFocusedFieldIntoView();
    }
  }

  function scheduleAdjust() {
    runWithLock();
    requestAnimationFrame(runWithLock);
    window.setTimeout(runWithLock, 120);
  }

  resetViewportKeyboardBaseline();
  modal.addEventListener("focusin", runWithLock, { capture: true, signal });
  window.visualViewport?.addEventListener("resize", runWithLock, {
    passive: true,
    signal,
  });
  window.visualViewport?.addEventListener("scroll", runInsetOnly, {
    passive: true,
    signal,
  });
  inputEl.addEventListener(
    "focus",
    () => {
      modal.classList.add("is-keyboard-open");
      scheduleAdjust();
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
  runWithLock();

  return () => {
    ac.abort();
    try {
      document.documentElement.classList.remove(htmlOpenClass);
    } catch (_) {}
    modal.classList.remove("is-keyboard-open");
  };
}
