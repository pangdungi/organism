/**
 * 과제 기록·예상 일정 모달 — 모바일 키보드 시 메모·입력란을 visualViewport 위로 스크롤
 */

import {
  lockPageScrollForModalKeyboard,
  resetViewportKeyboardBaseline,
  syncVisualViewportKeyboardInset,
} from "./mobileViewportKeyboard.js";

const DEFAULT_MEMO_INPUT_SELECTOR =
  '[data-legacy~="time-task-log-memo-input"], [data-legacy~="time-task-log-feedback"]';

const DEFAULT_DATETIME_INPUT_SELECTOR =
  '[data-legacy~="time-task-log-time-start"], [data-legacy~="time-task-log-time-end"]';

const DEFAULT_ALL_KEYBOARD_INPUT_SELECTOR = `${DEFAULT_MEMO_INPUT_SELECTOR}, ${DEFAULT_DATETIME_INPUT_SELECTOR}`;

function isMobileMemoUi() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 48rem) and (pointer: coarse)").matches
  );
}

/**
 * @param {HTMLElement} modal
 * @param {{
 *   scrollArea?: HTMLElement | null,
 *   signal?: AbortSignal,
 *   htmlOpenClass?: string,
 *   memoInputSelector?: string,
 * }} [opts]
 */
export function bindTimeTaskLogModalMemoKeyboard(modal, opts = {}) {
  const scrollArea = opts.scrollArea || null;
  const htmlOpenClass = opts.htmlOpenClass || "lp-task-log-modal-open";
  const memoInputSelector =
    opts.memoInputSelector || DEFAULT_MEMO_INPUT_SELECTOR;
  const datetimeInputSelector =
    opts.datetimeInputSelector || DEFAULT_DATETIME_INPUT_SELECTOR;
  const allKeyboardInputSelector =
    opts.allKeyboardInputSelector || DEFAULT_ALL_KEYBOARD_INPUT_SELECTOR;

  /** @type {{ resize: () => void, scroll: () => void } | null} */
  let memoVvAdjust = null;
  let memoActiveInput = null;
  let scrollTopBeforeMemo = 0;
  let keyboardShellAc = null;

  function isMemoInputFocused() {
    return !!modal.querySelector(`${memoInputSelector}:focus`);
  }

  function isDatetimeInput(el) {
    return !!(
      el instanceof HTMLElement && el.matches(datetimeInputSelector)
    );
  }

  function isAnyKeyboardInputFocused() {
    return !!modal.querySelector(`${allKeyboardInputSelector}:focus`);
  }

  function applyMemoScrollBottomSpace() {
    if (!(scrollArea instanceof HTMLElement)) return 0;
    const kb = syncVisualViewportKeyboardInset();
    const vv = window.visualViewport;
    const vvGap =
      vv && vv.height > 0
        ? Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0))
        : 0;
    const pad = Math.max(
      kb,
      vvGap,
      Math.round(window.innerHeight * 0.45),
      300,
    );
    scrollArea.style.setProperty("--task-log-memo-scroll-pad", `${pad}px`);
    return pad;
  }

  function clearMemoScrollBottomSpace() {
    scrollArea?.style.removeProperty("--task-log-memo-scroll-pad");
  }

  function scrollFocusedInputIntoView(inputEl, { jumpToMemoSection = false } = {}) {
    if (!(inputEl instanceof HTMLElement)) return;
    if (!(scrollArea instanceof HTMLElement)) return;

    if (jumpToMemoSection) {
      applyMemoScrollBottomSpace();
      const memoSection = modal.querySelector(
        '[data-legacy~="time-task-log-memo-section"]',
      );
      if (memoSection instanceof HTMLElement) {
        const memoDelta =
          memoSection.getBoundingClientRect().top -
          scrollArea.getBoundingClientRect().top;
        scrollArea.scrollTop = Math.max(
          0,
          scrollArea.scrollTop + memoDelta - 12,
        );
      }
    }

    const vv = window.visualViewport;
    const visibleBottom =
      vv && vv.height > 0
        ? vv.height + (vv.offsetTop || 0)
        : window.innerHeight;
    const margin = 20;
    const rect = inputEl.getBoundingClientRect();
    if (rect.bottom > visibleBottom - margin) {
      scrollArea.scrollTop += rect.bottom - (visibleBottom - margin);
    }
    if (rect.top < (vv?.offsetTop || 0) + margin) {
      scrollArea.scrollTop -= (vv?.offsetTop || 0) + margin - rect.top;
    }
  }

  function runMemoScrollPasses(inputEl) {
    applyMemoScrollBottomSpace();
    scrollFocusedInputIntoView(inputEl, { jumpToMemoSection: true });
    requestAnimationFrame(() =>
      scrollFocusedInputIntoView(inputEl, { jumpToMemoSection: true }),
    );
    for (const ms of [50, 150, 350, 550, 850]) {
      window.setTimeout(
        () => scrollFocusedInputIntoView(inputEl, { jumpToMemoSection: true }),
        ms,
      );
    }
  }

  function runDatetimeScrollPasses(inputEl) {
    const scrollOnce = () =>
      scrollFocusedInputIntoView(inputEl, { jumpToMemoSection: false });
    scrollOnce();
    requestAnimationFrame(scrollOnce);
    for (const ms of [50, 150, 350]) {
      window.setTimeout(scrollOnce, ms);
    }
  }

  function setMemoKeyboardScroll(on) {
    scrollArea?.classList?.toggle("is-memo-keyboard-open", !!on);
    if (on) applyMemoScrollBottomSpace();
    else clearMemoScrollBottomSpace();
  }

  function restoreMemoScrollPosition() {
    memoActiveInput = null;
    setMemoKeyboardScroll(false);
    clearMemoScrollBottomSpace();
    if (scrollArea instanceof HTMLElement) {
      scrollArea.scrollTop = scrollTopBeforeMemo;
    }
  }

  function exitMemoScroll() {
    restoreMemoScrollPosition();
    if (memoVvAdjust) {
      window.visualViewport?.removeEventListener("resize", memoVvAdjust.resize);
      window.visualViewport?.removeEventListener("scroll", memoVvAdjust.scroll);
      window.removeEventListener("resize", memoVvAdjust.resize);
    }
    memoVvAdjust = null;
  }

  function enterMemoScroll(inputEl) {
    if (!isMobileMemoUi()) return;
    if (!(inputEl instanceof HTMLElement)) return;
    if (!(scrollArea instanceof HTMLElement)) return;

    memoActiveInput = inputEl;
    scrollTopBeforeMemo = scrollArea.scrollTop;
    const isTimeField = isDatetimeInput(inputEl);
    setMemoKeyboardScroll(!isTimeField);
    syncVisualViewportKeyboardInset();
    lockPageScrollForModalKeyboard();
    if (isTimeField) runDatetimeScrollPasses(inputEl);
    else runMemoScrollPasses(inputEl);

    const adjustCore = (lockPage) => {
      const active = memoActiveInput;
      if (!active || !isAnyKeyboardInputFocused()) {
        exitMemoScroll();
        return;
      }
      syncVisualViewportKeyboardInset();
      if (lockPage) lockPageScrollForModalKeyboard();
      setMemoKeyboardScroll(!isDatetimeInput(active));
      scrollFocusedInputIntoView(active, {
        jumpToMemoSection: !isDatetimeInput(active),
      });
    };
    const adjustOnResize = () => adjustCore(true);
    const adjustOnScroll = () => adjustCore(false);

    if (memoVvAdjust && window.visualViewport) {
      window.visualViewport.removeEventListener("resize", memoVvAdjust.resize);
      window.visualViewport.removeEventListener("scroll", memoVvAdjust.scroll);
    }
    memoVvAdjust = { resize: adjustOnResize, scroll: adjustOnScroll };
    window.visualViewport?.addEventListener("resize", adjustOnResize, {
      passive: true,
    });
    window.visualViewport?.addEventListener("scroll", adjustOnScroll, {
      passive: true,
    });
    window.addEventListener("resize", adjustOnResize, { passive: true });
    adjustOnResize();
  }

  function bindMemoScrollMode(inputEl) {
    if (!(inputEl instanceof HTMLElement)) return;
    const onFocus = () => enterMemoScroll(inputEl);
    const onBlur = () => {
      window.setTimeout(() => {
        if (!isAnyKeyboardInputFocused()) exitMemoScroll();
      }, 0);
    };
    inputEl.addEventListener("focus", onFocus);
    inputEl.addEventListener("blur", onBlur);
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => {
        inputEl.removeEventListener("focus", onFocus);
        inputEl.removeEventListener("blur", onBlur);
      });
    }
  }

  function bindKeyboardShell() {
    keyboardShellAc?.abort();
    if (!isMobileMemoUi()) return;
    keyboardShellAc = new AbortController();
    const shellSignal = keyboardShellAc.signal;
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => keyboardShellAc?.abort());
    }
    resetViewportKeyboardBaseline();
    const runWithLock = () => {
      syncVisualViewportKeyboardInset();
      lockPageScrollForModalKeyboard();
    };
    const runInsetOnly = () => {
      syncVisualViewportKeyboardInset();
    };
    modal.addEventListener("focusin", runWithLock, {
      capture: true,
      signal: shellSignal,
    });
    window.visualViewport?.addEventListener("resize", runWithLock, {
      passive: true,
      signal: shellSignal,
    });
    window.visualViewport?.addEventListener("scroll", runInsetOnly, {
      passive: true,
      signal: shellSignal,
    });
    runWithLock();
    requestAnimationFrame(runWithLock);
    window.setTimeout(runWithLock, 120);
  }

  function bindAllMemoInputs() {
    modal.querySelectorAll(allKeyboardInputSelector).forEach((el) => {
      if (el instanceof HTMLElement) bindMemoScrollMode(el);
    });
  }

  function setShellOpen(open) {
    try {
      document.documentElement.classList.toggle(htmlOpenClass, !!open);
    } catch (_) {}
  }

  function unbind() {
    keyboardShellAc?.abort();
    keyboardShellAc = null;
    exitMemoScroll();
    setShellOpen(false);
  }

  setShellOpen(true);
  bindKeyboardShell();
  bindAllMemoInputs();

  if (opts.signal) {
    opts.signal.addEventListener("abort", unbind);
  }

  return { unbind, bindAllMemoInputs };
}
