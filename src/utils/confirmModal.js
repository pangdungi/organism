import { dismissAppToast } from "./showToast.js";
import {
  LP_CONFIRM_STACK_CLASS,
  syncBodyOverflowAfterModalClose,
  resolveLpModalStackZIndex,
  hasOpenLpConfirmModal,
} from "./lpModalStack.js";
import {
  SUBSCRIPTION_EXPIRED_MESSAGE,
  SUBSCRIPTION_RENEWAL_SHOP_URL,
  openSubscriptionRenewalShop,
} from "./subscriptionAccess.js";
import { openDeleteAccountModal } from "./deleteAccountModal.js";

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

  if (hasOpenLpConfirmModal()) {
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
    modal.style.zIndex = String(resolveLpModalStackZIndex());
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      confirmBtn?.focus({ preventScroll: true });
    });
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
    modal.style.zIndex = String(resolveLpModalStackZIndex());
    document.body.style.overflow = "hidden";
  });
}

/**
 * 구독 만료·이용 권한 없음 안내 (+ 갱신권 구매·회원 탈퇴).
 * @param {{ title?: string, message?: string, warnMessage?: string, deleteAccountText?: string, renewalText?: string, renewalUrl?: string, showRenewal?: boolean }} options
 * @returns {Promise<{ deleted?: boolean }>}
 */
export function showSubscriptionExpiredModal(options = {}) {
  const {
    title = "안내",
    message = SUBSCRIPTION_EXPIRED_MESSAGE,
    warnMessage = "갱신권 구매 후 다시 로그인해 주세요.",
    deleteAccountText = "회원 탈퇴하기",
    renewalText = "갱신권 구매하기",
    renewalUrl = SUBSCRIPTION_RENEWAL_SHOP_URL,
    showRenewal = true,
  } = options;

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
    modal.className = `time-task-setup-modal ${LP_CONFIRM_STACK_CLASS} lp-subscription-expired-modal`;
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
        <div class="time-task-log-footer lp-subscription-expired-footer">
          <button type="button" class="todo-list-modal-cancel lp-subscription-delete-btn">${escapeHtml(deleteAccountText)}</button>
          ${showRenewal ? `<button type="button" class="todo-list-modal-confirm lp-subscription-renewal-btn">${escapeHtml(renewalText)}</button>` : ""}
        </div>
      </div>
    `;

    const closeBtn = modal.querySelector(".time-task-setup-close");
    const deleteBtn = modal.querySelector(".lp-subscription-delete-btn");
    const renewalBtn = modal.querySelector(".lp-subscription-renewal-btn");

    function finish(result = {}) {
      modal.remove();
      syncBodyOverflowAfterModalClose();
      resolve(result);
    }

    renewalBtn?.addEventListener("click", () => {
      if (renewalUrl === SUBSCRIPTION_RENEWAL_SHOP_URL) {
        openSubscriptionRenewalShop();
      } else {
        try {
          window.open(renewalUrl, "_blank", "noopener,noreferrer");
        } catch (_) {
          window.location.href = renewalUrl;
        }
      }
    });
    deleteBtn.addEventListener("click", () => {
      modal.style.visibility = "hidden";
      void openDeleteAccountModal().then(({ deleted }) => {
        if (deleted) {
          finish({ deleted: true });
          return;
        }
        modal.style.visibility = "";
        document.body.style.overflow = "hidden";
      });
    });
    closeBtn.addEventListener("click", () => finish());

    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") finish();
    });

    document.body.appendChild(modal);
    modal.style.zIndex = String(resolveLpModalStackZIndex());
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      (renewalBtn || deleteBtn)?.focus({ preventScroll: true });
    });
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

/** KPI 수정 모달「이 행동 삭제하기」— 기록·할일까지 지워지므로 한 번 확인 */
export function confirmKpiActionDelete(kpiName) {
  const name = String(kpiName || "").trim();
  return showConfirmModal({
    title: "행동 삭제",
    message: name ? `「${name}」을(를) 삭제할까요?` : "이 행동을 삭제할까요?",
    warnMessage: "이 행동의 기록·할 일도 함께 삭제되며 복구할 수 없습니다.",
    confirmText: "삭제",
    cancelText: "취소",
    confirmDanger: true,
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
