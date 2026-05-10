import { confirmKpiTodoDelete } from "./confirmModal.js";

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

  return new Promise((resolve) => {
    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const modal = document.createElement("div");
    modal.className = "dream-kpi-modal dream-kpi-todo-edit-modal";
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel">
        <div class="dream-kpi-modal-header">
          <h3 class="dream-kpi-modal-title">${escapeHtml(title)}</h3>
          <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
        </div>
        <form class="dream-kpi-form">
          ${kpiName ? `<p class="dream-kpi-todo-add-modal-kpiname">${escapeHtml(kpiName)}</p>` : ""}
          <div class="dream-kpi-field">
            <label>${escapeHtml(inputLabel)}</label>
            <textarea name="text" rows="5" placeholder="${escapeHtml(placeholder)}" autocomplete="off"></textarea>
          </div>
          <button type="submit" class="dream-kpi-submit">저장</button>
          <div class="dream-kpi-delete-wrap dream-kpi-todo-edit-modal-delete-wrap">
            <button type="button" class="dream-kpi-delete-btn dream-kpi-todo-edit-modal-delete">삭제</button>
          </div>
        </form>
      </div>
    `;

    const prevOverflow = document.body.style.overflow;
    const ta = modal.querySelector('textarea[name="text"]');
    ta.value = opts.initialText ?? "";

    function finish(value) {
      modal.remove();
      document.body.style.overflow = prevOverflow;
      resolve(value);
    }

    const form = modal.querySelector("form");
    const deleteBtn = modal.querySelector(".dream-kpi-todo-edit-modal-delete");

    modal.querySelector(".dream-kpi-modal-close").addEventListener("click", () => finish(null));
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", () => finish(null));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = ta.value.trim();
      if (!val) {
        ta.focus();
        return;
      }
      finish({ action: "save", text: val });
    });

    deleteBtn.addEventListener("click", async () => {
      if (!(await confirmKpiTodoDelete())) return;
      finish({ action: "delete" });
    });

    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      }
    });

    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";
    queueMicrotask(() => ta?.focus());
  });
}
