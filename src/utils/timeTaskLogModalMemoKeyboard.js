/**
 * 과제 기록·예상 일정 모달 — 모바일 키보드 시 메모·입력란을 visualViewport 위로 스크롤
 */

import {
  isAndroidLikeMobile,
  lockPageScrollForModalKeyboard,
  readMobileKeyboardVisibleBand,
  resetViewportKeyboardBaseline,
  scheduleMobileKeyboardInsetSync,
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
    window.matchMedia("(max-width: 46rem)").matches
  );
}

function readVisibleBand() {
  return readMobileKeyboardVisibleBand(12);
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

  /** @type {{ resize: () => void } | null} */
  let memoVvAdjust = null;
  let memoActiveInput = null;
  let scrollTopBeforeMemo = 0;
  let memoScrollPadLocked = 0;
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

  function applyMemoScrollBottomSpace(force = false) {
    if (!(scrollArea instanceof HTMLElement)) return 0;
    if (!force && memoScrollPadLocked > 0) {
      scrollArea.style.setProperty(
        "--task-log-memo-scroll-pad",
        `${memoScrollPadLocked}px`,
      );
      return memoScrollPadLocked;
    }
    const kb = syncVisualViewportKeyboardInset();
    const vv = window.visualViewport;
    const vvGap =
      vv && vv.height > 0
        ? Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0))
        : 0;
    const pad = Math.max(kb, vvGap, 48);
    memoScrollPadLocked = pad;
    scrollArea.style.setProperty("--task-log-memo-scroll-pad", `${pad}px`);
    return pad;
  }

  function clearMemoScrollBottomSpace() {
    memoScrollPadLocked = 0;
    scrollArea?.style.removeProperty("--task-log-memo-scroll-pad");
  }

  /** 키보드 위 가시 영역 안으로 입력란 이동 */
  function scrollFocusedInputIntoView(inputEl) {
    if (!(inputEl instanceof HTMLElement)) return;
    if (!(scrollArea instanceof HTMLElement)) return;

    applyMemoScrollBottomSpace(true);
    syncVisualViewportKeyboardInset();
    const { top, bottom } = readVisibleBand();
    const pad = 14;
    const wantBottom = bottom - pad;
    const wantTop = top + pad;
    const rect = inputEl.getBoundingClientRect();

    if (rect.bottom > wantBottom) {
      scrollArea.scrollTop += rect.bottom - wantBottom;
    }
    const rect2 = inputEl.getBoundingClientRect();
    if (rect2.top < wantTop) {
      scrollArea.scrollTop -= wantTop - rect2.top;
    }
  }

  function runMemoScrollPasses(inputEl) {
    applyMemoScrollBottomSpace(true);
    const align = () => scrollFocusedInputIntoView(inputEl);
    align();
    requestAnimationFrame(align);
    window.setTimeout(align, 150);
    if (isAndroidLikeMobile()) {
      scheduleMobileKeyboardInsetSync(() => {
        if (document.activeElement !== inputEl) return;
        syncVisualViewportKeyboardInset();
        lockPageScrollForModalKeyboard();
        applyMemoScrollBottomSpace(true);
        align();
      });
    }
  }

  function runDatetimeScrollPasses(inputEl) {
    scrollFocusedInputIntoView(inputEl);
    requestAnimationFrame(() => scrollFocusedInputIntoView(inputEl));
    window.setTimeout(() => scrollFocusedInputIntoView(inputEl), 150);
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
      window.visualViewport?.removeEventListener(
        "resize",
        memoVvAdjust.resize,
      );
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

    const adjustOnResize = () => {
      const active = memoActiveInput;
      if (!active || !isAnyKeyboardInputFocused()) {
        exitMemoScroll();
        return;
      }
      syncVisualViewportKeyboardInset();
      lockPageScrollForModalKeyboard();
      setMemoKeyboardScroll(!isDatetimeInput(active));
      scrollFocusedInputIntoView(active);
    };

    if (memoVvAdjust && window.visualViewport) {
      window.visualViewport.removeEventListener("resize", memoVvAdjust.resize);
    }
    memoVvAdjust = { resize: adjustOnResize };
    window.visualViewport?.addEventListener("resize", adjustOnResize, {
      passive: true,
    });
    window.addEventListener("resize", adjustOnResize, { passive: true });
    adjustOnResize();
    if (isAndroidLikeMobile()) {
      scheduleMobileKeyboardInsetSync(() => {
        if (document.activeElement !== inputEl) return;
        adjustOnResize();
      }, [280, 480, 720]);
    }
  }

  function bindMemoScrollMode(inputEl) {
    if (!(inputEl instanceof HTMLElement)) return;
    const onFocus = () => enterMemoScroll(inputEl);
    const onBlur = () => {
      window.setTimeout(() => {
        if (!isAnyKeyboardInputFocused()) exitMemoScroll();
      }, 0);
    };
    const onInput = () => {
      if (memoActiveInput === inputEl) scrollFocusedInputIntoView(inputEl);
    };
    inputEl.addEventListener("focus", onFocus);
    inputEl.addEventListener("blur", onBlur);
    if (inputEl.tagName === "TEXTAREA") {
      inputEl.addEventListener("input", onInput);
    }
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => {
        inputEl.removeEventListener("focus", onFocus);
        inputEl.removeEventListener("blur", onBlur);
        inputEl.removeEventListener("input", onInput);
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
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        modal.contains(active) &&
        active.matches(allKeyboardInputSelector)
      ) {
        scrollFocusedInputIntoView(active);
      }
    };
    modal.addEventListener("focusin", runWithLock, {
      capture: true,
      signal: shellSignal,
    });
    window.visualViewport?.addEventListener("resize", runWithLock, {
      passive: true,
      signal: shellSignal,
    });
    runWithLock();
    requestAnimationFrame(runWithLock);
    if (isAndroidLikeMobile()) {
      scheduleMobileKeyboardInsetSync(runWithLock);
    } else {
      window.setTimeout(runWithLock, 120);
    }
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
