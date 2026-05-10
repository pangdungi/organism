/**
 * KPI 할 일 / 매일 반복 할 일 — 추가 전용 모달(확인 시에만 저장 로직으로 이어지게 할 때 사용).
 * @param {{
 *   title?: string,
 *   kpiName?: string,
 *   inputLabel?: string,
 *   placeholder?: string,
 *   submitLabel?: string,
 * }} opts
 * @returns {Promise<string|null>} 확인 시 trim된 텍스트, 닫기·취소 시 null
 */
export function showKpiTodoAddModal(opts = {}) {
  const placeholder = opts.placeholder ?? "할 일을 입력하세요";
  const inputLabel = opts.inputLabel ?? "할 일";
  const title = opts.title ?? "할 일 추가";
  const submitLabel = opts.submitLabel ?? "추가";
  const kpiName = (opts.kpiName || "").trim();

  return new Promise((resolve) => {
    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const modal = document.createElement("div");
    modal.className = "dream-kpi-modal dream-kpi-todo-add-modal";
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
            <input type="text" name="text" placeholder="${escapeHtml(placeholder)}" autocomplete="off" />
          </div>
          <button type="submit" class="dream-kpi-submit">${escapeHtml(submitLabel)}</button>
        </form>
      </div>
    `;

    const prevOverflow = document.body.style.overflow;

    function finish(value) {
      modal.remove();
      document.body.style.overflow = prevOverflow;
      resolve(value);
    }

    const input = modal.querySelector('input[name="text"]');
    const form = modal.querySelector("form");

    modal.querySelector(".dream-kpi-modal-close").addEventListener("click", () => finish(null));
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", () => finish(null));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = (input.value || "").trim();
      if (!val) {
        input.focus();
        return;
      }
      finish(val);
    });

    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      }
    });

    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";
    queueMicrotask(() => input?.focus());
  });
}
