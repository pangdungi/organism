import { allowModalInputFocus } from "./modalNoAutoFocus.js";
import { bindKpiTodoModalMobileKeyboard } from "./kpiTodoModalKeyboard.js";

/**
 * KPI 할 일 / 매일 반복 할 일 — 추가 전용 모달(확인 시에만 저장 로직으로 이어지게 할 때 사용).
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
    modal.className =
      "time-task-setup-modal dream-kpi-todo-add-modal lp-modal-compact";
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
            <label for="dream-kpi-todo-add-kpi-readonly">연결된 KPI</label>
            <p id="dream-kpi-todo-add-kpi-readonly" class="dream-kpi-todo-linked-kpi-name">${escapeHtml(kpiName)}</p>
          </div>`
              : ""
          }
          <div class="dream-kpi-field">
            <label>${escapeHtml(inputLabel)}</label>
            <input type="text" name="text" placeholder="${escapeHtml(placeholder)}" autocomplete="off" />
          </div>
          </div>
          <div data-legacy="time-task-log-footer">
            <button type="submit" data-legacy="time-task-log-submit">${escapeHtml(submitLabel)}</button>
          </div>
        </form>
      </div>
    `;

    const prevOverflow = document.body.style.overflow;
    let unbindKeyboard = () => {};

    function finish(value) {
      unbindKeyboard();
      modal.remove();
      document.body.style.overflow = prevOverflow;
      resolve(value);
    }

    const input = modal.querySelector('input[name="text"]');
    const form = modal.querySelector("form");

    modal.querySelector('[data-legacy~="time-task-setup-close"]').addEventListener("click", () => finish(null));
    /* 배경 탭으로 닫지 않음 — 입력 중 실수 닫힘 방지 (닫기는 ×만) */
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = (input.value || "").trim();
      if (!val) {
        allowModalInputFocus(input);
        input.focus();
        return;
      }
      finish(val);
    });

    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";
    unbindKeyboard = bindKpiTodoModalMobileKeyboard(modal, input);
  });
}
