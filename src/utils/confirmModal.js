/**
 * 할일 목록 등과 동일한 패널 스타일(todo-list-modal)로 확인창을 띄우고, Promise로 결과를 돌려줍니다.
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

  return new Promise((resolve) => {
    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const modal = document.createElement("div");
    modal.className = "todo-list-modal todo-list-confirm-modal";
    const confirmBtnClass = confirmDanger
      ? "todo-list-modal-confirm todo-list-confirm-btn--danger"
      : "todo-list-modal-confirm todo-list-confirm-delete";
    modal.innerHTML = `
      <div class="todo-list-modal-backdrop"></div>
      <div class="todo-list-modal-panel">
        <div class="todo-list-modal-header">
          <h3 class="todo-list-modal-title">${escapeHtml(title)}</h3>
          <button type="button" class="todo-list-modal-close" aria-label="닫기">×</button>
        </div>
        <div class="todo-list-modal-body todo-list-confirm-body">
          <p class="todo-list-confirm-message">${escapeHtml(message)}</p>
          ${warnMessage ? `<p class="todo-list-confirm-warn">${escapeHtml(warnMessage)}</p>` : ""}
        </div>
        <div class="todo-list-modal-footer">
          <button type="button" class="todo-list-modal-cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="${confirmBtnClass}">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    const backdrop = modal.querySelector(".todo-list-modal-backdrop");
    const closeBtn = modal.querySelector(".todo-list-modal-close");
    const cancelBtn = modal.querySelector(".todo-list-modal-cancel");
    const confirmBtn = modal.querySelector(".todo-list-modal-confirm");

    function finish(value) {
      modal.remove();
      document.body.style.overflow = "";
      resolve(value);
    }

    confirmBtn.addEventListener("click", () => finish(true));
    cancelBtn.addEventListener("click", () => finish(false));
    closeBtn.addEventListener("click", () => finish(false));
    backdrop.addEventListener("click", () => finish(false));

    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") finish(false);
    });

    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";
    cancelBtn.focus?.();
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
