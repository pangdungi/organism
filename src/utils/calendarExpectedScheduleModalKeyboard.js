/**
 * 예상 일정 모달 전용 — iOS·Android 키보드 (과제 기록 공통 bind 사용 안 함)
 */

import {
  lockPageScrollForModalKeyboard,
  scheduleMobileKeyboardInsetSync,
} from "./mobileViewportKeyboard.js";

const EXPECTED_SHELL_CLASS = "lp-calendar-expected-keyboard-shell";
const TIME_INPUT_SELECTOR =
  '[data-legacy~="time-task-log-time-start"], [data-legacy~="time-task-log-time-end"]';
const MEMO_INPUT_SELECTOR =
  '[data-legacy~="time-task-log-memo-input"], [data-legacy~="time-task-log-feedback"]';
const ALL_INPUT_SELECTOR = `${TIME_INPUT_SELECTOR}, ${MEMO_INPUT_SELECTOR}, .time-task-log-task-dropdown-search, [data-legacy~="time-task-log-task-dropdown-search"]`;

function isMobileModalUi() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 46rem)").matches
  );
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

/** iOS — visualViewport 높이를 모달 shell에 직접 (html --vv-visible-height 는 812px로 남는 경우 있음) */
function applyExpectedShellGeometry(modal, scrollArea) {
  const vv = window.visualViewport;
  const fallbackH = window.innerHeight;
  const top = vv?.offsetTop || 0;
  const visible = Math.max(160, vv?.height || fallbackH);
  const kb = Math.max(48, fallbackH - visible - top);

  modal.style.setProperty("--lp-expected-shell-top", `${top}px`);
  modal.style.setProperty("--lp-expected-shell-height", `${visible}px`);
  modal.style.setProperty("--lp-expected-kb", `${kb}px`);

  if (scrollArea instanceof HTMLElement) {
    scrollArea.style.setProperty("--lp-expected-kb", `${kb}px`);
  }

  const margin = 14;
  return {
    top: top + margin,
    bottom: top + visible - margin,
    kb,
    visible,
  };
}

function clearExpectedShellGeometry(modal, scrollArea) {
  modal.style.removeProperty("--lp-expected-shell-top");
  modal.style.removeProperty("--lp-expected-shell-height");
  modal.style.removeProperty("--lp-expected-kb");
  scrollArea?.style.removeProperty("--lp-expected-kb");
  scrollArea?.style.removeProperty("--lp-expected-scroll-pad");
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

function findMemoAnchor(inputEl) {
  if (!(inputEl instanceof HTMLElement)) return inputEl;
  const field = inputEl.closest('[data-legacy~="time-task-log-field"]');
  return field instanceof HTMLElement ? field : inputEl;
}

function readExpectedVisibleBand() {
  const vv = window.visualViewport;
  const margin = 16;
  if (!vv) {
    return { top: margin, bottom: window.innerHeight - margin };
  }
  return {
    top: (vv.offsetTop || 0) + margin,
    bottom: (vv.offsetTop || 0) + vv.height - margin,
  };
}

function scrollAnchorIntoBand(scrollArea, anchor, wantTop, wantBottom) {
  if (!(scrollArea instanceof HTMLElement)) return;
  if (!(anchor instanceof HTMLElement)) return;

  let rect = anchor.getBoundingClientRect();
  if (rect.bottom > wantBottom) {
    scrollArea.scrollTop += rect.bottom - wantBottom;
  }
  rect = anchor.getBoundingClientRect();
  if (rect.top < wantTop) {
    scrollArea.scrollTop -= wantTop - rect.top;
  }
}

/** 메모 — 레이블+입력+커서가 키보드·액세서리 바로 위에 보이게 (수동 스크롤 불필요) */
function scrollExpectedMemoIntoView(modal, scrollArea, inputEl) {
  if (!(inputEl instanceof HTMLElement)) return;
  if (!(scrollArea instanceof HTMLElement)) return;

  applyExpectedShellGeometry(modal, scrollArea);
  const { top: wantTop, bottom: wantBottom } = readExpectedVisibleBand();
  const anchor = findMemoAnchor(inputEl);
  const vv = window.visualViewport;
  const pad = vv
    ? Math.max(72, window.innerHeight - vv.height - (vv.offsetTop || 0))
    : 72;
  scrollArea.style.setProperty("--lp-expected-scroll-pad", `${pad}px`);

  scrollAnchorIntoBand(scrollArea, anchor, wantTop, wantBottom);

  let inputRect = inputEl.getBoundingClientRect();
  if (inputRect.bottom > wantBottom) {
    scrollArea.scrollTop += inputRect.bottom - wantBottom;
  }
  inputRect = inputEl.getBoundingClientRect();
  if (inputRect.top < wantTop) {
    scrollArea.scrollTop -= wantTop - inputRect.top;
  }
}

function scrollExpectedDatetimeIntoView(modal, scrollArea, inputEl) {
  if (!(inputEl instanceof HTMLElement)) return;
  if (!(scrollArea instanceof HTMLElement)) return;

  applyExpectedShellGeometry(modal, scrollArea);
  const { top: wantTop, bottom: wantBottom } = readExpectedVisibleBand();
  scrollAnchorIntoBand(scrollArea, findDatetimeAnchor(inputEl), wantTop, wantBottom);
}

function scrollExpectedFieldIntoView(modal, scrollArea, inputEl) {
  if (!(inputEl instanceof HTMLElement)) return;
  if (inputEl.matches(MEMO_INPUT_SELECTOR)) {
    scrollExpectedMemoIntoView(modal, scrollArea, inputEl);
    return;
  }
  if (inputEl.matches(TIME_INPUT_SELECTOR)) {
    scrollExpectedDatetimeIntoView(modal, scrollArea, inputEl);
    return;
  }
  applyExpectedShellGeometry(modal, scrollArea);
  const { top, bottom } = readExpectedVisibleBand();
  scrollAnchorIntoBand(scrollArea, inputEl, top, bottom);
}

function runMemoScrollPasses(modal, scrollArea, inputEl) {
  const run = () => scrollExpectedMemoIntoView(modal, scrollArea, inputEl);
  run();
  requestAnimationFrame(run);
  scheduleMobileKeyboardInsetSync(run, [0, 120, 280, 480, 720]);
}

function setExpectedMemoScrollMode(scrollArea, on) {
  scrollArea?.classList?.toggle("is-expected-memo-kb-open", !!on);
}

function bindExpectedScheduleKeyboardShell(modal, scrollArea, signal) {
  if (!isMobileModalUi()) return;

  const syncShell = () => {
    if (!modal.isConnected) return;
    lockPageScrollForModalKeyboard();

    const active = document.activeElement;
    const inputFocused =
      active instanceof HTMLElement &&
      modal.contains(active) &&
      isModalTextInput(active);

    if (!inputFocused) return;

    applyExpectedShellGeometry(modal, scrollArea);
    setExpectedMemoScrollMode(
      scrollArea,
      !!(active instanceof HTMLElement && active.matches(MEMO_INPUT_SELECTOR)),
    );

    try {
      document.documentElement.classList.add("lp-keyboard-open");
      document.documentElement.classList.add(EXPECTED_SHELL_CLASS);
    } catch (_) {}

    if (active.matches(MEMO_INPUT_SELECTOR)) {
      runMemoScrollPasses(modal, scrollArea, active);
    } else {
      scrollExpectedFieldIntoView(modal, scrollArea, active);
    }
  };

  modal.addEventListener("focusin", syncShell, { capture: true, signal });
  window.visualViewport?.addEventListener("resize", syncShell, {
    passive: true,
    signal,
  });
  window.visualViewport?.addEventListener("scroll", syncShell, {
    passive: true,
    signal,
  });

  modal.addEventListener(
    "focusout",
    () => {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && modal.contains(active)) return;
        setExpectedMemoScrollMode(scrollArea, false);
        clearExpectedShellGeometry(modal, scrollArea);
        try {
          document.documentElement.classList.remove(EXPECTED_SHELL_CLASS);
        } catch (_) {}
      }, 120);
    },
    { capture: true, signal },
  );

  scheduleMobileKeyboardInsetSync(syncShell, [0, 80, 180, 320, 520]);
}

function bindExpectedScheduleFieldScroll(modal, scrollArea, signal) {
  if (!isMobileModalUi()) return;
  if (!(scrollArea instanceof HTMLElement)) return;

  modal.querySelectorAll(ALL_INPUT_SELECTOR).forEach((el) => {
    if (!(el instanceof HTMLElement)) return;

    const align = () => {
      if (document.activeElement !== el) return;
      scrollExpectedFieldIntoView(modal, scrollArea, el);
    };

    el.addEventListener(
      "focus",
      () => {
        if (el.matches(MEMO_INPUT_SELECTOR)) {
          runMemoScrollPasses(modal, scrollArea, el);
        } else {
          align();
          requestAnimationFrame(align);
          scheduleMobileKeyboardInsetSync(align, [120, 280, 480]);
        }
      },
      { signal },
    );

    if (el.tagName === "TEXTAREA") {
      el.addEventListener("input", () => {
        if (document.activeElement === el) {
          scrollExpectedMemoIntoView(modal, scrollArea, el);
        }
      }, { signal });
    }
  });
}

export function bindExpectedScheduleModalKeyboard(modal, scrollArea, signal) {
  bindExpectedScheduleKeyboardShell(modal, scrollArea, signal);
  bindExpectedScheduleFieldScroll(modal, scrollArea, signal);
}

export function clearExpectedScheduleModalKeyboardShell(modal, scrollArea) {
  try {
    document.documentElement.classList.remove(EXPECTED_SHELL_CLASS);
  } catch (_) {}
  setExpectedMemoScrollMode(scrollArea, false);
  if (modal instanceof HTMLElement) clearExpectedShellGeometry(modal, scrollArea);
}
