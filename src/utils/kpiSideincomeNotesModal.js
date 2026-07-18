import { allowModalInputFocus } from "./modalNoAutoFocus.js";
import { bindKpiTodoModalMobileKeyboard } from "./kpiTodoModalKeyboard.js";
import { findKpiNoteTagByLabel } from "./sideincomeKpiNotesSupabase.js";

/**
 * 시급상승 KPI 기록 — 추가·수정 모달 (태그 1개 + 자동완성)
 * @param {{
 *   mode?: "add" | "edit",
 *   kpiName?: string,
 *   kpiId?: string,
 *   existingTags?: { id?: string, label?: string }[],
 *   note?: { tagId?: string, tagLabel?: string, memo?: string },
 * }} [opts]
 * @returns {Promise<null | { action: "save", tagId?: string, tagLabel: string, memo: string } | { action: "delete" }>}
 */
export function showSideincomeKpiNoteModal(opts = {}) {
  const mode = opts.mode === "edit" ? "edit" : "add";
  const kpiName = (opts.kpiName || "").trim();
  const kpiId = String(opts.kpiId || "").trim();
  const initialMemo = String(opts.note?.memo || "").trim();
  const existingTags = Array.isArray(opts.existingTags) ? opts.existingTags : [];
  const title = mode === "edit" ? "기록 수정" : "기록 추가";
  const submitLabel = mode === "edit" ? "저장" : "추가";

  const initialTagId = String(opts.note?.tagId || "").trim();
  const initialTagLabel =
    String(opts.note?.tagLabel || "").trim() ||
    existingTags.find((t) => String(t.id || "").trim() === initialTagId)?.label ||
    "";

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
            <div class="dream-kpi-note-tag-input-wrap">
              <input id="dream-kpi-note-tag-input" type="text" name="tag" placeholder="태그 입력" autocomplete="off" value="${escapeHtml(initialTagLabel)}" />
              <div class="dream-kpi-note-tag-suggest" data-lp-kpi-note-tag-suggest hidden role="listbox" aria-label="기존 태그"></div>
            </div>
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
    let selectedTagId = initialTagId;
    let suggestIndex = -1;

    /** @param {null | { action: string, tagId?: string, tagLabel?: string, memo?: string }} value */
    function finish(value) {
      unbindKeyboard();
      modal.remove();
      document.body.style.overflow = prevOverflow;
      resolve(value);
    }

    const tagInput = modal.querySelector("#dream-kpi-note-tag-input");
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

    function matchingTags(query) {
      const q = String(query || "").trim().toLowerCase();
      if (!q) return [];
      return existingTags.filter((t) => {
        const label = String(t.label || "").trim();
        return label && label.toLowerCase().includes(q);
      });
    }

    function hideSuggest() {
      if (!(suggestEl instanceof HTMLElement)) return;
      suggestEl.hidden = true;
      suggestEl.replaceChildren();
      suggestIndex = -1;
    }

    function selectTag(tag) {
      if (!(tagInput instanceof HTMLInputElement)) return;
      selectedTagId = String(tag.id || "").trim();
      tagInput.value = String(tag.label || "").trim();
      hideSuggest();
      clearFieldError(tagField);
    }

    function renderSuggest() {
      if (!(tagInput instanceof HTMLInputElement) || !(suggestEl instanceof HTMLElement)) {
        return;
      }
      const query = (tagInput.value || "").trim();
      const hits = matchingTags(query);
      suggestEl.replaceChildren();
      suggestIndex = -1;
      if (!query || !hits.length) {
        suggestEl.hidden = true;
        return;
      }
      const exact = hits.find(
        (t) => String(t.label || "").trim().toLowerCase() === query.toLowerCase(),
      );
      if (exact && String(exact.id || "").trim() === selectedTagId) {
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
          selectTag(tag);
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
      const query = (tagInput?.value || "").trim();
      const hits = matchingTags(query);
      const tag = hits[idx];
      if (!tag) return false;
      selectTag(tag);
      return true;
    }

    modal
      .querySelector('[data-legacy~="time-task-setup-close"]')
      .addEventListener("click", () => finish(null));

    modal.querySelector("[data-lp-kpi-note-delete]")?.addEventListener("click", () => {
      finish({ action: "delete" });
    });

    tagInput?.addEventListener("input", () => {
      selectedTagId = "";
      clearFieldError(tagField);
      renderSuggest();
    });

    tagInput?.addEventListener("focus", () => renderSuggest());

    tagInput?.addEventListener("blur", () => {
      window.setTimeout(() => hideSuggest(), 120);
    });

    tagInput?.addEventListener("keydown", (e) => {
      if (!(suggestEl instanceof HTMLElement) || suggestEl.hidden) {
        if (e.key === "Enter" && !e.isComposing) e.preventDefault();
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
        pickHighlightedSuggest();
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
      const tagLabel = String(tagInput?.value || "").trim();
      const memo = String(memoInput?.value || "").trim();
      if (!tagLabel) {
        showFieldError(tagField, "태그를 입력해 주세요.");
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
      let tagId = selectedTagId;
      if (!tagId) {
        const hit = findKpiNoteTagByLabel(kpiId, tagLabel, existingTags);
        if (hit?.id) tagId = hit.id;
      }
      finish({
        action: "save",
        tagId: tagId || undefined,
        tagLabel,
        memo,
      });
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
