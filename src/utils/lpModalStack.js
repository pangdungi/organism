/** 확인·삭제 안내 등 — 편집·추가·내부 모달(11000) 위에만 올림 */
export const LP_CONFIRM_STACK_CLASS = "lp-confirm-stack-modal";

const BODY_BLOCKING_MODAL_SELECTOR = [
  "body > .time-task-setup-modal:not(.lp-confirm-stack-modal)",
  "body > [data-legacy~='time-task-setup-modal']:not(.lp-confirm-stack-modal)",
  "body > .todo-list-modal",
  "body > .diary-desktop-compose-modal",
  "body > .work-schedule-day-entry-modal",
  "body > .work-schedule-type-settings-modal",
].join(", ");

const VISIBLE_MODAL_ZINDEX_SELECTOR = [
  ".time-task-setup-modal:not(.lp-confirm-stack-modal):not([hidden])",
  "[data-legacy~='time-task-setup-modal']:not(.lp-confirm-stack-modal):not([hidden])",
  ".todo-list-modal:not([hidden])",
  ".diary-desktop-compose-modal:not([hidden])",
].join(", ");

/** 열려 있는 모달 중 최대 z-index 위 — 과제 기록(2147483647) 위 확인창 */
export function resolveLpModalStackZIndex(base = 11010) {
  let max = base;
  try {
    document.querySelectorAll(VISIBLE_MODAL_ZINDEX_SELECTOR).forEach((node) => {
      const inline = parseInt(node.style.zIndex, 10);
      const computed = parseInt(getComputedStyle(node).zIndex, 10);
      for (const z of [inline, computed]) {
        if (!Number.isNaN(z) && z > max) max = z;
      }
    });
  } catch (_) {}
  return max + 1;
}

export function hasOpenLpConfirmModal() {
  try {
    return Boolean(
      document.querySelector(
        `.time-task-setup-modal.${LP_CONFIRM_STACK_CLASS}:not([hidden])`,
      ),
    );
  } catch (_) {
    return false;
  }
}

export function bodyHasBlockingModalOverlay() {
  try {
    return Boolean(document.querySelector(BODY_BLOCKING_MODAL_SELECTOR));
  } catch (_) {
    return false;
  }
}

/** 다른 body 모달이 남아 있으면 overflow 유지 */
export function syncBodyOverflowAfterModalClose() {
  try {
    if (bodyHasBlockingModalOverlay()) return;
    document.body.style.overflow = "";
  } catch (_) {}
}
