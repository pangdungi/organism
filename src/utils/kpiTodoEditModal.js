import { confirmKpiTodoDelete } from "./confirmModal.js";
import { allowModalInputFocus } from "./modalNoAutoFocus.js";
import { bindKpiTodoModalMobileKeyboard } from "./kpiTodoModalKeyboard.js";

/**
 * KPI 할 일 수정·삭제 모달 (저장·삭제 버튼을 눌렀을 때만 결과 반환).
 * @param {{
 *   title?: string,
 *   kpiName?: string,
 *   initialText?: string,
 *   inputLabel?: string,
 *   placeholder?: string,
 * }} opts
 * @returns {Promise<{ action: 'save', text: string } | { action: 'delete' } | null>}
 */
export function showKpiTodoEditModal(opts = {}) {
  const title = opts.title ?? "할 일 수정";
  const kpiName = (opts.kpiName || "").trim();
  const inputLabel = opts.inputLabel ?? "할 일";
  const placeholder = opts.placeholder ?? "";
  const linkedLabel = opts.linkedLabel ?? "연결된 KPI";

  return new Promise((resolve) => {
    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const modal = document.createElement("div");
    modal.className =
      "time-task-setup-modal dream-kpi-todo-edit-modal lp-modal-compact";
    modal.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">${escapeHtml(title)}</h3>
          <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
        </div>
        <form class="dream-kpi-form">
          <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
          ${
            kpiName
              ? `<div class="dream-kpi-field dream-kpi-todo-kpi-block">
            <label for="dream-kpi-todo-edit-kpi-readonly">${escapeHtml(linkedLabel)}</label>
            <p id="dream-kpi-todo-edit-kpi-readonly" class="dream-kpi-todo-linked-kpi-name">${escapeHtml(kpiName)}</p>
          </div>`
              : ""
          }
          <div class="dream-kpi-field">
            <label>${escapeHtml(inputLabel)}</label>
            <textarea name="text" rows="5" placeholder="${escapeHtml(placeholder)}" autocomplete="off"></textarea>
          </div>
          </div>
          <div data-legacy="time-task-log-footer" class="dream-kpi-todo-edit-modal-footer">
            <button type="button" data-legacy="time-task-log-delete-btn" class="dream-kpi-todo-edit-modal-delete">삭제</button>
            <button type="submit" data-legacy="time-task-log-submit">저장</button>
          </div>
        </form>
      </div>
    `;

    const prevOverflow = document.body.style.overflow;
    const ta = modal.querySelector('textarea[name="text"]');
    ta.value = opts.initialText ?? "";
    let unbindKeyboard = () => {};

    function finish(value) {
      unbindKeyboard();
      modal.remove();
      document.body.style.overflow = prevOverflow;
      resolve(value);
    }

    const form = modal.querySelector("form");
    const deleteBtn = modal.querySelector(".dream-kpi-todo-edit-modal-delete");

    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", () => finish(null));
    /* 배경 탭으로 닫지 않음 — 입력 중 실수 닫힘 방지 (닫기는 ×만) */

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = ta.value.trim();
      if (!val) {
        allowModalInputFocus(ta);
        ta.focus();
        return;
      }
      finish({ action: "save", text: val });
    });

    deleteBtn.addEventListener("click", async () => {
      if (!(await confirmKpiTodoDelete())) return;
      finish({ action: "delete" });
    });

    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";
    unbindKeyboard = bindKpiTodoModalMobileKeyboard(modal, ta);
  });
}
