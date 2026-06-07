/**
 * 일간 타임블록 — 예상 일정 템플릿 저장·적용 모달 (공통 time-task-setup-modal 셸)
 */

import { dismissAppToast, showToast } from "./showToast.js";
import {
  allowModalInputFocus,
  wireModalEnterToConfirm,
} from "./modalNoAutoFocus.js";
import { showConfirmModal } from "./confirmModal.js";
import {
  resolveLpModalStackZIndex,
  syncBodyOverflowAfterModalClose,
} from "./lpModalStack.js";
import {
  extractBudgetBlocksFromDateKey,
  saveBudgetDayAsTemplate,
  applyBudgetTemplateToDateKey,
  ensureBudgetTemplatesLoaded,
} from "./timeDailyBudgetTemplateOps.js";
import {
  readBudgetScheduleTemplates,
  removeBudgetScheduleTemplate,
} from "./timeDailyBudgetTemplateModel.js";
import { deleteBudgetScheduleTemplateOnSupabase } from "./timeDailyBudgetTemplateSupabase.js";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function normalizeDateKey(s) {
  const d = String(s || "").replace(/\//g, "-").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

function mountModalShell(title) {
  if (document.querySelector(".lp-budget-template-modal")) return null;
  dismissAppToast();

  const modal = document.createElement("div");
  modal.className =
    "time-task-setup-modal time-task-log-modal lp-calendar-budget-add-modal lp-budget-template-modal";

  modal.innerHTML = `
    <div data-legacy="time-task-setup-backdrop"></div>
    <div data-legacy="time-task-setup-panel time-task-log-panel" role="dialog" aria-modal="true">
      <div data-legacy="time-task-setup-header time-task-log-header">
        <h3 data-legacy="time-task-setup-title">${escapeHtml(title)}</h3>
        <button type="button" data-legacy="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div data-legacy="time-task-setup-body time-task-log-body">
        <div data-legacy="time-task-log-scroll-area" data-lp-budget-template-body></div>
      </div>
      <div data-legacy="time-task-log-footer" data-lp-budget-template-footer></div>
    </div>
  `;

  const finish = () => {
    modal.remove();
    syncBodyOverflowAfterModalClose();
  };

  modal
    .querySelector('[data-legacy~="time-task-setup-close"]')
    ?.addEventListener("click", finish);
  modal
    .querySelector('[data-legacy~="time-task-setup-backdrop"]')
    ?.addEventListener("click", finish);
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") finish();
  });

  document.body.appendChild(modal);
  modal.style.zIndex = String(resolveLpModalStackZIndex());
  document.body.style.overflow = "hidden";

  return {
    modal,
    close: finish,
    body: modal.querySelector("[data-lp-budget-template-body]"),
    footer: modal.querySelector("[data-lp-budget-template-footer]"),
  };
}

function mountFooterActions(footer, { onCancel, onConfirm, confirmLabel }) {
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.setAttribute("data-legacy", "todo-list-modal-cancel");
  cancelBtn.textContent = "취소";
  cancelBtn.addEventListener("click", onCancel);

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.setAttribute("data-legacy", "time-task-log-submit");
  confirmBtn.textContent = confirmLabel;
  confirmBtn.addEventListener("click", onConfirm);

  footer.appendChild(cancelBtn);
  footer.appendChild(confirmBtn);
  return { cancelBtn, confirmBtn };
}

/**
 * @param {{ dateKey: string, onSaved?: () => void }} options
 */
export function openSaveBudgetTemplateModal(options) {
  const { dateKey, onSaved } = options || {};
  const dk = normalizeDateKey(dateKey);
  if (!dk) return;
  const blocks = extractBudgetBlocksFromDateKey(dk);
  if (!blocks.length) {
    showToast("이 날짜에 저장할 예상 일정이 없습니다.");
    return;
  }
  const shell = mountModalShell("템플릿으로 저장");
  if (!shell) return;
  const { body, footer, close } = shell;

  body.innerHTML = `
    <p class="lp-budget-template-lead">이 날짜의 예상 일정 <strong>${blocks.length}</strong>건을 템플릿으로 저장합니다.</p>
    <div data-legacy="time-task-log-field">
      <label for="lp-budget-template-name-input">템플릿 이름</label>
      <input type="text" id="lp-budget-template-name-input" data-legacy="time-task-log-meal-detail-input" placeholder="예: 평일 오전 루틴" maxlength="80" autocomplete="off" />
    </div>
    <div data-legacy="time-task-log-field">
      <span data-legacy="time-task-log-section-label">저장할 일정</span>
      <ul class="lp-budget-template-preview" aria-label="저장할 일정 미리보기">
        ${blocks
          .slice(0, 8)
          .map(
            (b) =>
              `<li>${escapeHtml(b.startHhMm)}–${escapeHtml(b.endHhMm)} ${escapeHtml(b.taskName)}</li>`,
          )
          .join("")}
        ${blocks.length > 8 ? `<li class="lp-budget-template-preview-more">외 ${blocks.length - 8}건</li>` : ""}
      </ul>
    </div>
  `;

  const nameInput = body.querySelector("#lp-budget-template-name-input");
  allowModalInputFocus(nameInput);

  const { confirmBtn } = mountFooterActions(footer, {
    onCancel: close,
    onConfirm: async () => {
      const name = String(nameInput?.value || "").trim();
      if (!name) {
        showToast("템플릿 이름을 입력해 주세요.");
        nameInput?.focus();
        return;
      }
      confirmBtn.disabled = true;
      const r = await saveBudgetDayAsTemplate(dk, name);
      confirmBtn.disabled = false;
      if (!r.ok) {
        showToast(r.error || "저장에 실패했습니다.");
        return;
      }
      showToast(`「${name}」 템플릿을 저장했습니다.`);
      close();
      onSaved?.();
    },
    confirmLabel: "저장",
  });

  wireModalEnterToConfirm(shell.modal, confirmBtn);
  requestAnimationFrame(() => nameInput?.focus({ preventScroll: true }));
}

/**
 * @param {{ dateKey: string, onApplied?: () => void }} options
 */
export function openApplyBudgetTemplateModal(options) {
  const { dateKey, onApplied } = options || {};
  const dk = normalizeDateKey(dateKey);
  if (!dk) return;
  const shell = mountModalShell("템플릿 적용");
  if (!shell) return;
  const { body, footer, close } = shell;

  let selectedId = "";
  let mode = "append";

  const renderList = () => {
    const list = readBudgetScheduleTemplates();
    if (!list.length) {
      body.innerHTML =
        '<p class="lp-budget-template-empty">저장된 템플릿이 없습니다. 「템플릿으로 저장」으로 먼저 만들어 주세요.</p>';
      return;
    }
    body.innerHTML = `
      <p class="lp-budget-template-lead">적용할 템플릿을 고르세요.</p>
      <div data-legacy="time-task-log-field">
        <span data-legacy="time-task-log-section-label">적용 방식</span>
        <div data-legacy="lp-choice-chip-row lp-budget-template-mode" role="radiogroup" aria-label="적용 방식">
          <button type="button" data-legacy="lp-choice-chip${mode === "append" ? " lp-choice-chip--on" : ""}" data-mode="append">기존 일정에 추가</button>
          <button type="button" data-legacy="lp-choice-chip${mode === "replace" ? " lp-choice-chip--on" : ""}" data-mode="replace">기존 일정 지우고 적용</button>
        </div>
      </div>
      <div data-legacy="time-task-log-field">
        <span data-legacy="time-task-log-section-label">템플릿 목록</span>
        <ul class="lp-budget-template-list"></ul>
      </div>
    `;
    body
      .querySelectorAll(
        '[data-legacy~="lp-budget-template-mode"] [data-legacy~="lp-choice-chip"]',
      )
      .forEach((btn) => {
      btn.addEventListener("click", () => {
        mode = btn.dataset.mode === "replace" ? "replace" : "append";
        renderList();
      });
    });
    const ul = body.querySelector(".lp-budget-template-list");
    for (const t of list) {
      const li = document.createElement("li");
      li.className =
        "lp-budget-template-list-item" +
        (selectedId === t.id ? " lp-budget-template-list-item--selected" : "");
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "lp-budget-template-pick-btn";
      pick.innerHTML = `<span class="lp-budget-template-pick-name">${escapeHtml(t.name)}</span><span class="lp-budget-template-pick-meta">${t.blocks.length}건</span>`;
      pick.addEventListener("click", () => {
        selectedId = t.id;
        renderList();
      });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "lp-budget-template-del-btn";
      del.setAttribute("aria-label", "템플릿 삭제");
      del.textContent = "×";
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await showConfirmModal({
          title: "템플릿 삭제",
          message: `「${t.name}」 템플릿을 삭제할까요?`,
          confirmText: "삭제",
          confirmDanger: true,
        });
        if (!ok) return;
        removeBudgetScheduleTemplate(t.id);
        try {
          await deleteBudgetScheduleTemplateOnSupabase(t.id);
        } catch (_) {}
        if (selectedId === t.id) selectedId = "";
        renderList();
        showToast("템플릿을 삭제했습니다.");
      });
      li.appendChild(pick);
      li.appendChild(del);
      ul.appendChild(li);
    }
  };

  body.innerHTML = '<p class="lp-budget-template-loading">불러오는 중…</p>';
  void ensureBudgetTemplatesLoaded().then(() => {
    renderList();
  });

  const { confirmBtn } = mountFooterActions(footer, {
    onCancel: close,
    onConfirm: async () => {
      if (!selectedId) {
        showToast("템플릿을 선택해 주세요.");
        return;
      }
      if (mode === "replace") {
        const ok = await showConfirmModal({
          title: "일정 덮어쓰기",
          message:
            "이 날짜의 기존 예상 일정을 모두 지우고 템플릿을 적용합니다. 계속할까요?",
          confirmText: "적용",
        });
        if (!ok) return;
      }
      confirmBtn.disabled = true;
      const r = await applyBudgetTemplateToDateKey(dk, selectedId, mode);
      confirmBtn.disabled = false;
      if (!r.ok) {
        showToast(r.error || "적용에 실패했습니다.");
        return;
      }
      showToast(`템플릿을 적용했습니다. (${r.applied}건)`);
      close();
      onApplied?.();
    },
    confirmLabel: "적용",
  });

  wireModalEnterToConfirm(shell.modal, confirmBtn);
}
