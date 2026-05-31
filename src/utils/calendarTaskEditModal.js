/**
 * 캘린더 — 할일/일정 수정 모달 (완료 체크 포함)
 * KPI 할일은 TodoList.openTodoTaskEditFromCalendarBarModel 경로 유지.
 */

import { initModalStandardDateFields } from "./modalNativeDateField.js";
import {
  buildTodoTaskDateQuickMarkup,
  setupTodoTaskDateQuickButtons,
} from "./deadlineQuickButtons.js";
import {
  closeDuplicateTodoAddModals,
  wireModalEnterToConfirm,
} from "./modalNoAutoFocus.js";
import { syncBodyOverflowAfterModalClose } from "./lpModalStack.js";
import { syncCalendarDayIconForDate } from "./calendarDayIconsSupabase.js";
import { mountCalendarDayIconsEditor } from "./calendarDayIconsEditor.js";
import { showAlertModal } from "./confirmModal.js";
import { clearSubtasks } from "./todoSubtasks.js";
import {
  readSectionTasksObject,
  writeSectionTasksObject,
  readCustomSectionTasksObject,
  writeCustomSectionTasksObject,
} from "./todoSectionTasksModel.js";
import {
  upsertCalendarSectionTaskDirectFromModal,
  deleteCalendarSectionTaskRowById,
  cancelTodoSectionTasksSyncPushSchedule,
  persistSectionTasksAndSchedule,
  persistCustomSectionTasksAndSchedule,
} from "./todoSectionTasksSupabase.js";

const CALENDAR_TASK_EDIT_ACTIVE_CLASS = "calendar-task-edit-active";

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function clearCalendarTaskEditSelection() {
  try {
    document
      .querySelectorAll("." + CALENDAR_TASK_EDIT_ACTIVE_CLASS)
      .forEach((el) => el.classList.remove(CALENDAR_TASK_EDIT_ACTIVE_CLASS));
  } catch (_) {}
}

function beginRemoveFromFixedSection(sectionId, taskId) {
  try {
    cancelTodoSectionTasksSyncPushSchedule();
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return { ok: false, snapshot: null };
    const tid = String(taskId || "").trim();
    const snapshot = arr.find((t) => String(t.taskId || "").trim() === tid);
    obj[sectionId] = arr.filter((t) => String(t.taskId || "").trim() !== tid);
    writeSectionTasksObject(obj);
    return { ok: true, snapshot: snapshot || null };
  } catch (_) {}
  return { ok: false, snapshot: null };
}

function rollbackRemoveFromFixedSection(sectionId, taskId, snapshot) {
  if (!snapshot) return;
  try {
    const tid = String(taskId || "").trim();
    const o2 = readSectionTasksObject();
    const cur = Array.isArray(o2[sectionId]) ? o2[sectionId] : [];
    if (!cur.some((t) => String(t.taskId || "").trim() === tid)) {
      o2[sectionId] = [...cur, { ...snapshot }];
      writeSectionTasksObject(o2);
    }
  } catch (_) {}
}

function beginRemoveFromCustomSection(sectionId, taskId) {
  try {
    cancelTodoSectionTasksSyncPushSchedule();
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return { ok: false, snapshot: null };
    const tid = String(taskId || "").trim();
    const snapshot = arr.find((t) => String(t.taskId || "").trim() === tid);
    obj[sectionId] = arr.filter((t) => String(t.taskId || "").trim() !== tid);
    writeCustomSectionTasksObject(obj);
    return { ok: true, snapshot: snapshot || null };
  } catch (_) {}
  return { ok: false, snapshot: null };
}

function rollbackRemoveFromCustomSection(sectionId, taskId, snapshot) {
  if (!snapshot) return;
  try {
    const tid = String(taskId || "").trim();
    const o2 = readCustomSectionTasksObject();
    const cur = Array.isArray(o2[sectionId]) ? o2[sectionId] : [];
    if (!cur.some((t) => String(t.taskId || "").trim() === tid)) {
      o2[sectionId] = [...cur, { ...snapshot }];
      writeCustomSectionTasksObject(o2);
    }
  } catch (_) {}
}

async function completeRemoveFromServer(sectionId, taskId, snapshot, isCustom) {
  const tid = String(taskId || "").trim();
  const del = await deleteCalendarSectionTaskRowById(taskId);
  if (!del.ok) {
    if (isCustom) rollbackRemoveFromCustomSection(sectionId, tid, snapshot);
    else rollbackRemoveFromFixedSection(sectionId, tid, snapshot);
  }
  return del;
}

function showCalendarTaskEditModal(options) {
  const {
    taskData = {},
    onSave,
    onDelete,
    selectionEl = null,
    dayIconDateKey = "",
  } = options;
  const {
    name = "",
    startDate = "",
    dueDate = "",
    done = false,
  } = taskData;
  const storageSectionId = String(taskData.sectionId || "").trim();

  clearCalendarTaskEditSelection();
  closeDuplicateTodoAddModals();
  if (selectionEl?.classList) {
    selectionEl.classList.add(CALENDAR_TASK_EDIT_ACTIVE_CLASS);
  }

  const modal = document.createElement("div");
  modal.className =
    "time-task-setup-modal time-add-task-modal calendar-task-edit-modal";
  modal.innerHTML = `
    <div class="time-task-setup-backdrop"></div>
    <div class="time-task-setup-panel time-add-task-panel">
      <div class="time-task-setup-header">
        <h3 class="time-task-setup-title">할일/일정 수정</h3>
        <button type="button" class="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div class="time-task-setup-body">
        <div class="time-task-log-field">
          <label>할일/일정 이름</label>
          <input type="text" class="time-add-task-name" placeholder="할일/일정 입력" value="${escapeHtml(name)}" maxlength="500" />
        </div>
        <div class="time-task-log-field calendar-task-edit-done-field">
          <label class="calendar-task-edit-done-label">
            <input type="checkbox" class="calendar-task-edit-done-check" aria-label="완료" ${done ? "checked" : ""} />
            <span class="calendar-task-edit-done-face" aria-hidden="true"></span>
            <span class="calendar-task-edit-done-text">완료</span>
          </label>
        </div>
        <div class="todo-task-date-block">
          <div class="time-task-log-field">
            <label>시작일</label>
            <div class="time-task-log-date-native-wrap">
              <input type="date" class="todo-task-edit-start" aria-label="시작일" value="${escapeHtml((startDate || "").slice(0, 10))}" />
              <span class="time-task-log-date-overlay" aria-hidden="true"></span>
            </div>
          </div>
          <div class="time-task-log-field">
            <label>마감일</label>
            <div class="time-task-log-date-native-wrap">
              <input type="date" class="todo-task-edit-due" aria-label="마감일" value="${escapeHtml((dueDate || "").slice(0, 10))}" />
              <span class="time-task-log-date-overlay" aria-hidden="true"></span>
            </div>
          </div>
          ${buildTodoTaskDateQuickMarkup()}
        </div>
        <div class="calendar-day-icons-editor-mount" data-calendar-day-icons-mount></div>
      </div>
      <div class="time-task-log-footer todo-task-edit-footer todo-task-edit-footer--actions">
        <button type="button" class="time-add-task-delete todo-task-edit-footer-delete" aria-label="삭제">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" aria-hidden="true" class="todo-task-edit-footer-delete-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          <span class="todo-task-edit-footer-delete-label">삭제</span>
        </button>
        <button type="button" class="time-add-task-submit todo-task-edit-footer-confirm">저장</button>
      </div>
    </div>
  `;

  const closeBtn = modal.querySelector(".time-task-setup-close");
  const confirmBtn = modal.querySelector(".time-add-task-submit");
  const deleteBtn = modal.querySelector(".todo-task-edit-footer-delete");
  const nameInput = modal.querySelector(".time-add-task-name");
  const doneCheck = modal.querySelector(".calendar-task-edit-done-check");
  const startInput = modal.querySelector(".todo-task-edit-start");
  const dueInput = modal.querySelector(".todo-task-edit-due");
  const iconDateKey =
    String(dayIconDateKey || startDate || dueDate || "")
      .trim()
      .slice(0, 10) || "";
  const dayIconsEditor = mountCalendarDayIconsEditor(
    modal.querySelector("[data-calendar-day-icons-mount]"),
    { dateKey: iconDateKey },
  );

  function close() {
    try {
      if (selectionEl?.classList && selectionEl.isConnected) {
        selectionEl.classList.remove(CALENDAR_TASK_EDIT_ACTIVE_CLASS);
      }
    } catch (_) {}
    modal.remove();
    syncBodyOverflowAfterModalClose();
  }

  function gatherForm() {
    return {
      name: (nameInput?.value || "").trim(),
      startDate: (startInput?.value || "").trim().slice(0, 10),
      dueDate: (dueInput?.value || "").trim().slice(0, 10),
      done: !!doneCheck?.checked,
      sectionId: storageSectionId,
    };
  }

  let saving = false;
  confirmBtn?.addEventListener("click", () => {
    if (saving) return;
    saving = true;
    try {
      onSave?.({ ...taskData, ...gatherForm() });
      if (iconDateKey) {
        void syncCalendarDayIconForDate(
          iconDateKey,
          dayIconsEditor.getIconKey(),
        ).catch(() => {});
      }
    } catch (err) {
      console.error("calendar task edit onSave", err);
      void showAlertModal({
        message: "저장 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
      });
      return;
    } finally {
      saving = false;
    }
    close();
  });
  closeBtn?.addEventListener("click", close);
  deleteBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    onDelete?.();
    close();
  });
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
  wireModalEnterToConfirm(modal, confirmBtn);
  initModalStandardDateFields(modal);
  setupTodoTaskDateQuickButtons(modal);
}

/**
 * @param {object} barModel
 * @param {{ selectionEl?: HTMLElement|null, onAfterApply?: () => void }} [options]
 */
export function openCalendarTaskEditFromBarModel(barModel, options = {}) {
  const { selectionEl = null, onAfterApply } = options || {};
  const b = barModel || {};
  const taskId = String(b.taskId || "").trim();
  const sectionId = String(b.sectionId || "").trim();
  const runAfter = () => {
    try {
      onAfterApply?.();
    } catch (_) {}
  };

  if (!taskId || !sectionId) return;

  const isCustom = sectionId.startsWith("custom-");
  let row = null;
  try {
    if (isCustom) {
      const obj = readCustomSectionTasksObject();
      const arr = obj[sectionId];
      if (Array.isArray(arr)) {
        row = arr.find((t) => String(t.taskId || "").trim() === taskId);
      }
    } else {
      const obj = readSectionTasksObject();
      const arr = obj[sectionId];
      if (Array.isArray(arr)) {
        row = arr.find((t) => String(t.taskId || "").trim() === taskId);
      }
    }
  } catch (_) {}
  if (!row) return;

  const storageSectionId = sectionId;
  const itemType =
    String(row.itemType || b.itemType || "todo").toLowerCase() === "schedule"
      ? "schedule"
      : "todo";

  showCalendarTaskEditModal({
    taskData: {
      taskId,
      name: row.name || b.name || "",
      startDate: (row.startDate || b.startDate || "").toString().slice(0, 10),
      dueDate: (row.dueDate || b.dueDate || "").toString().slice(0, 10),
      done: !!(row.done ?? b.done),
      sectionId: storageSectionId,
      itemType,
    },
    dayIconDateKey: String(b.dateKey || b.startDate || row.startDate || "")
      .trim()
      .slice(0, 10),
    selectionEl,
    onSave: (payload) => {
      const merged = {
        ...row,
        name: (payload.name || "").trim(),
        startDate: (payload.startDate || "").trim().slice(0, 10) || "",
        dueDate: (payload.dueDate || "").trim().slice(0, 10) || "",
        reminderDate: "",
        reminderTime: "",
        eisenhower: String(row.eisenhower || "").trim() || "",
        itemType,
        done: !!payload.done,
      };

      if (isCustom) {
        const obj = readCustomSectionTasksObject();
        const arr = obj[storageSectionId];
        if (!Array.isArray(arr)) return;
        const idx = arr.findIndex(
          (t) => String(t.taskId || "").trim() === taskId,
        );
        if (idx < 0) return;
        arr[idx] = merged;
        writeCustomSectionTasksObject(obj);
        void persistCustomSectionTasksAndSchedule(obj).catch(() => {});
      } else {
        const obj = readSectionTasksObject();
        const arr = obj[storageSectionId];
        if (!Array.isArray(arr)) return;
        const idx = arr.findIndex(
          (t) => String(t.taskId || "").trim() === taskId,
        );
        if (idx < 0) return;
        arr[idx] = merged;
        writeSectionTasksObject(obj);
        void persistSectionTasksAndSchedule(obj).catch(() => {});
      }

      void upsertCalendarSectionTaskDirectFromModal({
        task: {
          taskId,
          name: merged.name,
          startDate: merged.startDate,
          dueDate: merged.dueDate,
          startTime: String(merged.startTime || "").trim(),
          endTime: String(merged.endTime || "").trim(),
          eisenhower: merged.eisenhower,
          done: !!merged.done,
          itemType: merged.itemType || "todo",
          reminderDate: "",
          reminderTime: "",
        },
        sectionKey: storageSectionId,
        isCustom,
        sortOrder: 0,
      }).catch(() => {});

      runAfter();
    },
    onDelete: () => {
      clearSubtasks(taskId);
      if (isCustom) {
        const begun = beginRemoveFromCustomSection(storageSectionId, taskId);
        if (!begun.ok) return;
        runAfter();
        void completeRemoveFromServer(
          storageSectionId,
          taskId,
          begun.snapshot,
          true,
        ).catch(() => {});
        return;
      }
      const begun = beginRemoveFromFixedSection(storageSectionId, taskId);
      if (!begun.ok) return;
      runAfter();
      void completeRemoveFromServer(
        storageSectionId,
        taskId,
        begun.snapshot,
        false,
      ).catch(() => {});
    },
  });
}
