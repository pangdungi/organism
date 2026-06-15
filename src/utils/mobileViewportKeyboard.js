/**
 * 모바일 PWA: iOS·Android에서 키보드가 올라와도 layout viewport(100vh)는 그대로인 경우가 많아
 * 입력란이 키보드·하단 탭에 가려짐. visualViewport로 키보드에 해당하는 높이를 --vv-keyboard 로 넣어
 * .app-main 하단 패딩을 늘려 스크롤 가능 영역을 확보한다.
 *
 * iOS(Safari·PWA)는 키보드 시 innerHeight 와 visualViewport 가 함께 줄어 vv-only 계산이 0이 될 수 있어
 * baseline innerHeight 로 layout shrink 도 감지한다.
 */

const KEYBOARD_OPEN_PX = 60;

/** @type {number} */
let _baselineInnerHeight = 0;

function readInnerHeight() {
  if (typeof window === "undefined") return 0;
  const h = window.innerHeight;
  return Number.isFinite(h) && h > 0 ? h : 0;
}

export function isIosLikeMobile() {
  if (typeof navigator === "undefined") return false;
  try {
    if (/iPad|iPhone|iPod/.test(navigator.userAgent || "")) return true;
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
      return true;
    if (/** @type {Navigator & { standalone?: boolean }} */ (navigator).standalone)
      return true;
  } catch (_) {}
  return false;
}

function isTaskLogPickerSearchFocused() {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  return el.matches(
    ".time-task-log-task-dropdown-search, [data-legacy~='time-task-log-task-dropdown-search']",
  );
}

export function isAndroidLikeMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

function isTaskLogMemoFieldFocused() {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  return el.matches(
    '[data-legacy~="time-task-log-memo-input"], [data-legacy~="time-task-log-feedback"], [data-legacy~="time-task-log-meal-detail-input"]',
  );
}

/** iOS 과제 검색·Android 메모: 모달 크기는 유지하고 스크롤 영역만 조정(iOS와 동일) */
export function shouldSkipTaskLogModalKeyboardReposition() {
  if (isIosLikeMobile() && isTaskLogPickerSearchFocused()) return true;
  if (isAndroidLikeMobile() && isTaskLogMemoFieldFocused()) return true;
  return false;
}

function isTextInputFocused() {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "SELECT") return true;
  if (el.tagName !== "INPUT") return false;
  const type = String(el.getAttribute("type") || "text").toLowerCase();
  return !["checkbox", "radio", "hidden", "button", "submit", "reset", "file"].includes(
    type,
  );
}

function refreshBaselineInnerHeight(force = false) {
  const h = readInnerHeight();
  if (!(h > 0)) return;
  if (force || h > _baselineInnerHeight) _baselineInnerHeight = h;
}

export function resetViewportKeyboardBaseline() {
  _baselineInnerHeight = readInnerHeight();
}

/**
 * @returns {number} 추정 키보드·하단 가림 높이(px)
 */
export function syncVisualViewportKeyboardInset() {
  if (typeof window === "undefined") {
    return 0;
  }
  refreshBaselineInnerHeight();
  const vv = window.visualViewport;
  if (!vv) {
    try {
      document.documentElement.style.setProperty("--vv-keyboard", "0px");
      document.documentElement.style.setProperty("--vv-visible-height", "100vh");
      document.documentElement.style.setProperty("--vv-offset-top", "0px");
      document.documentElement.classList.remove("lp-keyboard-open");
    } catch (_) {}
    return 0;
  }
  const h = readInnerHeight();
  const vvKb = Math.max(0, h - vv.height - (vv.offsetTop || 0));
  const layoutShrinkKb = Math.max(0, _baselineInnerHeight - h);
  const kb = Math.max(vvKb, layoutShrinkKb);
  const iosLayoutShrink = isIosLikeMobile() && layoutShrinkKb > vvKb + 8;
  const visibleHeight = iosLayoutShrink ? h : vv.height;
  try {
    document.documentElement.style.setProperty("--vv-keyboard", `${kb}px`);
    document.documentElement.style.setProperty(
      "--vv-visible-height",
      `${visibleHeight}px`,
    );
    document.documentElement.style.setProperty(
      "--vv-offset-top",
      `${vv.offsetTop || 0}px`,
    );
    document.documentElement.classList.toggle(
      "lp-keyboard-open",
      kb > KEYBOARD_OPEN_PX && !shouldSkipTaskLogModalKeyboardReposition(),
    );
  } catch (_) {}
  return kb;
}

/** iOS가 fixed 모달·페이지를 밀어 올리는 것을 줄이기 */
let _lockPageScrollActive = false;

export function lockPageScrollForModalKeyboard() {
  if (typeof window === "undefined") return;
  if (_lockPageScrollActive) return;
  _lockPageScrollActive = true;
  try {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  } catch (_) {}
  _lockPageScrollActive = false;
}

let _inited = false;

export function initMobileVisualViewportKeyboardInset() {
  if (_inited || typeof window === "undefined" || !window.visualViewport) return;
  _inited = true;
  resetViewportKeyboardBaseline();
  const run = () => syncVisualViewportKeyboardInset();
  window.visualViewport.addEventListener("resize", run, { passive: true });
  window.visualViewport.addEventListener("scroll", run, { passive: true });
  window.addEventListener("focusin", run, true);
  window.addEventListener(
    "focusout",
    () => {
      window.setTimeout(() => {
        if (!isTextInputFocused()) {
          resetViewportKeyboardBaseline();
          syncVisualViewportKeyboardInset();
        }
      }, 120);
    },
    true,
  );
  window.addEventListener(
    "orientationchange",
    () => {
      window.setTimeout(() => {
        resetViewportKeyboardBaseline();
        syncVisualViewportKeyboardInset();
      }, 160);
    },
    { passive: true },
  );
  window.addEventListener("pageshow", () => resetViewportKeyboardBaseline(), {
    passive: true,
  });
  run();
}

function isAuthGateTextInput(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (!el.closest(".login-page.login-page--gate")) return false;
  return el.matches(
    ".login-input--auth, .login-input--in-password-row, #forgot-pw-email",
  );
}

function readVisibleViewportBand() {
  const vv = window.visualViewport;
  if (!vv) {
    return { top: 0, bottom: window.innerHeight };
  }
  const top = vv.offsetTop || 0;
  return { top, bottom: top + vv.height };
}

function scrollAuthGateFieldIntoView(el) {
  const root = el?.closest?.(".auth-gate-body");
  const target =
    el instanceof HTMLElement
      ? el.closest(".login-field--auth") || el
      : null;
  if (!(root instanceof HTMLElement) || !(target instanceof HTMLElement)) return;

  const align = () => {
    syncVisualViewportKeyboardInset();
    const { top, bottom } = readVisibleViewportBand();
    const margin = 14;
    const visibleBottom = bottom - margin;
    const visibleTop = top + margin;
    let rect = target.getBoundingClientRect();
    if (rect.bottom > visibleBottom) {
      root.scrollTop += rect.bottom - visibleBottom;
    }
    rect = target.getBoundingClientRect();
    if (rect.top < visibleTop) {
      root.scrollTop += rect.top - visibleTop;
    }
  };

  align();
  requestAnimationFrame(align);
  window.setTimeout(align, 80);
  window.setTimeout(align, 240);
  window.setTimeout(align, 420);
}

let _authGateVvResizeBound = false;

function bindAuthGateViewportFollow() {
  if (_authGateVvResizeBound || !window.visualViewport) return;
  _authGateVvResizeBound = true;
  const onVv = () => {
    if (!document.documentElement.classList.contains("lp-auth-gate-focus")) return;
    const active = document.activeElement;
    if (isAuthGateTextInput(active)) scrollAuthGateFieldIntoView(active);
    else syncVisualViewportKeyboardInset();
  };
  window.visualViewport.addEventListener("resize", onVv, { passive: true });
  window.visualViewport.addEventListener("scroll", onVv, { passive: true });
}

function setAuthGateInputFocus(active) {
  try {
    document.documentElement.classList.toggle("lp-auth-gate-focus", active);
  } catch (_) {}
  if (active) bindAuthGateViewportFollow();
}

/** 로그인·회원가입 — 입력란이 키보드에 가리지 않게 (.auth-gate-body 안에서 스크롤) */
export function initAuthGateKeyboardScroll() {
  if (typeof document === "undefined") return;
  if (document.documentElement.dataset.lpAuthGateKbScroll === "1") return;
  document.documentElement.dataset.lpAuthGateKbScroll = "1";

  document.addEventListener(
    "focusin",
    (e) => {
      const t = e.target;
      if (!isAuthGateTextInput(t)) return;
      setAuthGateInputFocus(true);
      scrollAuthGateFieldIntoView(t);
    },
    true,
  );

  document.addEventListener(
    "focusout",
    () => {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (isAuthGateTextInput(active)) return;
        setAuthGateInputFocus(false);
        syncVisualViewportKeyboardInset();
      }, 120);
    },
    true,
  );
}
