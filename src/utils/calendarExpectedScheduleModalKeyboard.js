/**
 * 예상 일정 모달 전용 — 모바일 키보드·스크롤 (과제 기록 모달 공통 코드는 건드리지 않음)
 */

import {
  lockPageScrollForModalKeyboard,
  readMobileKeyboardVisibleBand,
  scheduleMobileKeyboardInsetSync,
  syncVisualViewportKeyboardInset,
} from "./mobileViewportKeyboard.js";

const EXPECTED_SHELL_CLASS = "lp-calendar-expected-keyboard-shell";
const TIME_INPUT_SELECTOR =
  '[data-legacy~="time-task-log-time-start"], [data-legacy~="time-task-log-time-end"]';

function isMobileModalUi() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 46rem)").matches
  );
}

function findDatetimeAnchor(inputEl) {
  if (!(inputEl instanceof HTMLElement)) return inputEl;
  const wrap = inputEl.closest(
    '[data-legacy~="time-task-log-datetime-fields-wrap"]',
  );
  if (wrap instanceof HTMLElement) return wrap;
  const field = inputEl.closest('[data-legacy~="time-task-log-field"]');
  return field instanceof HTMLElement ? field : inputEl;
}

function isFullyVisible(anchor, wantTop, wantBottom) {
  const rect = anchor.getBoundingClientRect();
  return rect.top >= wantTop && rect.bottom <= wantBottom;
}

function scrollExpectedDatetimeIntoView(scrollArea, inputEl) {
  if (!(scrollArea instanceof HTMLElement)) return;
  if (!(inputEl instanceof HTMLElement)) return;

  syncVisualViewportKeyboardInset();
  const { top, bottom } = readMobileKeyboardVisibleBand(12);
  const pad = 14;
  const wantBottom = bottom - pad;
  const wantTop = top + pad;
  const anchor = findDatetimeAnchor(inputEl);

  if (isFullyVisible(anchor, wantTop, wantBottom)) return;

  let rect = anchor.getBoundingClientRect();
  if (rect.bottom > wantBottom) {
    scrollArea.scrollTop += rect.bottom - wantBottom;
    rect = anchor.getBoundingClientRect();
  }
  if (rect.top < wantTop) {
    scrollArea.scrollTop -= wantTop - rect.top;
  }
}

function clearMemoKeyboardScrollMode(scrollArea) {
  scrollArea?.classList?.remove("is-memo-keyboard-open");
  scrollArea?.style.removeProperty("--task-log-memo-scroll-pad");
}

function isModalTextInput(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  const type = String(el.getAttribute("type") || "text").toLowerCase();
  return !["checkbox", "radio", "hidden", "button", "submit", "reset", "file"].includes(
    type,
  );
}

/** 예상 일정 — 키보드 시 shell 올림(iOS 과제 검색 포함, 과제 기록과 분리) */
function bindExpectedScheduleKeyboardShell(modal, signal) {
  if (!isMobileModalUi()) return;

  const syncShell = () => {
    if (!modal.isConnected) return;
    syncVisualViewportKeyboardInset();
    lockPageScrollForModalKeyboard();
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !modal.contains(active)) return;
    if (!isModalTextInput(active)) return;
    try {
      document.documentElement.classList.add("lp-keyboard-open");
      document.documentElement.classList.add(EXPECTED_SHELL_CLASS);
    } catch (_) {}
  };

  modal.addEventListener("focusin", syncShell, { capture: true, signal });
  window.visualViewport?.addEventListener("resize", syncShell, {
    passive: true,
    signal,
  });
  modal.addEventListener(
    "focusout",
    () => {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && modal.contains(active)) return;
        try {
          document.documentElement.classList.remove(EXPECTED_SHELL_CLASS);
        } catch (_) {}
        syncVisualViewportKeyboardInset();
      }, 120);
    },
    { capture: true, signal },
  );
  scheduleMobileKeyboardInsetSync(syncShell, [0, 80, 180, 320]);
}

/** 예상 일정 — 시각 입력 시 메모까지 스크롤되지 않게 */
function bindExpectedScheduleDatetimeScroll(modal, scrollArea, signal) {
  if (!isMobileModalUi()) return;
  if (!(scrollArea instanceof HTMLElement)) return;

  modal.querySelectorAll(TIME_INPUT_SELECTOR).forEach((el) => {
    if (!(el instanceof HTMLElement)) return;

    const fixDatetimeScroll = () => {
      if (document.activeElement !== el) return;
      clearMemoKeyboardScrollMode(scrollArea);
      scrollExpectedDatetimeIntoView(scrollArea, el);
    };

    el.addEventListener(
      "focus",
      () => {
        clearMemoKeyboardScrollMode(scrollArea);
        fixDatetimeScroll();
        requestAnimationFrame(fixDatetimeScroll);
        scheduleMobileKeyboardInsetSync(fixDatetimeScroll, [0, 120, 280]);
      },
      { signal },
    );
  });
}

export function bindExpectedScheduleModalKeyboard(modal, scrollArea, signal) {
  bindExpectedScheduleKeyboardShell(modal, signal);
  bindExpectedScheduleDatetimeScroll(modal, scrollArea, signal);
}

export function clearExpectedScheduleModalKeyboardShell() {
  try {
    document.documentElement.classList.remove(EXPECTED_SHELL_CLASS);
  } catch (_) {}
}
