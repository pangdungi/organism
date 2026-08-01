/**
 * 모달·오버레이 — 사용자가 입력칸(또는 날짜 영역)을 직접 탭하기 전까지 키보드 금지.
 * focus() 후 blur 하면 키보드가 깜빡이므로, programmatic focus() 차단 + readonly 가드 + 오픈 직후 유예.
 */

const FOCUSABLE_INPUT_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]';

const TEXT_LIKE_INPUT_SELECTOR =
  'input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"], input[type="number"], input:not([type]), textarea';

const MODAL_ROOT_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  ".time-task-setup-modal",
  "[data-legacy~='time-task-setup-modal']",
  ".todo-list-modal",
  ".diary-desktop-compose-modal",
  ".auth-pw-modal",
  ".app-toast-modal",
  ".gantt-modal",
  ".routine-add-modal",
  ".lp-pwa-install-modal",
  ".idea-delete-account-modal",
  ".diary-tr-invest-detail-modal",
  ".calendar-event-bubble",
  ".calendar-day-expand-overlay",
  ".time-task-log-todo-inner-modal",
  ".time-task-log-expense-inner-modal",
  ".lp-calendar-budget-add-modal",
].join(", ");

const DATE_WRAP_SELECTOR =
  ".time-task-log-date-native-wrap, .todo-task-edit-native-slot, [data-legacy~='todo-task-edit-native-slot']";

/** 모달 오픈 직후 터치가 입력칸으로 전달되는 ghost click 차단(ms) */
const MODAL_OPEN_FOCUS_GRACE_MS = 450;

/** @type {HTMLElement | null} */
let userAllowedFocusTarget = null;
/** @type {HTMLElement | null} */
let pendingFocusFromPointer = null;
/** @type {number} */
let modalFocusGraceUntil = 0;

let focusPatchInstalled = false;
let observersInstalled = false;

function isModalRoot(el) {
  if (!(el instanceof Element)) return false;
  if (el.matches(MODAL_ROOT_SELECTOR)) return true;
  for (const cls of el.classList) {
    if (cls.endsWith("-modal") || cls.endsWith("-overlay")) return true;
  }
  return false;
}

function findModalRoot(el) {
  if (!(el instanceof Element)) return null;
  const direct = el.closest(MODAL_ROOT_SELECTOR);
  if (direct) return direct;
  let node = el;
  while (node instanceof Element) {
    if (isModalRoot(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function isInModalOpenGracePeriod() {
  return Date.now() < modalFocusGraceUntil;
}

export function markModalOpened() {
  modalFocusGraceUntil = Date.now() + MODAL_OPEN_FOCUS_GRACE_MS;
}

/** 아이콘 검색 등 — 자동 키보드 가드 제외 */
function isKbAllowListed(el) {
  return el instanceof HTMLElement && el.dataset.lpKbAllow === "1";
}

/** @param {Element} el */
function shouldBlockModalInputFocus(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (!el.matches(FOCUSABLE_INPUT_SELECTOR)) return false;
  if (isKbAllowListed(el)) return false;
  if (!findModalRoot(el)) return false;
  if (el === userAllowedFocusTarget) return false;
  return true;
}

function installFocusPatch() {
  if (focusPatchInstalled) return;
  focusPatchInstalled = true;
  const nativeFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function focusWithoutModalAutoKeyboard(options) {
    if (shouldBlockModalInputFocus(this)) return;
    return nativeFocus.call(this, options);
  };
}

/** @param {HTMLElement} inp */
function unlockModalInput(inp) {
  if (!(inp instanceof HTMLElement)) return;
  if (inp.dataset.lpKbGuard === "1") {
    inp.readOnly = false;
    delete inp.dataset.lpKbGuard;
  }
  if (inp.dataset.lpKbGuardCe === "1") {
    inp.setAttribute("contenteditable", "true");
    delete inp.dataset.lpKbGuardCe;
  }
  inp.dataset.lpKbUser = "1";
  try {
    inp.removeAttribute("autofocus");
  } catch (_) {}
}

/** @param {Element} root */
function guardModalInputs(root) {
  if (!(root instanceof Element)) return;
  const roots = [];
  if (isModalRoot(root)) roots.push(root);
  root.querySelectorAll(MODAL_ROOT_SELECTOR).forEach((el) => roots.push(el));
  if (!roots.length && root.querySelector(FOCUSABLE_INPUT_SELECTOR)) roots.push(root);

  roots.forEach((modalEl) => {
    modalEl.querySelectorAll(FOCUSABLE_INPUT_SELECTOR).forEach((inp) => {
      if (!(inp instanceof HTMLElement)) return;
      try {
        inp.removeAttribute("autofocus");
      } catch (_) {}
      /* 이미 사용자가 잠금 해제했거나 검색 허용 필드는 다시 잠그지 않음 */
      if (isKbAllowListed(inp) || inp.dataset.lpKbUser === "1") {
        unlockModalInput(inp);
        return;
      }
      if (inp.matches(TEXT_LIKE_INPUT_SELECTOR)) {
        inp.readOnly = true;
        inp.dataset.lpKbGuard = "1";
      } else if (inp.matches('[contenteditable="true"]')) {
        inp.setAttribute("contenteditable", "false");
        inp.dataset.lpKbGuardCe = "1";
      }
    });
  });
}

function onModalNodeShown(node) {
  markModalOpened();
  guardModalInputs(node);
}

function installModalObservers() {
  if (observersInstalled || typeof document === "undefined") return;
  observersInstalled = true;

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (isModalRoot(node) || node.querySelector(MODAL_ROOT_SELECTOR)) {
            onModalNodeShown(node);
          }
        });
      }
      if (m.type === "attributes" && m.attributeName === "hidden") {
        const el = m.target;
        if (el instanceof HTMLElement && isModalRoot(el) && !el.hidden) {
          onModalNodeShown(el);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
}

/** @param {HTMLElement | null | undefined} el */
export function allowModalInputFocus(el) {
  if (el instanceof HTMLElement && el.matches(FOCUSABLE_INPUT_SELECTOR)) {
    unlockModalInput(el);
    userAllowedFocusTarget = el;
  }
}

import { syncBodyOverflowAfterModalClose } from "./lpModalStack.js";

/** 할일·일정 추가/수정 모달 중복 방지(배경 누적 어두워짐) */
export function closeDuplicateTodoAddModals() {
  const open = document.querySelectorAll(".time-task-setup-modal.time-add-task-modal");
  if (!open.length) return;
  open.forEach((el) => {
    try {
      el.remove();
    } catch (_) {}
  });
  syncBodyOverflowAfterModalClose();
}

/**
 * 텍스트 입력에서 Enter(모바일 키보드 완료 포함) → 확인 버튼 1회만.
 * @param {HTMLElement} modalRoot
 * @param {HTMLElement | null | undefined} confirmEl
 * @param {{ inputSelector?: string }} [opts]
 */
export function wireModalEnterToConfirm(modalRoot, confirmEl, opts = {}) {
  if (!(modalRoot instanceof HTMLElement) || !confirmEl) return;
  const sel =
    opts.inputSelector ??
    'input[type="text"], input[type="search"], input:not([type="date"]):not([type="hidden"]), textarea';
  modalRoot.querySelectorAll(sel).forEach((inp) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      if (inp.tagName === "TEXTAREA" && e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      confirmEl.click();
    });
  });
}

/** @param {EventTarget | null} target */
function resolveInputFromPointerTarget(target) {
  if (!(target instanceof Element)) return null;
  if (target.matches(FOCUSABLE_INPUT_SELECTOR)) {
    return /** @type {HTMLElement} */ (target);
  }
  const label = target.closest("label");
  if (label) {
    const id = label.htmlFor;
    if (id) {
      const linked = document.getElementById(id);
      if (linked instanceof HTMLElement && linked.matches(FOCUSABLE_INPUT_SELECTOR)) {
        return linked;
      }
    }
    const inner = label.querySelector(FOCUSABLE_INPUT_SELECTOR);
    if (inner instanceof HTMLElement) return inner;
  }
  const dateWrap = target.closest(DATE_WRAP_SELECTOR);
  if (dateWrap) {
    const inp = dateWrap.querySelector(
      'input[type="date"], input[type="datetime-local"], input[type="time"], [data-legacy~="todo-task-edit-native-dt-input"]',
    );
    if (inp instanceof HTMLElement) return inp;
  }
  if (
    target.closest(
      ".time-task-log-date-overlay, .todo-task-edit-native-date-overlay, [data-legacy~='todo-task-edit-native-date-overlay']",
    )
  ) {
    const wrap = target.closest(DATE_WRAP_SELECTOR);
    const inp = wrap?.querySelector(
      'input[type="date"], input[type="datetime-local"], [data-legacy~="todo-task-edit-native-dt-input"]',
    );
    if (inp instanceof HTMLElement) return inp;
  }
  return null;
}

export function initModalNoAutoFocus() {
  installFocusPatch();
  installModalObservers();

  document.addEventListener(
    "pointerdown",
    (e) => {
      const inp = resolveInputFromPointerTarget(e.target);
      if (!inp || !findModalRoot(inp)) {
        pendingFocusFromPointer = null;
        return;
      }
      if (isKbAllowListed(inp)) {
        unlockModalInput(inp);
        pendingFocusFromPointer = inp;
        userAllowedFocusTarget = inp;
        return;
      }
      if (isInModalOpenGracePeriod()) {
        /* 유예 중 탭은 무시하지 말고, 유예 끝나면 잠금 해제(빠른 탭 시 검색 먹통 방지) */
        pendingFocusFromPointer = inp;
        const target = inp;
        const unlockAt = modalFocusGraceUntil;
        window.setTimeout(() => {
          if (pendingFocusFromPointer !== target && document.activeElement !== target) {
            return;
          }
          if (Date.now() < unlockAt) return;
          unlockModalInput(target);
          userAllowedFocusTarget = target;
          try {
            target.focus({ preventScroll: true });
          } catch (_) {
            try {
              target.focus();
            } catch (_) {}
          }
        }, Math.max(0, unlockAt - Date.now()) + 16);
        return;
      }
      unlockModalInput(inp);
      pendingFocusFromPointer = inp;
      userAllowedFocusTarget = inp;
    },
    true,
  );

  document.addEventListener(
    "focusin",
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !t.matches(FOCUSABLE_INPUT_SELECTOR)) return;
      if (!findModalRoot(t)) return;

      if (isKbAllowListed(t)) {
        unlockModalInput(t);
        pendingFocusFromPointer = null;
        return;
      }

      if (isInModalOpenGracePeriod()) {
        try {
          t.blur();
        } catch (_) {}
        return;
      }

      if (pendingFocusFromPointer === t || userAllowedFocusTarget === t) {
        unlockModalInput(t);
        pendingFocusFromPointer = null;
        userAllowedFocusTarget = null;
      }
    },
    true,
  );
}

installFocusPatch();
