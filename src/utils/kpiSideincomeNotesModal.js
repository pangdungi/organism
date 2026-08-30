import { confirmKpiNoteDelete } from "./confirmModal.js";
import { allowModalInputFocus } from "./modalNoAutoFocus.js";
import { bindKpiTodoModalMobileKeyboard } from "./kpiTodoModalKeyboard.js";
import {
  getNoteTagIds,
  kpiNoteTagLabelsJoined,
  parseKpiNoteTagsInput,
} from "./sideincomeKpiNotesSupabase.js";

/**
 * @typedef {{
 *   titleAdd?: string,
 *   titleEdit?: string,
 *   tagLabel?: string,
 *   tagPlaceholder?: string,
 *   tagAddButton?: string,
 *   tagSuggestAria?: string,
 *   tagRequiredError?: string,
 *   memoLabel?: string,
 *   memoPlaceholder?: string,
 *   memoRequiredError?: string,
 * }} KpiNoteModalLabels
 */

const DEFAULT_KPI_NOTE_MODAL_LABELS = {
  titleAdd: "기록 추가",
  titleEdit: "기록 수정",
  tagLabel: "태그",
  tagPlaceholder: "태그 입력",
  tagAddButton: "+",
  tagSuggestAria: "기존 태그",
  tagRequiredError: "태그를 하나 이상 추가해 주세요.",
  memoLabel: "메모",
  memoPlaceholder: "아이디어·메모",
  memoRequiredError: "메모를 입력해 주세요.",
};

function normalizeTagLabelKey(label) {
  return String(label || "").trim().toLowerCase();
}

function initialTagLabelsFromNote(note, existingTags) {
  const joined = kpiNoteTagLabelsJoined(getNoteTagIds(note || {}), existingTags);
  return parseKpiNoteTagsInput(joined);
}

/**
 * KPI 기록 — 추가·수정 모달 (태그 칩 + 추가 버튼)
 * @param {{
 *   mode?: "add" | "edit",
 *   kpiName?: string,
 *   kpiId?: string,
 *   existingTags?: { id?: string, label?: string }[],
 *   note?: { tagIds?: string[], tagId?: string, memo?: string },
 *   labels?: KpiNoteModalLabels,
 * }} [opts]
 * @returns {Promise<null | { action: "save", tagLabels: string[], memo: string, noteId?: string } | { action: "delete" }>}
 */
export function showSideincomeKpiNoteModal(opts = {}) {
  const mode = opts.mode === "edit" ? "edit" : "add";
  const kpiName = (opts.kpiName || "").trim();
  const initialMemo = String(opts.note?.memo || "").trim();
  const existingTags = Array.isArray(opts.existingTags) ? opts.existingTags : [];
  const labels = { ...DEFAULT_KPI_NOTE_MODAL_LABELS, ...(opts.labels || {}) };
  const title = mode === "edit" ? labels.titleEdit : labels.titleAdd;
  const submitLabel = mode === "edit" ? "저장" : "추가";
  const noteId = String(opts.note?.id || "").trim();

  /** @type {string[]} */
  const selectedTagLabels = initialTagLabelsFromNote(opts.note || {}, existingTags);

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
            <label for="dream-kpi-note-kpi-readonly">연결된 행동</label>
            <p id="dream-kpi-note-kpi-readonly" class="dream-kpi-todo-linked-kpi-name">${escapeHtml(kpiName)}</p>
          </div>`
              : ""
          }
          <div class="dream-kpi-field dream-kpi-note-tags-field">
            <label for="dream-kpi-note-tag-input">${escapeHtml(labels.tagLabel)}</label>
            <div class="dream-kpi-note-tag-chips" data-lp-kpi-note-tag-chips hidden aria-live="polite"></div>
            <div class="dream-kpi-note-tag-input-row">
              <div class="dream-kpi-note-tag-input-wrap">
                <input id="dream-kpi-note-tag-input" type="text" name="tag" placeholder="${escapeHtml(labels.tagPlaceholder)}" autocomplete="off" />
                <div class="dream-kpi-note-tag-suggest" data-lp-kpi-note-tag-suggest hidden role="listbox" aria-label="${escapeHtml(labels.tagSuggestAria)}"></div>
              </div>
              <button type="button" class="dream-kpi-note-tag-add-btn" data-lp-kpi-note-tag-add aria-label="${escapeHtml(labels.tagLabel)} 추가">${escapeHtml(labels.tagAddButton)}</button>
            </div>
          </div>
          <div class="dream-kpi-field dream-kpi-note-memo-field">
            <label for="dream-kpi-note-memo">${escapeHtml(labels.memoLabel)}</label>
            <textarea id="dream-kpi-note-memo" name="memo" rows="4" placeholder="${escapeHtml(labels.memoPlaceholder)}">${escapeHtml(initialMemo)}</textarea>
          </div>
          </div>
          <div data-legacy="time-task-log-footer" class="dream-kpi-note-modal-footer">
            ${
              mode === "edit"
                ? `<button type="button" data-legacy="time-task-log-delete-btn" class="dream-kpi-note-delete-btn" data-lp-kpi-note-delete>삭제</button>`
                : ""
            }
            <button type="submit" data-legacy="time-task-log-submit">${escapeHtml(submitLabel)}</button>
          </div>
        </form>
      </div>
    `;

    const prevOverflow = document.body.style.overflow;
    let unbindKeyboard = () => {};
    let suggestIndex = -1;

    /** @param {null | { action: string, tagLabels?: string[], memo?: string, noteId?: string }} value */
    function finish(value) {
      unbindKeyboard();
      modal.remove();
      document.body.style.overflow = prevOverflow;
      resolve(value);
    }

    const tagInput = modal.querySelector("#dream-kpi-note-tag-input");
    const tagAddBtn = modal.querySelector("[data-lp-kpi-note-tag-add]");
    const chipsEl = modal.querySelector("[data-lp-kpi-note-tag-chips]");
    const suggestEl = modal.querySelector("[data-lp-kpi-note-tag-suggest]");
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

    function hasSelectedTag(label) {
      const key = normalizeTagLabelKey(label);
      return selectedTagLabels.some((t) => normalizeTagLabelKey(t) === key);
    }

    function renderTagChips() {
      if (!(chipsEl instanceof HTMLElement)) return;
      chipsEl.replaceChildren();
      if (!selectedTagLabels.length) {
        chipsEl.hidden = true;
        return;
      }
      chipsEl.hidden = false;
      selectedTagLabels.forEach((label, index) => {
        const chip = document.createElement("span");
        chip.className = "dream-kpi-note-tag-chip";
        chip.innerHTML = `<span class="dream-kpi-note-tag-chip-text">${escapeHtml(label)}</span><button type="button" class="dream-kpi-note-tag-chip-remove" aria-label="${escapeHtml(label)} 태그 삭제">&times;</button>`;
        chip
          .querySelector(".dream-kpi-note-tag-chip-remove")
          ?.addEventListener("click", (e) => {
            e.preventDefault();
            selectedTagLabels.splice(index, 1);
            renderTagChips();
            clearFieldError(tagField);
          });
        chipsEl.appendChild(chip);
      });
    }

    function addTagFromInput() {
      if (!(tagInput instanceof HTMLInputElement)) return false;
      const label = String(tagInput.value || "").trim();
      if (!label) return false;
      if (hasSelectedTag(label)) {
        tagInput.value = "";
        hideSuggest();
        return true;
      }
      selectedTagLabels.push(label);
      tagInput.value = "";
      renderTagChips();
      hideSuggest();
      clearFieldError(tagField);
      return true;
    }

    function matchingTags(query) {
      const q = String(query || "").trim().toLowerCase();
      if (!q) return [];
      return existingTags.filter((t) => {
        const label = String(t.label || "").trim();
        if (!label) return false;
        if (hasSelectedTag(label)) return false;
        return label.toLowerCase().includes(q);
      });
    }

    function hideSuggest() {
      if (!(suggestEl instanceof HTMLElement)) return;
      suggestEl.hidden = true;
      suggestEl.replaceChildren();
      suggestIndex = -1;
    }

    function addTagLabel(label) {
      const trimmed = String(label || "").trim();
      if (!trimmed || hasSelectedTag(trimmed)) {
        if (tagInput instanceof HTMLInputElement) tagInput.value = "";
        hideSuggest();
        return;
      }
      selectedTagLabels.push(trimmed);
      if (tagInput instanceof HTMLInputElement) tagInput.value = "";
      renderTagChips();
      hideSuggest();
      clearFieldError(tagField);
    }

    function renderSuggest() {
      if (!(tagInput instanceof HTMLInputElement) || !(suggestEl instanceof HTMLElement)) {
        return;
      }
      const query = String(tagInput.value || "").trim();
      const hits = matchingTags(query);
      suggestEl.replaceChildren();
      suggestIndex = -1;
      if (!query || !hits.length) {
        suggestEl.hidden = true;
        return;
      }
      hits.slice(0, 8).forEach((tag, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dream-kpi-note-tag-suggest-item";
        btn.setAttribute("role", "option");
        btn.dataset.suggestIndex = String(i);
        btn.textContent = String(tag.label || "").trim();
        btn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          addTagLabel(tag.label);
        });
        suggestEl.appendChild(btn);
      });
      suggestEl.hidden = false;
    }

    function highlightSuggest(index) {
      if (!(suggestEl instanceof HTMLElement)) return;
      const items = suggestEl.querySelectorAll(".dream-kpi-note-tag-suggest-item");
      items.forEach((el, i) => {
        el.classList.toggle("is-active", i === index);
      });
    }

    function pickHighlightedSuggest() {
      if (!(suggestEl instanceof HTMLElement) || suggestEl.hidden) return false;
      const items = suggestEl.querySelectorAll(".dream-kpi-note-tag-suggest-item");
      if (!items.length) return false;
      const idx = suggestIndex >= 0 ? suggestIndex : 0;
      const query = String(tagInput?.value || "").trim();
      const hits = matchingTags(query);
      const tag = hits[idx];
      if (!tag) return false;
      addTagLabel(tag.label);
      return true;
    }

    modal
      .querySelector('[data-legacy~="time-task-setup-close"]')
      .addEventListener("click", () => finish(null));

    modal.querySelector("[data-lp-kpi-note-delete]")?.addEventListener("click", async () => {
      if (!(await confirmKpiNoteDelete())) return;
      finish({ action: "delete" });
    });

    tagAddBtn?.addEventListener("click", () => {
      addTagFromInput();
      allowModalInputFocus(tagInput);
      tagInput?.focus();
    });

    tagInput?.addEventListener("input", () => {
      clearFieldError(tagField);
      renderSuggest();
    });

    tagInput?.addEventListener("focus", () => renderSuggest());

    tagInput?.addEventListener("blur", () => {
      window.setTimeout(() => hideSuggest(), 120);
    });

    tagInput?.addEventListener("keydown", (e) => {
      if (!(suggestEl instanceof HTMLElement) || suggestEl.hidden) {
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          addTagFromInput();
        }
        return;
      }
      const items = suggestEl.querySelectorAll(".dream-kpi-note-tag-suggest-item");
      if (!items.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        suggestIndex = Math.min(suggestIndex + 1, items.length - 1);
        highlightSuggest(suggestIndex);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        suggestIndex = Math.max(suggestIndex - 1, 0);
        highlightSuggest(suggestIndex);
        return;
      }
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        if (!pickHighlightedSuggest()) addTagFromInput();
        return;
      }
      if (e.key === "Escape") {
        hideSuggest();
      }
    });

    memoInput?.addEventListener("input", () => clearFieldError(memoField));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearFieldError(tagField);
      clearFieldError(memoField);
      if (String(tagInput?.value || "").trim()) addTagFromInput();
      const tagLabels = [...selectedTagLabels];
      const memo = String(memoInput?.value || "").trim();
      if (!tagLabels.length) {
        showFieldError(tagField, labels.tagRequiredError);
        allowModalInputFocus(tagInput);
        tagInput?.focus();
        return;
      }
      if (!memo) {
        showFieldError(memoField, labels.memoRequiredError);
        allowModalInputFocus(memoInput);
        memoInput?.focus();
        return;
      }
      finish({
        action: "save",
        tagLabels,
        memo,
        noteId: noteId || undefined,
      });
    });

    renderTagChips();

    document.body.style.overflow = "hidden";
    document.body.appendChild(modal);
    unbindKeyboard = bindKpiTodoModalMobileKeyboard(modal, tagInput);
    requestAnimationFrame(() => {
      allowModalInputFocus(tagInput);
      tagInput?.focus();
    });
  });
}
