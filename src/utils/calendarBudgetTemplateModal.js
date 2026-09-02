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
import { getTaskOptionByName } from "../views/Time.js";
import {
  extractBudgetBlocksFromDateKey,
  saveBudgetDayAsTemplate,
  applyBudgetTemplateToDateKey,
  clearBudgetDayPlanFromDateKey,
  budgetTemplateBlocksToCalendarSpans,
  ensureBudgetTemplatesLoaded,
  renameBudgetDayTemplate,
} from "./timeDailyBudgetTemplateOps.js";
import {
  readBudgetScheduleTemplates,
  removeBudgetScheduleTemplate,
} from "./timeDailyBudgetTemplateModel.js";
import { deleteBudgetScheduleTemplateOnSupabase } from "./timeDailyBudgetTemplateSupabase.js";
import {
  createCalendar1DaySlotGridScroll,
  paintCalendar1DaySlotGridFromSpans,
} from "./calendar1DaySlotGrid.js";

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

function mountBudgetTemplateModalShell(title, { variant = "apply" } = {}) {
  const variantClass = `lp-budget-template-modal--${variant}`;
  if (document.querySelector(`.${variantClass}`)) return null;
  dismissAppToast();

  const modal = document.createElement("div");
  modal.className =
    `time-task-setup-modal time-task-log-modal lp-calendar-budget-add-modal lp-budget-template-modal ${variantClass}`;

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
    try {
      delete modal.__lpDismissBudgetTemplate;
    } catch (_) {}
    modal.remove();
    syncBodyOverflowAfterModalClose();
  };
  modal.__lpDismissBudgetTemplate = finish;

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

function mountApplyModalShell(title) {
  return mountBudgetTemplateModalShell(title, { variant: "apply" });
}

function mountSaveModalShell(title) {
  return mountBudgetTemplateModalShell(title, { variant: "save" });
}

function enrichCalendarSpansForPreview(spans) {
  return (spans || []).map((span) => {
    const taskName = String(span?.taskName || "").trim();
    const opt = getTaskOptionByName(taskName);
    return {
      ...span,
      prod: opt?.productivity || span?.prod || "other",
      category: opt?.category || span?.category || "",
    };
  });
}

function mountTemplatePreviewTimebox(blocks) {
  const wrap = document.createElement("div");
  wrap.className =
    "lp-budget-template-preview-timebox calendar-1day-view--slot-grid";
  const scroll = createCalendar1DaySlotGridScroll();
  scroll.classList.add("lp-budget-template-preview-timebox-scroll");
  scroll.setAttribute("aria-label", "템플릿 미리보기 타임박스");
  paintCalendar1DaySlotGridFromSpans(
    scroll,
    enrichCalendarSpansForPreview(
      budgetTemplateBlocksToCalendarSpans(blocks),
    ),
  );
  wrap.appendChild(scroll);
  return wrap;
}

async function deleteBudgetTemplateById(templateId, templateName) {
  const id = String(templateId || "").trim();
  if (!id) return false;
  const ok = await showConfirmModal({
    title: "템플릿 삭제",
    message: `「${templateName || "템플릿"}」 템플릿을 삭제할까요?\n삭제하면 복구할 수 없습니다.`,
    confirmText: "삭제",
    confirmDanger: true,
  });
  if (!ok) return false;
  removeBudgetScheduleTemplate(id);
  try {
    await deleteBudgetScheduleTemplateOnSupabase(id);
  } catch (_) {}
  showToast("템플릿을 삭제했습니다.");
  return true;
}

/**
 * @param {{ id: string, name: string, blocks: object[] }} template
 * @param {{ dateKey?: string, onApplied?: () => void, onCloseAll?: () => void, onDeleted?: () => void }} [callbacks]
 */
function openBudgetTemplatePreviewModal(template, callbacks = {}) {
  const tpl = template;
  if (!tpl?.id) return;
  const dk = normalizeDateKey(callbacks.dateKey);
  const shell = mountBudgetTemplateModalShell("템플릿", { variant: "preview" });
  if (!shell) return;
  const { body, footer, close } = shell;

  const nameField = document.createElement("div");
  nameField.setAttribute("data-legacy", "time-task-log-field");
  const nameLabel = document.createElement("label");
  nameLabel.setAttribute("for", "lp-budget-template-edit-name");
  nameLabel.textContent = "템플릿 이름";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.id = "lp-budget-template-edit-name";
  nameInput.className = "lp-budget-template-name-input";
  nameInput.setAttribute("data-legacy", "time-task-log-meal-detail-input");
  nameInput.placeholder = "템플릿 이름";
  nameInput.maxLength = 80;
  nameInput.autocomplete = "off";
  nameInput.value = String(tpl.name || "");
  nameField.append(nameLabel, nameInput);
  body.appendChild(nameField);
  allowModalInputFocus(nameInput);

  const persistName = async () => {
    const next = String(nameInput.value || "").trim();
    if (!next) {
      nameInput.value = String(tpl.name || "");
      return { ok: false, empty: true };
    }
    const r = await renameBudgetDayTemplate(tpl.id, next);
    if (!r.ok) {
      showToast(r.error || "이름을 바꾸지 못했습니다.");
      return r;
    }
    if (!r.unchanged) {
      tpl.name = next;
      callbacks.onRenamed?.();
    }
    return r;
  };
  nameInput.addEventListener("blur", () => {
    void persistName();
  });

  const lead = document.createElement("p");
  lead.className = "lp-budget-template-preview-lead";
  lead.textContent = `일정 ${tpl.blocks?.length || 0}건`;
  body.appendChild(lead);

  if (tpl.blocks?.length) {
    body.appendChild(mountTemplatePreviewTimebox(tpl.blocks));
  } else {
    const empty = document.createElement("p");
    empty.className = "lp-budget-template-empty";
    empty.textContent = "이 템플릿에 일정이 없습니다.";
    body.appendChild(empty);
  }

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.setAttribute("data-legacy", "time-task-log-submit");
  applyBtn.className = "lp-budget-template-apply-template-btn";
  applyBtn.textContent = "적용";
  applyBtn.addEventListener("click", async () => {
    if (!dk) {
      showToast("날짜 정보를 확인할 수 없습니다.");
      return;
    }
    applyBtn.disabled = true;
    const named = await persistName();
    if (named.empty) {
      showToast("템플릿 이름을 입력해 주세요.");
      nameInput.focus();
      applyBtn.disabled = false;
      return;
    }
    if (!named.ok) {
      applyBtn.disabled = false;
      return;
    }
    const r = await applyBudgetTemplateToDateKey(dk, tpl.id, "replace");
    applyBtn.disabled = false;
    if (!r.ok) {
      showToast(r.error || "적용에 실패했습니다.");
      return;
    }
    showToast(`템플릿을 적용했습니다. (${r.applied}건)`);
    close();
    callbacks.onCloseAll?.();
    callbacks.onApplied?.();
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "lp-budget-template-delete-template-btn";
  deleteBtn.textContent = "템플릿 삭제";
  deleteBtn.addEventListener("click", async () => {
    const named = String(nameInput.value || "").trim() || tpl.name;
    deleteBtn.disabled = true;
    const deleted = await deleteBudgetTemplateById(tpl.id, named);
    deleteBtn.disabled = false;
    if (!deleted) return;
    close();
    callbacks.onDeleted?.();
  });

  footer.append(deleteBtn, applyBtn);
  wireModalEnterToConfirm(shell.modal, applyBtn);
  requestAnimationFrame(() => nameInput.focus({ preventScroll: true }));
}

/**
 * @param {{ dateKey: string, onApplied?: () => void, onCloseAll?: () => void }} callbacks
 */
function openBudgetTemplateClearModal(callbacks = {}) {
  const dk = normalizeDateKey(callbacks.dateKey);
  if (!dk) return;
  const shell = mountBudgetTemplateModalShell("현재 템플릿 비우기", {
    variant: "clear",
  });
  if (!shell) return;
  const { body, footer, close } = shell;

  const lead = document.createElement("p");
  lead.className = "lp-budget-template-preview-lead";
  lead.textContent = "이 날짜 예상 일정을 모두 비웁니다. 저장된 템플릿 목록은 그대로입니다.";
  body.appendChild(lead);

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.setAttribute("data-legacy", "time-task-log-submit");
  applyBtn.className = "lp-budget-template-apply-template-btn";
  applyBtn.textContent = "적용";
  applyBtn.addEventListener("click", async () => {
    applyBtn.disabled = true;
    const r = await clearBudgetDayPlanFromDateKey(dk);
    applyBtn.disabled = false;
    if (!r.ok) {
      showToast(r.error || "비우지 못했습니다.");
      if (r.empty) {
        close();
        callbacks.onCloseAll?.();
        callbacks.onApplied?.();
      }
      return;
    }
    showToast(`이 날짜 예상 일정 ${r.cleared}건을 비웠습니다.`);
    close();
    callbacks.onCloseAll?.();
    callbacks.onApplied?.();
  });
  footer.appendChild(applyBtn);

  wireModalEnterToConfirm(shell.modal, applyBtn);
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
  const shell = mountSaveModalShell("템플릿 저장");
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
  const shell = mountApplyModalShell("템플릿 적용");
  if (!shell) return;
  const { body, close } = shell;

  body.innerHTML = `
    <div data-lp-budget-template-list-host>
      <p class="lp-budget-template-loading">불러오는 중…</p>
    </div>
  `;

  const listHost = body.querySelector("[data-lp-budget-template-list-host]");

  const renderList = () => {
    if (!listHost) return;
    const list = readBudgetScheduleTemplates();
    listHost.replaceChildren();
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <p class="lp-budget-template-lead">적용할 템플릿을 고르세요.</p>
      <div data-legacy="time-task-log-field">
        <span data-legacy="time-task-log-section-label">템플릿 목록</span>
        <ul class="lp-budget-template-list"></ul>
      </div>
    `;
    listHost.appendChild(wrap);
    const ul = wrap.querySelector(".lp-budget-template-list");

    const noneLi = document.createElement("li");
    noneLi.className = "lp-budget-template-list-item";
    const nonePick = document.createElement("button");
    nonePick.type = "button";
    nonePick.className = "lp-budget-template-pick-name";
    nonePick.textContent = "현재 템플릿 비우기";
    nonePick.setAttribute("aria-label", "현재 템플릿 비우기");
    nonePick.addEventListener("click", () => {
      openBudgetTemplateClearModal({
        dateKey: dk,
        onCloseAll: close,
        onApplied,
      });
    });
    noneLi.appendChild(nonePick);
    ul.appendChild(noneLi);

    for (const t of list) {
      const li = document.createElement("li");
      li.className = "lp-budget-template-list-item";
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "lp-budget-template-pick-name";
      pick.textContent = t.name;
      pick.setAttribute("aria-label", `${t.name} 미리보기`);
      pick.addEventListener("click", () => {
        openBudgetTemplatePreviewModal(t, {
          dateKey: dk,
          onCloseAll: close,
          onApplied,
          onDeleted: () => renderList(),
          onRenamed: () => renderList(),
        });
      });
      li.appendChild(pick);
      ul.appendChild(li);
    }
  };
  void ensureBudgetTemplatesLoaded().then(() => {
    renderList();
  });
}
