import { dismissAppToast } from "./showToast.js";
import {
  LP_CONFIRM_STACK_CLASS,
  syncBodyOverflowAfterModalClose,
} from "./lpModalStack.js";

/**
 * 할 일·타임레저와 동일한 `time-task-setup-modal` 셸로 확인창을 띄우고, Promise로 결과를 돌려줍니다.
 * @param {{ title?: string, message: string, warnMessage?: string, confirmText?: string, cancelText?: string, confirmDanger?: boolean }} options
 * @returns {Promise<boolean>} 확인 시 true, 취소·닫기 시 false
 */
export function showConfirmModal(options = {}) {
  const {
    title = "확인",
    message,
    warnMessage,
    confirmText = "확인",
    cancelText = "취소",
    confirmDanger = false,
  } = options;

  if (typeof message !== "string" || !message.trim()) {
    return Promise.resolve(false);
  }

  dismissAppToast();

  return new Promise((resolve) => {
    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const modal = document.createElement("div");
    modal.className = `time-task-setup-modal ${LP_CONFIRM_STACK_CLASS}`;
    const confirmBtnClass = confirmDanger
      ? "todo-list-modal-confirm todo-list-confirm-btn--danger"
      : "todo-list-modal-confirm todo-list-confirm-delete";
    modal.innerHTML = `
      <div class="time-task-setup-backdrop"></div>
      <div class="time-task-setup-panel time-add-task-panel">
        <div class="time-task-setup-header">
          <h3 class="time-task-setup-title">${escapeHtml(title)}</h3>
          <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
        </div>
        <div class="time-task-setup-body todo-list-confirm-body">
          <p class="todo-list-confirm-message">${escapeHtml(message)}</p>
          ${warnMessage ? `<p class="todo-list-confirm-warn">${escapeHtml(warnMessage)}</p>` : ""}
        </div>
        <div class="time-task-log-footer">
          <button type="button" class="todo-list-modal-cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="${confirmBtnClass}">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    const closeBtn = modal.querySelector(".time-task-setup-close");
    const cancelBtn = modal.querySelector(".todo-list-modal-cancel");
    const confirmBtn = modal.querySelector(".todo-list-modal-confirm");

    function finish(value) {
      modal.remove();
      syncBodyOverflowAfterModalClose();
      resolve(value);
    }

    confirmBtn.addEventListener("click", () => finish(true));
    cancelBtn.addEventListener("click", () => finish(false));
    closeBtn.addEventListener("click", () => finish(false));

    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") finish(false);
    });

    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";
  });
}

/**
 * 확인만 있는 알림창(네이티브 alert 대체). `time-task-setup-modal` 셸.
 * @param {{ title?: string, message: string, confirmText?: string }} options
 * @returns {Promise<void>}
 */
export function showAlertModal(options = {}) {
  const { title = "알림", message, confirmText = "확인" } = options;

  if (typeof message !== "string" || !message.trim()) {
    return Promise.resolve();
  }

  dismissAppToast();

  return new Promise((resolve) => {
    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const modal = document.createElement("div");
    modal.className = `time-task-setup-modal ${LP_CONFIRM_STACK_CLASS} lp-alert-modal`;
    modal.innerHTML = `
      <div class="time-task-setup-backdrop"></div>
      <div class="time-task-setup-panel time-add-task-panel">
        <div class="time-task-setup-header">
          <h3 class="time-task-setup-title">${escapeHtml(title)}</h3>
          <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
        </div>
        <div class="time-task-setup-body todo-list-confirm-body">
          <p class="todo-list-confirm-message">${escapeHtml(message)}</p>
        </div>
        <div class="time-task-log-footer">
          <button type="button" class="todo-list-modal-confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    const closeBtn = modal.querySelector(".time-task-setup-close");
    const confirmBtn = modal.querySelector(".todo-list-modal-confirm");

    function finish() {
      modal.remove();
      syncBodyOverflowAfterModalClose();
      resolve();
    }

    confirmBtn.addEventListener("click", finish);
    closeBtn.addEventListener("click", finish);

    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") finish();
    });

    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";
  });
}

/** 표 행 삭제 전 확인(복구 불가 안내). 확인 시에만 `onConfirm` 실행 */
export function confirmDeleteRow(onConfirm) {
  return showConfirmModal({
    title: "행 삭제",
    message: "이 행을 삭제할까요?",
    warnMessage: "삭제 후에는 복구할 수 없습니다.",
    confirmText: "삭제",
    cancelText: "취소",
    confirmDanger: true,
  }).then((ok) => {
    if (ok) onConfirm();
  });
}

/** KPI 카드「할 일 목록」× 클릭 — 실수 삭제 방지 */
export function confirmKpiTodoDelete() {
  return showConfirmModal({
    title: "할 일 삭제",
    message: "이 할 일을 삭제할까요?",
    confirmText: "삭제",
    cancelText: "취소",
    confirmDanger: true,
  });
}
