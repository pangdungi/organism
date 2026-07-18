import { allowModalInputFocus } from "./modalNoAutoFocus.js";
import { bindKpiTodoModalMobileKeyboard } from "./kpiTodoModalKeyboard.js";
import { normalizeKpiNoteTags } from "./sideincomeKpiNotesSupabase.js";

/**
 * 시급상승 KPI 기록 — 추가·수정 모달
 * @param {{
 *   mode?: "add" | "edit",
 *   kpiName?: string,
 *   note?: { tags?: string[], memo?: string },
 * }} [opts]
 * @returns {Promise<null | { action: "save", tags: string[], memo: string } | { action: "delete" }>}
 */
export function showSideincomeKpiNoteModal(opts = {}) {
  const mode = opts.mode === "edit" ? "edit" : "add";
  const kpiName = (opts.kpiName || "").trim();
  const initialMemo = String(opts.note?.memo || "").trim();
  const title = mode === "edit" ? "기록 수정" : "기록 추가";
  const submitLabel = mode === "edit" ? "저장" : "추가";

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
      "time-task-setup-modal dream-kpi-note-modal lp-modal-compact";
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
            <label for="dream-kpi-note-kpi-readonly">연결된 KPI</label>
            <p id="dream-kpi-note-kpi-readonly" class="dream-kpi-todo-linked-kpi-name">${escapeHtml(kpiName)}</p>
          </div>`
              : ""
          }
          <div class="dream-kpi-field dream-kpi-note-tags-field">
            <label for="dream-kpi-note-tag-input">태그</label>
            <div class="dream-kpi-note-tags-input-row">
              <input id="dream-kpi-note-tag-input" type="text" name="tagDraft" placeholder="태그 입력" autocomplete="off" />
              <button type="button" class="dream-kpi-note-tag-add-btn" data-lp-kpi-note-tag-add aria-label="태그 추가">+</button>
            </div>
            <div class="dream-kpi-note-tags-chips" data-lp-kpi-note-tags-list aria-live="polite"></div>
          </div>
          <div class="dream-kpi-field dream-kpi-note-memo-field">
            <label for="dream-kpi-note-memo">메모</label>
            <textarea id="dream-kpi-note-memo" name="memo" rows="4" placeholder="아이디어·메모">${escapeHtml(initialMemo)}</textarea>
          </div>
          </div>
          <div data-legacy="time-task-log-footer" class="dream-kpi-note-modal-footer">
            ${
              mode === "edit"
                ? `<button type="button" class="dream-kpi-note-delete-btn" data-lp-kpi-note-delete>삭제</button>`
                : ""
            }
            <button type="submit" data-legacy="time-task-log-submit">${escapeHtml(submitLabel)}</button>
          </div>
        </form>
      </div>
    `;

    const prevOverflow = document.body.style.overflow;
    let unbindKeyboard = () => {};
    /** @type {string[]} */
    let tags = normalizeKpiNoteTags(opts.note?.tags);

    /** @param {null | { action: string, tags?: string[], memo?: string }} value */
    function finish(value) {
      unbindKeyboard();
      modal.remove();
      document.body.style.overflow = prevOverflow;
      resolve(value);
    }

    const tagInput = modal.querySelector("#dream-kpi-note-tag-input");
    const tagListEl = modal.querySelector("[data-lp-kpi-note-tags-list]");
    const tagAddBtn = modal.querySelector("[data-lp-kpi-note-tag-add]");
    const memoInput = modal.querySelector("#dream-kpi-note-memo");
    const tagField = modal.querySelector(".dream-kpi-note-tags-field");
    const memoField = modal.querySelector(".dream-kpi-note-memo-field");
    const form = modal.querySelector("form");

    function clearFieldError(field) {
      if (!(field instanceof HTMLElement)) return;
      field.classList.remove("dream-kpi-field--invalid");
      field.querySelector(".dream-kpi-field-error")?.remove();
    }

    function showFieldError(field, message) {
      if (!(field instanceof HTMLElement)) return;
      field.classList.add("dream-kpi-field--invalid");
      let err = field.querySelector(".dream-kpi-field-error");
      if (!err) {
        err = document.createElement("p");
        err.className = "dream-kpi-field-error";
        err.setAttribute("role", "alert");
        field.appendChild(err);
      }
      err.textContent = message;
    }

    function renderTagChips() {
      if (!(tagListEl instanceof HTMLElement)) return;
      tagListEl.replaceChildren();
      tags.forEach((tag, index) => {
        const chip = document.createElement("span");
        chip.className = "dream-kpi-note-tag-chip";
        chip.innerHTML = `<span class="dream-kpi-note-tag-chip-text">${escapeHtml(tag)}</span><button type="button" class="dream-kpi-note-tag-chip-remove" aria-label="태그 삭제">&times;</button>`;
        chip
          .querySelector(".dream-kpi-note-tag-chip-remove")
          ?.addEventListener("click", () => {
            tags = tags.filter((_, i) => i !== index);
            renderTagChips();
          });
        tagListEl.appendChild(chip);
      });
      tagListEl.hidden = tags.length === 0;
      if (tags.length) clearFieldError(tagField);
    }

    function addTagFromInput() {
      if (!(tagInput instanceof HTMLInputElement)) return false;
      const val = (tagInput.value || "").trim();
      if (!val) return false;
      const merged = normalizeKpiNoteTags([...tags, val]);
      tags = merged;
      tagInput.value = "";
      renderTagChips();
      clearFieldError(tagField);
      return true;
    }

    renderTagChips();

    modal
      .querySelector('[data-legacy~="time-task-setup-close"]')
      .addEventListener("click", () => finish(null));

    modal.querySelector("[data-lp-kpi-note-delete]")?.addEventListener("click", () => {
      finish({ action: "delete" });
    });

    tagAddBtn?.addEventListener("click", () => {
      addTagFromInput();
      allowModalInputFocus(tagInput);
      tagInput?.focus();
    });

    tagInput?.addEventListener("input", () => clearFieldError(tagField));
    tagInput?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      addTagFromInput();
    });

    memoInput?.addEventListener("input", () => clearFieldError(memoField));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearFieldError(tagField);
      clearFieldError(memoField);
      const memo = String(memoInput?.value || "").trim();
      if (!tags.length) {
        showFieldError(tagField, "+ 버튼을 눌러 태그를 추가해 주세요.");
        allowModalInputFocus(tagInput);
        tagInput?.focus();
        return;
      }
      if (!memo) {
        showFieldError(memoField, "메모를 입력해 주세요.");
        allowModalInputFocus(memoInput);
        memoInput?.focus();
        return;
      }
      finish({ action: "save", tags: [...tags], memo });
    });

    document.body.style.overflow = "hidden";
    document.body.appendChild(modal);
    unbindKeyboard = bindKpiTodoModalMobileKeyboard(modal, tagInput);
    requestAnimationFrame(() => {
      allowModalInputFocus(tagInput);
      tagInput?.focus();
    });
  });
}
