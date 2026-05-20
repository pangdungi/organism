/** 확인·삭제 안내 등 — 편집·추가·내부 모달(11000) 위에만 올림 */
export const LP_CONFIRM_STACK_CLASS = "lp-confirm-stack-modal";

const BODY_BLOCKING_MODAL_SELECTOR = [
  "body > .time-task-setup-modal:not(.lp-confirm-stack-modal)",
  "body > .todo-list-modal",
  "body > .diary-desktop-compose-modal",
  "body > .work-schedule-day-entry-modal",
  "body > .work-schedule-type-settings-modal",
].join(", ");

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
