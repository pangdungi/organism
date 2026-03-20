/**
 * 할 일 목록 - 토글 헤더 + Name, Due date + Add Task + 분류 드롭다운
 * KPI 할 일(꿈/부수입/행복/건강) 연동: 마감일 없음, 꿈 이름 자동, 분류=KPI이름
 */

import { getKpiTodosAsTasks, syncKpiTodoCompleted, removeAllCompletedKpiTodos, removeKpiTodo, updateKpiTodo, moveKpiTodoToSection } from "../utils/kpiTodoSync.js";
import { createTodoSettingsModal } from "../utils/todoSettingsModal.js";
import { getTodoSettings, getCustomSections, addCustomSection, removeCustomSection, updateCustomSectionLabel, getSectionColor } from "../utils/todoSettings.js";
import { getSubtasks, addSubtask, updateSubtask, removeSubtask, clearSubtasks, setSubtasks } from "../utils/todoSubtasks.js";
import { createBraindumpContextMenu } from "../utils/braindumpContextMenu.js";
import { createTodoCheckboxTypeMenu } from "../utils/todoCheckboxTypeMenu.js";

const CUSTOM_SECTION_TASKS_KEY = "todo-custom-section-tasks";
const SECTION_TASKS_KEY = "todo-section-tasks";
export const DRAG_TYPE_TODO_TO_CALENDAR = "todo-task-to-calendar";
export const DRAG_TYPE_TODO_TO_EISENHOWER = "todo-task-to-eisenhower";

const TODO_DEBUG = false;
function todoDebug(...args) {
  if (TODO_DEBUG && typeof console !== "undefined" && console.log) console.log("[TODO-DEBUG]", ...args);
}

// 나의 계정에서 리스트 색상 저장 시 탭 버튼 색상 즉시 반영
window.addEventListener("app-colors-changed", () => {
  const container = document.querySelector(".todo-category-tabs");
  if (!container) return;
  const sectionColors = getTodoSettings().sectionColors;
  container.querySelectorAll(".todo-category-tab[data-section]").forEach((btn) => {
    const c = sectionColors?.[btn.dataset.section];
    if (c) {
      btn.style.borderLeft = `0.0625rem solid ${c}`;
      btn.style.borderTop = `0.0625rem solid ${c}`;
      btn.style.borderRight = `0.0625rem solid ${c}`;
      btn.style.borderBottom = `0.0625rem solid ${c}`;
      btn.style.backgroundColor = "";
    } else {
      btn.style.borderLeft = "";
      btn.style.borderTop = "";
      btn.style.borderRight = "";
      btn.style.borderBottom = "";
    }
  });
});

function loadSectionTasks(sectionId) {
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      const arr = obj[sectionId];
      if (Array.isArray(arr)) {
        const sectionLabel = { dream: "꿈", sideincome: "부수입", health: "건강", happy: "행복", braindump: "브레인 덤프" }[sectionId] || sectionId;
        const out = arr
          .filter((t) => (t.name || "").trim() !== "")
          .map((t) => ({
            ...t,
            sectionId,
            sectionLabel,
            itemType: t.itemType || "todo",
            isKpiTodo: false,
          }));
        todoDebug("loadSectionTasks", sectionId, "count", out.length);
        return out;
      }
    }
  } catch (_) {}
  return [];
}

function updateSectionTaskDone(sectionId, taskId, done) {
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.done = !!done;
      localStorage.setItem(SECTION_TASKS_KEY, JSON.stringify(obj));
      return true;
    }
  } catch (_) {}
  return false;
}

function saveSectionTasks(sectionId, tasks) {
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    const existingList = obj[sectionId] || [];
    const domByTaskId = new Map(
      tasks
        .filter((t) => (t.name || "").trim() !== "")
        .map((t) => [
          t.taskId || "",
          {
            taskId: t.taskId || "",
            name: (t.name || "").trim(),
            startDate: (t.startDate || "").trim(),
            dueDate: (t.dueDate || "").trim(),
            startTime: t.startTime || "",
            endTime: t.endTime || "",
            eisenhower: t.eisenhower || "",
            done: !!t.done,
            itemType: t.itemType || "todo",
            reminderDate: (t.reminderDate || "").trim(),
            reminderTime: (t.reminderTime || "").trim(),
          },
        ]),
    );
    const merged = [];
    existingList.forEach((ex) => {
      const tid = ex.taskId || "";
      const fromDom = domByTaskId.get(tid);
      if (fromDom) {
        merged.push({
          ...ex,
          name: fromDom.name,
          startDate: fromDom.startDate || (ex.startDate || "").slice(0, 10) || "",
          dueDate: fromDom.dueDate || (ex.dueDate || "").slice(0, 10) || "",
          startTime: fromDom.startTime || ex.startTime || "",
          endTime: fromDom.endTime || ex.endTime || "",
          eisenhower: fromDom.eisenhower || ex.eisenhower || "",
          done: fromDom.done,
          itemType: fromDom.itemType || ex.itemType || "todo",
          reminderDate: fromDom.reminderDate || (ex.reminderDate || "").slice(0, 10) || "",
          reminderTime: fromDom.reminderTime || ex.reminderTime || "",
        });
        domByTaskId.delete(tid);
      } else {
        merged.push(ex);
      }
    });
    domByTaskId.forEach((t) => {
      merged.push({
        taskId: t.taskId,
        name: t.name,
        startDate: t.startDate || "",
        dueDate: t.dueDate || "",
        startTime: t.startTime || "",
        endTime: t.endTime || "",
        eisenhower: t.eisenhower || "",
        done: t.done,
        itemType: t.itemType || "todo",
        reminderDate: t.reminderDate || "",
        reminderTime: t.reminderTime || "",
      });
    });
    const toSave = merged
      .map(({ taskId, name, startDate, dueDate, startTime, endTime, eisenhower, done, itemType, reminderDate, reminderTime }) => ({
        taskId: taskId || "",
        name: (name || "").trim(),
        startDate: (startDate || "").slice(0, 10) || "",
        dueDate: (dueDate || "").slice(0, 10) || "",
        startTime: startTime || "",
        endTime: endTime || "",
        eisenhower: eisenhower || "",
        done: !!done,
        itemType: itemType || "todo",
        reminderDate: (reminderDate || "").slice(0, 10) || "",
        reminderTime: reminderTime || "",
      }))
      .filter((t) => t.name !== "");
    obj[sectionId] = toSave;
    localStorage.setItem(SECTION_TASKS_KEY, JSON.stringify(obj));
  } catch (_) {}
}

function moveSectionTaskToSection(fromSectionId, taskId, targetSectionId, taskData) {
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    const fromArr = obj[fromSectionId];
    if (!Array.isArray(fromArr)) return false;
    const idx = fromArr.findIndex((x) => (x.taskId || "") === taskId);
    if (idx < 0) return false;
    fromArr.splice(idx, 1);
    if (!obj[targetSectionId]) obj[targetSectionId] = [];
    obj[targetSectionId].push({
      taskId: taskData.taskId || taskId,
      name: (taskData.name || "").trim(),
      startDate: taskData.startDate || "",
      dueDate: taskData.dueDate || "",
      startTime: taskData.startTime || "",
      endTime: taskData.endTime || "",
      eisenhower: taskData.eisenhower || "",
      done: !!taskData.done,
      itemType: taskData.itemType || "todo",
      reminderDate: (taskData.reminderDate || "").slice(0, 10) || "",
      reminderTime: taskData.reminderTime || "",
    });
    localStorage.setItem(SECTION_TASKS_KEY, JSON.stringify(obj));
    return true;
  } catch (_) {}
  return false;
}

function moveCustomSectionTaskToSection(fromSectionId, taskId, targetSectionId, taskData) {
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    const fromArr = obj[fromSectionId];
    if (!Array.isArray(fromArr)) return false;
    const idx = fromArr.findIndex((x) => (x.taskId || "") === taskId);
    if (idx < 0) return false;
    fromArr.splice(idx, 1);
    if (!obj[targetSectionId]) obj[targetSectionId] = [];
    obj[targetSectionId].push({
      taskId: taskData.taskId || taskId,
      name: (taskData.name || "").trim(),
      startDate: taskData.startDate || "",
      dueDate: taskData.dueDate || "",
      startTime: taskData.startTime || "",
      endTime: taskData.endTime || "",
      eisenhower: taskData.eisenhower || "",
      done: !!taskData.done,
      itemType: taskData.itemType || "todo",
      reminderDate: (taskData.reminderDate || "").slice(0, 10) || "",
      reminderTime: taskData.reminderTime || "",
    });
    localStorage.setItem(CUSTOM_SECTION_TASKS_KEY, JSON.stringify(obj));
    return true;
  } catch (_) {}
  return false;
}

function loadCustomSectionTasks(sectionId) {
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      const arr = obj[sectionId];
      if (Array.isArray(arr)) {
        return arr
          .filter((t) => (t.name || "").trim() !== "")
          .map((t) => ({
            ...t,
            sectionId,
            sectionLabel: getCustomSections().find((s) => s.id === sectionId)?.label || sectionId,
            itemType: t.itemType || "todo",
          }));
      }
    }
  } catch (_) {}
  return [];
}

function saveCustomSectionTasks(sectionId, tasks) {
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    const toSave = tasks
      .map(({ taskId, name, startDate, dueDate, startTime, endTime, eisenhower, done, itemType }) => ({
        taskId,
        name: (name || "").trim(),
        startDate: startDate || "",
        dueDate: dueDate || "",
        startTime: startTime || "",
        endTime: endTime || "",
        eisenhower: eisenhower || "",
        done: !!done,
        itemType: itemType || "todo",
      }))
      .filter((t) => t.name !== "");
    obj[sectionId] = toSave;
    localStorage.setItem(CUSTOM_SECTION_TASKS_KEY, JSON.stringify(obj));
  } catch (_) {}
}

function removeCustomSectionTasks(sectionId) {
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    delete obj[sectionId];
    localStorage.setItem(CUSTOM_SECTION_TASKS_KEY, JSON.stringify(obj));
  } catch (_) {}
}

function removeTaskFromSectionStorage(sectionId, taskId) {
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    obj[sectionId] = arr.filter((t) => (t.taskId || "") !== taskId);
    localStorage.setItem(SECTION_TASKS_KEY, JSON.stringify(obj));
    return true;
  } catch (_) {}
  return false;
}

function removeTaskFromCustomSectionStorage(sectionId, taskId) {
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    obj[sectionId] = arr.filter((t) => (t.taskId || "") !== taskId);
    localStorage.setItem(CUSTOM_SECTION_TASKS_KEY, JSON.stringify(obj));
    return true;
  } catch (_) {}
  return false;
}

function collectCustomSectionFromDOM(sectionsEl, sectionId) {
  const tasks = [];
  const sec = sectionsEl?.querySelector(`.todo-section[data-section="${sectionId}"]`);
  sec?.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").forEach((row) => {
    const nameInput = row.querySelector(".todo-cell-name input");
    const startInput = row.querySelector(".todo-start-input-hidden");
    const dueInput = row.querySelector(".todo-due-input-hidden");
    const eisenhowerSelect = row.querySelector(".todo-eisenhower-select");
    const doneCheck = row.querySelector(".todo-done-check");
    const itemType = row.dataset.itemType || "todo";
    tasks.push({
      taskId: row.dataset.taskId || "",
      name: (nameInput?.value || "").trim(),
      startDate: startInput?.value || "",
      dueDate: dueInput?.value || "",
      startTime: row.dataset.startTime || "",
      endTime: row.dataset.endTime || "",
      eisenhower: eisenhowerSelect?.value || row.dataset.eisenhower || "",
      done: itemType === "todo" ? (doneCheck?.checked || false) : false,
      itemType,
      reminderDate: row.dataset.reminderDate || "",
      reminderTime: row.dataset.reminderTime || "",
    });
  });
  return tasks;
}

const KPI_SECTION_IDS = ["dream", "sideincome", "happy", "health"];
const FIXED_SECTION_IDS_FOR_STORAGE = ["braindump", ...KPI_SECTION_IDS];

let _saveSectionTasksTimer = null;
function scheduleSaveSectionTasksFromDOM(sectionsWrap) {
  todoDebug("scheduleSaveSectionTasksFromDOM", { hasWrap: !!sectionsWrap });
  if (!sectionsWrap) return;
  if (_saveSectionTasksTimer) clearTimeout(_saveSectionTasksTimer);
  _saveSectionTasksTimer = setTimeout(() => {
    _saveSectionTasksTimer = null;
    collectAndSaveKpiTasksFromDOM(sectionsWrap);
  }, 300);
}

function collectAndSaveKpiTasksFromDOM(sectionsWrap) {
  todoDebug("collectAndSaveKpiTasksFromDOM", { hasWrap: !!sectionsWrap });
  if (!sectionsWrap) return;
  FIXED_SECTION_IDS_FOR_STORAGE.forEach((sectionId) => {
    const sec = sectionsWrap.querySelector(`.todo-section[data-section="${sectionId}"]`);
    if (!sec) {
      todoDebug("collectAndSave: section not found", sectionId);
      return;
    }
    const sectionTasks = [];
    sec.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").forEach((row) => {
      const nameInput = row.querySelector(".todo-cell-name input");
      const startInput = row.querySelector(".todo-start-input-hidden");
      const dueInput = row.querySelector(".todo-due-input-hidden");
      const eisenhowerSelect = row.querySelector(".todo-eisenhower-select");
      const doneCheck = row.querySelector(".todo-done-check");
      const name = (nameInput?.value || "").trim();
      const startDate = startInput?.value || "";
      const dueDate = dueInput?.value || "";
      const startTime = row.dataset.startTime || "";
      const endTime = row.dataset.endTime || "";
      const eisenhower = eisenhowerSelect?.value || row.dataset.eisenhower || "";
      const done = doneCheck?.checked || false;
      const itemType = row.dataset.itemType || "todo";
      const kpiTodoId = row.dataset.kpiTodoId;
      const storageKey = row.dataset.kpiStorageKey;

      if (kpiTodoId && storageKey) {
        if (name === "") {
          removeKpiTodo(kpiTodoId, storageKey);
        } else {
          updateKpiTodo(kpiTodoId, storageKey, { text: name, startDate, dueDate, startTime, endTime, eisenhower, completed: done, itemType });
        }
      } else if (name !== "") {
        sectionTasks.push({
          taskId: row.dataset.taskId || "",
          name,
          startDate,
          dueDate,
          startTime,
          endTime,
          eisenhower,
          done,
          itemType,
          reminderDate: row.dataset.reminderDate || "",
          reminderTime: row.dataset.reminderTime || "",
        });
      }
    });
    const withDate = sectionTasks.filter((t) => (t.dueDate || "").trim()).length;
    todoDebug("collectAndSave: saving section", sectionId, "tasks", sectionTasks.length, "withDueDate", withDate, sectionTasks.map((t) => ({ name: (t.name || "").slice(0, 12), dueDate: (t.dueDate || "").slice(0, 10) })));
    saveSectionTasks(sectionId, sectionTasks);
  });
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    const counts = {};
    Object.keys(obj || {}).forEach((k) => { counts[k] = (obj[k] || []).length; });
    todoDebug("collectAndSave: after save localStorage", SECTION_TASKS_KEY, counts);
  } catch (_) {}
}

export function saveTodoListBeforeUnmount(container) {
  const hasContainer = !!container;
  const sectionsWrap = container?.querySelector(".todo-sections-wrap");
  todoDebug("saveTodoListBeforeUnmount", {
    hasContainer,
    hasSectionsWrap: !!sectionsWrap,
    containerClass: container?.className,
    containerChildren: container?.children?.length,
  });
  if (sectionsWrap) {
    collectAndSaveKpiTasksFromDOM(sectionsWrap);
    getCustomSections().forEach((s) => {
      const sec = sectionsWrap.querySelector(`.todo-section[data-section="${s.id}"]`);
      if (sec) saveCustomSectionTasks(s.id, collectCustomSectionFromDOM(sectionsWrap, s.id));
    });
  } else {
    todoDebug("saveTodoListBeforeUnmount: no .todo-sections-wrap in container, save skipped");
  }
}

const TODO_CATEGORY_OPTIONS_KEY = "todo_category_options";
const DEFAULT_CATEGORIES = ["학업", "잡무", "사이드프로젝트", "회사"];
const PASTEL_COLORS = [
  { bg: "rgba(167, 243, 208, 0.5)", text: "#047857" },
  { bg: "rgba(196, 181, 253, 0.5)", text: "#5b21b6" },
  { bg: "rgba(253, 186, 116, 0.5)", text: "#c2410c" },
  { bg: "rgba(251, 207, 232, 0.5)", text: "#9d174d" },
  { bg: "rgba(147, 197, 253, 0.5)", text: "#1e40af" },
  { bg: "rgba(190, 242, 100, 0.5)", text: "#4d7c0f" },
  { bg: "rgba(253, 230, 138, 0.5)", text: "#b45309" },
  { bg: "rgba(125, 211, 252, 0.5)", text: "#0369a1" },
  { bg: "rgba(165, 180, 252, 0.5)", text: "#3730a3" },
  { bg: "rgba(110, 231, 183, 0.5)", text: "#047857" },
  { bg: "rgba(94, 234, 212, 0.5)", text: "#0f766e" },
  { bg: "rgba(253, 164, 175, 0.5)", text: "#be123c" },
];

function getCategoryOptions() {
  try {
    const raw = localStorage.getItem(TODO_CATEGORY_OPTIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    }
  } catch (_) {}
  const defaults = DEFAULT_CATEGORIES.map((name) => ({
    name,
    bg: PASTEL_COLORS[DEFAULT_CATEGORIES.indexOf(name) % PASTEL_COLORS.length].bg,
    text: PASTEL_COLORS[DEFAULT_CATEGORIES.indexOf(name) % PASTEL_COLORS.length].text,
  }));
  try {
    localStorage.setItem(TODO_CATEGORY_OPTIONS_KEY, JSON.stringify(defaults));
  } catch (_) {}
  return defaults;
}

function addCategoryOption(name) {
  const opts = getCategoryOptions();
  const trimmed = (name || "").trim();
  if (!trimmed || opts.some((o) => o.name === trimmed)) return opts;
  const color = PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];
  opts.unshift({ name: trimmed, bg: color.bg, text: color.text });
  try {
    localStorage.setItem(TODO_CATEGORY_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

function removeCategoryOption(name) {
  const opts = getCategoryOptions().filter((o) => o.name !== name);
  try {
    localStorage.setItem(TODO_CATEGORY_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

const DELETE_ICON =
  '<svg class="todo-category-delete-icon" viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

const TASK_DELETE_ICON =
  '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

const ADD_TASK_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 8v8"/><path d="m8 12h8"/><path d="m18 22h-12c-2.209 0-4-1.791-4-4v-12c0-2.209 1.791-4 4-4h12c2.209 0 4 1.791 4 4v12c0 2.209-1.791 4-4 4z"/></g></svg>';

const LIST_ICON =
  '<img src="/toolbaricons/list.svg" alt="세부 할 일" class="todo-list-icon" width="18" height="18">';

function createCategoryDropdown(initialValue, onUpdate) {
  const wrap = document.createElement("div");
  wrap.className = "todo-category-wrap";

  const inputWrap = document.createElement("div");
  inputWrap.className = "todo-category-input-wrap";

  const display = document.createElement("span");
  display.className = "todo-category-display";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "todo-category-input";
  input.placeholder = "";
  if (initialValue) input.value = initialValue;

  function getOpt(name) {
    return getCategoryOptions().find((o) => o.name === name);
  }

  function updateDisplay() {
    const val = (input.value || "").trim();
    display.textContent = val || "";
    display.className = "todo-category-display";
    if (val) {
      const opt = getOpt(val);
      if (opt) {
        display.style.background = opt.bg;
        display.style.color = opt.text;
      } else {
        display.style.background = "#f0f0f0";
        display.style.color = "#333";
      }
      display.classList.add("has-value");
    } else {
      display.style.background = "";
      display.style.color = "";
      display.classList.remove("has-value");
    }
  }

  function showInput() {
    wrap.classList.add("is-editing");
    wrap.classList.remove("has-value");
  }

  function showDisplay() {
    updateDisplay();
    if ((input.value || "").trim()) {
      wrap.classList.remove("is-editing");
      wrap.classList.add("has-value");
    } else {
      wrap.classList.add("is-editing");
      wrap.classList.remove("has-value");
    }
  }

  display.addEventListener("click", () => {
    showInput();
    input.focus();
    renderPanel(input.value);
  });

  input.addEventListener("focus", () => {
    showInput();
    renderPanel(input.value);
  });
  input.addEventListener("blur", () => {
    showDisplay();
    onUpdate?.();
    setTimeout(closePanel, 150);
  });
  input.addEventListener("input", () => {
    if (wrap.classList.contains("is-editing")) renderPanel(input.value);
  });

  inputWrap.appendChild(display);
  inputWrap.appendChild(input);
  if (initialValue) showDisplay();
  else wrap.classList.add("is-editing");

  const panel = document.createElement("div");
  panel.className = "todo-category-panel";
  panel.hidden = true;

  let highlightedIndex = -1;

  function updatePanelPosition() {
    const rect = input.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.width = "max-content";
    panel.style.minWidth = `${rect.width}px`;
  }

  function renderPanel(query) {
    const q = (query || "").trim().toLowerCase();
    const all = getCategoryOptions();
    const matches = q ? all.filter((o) => o.name.toLowerCase().includes(q)) : all;
    const exactMatch = q && matches.some((o) => o.name.toLowerCase() === q);
    const showCreate = q && !exactMatch;

    panel.innerHTML = "";
    highlightedIndex = -1;

    if (matches.length === 0 && !showCreate) {
      panel.hidden = true;
      return;
    }

    const sep = document.createElement("div");
    sep.className = "todo-category-separator";
    sep.textContent = "—";
    panel.appendChild(sep);

    matches.forEach((opt) => {
      const row = document.createElement("div");
      row.className = "todo-category-option";
      const tag = document.createElement("span");
      tag.className = "todo-category-tag";
      tag.style.background = opt.bg;
      tag.style.color = opt.text;
      tag.textContent = opt.name;
      row.innerHTML = "";
      row.appendChild(tag);
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "todo-category-delete-btn";
      delBtn.title = "삭제";
      delBtn.innerHTML = DELETE_ICON;
      row.appendChild(delBtn);
      row.dataset.value = opt.name;
      row.addEventListener("click", (e) => {
        if (e.target.closest(".todo-category-delete-btn")) return;
        input.value = opt.name;
        showDisplay();
        panel.hidden = true;
        input.blur();
        onUpdate?.();
      });
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeCategoryOption(opt.name);
        renderPanel(input.value);
      });
      panel.appendChild(row);
    });

    if (showCreate) {
      const createRow = document.createElement("div");
      createRow.className = "todo-category-option todo-category-create";
      createRow.innerHTML = `<span class="todo-category-create-label">Create</span><span class="todo-category-tag">${(query || "").trim()}</span>`;
      createRow.dataset.value = (query || "").trim();
      createRow.dataset.isCreate = "true";
      createRow.addEventListener("click", () => {
        const val = (query || "").trim();
        addCategoryOption(val);
        input.value = val;
        showDisplay();
        panel.hidden = true;
        input.blur();
        onUpdate?.();
      });
      panel.appendChild(createRow);
    }

    highlightedIndex = 0;
    const opts = panel.querySelectorAll(".todo-category-option");
    if (opts[0]) opts[0].classList.add("is-highlighted");
    updatePanelPosition();
    panel.hidden = false;
  }

  function closePanel() {
    panel.hidden = true;
    highlightedIndex = -1;
  }

  input.addEventListener("keydown", (e) => {
    if (panel.hidden) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }
    const opts = panel.querySelectorAll(".todo-category-option");
    if (opts.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, opts.length - 1);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) => o.classList.toggle("is-highlighted", i === highlightedIndex));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) => o.classList.toggle("is-highlighted", i === highlightedIndex));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const sel = opts[highlightedIndex >= 0 ? highlightedIndex : 0];
      if (sel) {
        const val = sel.dataset.value;
        if (sel.dataset.isCreate === "true") addCategoryOption(val);
        input.value = val;
        showDisplay();
        closePanel();
        input.blur();
        onUpdate?.();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closePanel();
    }
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) closePanel();
  });

  wrap.appendChild(inputWrap);
  wrap.appendChild(panel);

  const scrollResizeHandler = () => {
    if (!panel.hidden) updatePanelPosition();
  };
  window.addEventListener("scroll", scrollResizeHandler, true);
  window.addEventListener("resize", scrollResizeHandler);

  return { wrap, input };
}

const FIXED_SECTIONS = [
  { id: "braindump", label: "브레인 덤프" },
  { id: "dream", label: "꿈" },
  { id: "sideincome", label: "부수입" },
  { id: "health", label: "건강" },
  { id: "happy", label: "행복" },
];

function showAddListModal(options = {}) {
  const { validate, onSuccess, title = "새 리스트 추가", label = "새 리스트 이름을 입력하세요", initialValue = "" } = options;
  const modal = document.createElement("div");
  modal.className = "todo-list-modal";
  modal.innerHTML = `
    <div class="todo-list-modal-backdrop"></div>
    <div class="todo-list-modal-panel">
      <div class="todo-list-modal-header">
        <h3 class="todo-list-modal-title">${title}</h3>
        <button type="button" class="todo-list-modal-close" aria-label="닫기">×</button>
      </div>
      <div class="todo-list-modal-body">
        <p class="todo-list-modal-label">${label}</p>
        <input type="text" name="todo-list-modal-name" class="todo-list-modal-input" placeholder="리스트 이름" maxlength="50" />
        <p class="todo-list-modal-error" role="alert"></p>
      </div>
      <div class="todo-list-modal-footer">
        <button type="button" class="todo-list-modal-cancel">취소</button>
        <button type="button" class="todo-list-modal-confirm">확인</button>
      </div>
    </div>
  `;

  const backdrop = modal.querySelector(".todo-list-modal-backdrop");
  const closeBtn = modal.querySelector(".todo-list-modal-close");
  const input = modal.querySelector(".todo-list-modal-input");
  const errorEl = modal.querySelector(".todo-list-modal-error");
  const cancelBtn = modal.querySelector(".todo-list-modal-cancel");
  const confirmBtn = modal.querySelector(".todo-list-modal-confirm");

  function close() {
    modal.remove();
    document.body.style.overflow = "";
  }

  function showError(msg) {
    errorEl.textContent = msg || "";
  }

  function doConfirm() {
    const val = (input.value || "").trim();
    const err = validate ? validate(val) : null;
    if (err) {
      showError(err);
      return;
    }
    showError("");
    close();
    onSuccess?.(val);
  }

  confirmBtn.addEventListener("click", doConfirm);
  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doConfirm();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
  if (initialValue) input.value = initialValue;
  input.focus();
}

function showEditListModal(options = {}) {
  const { sectionId, currentLabel, onSuccess } = options;
  showAddListModal({
    title: "리스트 이름 편집",
    label: "리스트 이름을 입력하세요",
    initialValue: currentLabel || "",
    validate: (name) => {
      if (!name || !name.trim()) return "리스트 이름을 입력하세요.";
      if (getCustomSections().some((s) => s.label === name.trim() && s.id !== sectionId)) return "같은 이름의 리스트가 이미 있습니다.";
      return null;
    },
    onSuccess: (name) => {
      const updated = updateCustomSectionLabel(sectionId, name.trim());
      if (updated) onSuccess?.(updated);
    },
  });
}

function showConfirmModal(options = {}) {
  const { title = "확인", message, confirmText = "확인", cancelText = "취소", onConfirm } = options;
  const modal = document.createElement("div");
  modal.className = "todo-list-modal todo-list-confirm-modal";
  modal.innerHTML = `
    <div class="todo-list-modal-backdrop"></div>
    <div class="todo-list-modal-panel">
      <div class="todo-list-modal-header">
        <h3 class="todo-list-modal-title">${title}</h3>
        <button type="button" class="todo-list-modal-close" aria-label="닫기">×</button>
      </div>
      <div class="todo-list-modal-body todo-list-confirm-body">
        <p class="todo-list-confirm-message">${(message || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}</p>
      </div>
      <div class="todo-list-modal-footer">
        <button type="button" class="todo-list-modal-cancel">${cancelText}</button>
        <button type="button" class="todo-list-modal-confirm todo-list-confirm-delete">${confirmText}</button>
      </div>
    </div>
  `;

  const backdrop = modal.querySelector(".todo-list-modal-backdrop");
  const closeBtn = modal.querySelector(".todo-list-modal-close");
  const cancelBtn = modal.querySelector(".todo-list-modal-cancel");
  const confirmBtn = modal.querySelector(".todo-list-modal-confirm");

  function close() {
    modal.remove();
    document.body.style.overflow = "";
  }

  confirmBtn.addEventListener("click", () => {
    close();
    onConfirm?.();
  });
  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
}

/** 모바일 전용: 날짜 선택 모달. 모달 안 input을 탭하면 네이티브 날짜 픽커가 열림 */
function showMobileDateModal(options) {
  const { title = "날짜 선택", value = "", min = "", max = "", onSelect } = options;
  const modal = document.createElement("div");
  modal.className = "todo-list-modal todo-mobile-date-modal";
  modal.innerHTML = `
    <div class="todo-list-modal-backdrop"></div>
    <div class="todo-list-modal-panel todo-mobile-date-panel">
      <div class="todo-list-modal-header">
        <h3 class="todo-list-modal-title">${title}</h3>
        <button type="button" class="todo-list-modal-close" aria-label="닫기">×</button>
      </div>
      <div class="todo-list-modal-body">
        <input type="date" class="todo-mobile-date-input" tabindex="-1" value="${(value || "").slice(0, 10)}" ${min ? `min="${min}"` : ""} ${max ? `max="${max}"` : ""} />
      </div>
      <div class="todo-list-modal-footer">
        <button type="button" class="todo-list-modal-cancel">취소</button>
        <button type="button" class="todo-list-modal-confirm">확인</button>
      </div>
    </div>
  `;
  const backdrop = modal.querySelector(".todo-list-modal-backdrop");
  const closeBtn = modal.querySelector(".todo-list-modal-close");
  const cancelBtn = modal.querySelector(".todo-list-modal-cancel");
  const confirmBtn = modal.querySelector(".todo-list-modal-confirm");
  const dateInput = modal.querySelector(".todo-mobile-date-input");

  function close() {
    modal.remove();
    document.body.style.overflow = "";
  }

  function apply() {
    const val = (dateInput.value || "").trim().slice(0, 10);
    if (val) onSelect?.(val);
    close();
  }

  dateInput.addEventListener("change", apply);
  confirmBtn.addEventListener("click", apply);
  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    close();
  });
  closeBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    close();
  });
  backdrop.addEventListener("click", close);
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
  // 모달만 보이게: 입력 포커스 시 날짜 피커가 같이 뜨지 않도록 X 버튼에 포커스
  requestAnimationFrame(() => {
    closeBtn.focus();
  });
}

function getSections() {
  return [...FIXED_SECTIONS, ...getCustomSections()];
}

function getTaskId(taskData) {
  if (taskData.isKpiTodo && taskData.kpiTodoId && taskData.storageKey) {
    return `kpi-${taskData.kpiTodoId}-${taskData.storageKey}`;
  }
  return taskData.taskId || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createSubtaskItem(parentTaskId, subtaskData, onRemove) {
  const { id: subtaskId, name = "", done = false } = subtaskData;
  const wrap = document.createElement("div");
  wrap.className = "todo-subtask-item";
  wrap.dataset.parentTaskId = parentTaskId;
  wrap.dataset.subtaskId = subtaskId;

  const nameWrap = document.createElement("div");
  nameWrap.className = "todo-subtask-name-wrap";
  const inputGroup = document.createElement("div");
  inputGroup.className = "todo-subtask-input-group";
  const doneCheck = document.createElement("input");
  doneCheck.type = "checkbox";
  doneCheck.className = "todo-done-check";
  doneCheck.checked = done;
  doneCheck.addEventListener("change", () => {
    updateSubtask(parentTaskId, subtaskId, { done: doneCheck.checked });
  });
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.name = "todo-subtask-name";
  nameInput.className = "todo-subtask-input";
  nameInput.value = name;
  nameInput.placeholder = "세부 할 일 입력";
  nameInput.addEventListener("blur", () => {
    const val = (nameInput.value || "").trim();
    if (val === "") {
      removeSubtask(parentTaskId, subtaskId);
      wrap.remove();
      onRemove?.();
    } else {
      updateSubtask(parentTaskId, subtaskId, { name: val });
    }
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      nameInput.blur();
    }
  });
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "todo-task-delete-btn todo-subtask-delete-btn";
  delBtn.title = "삭제";
  delBtn.innerHTML = TASK_DELETE_ICON;
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeSubtask(parentTaskId, subtaskId);
    wrap.remove();
    onRemove?.();
  });
  inputGroup.appendChild(doneCheck);
  inputGroup.appendChild(nameInput);
  inputGroup.appendChild(delBtn);
  wrap.appendChild(nameWrap);
  nameWrap.appendChild(inputGroup);
  return wrap;
}

function createTaskRow(taskData = {}, options = {}) {
  const {
    name = "",
    startDate = "",
    dueDate = "",
    startTime = "",
    endTime = "",
    eisenhower = "",
    classification = "",
    sectionLabel = "",
    done = false,
    itemType = "todo",
    isKpiTodo = false,
    kpiTodoId = "",
    storageKey = "",
    reminderDate = "",
    reminderTime = "",
  } = taskData;
  const { showCategoryCol = false, isSubtask = false, taskId: optTaskId, showCheckboxTypeMenu = null, enableDragToCalendar = false, enableDragToEisenhower = false, overdueColumnOrder = false, eisenhowerSidebarFirst = false } = options;
  const taskId = optTaskId || getTaskId(taskData);

  const tr = document.createElement("tr");
  tr.className = "todo-task-row" + (isSubtask ? " todo-subtask-row" : "");
  tr.dataset.sectionId = taskData.sectionId || "";
  const hasDates = !!((startDate || "").trim() || (dueDate || "").trim());
  tr.dataset.hasDates = hasDates ? "true" : "false";
  if (!hasDates && (taskData.sectionId || "")) {
    tr.style.setProperty("--row-section-color", getSectionColor(taskData.sectionId));
  }
  if (!isSubtask) tr.dataset.taskId = taskId;
  tr.dataset.startTime = startTime || "";
  tr.dataset.endTime = endTime || "";
  tr.dataset.reminderDate = reminderDate || "";
  tr.dataset.reminderTime = reminderTime || "";
  if (dueDate && isOverdue(dueDate)) tr.classList.add("todo-row-overdue");
  if (isKpiTodo) {
    tr.classList.add("todo-task-row--kpi");
    tr.dataset.isKpiTodo = "true";
    tr.dataset.kpiTodoId = kpiTodoId;
    tr.dataset.kpiStorageKey = storageKey;
  }

  const doneTd = document.createElement("td");
  doneTd.className = "todo-cell-done";
  doneTd.dataset.itemType = itemType;
  tr.dataset.itemType = itemType;

  const doneCheck = document.createElement("input");
  doneCheck.type = "checkbox";
  doneCheck.className = "todo-done-check";
  doneCheck.checked = done;
  doneCheck.addEventListener("change", () => {
    if (isKpiTodo && kpiTodoId && storageKey) {
      syncKpiTodoCompleted(kpiTodoId, storageKey, doneCheck.checked);
    } else if (!isKpiTodo && (taskData.sectionId || "")) {
      const secId = taskData.sectionId || tr.closest(".todo-section")?.dataset?.section || "";
      if (FIXED_SECTION_IDS_FOR_STORAGE.includes(secId)) {
        updateSectionTaskDone(secId, taskId, doneCheck.checked);
      }
    }
    syncOverdueDisplay?.();
  });

  const scheduleIcon = document.createElement("img");
  scheduleIcon.src = "/toolbaricons/radio-button.svg";
  scheduleIcon.alt = "";
  scheduleIcon.className = "todo-schedule-icon";
  scheduleIcon.width = 18;
  scheduleIcon.height = 18;

  const doneWrap = document.createElement("div");
  doneWrap.className = "todo-done-wrap";
  if (itemType === "schedule") {
    doneWrap.classList.add("todo-done-wrap--schedule");
    doneCheck.hidden = true;
    doneWrap.appendChild(scheduleIcon);
  } else {
    doneWrap.appendChild(doneCheck);
  }
  doneTd.appendChild(doneWrap);

  const setItemType = (type) => {
    tr.dataset.itemType = type;
    doneTd.dataset.itemType = type;
    doneWrap.classList.toggle("todo-done-wrap--schedule", type === "schedule");
    if (type === "schedule") {
      doneCheck.hidden = true;
      doneCheck.checked = false;
      if (!doneWrap.contains(scheduleIcon)) doneWrap.appendChild(scheduleIcon);
      if (doneWrap.contains(doneCheck)) doneWrap.removeChild(doneCheck);
    } else {
      doneCheck.hidden = false;
      if (doneWrap.contains(scheduleIcon)) doneWrap.removeChild(scheduleIcon);
      if (!doneWrap.contains(doneCheck)) doneWrap.insertBefore(doneCheck, doneWrap.firstChild);
    }
  };

  const nameTd = document.createElement("td");
  nameTd.className = "todo-cell-name" + (isSubtask ? " todo-cell-name-subtask" : "");
  const nameWrap = document.createElement("div");
  nameWrap.className = "todo-cell-name-wrap";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.name = "todo-task-name";
  nameInput.value = name;
  let dateAreaClicked = false;
  if (isKpiTodo && kpiTodoId && storageKey) {
    nameInput.addEventListener("blur", (e) => {
      const val = (nameInput.value || "").trim();
      const relatedTarget = e.relatedTarget;
      const focusStaysInRowSync = relatedTarget && tr.contains(relatedTarget);
      console.log("[DEBUG todo-row] nameInput blur (KPI)", {
        val,
        relatedTarget: relatedTarget?.className || relatedTarget?.tagName,
      });
      setTimeout(() => {
        const activeEl = document.activeElement;
        const hadDateAreaClick = dateAreaClicked;
        if (dateAreaClicked) dateAreaClicked = false;
        const focusStaysInRow = tr.contains(activeEl) || focusStaysInRowSync || hadDateAreaClick;
        console.log("[DEBUG todo-row] nameInput blur (KPI deferred)", {
          val,
          focusStaysInRow,
          hadDateAreaClick,
          activeEl: activeEl?.className || activeEl?.tagName,
          willRemove: val === "" && !focusStaysInRow,
        });
        if (val === "" && !focusStaysInRow) {
          if (removeKpiTodo(kpiTodoId, storageKey)) {
            console.log("[DEBUG todo-row] REMOVING KPI row (name empty, focus left row)");
            clearSubtasks(taskId);
            tr.remove();
            const section = tr.closest(".todo-section");
            const tbody = tr.parentElement;
            const countEl = section?.querySelector(".todo-section-count");
            if (countEl && tbody) countEl.textContent = String(tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length);
          }
        } else if (val !== name) {
          updateKpiTodo(kpiTodoId, storageKey, { text: val });
        }
      }, 0);
    });
  } else {
    nameInput.addEventListener("blur", (e) => {
      const val = (nameInput.value || "").trim();
      const relatedTarget = e.relatedTarget;
      const focusStaysInRowSync = relatedTarget && tr.contains(relatedTarget);
      console.log("[DEBUG todo-row] nameInput blur", {
        val,
        relatedTarget: relatedTarget?.className || relatedTarget?.tagName,
      });
      setTimeout(() => {
        const activeEl = document.activeElement;
        const hadDateAreaClick = dateAreaClicked;
        if (dateAreaClicked) dateAreaClicked = false;
        const focusStaysInRow = tr.contains(activeEl) || focusStaysInRowSync || hadDateAreaClick;
        console.log("[DEBUG todo-row] nameInput blur (deferred)", {
          val,
          focusStaysInRow,
          hadDateAreaClick,
          activeEl: activeEl?.className || activeEl?.tagName,
          willRemove: val === "" && !focusStaysInRow,
        });
        if (val === "" && !focusStaysInRow) {
          console.log("[DEBUG todo-row] REMOVING row (name empty, focus left row)");
          clearSubtasks(taskId);
          tr.remove();
          const section = tr.closest(".todo-section");
          const tbody = tr.parentElement;
          const countEl = section?.querySelector(".todo-section-count");
          if (countEl && tbody) countEl.textContent = String(tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length);
        } else if (val !== "" && !isKpiTodo) {
          scheduleSaveSectionTasksFromDOM(tr.closest(".todo-sections-wrap"));
        }
      }, 0);
    });
  }
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      nameInput.blur();
    }
  });
  nameWrap.appendChild(nameInput);
  if (!isSubtask) {
    const listBtn = document.createElement("button");
    listBtn.type = "button";
    listBtn.className = "todo-list-btn";
    listBtn.title = "세부 할 일 추가";
    listBtn.innerHTML = LIST_ICON;
    listBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const section = tr.closest(".todo-section");
      const updateCount = () => {
        const countEl = section?.querySelector(".todo-section-count");
        if (countEl) countEl.textContent = String(tr.closest("tbody")?.querySelectorAll(".todo-task-row").length || 0);
      };
      const subs = addSubtask(taskId, { name: "", done: false });
      const newItem = createSubtaskItem(taskId, subs[subs.length - 1], updateCount);
      const container = nameTd.querySelector(".todo-subtasks-container");
      if (container) container.appendChild(newItem);
      updateCount();
      const subInput = newItem.querySelector(".todo-subtask-input");
      if (subInput) subInput.focus();
    });
    nameWrap.appendChild(listBtn);
  }
  const dateLineEl = document.createElement("div");
  dateLineEl.className = "todo-task-date-line";
  nameTd.appendChild(nameWrap);
  nameTd.appendChild(dateLineEl);
  if (!isSubtask) {
    const subtasksContainer = document.createElement("div");
    subtasksContainer.className = "todo-subtasks-container";
    nameTd.appendChild(subtasksContainer);
  }

  const startTd = document.createElement("td");
  startTd.className = "todo-cell-start";
  const startWrap = document.createElement("div");
  startWrap.className = "todo-due-wrap";
  const startDisplay = document.createElement("span");
  startDisplay.className = "todo-due-display";
  if (startDate && startDate.includes("-")) {
    const [y, m, d] = startDate.split("-");
    startDisplay.innerHTML = y && m && d ? `<span class="todo-due-date-text">${m}/${d}</span>` : '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
  } else {
    startDisplay.innerHTML =
      '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
  }
  const startInput = document.createElement("input");
  startInput.type = "date";
  startInput.className = "todo-start-input-hidden";
  startInput.name = "todo-start-date";
  startInput.value = startDate;
  const syncStartDisplay = () => {
    const val = startInput.value;
    if (val && val.includes("-")) {
      const [y, m, d] = val.split("-");
      startDisplay.innerHTML = y && m && d ? `<span class="todo-due-date-text">${m}/${d}</span>` : '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
    } else {
      startDisplay.innerHTML =
        '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
    }
  };
  const syncHasDates = () => {
    const hasDates = !!((startInput.value || "").trim() || (dueInput.value || "").trim());
    tr.dataset.hasDates = hasDates ? "true" : "false";
    if (!hasDates && (taskData.sectionId || "")) {
      tr.style.setProperty("--row-section-color", getSectionColor(taskData.sectionId));
    } else {
      tr.style.removeProperty("--row-section-color");
    }
  };
  startInput.addEventListener("change", () => {
    syncStartDisplay();
    syncHasDates();
    syncDateLine();
    if (isKpiTodo && kpiTodoId && storageKey) {
      updateKpiTodo(kpiTodoId, storageKey, { startDate: startInput.value });
    } else if (!isKpiTodo) {
      scheduleSaveSectionTasksFromDOM(tr.closest(".todo-sections-wrap"));
    }
  });
  startWrap.addEventListener("mousedown", () => {
    dateAreaClicked = true;
  });
  startWrap.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 768px)").matches) {
      showMobileDateModal({
        title: "시작일",
        value: startInput.value,
        max: dueInput.value || "",
        onSelect(val) {
          startInput.value = val;
          syncStartDisplay();
          syncHasDates();
          syncDateLine();
          if (isKpiTodo && kpiTodoId && storageKey) {
            updateKpiTodo(kpiTodoId, storageKey, { startDate: val });
          } else if (!isKpiTodo) {
            scheduleSaveSectionTasksFromDOM(tr.closest(".todo-sections-wrap"));
          }
        },
      });
      return;
    }
    startInput.focus();
    if (startInput._flatpickr) startInput._flatpickr.open();
    else if (typeof startInput.showPicker === "function") startInput.showPicker();
    else startInput.click();
  });
  startWrap.style.cursor = "pointer";
  startWrap.appendChild(startDisplay);
  startWrap.appendChild(startInput);
  startTd.appendChild(startWrap);

  const dueTd = document.createElement("td");
  dueTd.className = "todo-cell-due";
  const dueWrap = document.createElement("div");
  dueWrap.className = "todo-due-wrap";
  const dueDisplay = document.createElement("span");
  dueDisplay.className = "todo-due-display";
  if (dueDate && dueDate.includes("-")) {
    const [y, m, d] = dueDate.split("-");
    dueDisplay.innerHTML = y && m && d ? `<span class="todo-due-date-text">${m}/${d}</span>` : '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
  } else {
    dueDisplay.innerHTML =
      '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
  }
  const dueInput = document.createElement("input");
  dueInput.type = "date";
  dueInput.className = "todo-due-input-hidden";
  dueInput.name = "todo-due-date";
  dueInput.value = dueDate;
  const syncDueDisplay = () => {
    const val = dueInput.value;
    if (val && val.includes("-")) {
      const [y, m, d] = val.split("-");
      dueDisplay.innerHTML = y && m && d ? `<span class="todo-due-date-text">${m}/${d}</span>` : '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
    } else {
      dueDisplay.innerHTML =
        '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
    }
  };
  const syncDateMinMax = () => {
    const s = startInput.value || "";
    const d = dueInput.value || "";
    startInput.max = d || "";
    dueInput.min = s || "";
  };
  syncDateMinMax();
  startInput.addEventListener("change", syncDateMinMax);
  dueInput.addEventListener("change", syncDateMinMax);
  dueInput.addEventListener("change", () => {
    syncDueDisplay();
    syncOverdueDisplay?.();
    syncHasDates();
    syncDateLine();
    if (isKpiTodo && kpiTodoId && storageKey) {
      updateKpiTodo(kpiTodoId, storageKey, { dueDate: dueInput.value });
    } else if (!isKpiTodo) {
      scheduleSaveSectionTasksFromDOM(tr.closest(".todo-sections-wrap"));
    }
  });
  dueWrap.addEventListener("mousedown", () => {
    dateAreaClicked = true;
  });
  dueWrap.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 768px)").matches) {
      showMobileDateModal({
        title: "마감일",
        value: dueInput.value,
        min: startInput.value || "",
        onSelect(val) {
          dueInput.value = val;
          syncDueDisplay();
          syncOverdueDisplay?.();
          syncHasDates();
          syncDateLine();
          if (isKpiTodo && kpiTodoId && storageKey) {
            updateKpiTodo(kpiTodoId, storageKey, { dueDate: val });
          } else if (!isKpiTodo) {
            scheduleSaveSectionTasksFromDOM(tr.closest(".todo-sections-wrap"));
          }
        },
      });
      return;
    }
    dueInput.focus();
    if (dueInput._flatpickr) dueInput._flatpickr.open();
    else if (typeof dueInput.showPicker === "function") dueInput.showPicker();
    else dueInput.click();
  });
  dueWrap.style.cursor = "pointer";
  dueWrap.appendChild(dueDisplay);
  dueWrap.appendChild(dueInput);
  dueTd.appendChild(dueWrap);

  const reminderTd = document.createElement("td");
  reminderTd.className = "todo-cell-reminder";
  const reminderBtn = document.createElement("button");
  reminderBtn.type = "button";
  reminderBtn.className = "todo-reminder-btn";
  reminderBtn.title = "Reminder";
  reminderBtn.innerHTML = `<svg class="todo-reminder-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 19.001c0 2.209 1.791 4 4 4s4-1.791 4-4"/><path d="m12 5.999v6"/><path d="m9 8.999h6"/><path d="m22 19.001-3-5.25v-5.752c0-3.866-3.134-7-7-7s-7 3.134-7 7v5.751l-3 5.25h20z"/></svg>`;
  const reminderDisplaySpan = document.createElement("span");
  reminderDisplaySpan.className = "todo-reminder-display";
  function formatReminderDisplay(rDate, rTime) {
    if (!(rDate || "").trim()) return "";
    const parts = String(rDate).trim().split(/[-/]/);
    const dateStr = parts.length >= 3 ? `${parts[1]}/${parts[2]}` : rDate;
    return (rTime || "").trim() ? `${dateStr} ${(rTime || "").trim()}` : dateStr;
  }
  const reminderDisplayVal = formatReminderDisplay(reminderDate, reminderTime);
  reminderDisplaySpan.textContent = reminderDisplayVal || "";
  reminderTd.classList.toggle("todo-cell-reminder-empty", !reminderDisplayVal);
  reminderBtn.hidden = !!reminderDisplayVal;

  function openReminderModal() {
    const taskName = (nameInput.value || "").trim() || "(과제명 없음)";
    const defaultDate = (tr.dataset.reminderDate || "").trim() || (dueInput.value || "").trim();
    const defaultTime = (tr.dataset.reminderTime || "").trim();
    const modal = document.createElement("div");
    modal.className = "dream-kpi-modal todo-reminder-modal";
    const escapeHtml = (s) => {
      const d = document.createElement("div");
      d.textContent = s;
      return d.innerHTML;
    };
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel">
        <div class="dream-kpi-modal-header">
          <h3 class="dream-kpi-modal-title">리마인더</h3>
          <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
        </div>
        <div class="todo-reminder-form">
          <div class="todo-reminder-field">
            <label class="todo-reminder-label">과제명</label>
            <p class="todo-reminder-task-name">${escapeHtml(taskName)}</p>
          </div>
          <div class="todo-reminder-field">
            <label class="todo-reminder-label">날짜</label>
            <div class="todo-reminder-date-row">
              <input type="date" class="todo-reminder-date" name="todo-reminder-date" value="${escapeHtml(defaultDate)}" />
              <button type="button" class="todo-reminder-date-btn" data-offset="0">오늘</button>
              <button type="button" class="todo-reminder-date-btn" data-offset="1">내일</button>
            </div>
          </div>
          <div class="todo-reminder-field">
            <label class="todo-reminder-label">시간</label>
            <input type="text" class="todo-reminder-time" placeholder="14:30" autocomplete="off" value="${escapeHtml(defaultTime)}" />
            <span class="todo-reminder-time-error" aria-live="polite"></span>
          </div>
          <button type="button" class="dream-kpi-submit todo-reminder-save">설정</button>
        </div>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-kpi-modal-close").addEventListener("click", close);
    const dateInput = modal.querySelector(".todo-reminder-date");
    function toYYYYMMDD(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    modal.querySelectorAll(".todo-reminder-date-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const offset = parseInt(btn.dataset.offset, 10) || 0;
        const d = new Date();
        d.setDate(d.getDate() + offset);
        dateInput.value = toYYYYMMDD(d);
      });
    });
    const timeInput = modal.querySelector(".todo-reminder-time");
    function formatTimeInput(val) {
      const digits = String(val || "").replace(/\D/g, "");
      if (digits.length >= 4) {
        const h = digits.slice(0, 2);
        const m = digits.slice(2, 4);
        return `${h}:${m}`;
      }
      if (digits.length === 2) return digits;
      return digits;
    }
    timeInput.addEventListener("input", () => {
      const raw = timeInput.value;
      const digits = raw.replace(/\D/g, "");
      if (digits.length >= 4) {
        timeInput.value = formatTimeInput(raw);
        timeInput.setSelectionRange(5, 5);
      }
    });
    timeInput.addEventListener("blur", () => {
      const digits = (timeInput.value || "").replace(/\D/g, "");
      if (digits.length >= 2) timeInput.value = formatTimeInput(timeInput.value);
    });
    const timeErrorEl = modal.querySelector(".todo-reminder-time-error");
    timeInput.addEventListener("input", () => { timeErrorEl.textContent = ""; }, { capture: true });
    modal.querySelector(".todo-reminder-save").addEventListener("click", () => {
      const dateVal = (modal.querySelector(".todo-reminder-date").value || "").trim();
      let timeVal = (timeInput.value || "").trim();
      const digits = timeVal.replace(/\D/g, "");
      if (digits.length >= 2) timeVal = formatTimeInput(timeVal);
      if (!timeVal || digits.length < 2) {
        timeErrorEl.textContent = "시간을 입력하세요.";
        return;
      }
      timeErrorEl.textContent = "";
      tr.dataset.reminderDate = dateVal;
      tr.dataset.reminderTime = timeVal;
      const nextDisplay = formatReminderDisplay(dateVal, timeVal);
      reminderDisplaySpan.textContent = nextDisplay || "";
      reminderTd.classList.toggle("todo-cell-reminder-empty", !nextDisplay);
      reminderBtn.hidden = !!nextDisplay;
      reminderDisplaySpan.classList.toggle("todo-reminder-display--clickable", !!nextDisplay);
      const wrap = tr.closest(".todo-sections-wrap");
      if (wrap) scheduleSaveSectionTasksFromDOM(wrap);
      close();
    });
    document.body.appendChild(modal);
  }

  reminderBtn.addEventListener("click", openReminderModal);
  reminderDisplaySpan.addEventListener("click", (e) => {
    if (reminderDisplaySpan.textContent.trim()) openReminderModal();
  });
  if (reminderDisplayVal) reminderDisplaySpan.classList.add("todo-reminder-display--clickable");

  reminderTd.appendChild(reminderBtn);
  reminderTd.appendChild(reminderDisplaySpan);

  function formatOverdueText(dueStr) {
    if (!dueStr || !dueStr.trim()) return "";
    const parts = String(dueStr).trim().split(/[-/]/);
    if (parts.length < 3) return "";
    const dueY = parseInt(parts[0], 10);
    const dueM = parseInt(parts[1], 10) - 1;
    const dueD = parseInt(parts[2], 10);
    if (Number.isNaN(dueY) || Number.isNaN(dueM) || Number.isNaN(dueD)) return "";
    const due = new Date(dueY, dueM, dueD);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffMs = due.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return `${Math.abs(diffDays)}일 초과`;
    if (diffDays === 0) return "오늘";
    return `${diffDays}일 남음`;
  }
  function formatOverdueDisplay(dueStr, isDone) {
    if (isDone && dueStr && isOverdue(dueStr)) return "과제 완료";
    return formatOverdueText(dueStr);
  }
  function toMMDD(dateStr) {
    if (!dateStr || !String(dateStr).trim()) return "";
    const parts = String(dateStr).trim().split(/[-/]/);
    if (parts.length < 3) return "";
    return `${parts[1]}/${parts[2]}`;
  }
  function syncDateLine() {
    const s = toMMDD(startInput.value);
    const d = toMMDD(dueInput.value);
    let t = "";
    if (s && d) t = `${s} - ${d}`;
    else if (d) t = d;
    else if (s) t = s;
    if (t && dueInput.value && isOverdue(dueInput.value)) t += " " + formatOverdueText(dueInput.value);
    dateLineEl.textContent = t;
  }

  const overdueTd = document.createElement("td");
  overdueTd.className = "todo-cell-overdue";
  const overdueSpan = document.createElement("span");
  overdueSpan.className = "todo-overdue-display";
  overdueSpan.textContent = formatOverdueDisplay(dueDate, done);
  overdueTd.appendChild(overdueSpan);
  const syncOverdueDisplay = () => {
    overdueSpan.textContent = formatOverdueDisplay(dueInput.value, doneCheck.checked);
    tr.classList.toggle("todo-row-overdue", !!(dueInput.value && isOverdue(dueInput.value)));
  };

  const EISENHOWER_LABELS = {
    "urgent-important": "긴급+중요",
    "important-not-urgent": "중요+여유",
    "urgent-not-important": "긴급+덜중요",
    "not-urgent-not-important": "여유+안중요",
    "not-urgent-": "여유+안중요",
  };
  const eisenhowerTd = document.createElement("td");
  eisenhowerTd.className = "todo-cell-eisenhower" + (!eisenhower ? " todo-cell-eisenhower--empty" : "");
  tr.dataset.eisenhower = eisenhower || "";
  const eisenhowerSpan = document.createElement("span");
  eisenhowerSpan.className = "todo-eisenhower-display";
  eisenhowerSpan.textContent = eisenhower ? (EISENHOWER_LABELS[eisenhower] || eisenhower) : "";
  eisenhowerTd.appendChild(eisenhowerSpan);

  const delTd = document.createElement("td");
  delTd.className = "todo-cell-delete";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "todo-task-delete-btn";
  delBtn.title = "삭제";
  delBtn.innerHTML = TASK_DELETE_ICON;
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const section = tr.closest(".todo-section");
    const tbody = tr.parentElement;
    const sectionId = section?.dataset?.section || tr.dataset.sectionId || "";
    const rowTaskId = tr.dataset.taskId || "";
    if (isKpiTodo && kpiTodoId && storageKey) {
      if (removeKpiTodo(kpiTodoId, storageKey)) tr.remove();
    } else if (sectionId && rowTaskId) {
      if (sectionId.startsWith("custom-")) {
        removeTaskFromCustomSectionStorage(sectionId, rowTaskId);
      } else {
        removeTaskFromSectionStorage(sectionId, rowTaskId);
      }
      clearSubtasks(rowTaskId);
      tr.remove();
    } else {
      tr.remove();
    }
    section?.querySelector(".todo-section-count") &&
      (section.querySelector(".todo-section-count").textContent = tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length);
  });
  delTd.appendChild(delBtn);

  const kpiTd = document.createElement("td");
  kpiTd.className = "todo-cell-kpi";
  kpiTd.textContent = isKpiTodo && classification ? classification : "";

  tr.appendChild(doneTd);
  tr.appendChild(nameTd);
  if (eisenhowerSidebarFirst) {
    tr.appendChild(eisenhowerTd);
    tr.appendChild(kpiTd);
    tr.appendChild(startTd);
    tr.appendChild(dueTd);
    tr.appendChild(reminderTd);
    tr.appendChild(overdueTd);
  } else {
    if (overdueColumnOrder) {
      tr.appendChild(overdueTd);
    }
    tr.appendChild(kpiTd);
    tr.appendChild(startTd);
    tr.appendChild(dueTd);
    tr.appendChild(reminderTd);
    if (!overdueColumnOrder) {
      tr.appendChild(overdueTd);
    }
    tr.appendChild(eisenhowerTd);
  }
  if (!options.hideCategoryCol) {
    const lastColTd = document.createElement("td");
    lastColTd.className = "todo-cell-category";
    if (showCategoryCol) {
      lastColTd.textContent = sectionLabel;
      lastColTd.classList.add("todo-cell-category-readonly");
    } else if (isKpiTodo) {
      lastColTd.textContent = classification;
      lastColTd.classList.add("todo-cell-category-readonly");
    } else {
      const categoryDropdown = createCategoryDropdown(classification, () => {});
      lastColTd.appendChild(categoryDropdown.wrap);
    }
    tr.appendChild(lastColTd);
  }
  tr.appendChild(delTd);

  syncDateLine();

  if ((enableDragToCalendar && !hasDates) || enableDragToEisenhower) {
    if (!isSubtask) {
      tr.draggable = true;
      tr.addEventListener("dragstart", (e) => {
        const nameInput = tr.querySelector(".todo-cell-name input");
        const startInput = tr.querySelector(".todo-start-input-hidden");
        const dueInput = tr.querySelector(".todo-due-input-hidden");
        const doneCheck = tr.querySelector(".todo-done-check");
        const rowSectionId = taskData.sectionId || tr.dataset.sectionId || tr.closest(".todo-section")?.dataset?.section || "";
        const startTime = tr.dataset.startTime || "";
        const endTime = tr.dataset.endTime || "";
        const eisenhowerVal = tr.dataset.eisenhower || "";
        let durationMin = 30;
        if (startTime && endTime) {
          const [sh, sm] = startTime.split(":").map(Number);
          const [eh, em] = endTime.split(":").map(Number);
          durationMin = Math.max(30, (eh * 60 + em) - (sh * 60 + sm));
        }
        const payload = {
          taskId,
          sectionId: rowSectionId,
          name: (nameInput?.value || "").trim(),
          startDate: startInput?.value || "",
          dueDate: dueInput?.value || "",
          startTime,
          endTime,
          eisenhower: eisenhowerVal,
          done: doneCheck?.checked || false,
          itemType: tr.dataset.itemType || "todo",
          isKpiTodo: !!isKpiTodo,
          kpiTodoId: kpiTodoId || "",
          storageKey: storageKey || "",
          _durationMin: durationMin,
        };
        if (enableDragToEisenhower) {
          e.dataTransfer.setData(DRAG_TYPE_TODO_TO_EISENHOWER, JSON.stringify(payload));
        }
        if (enableDragToCalendar && !hasDates) {
          window.__calendarDragDuration = durationMin;
          e.dataTransfer.setData(DRAG_TYPE_TODO_TO_CALENDAR, JSON.stringify(payload));
        }
        e.dataTransfer.effectAllowed = "move";
      });
    }
  }

  return tr;
}

function createSection(section, options = {}) {
  const { lastColHeader = "분류", initialTasks = [], showCategoryCol = false, sectionIdForAdd = null, hideCategoryCol = true, tabMode = false, showCheckboxTypeMenu = null, enableDragToCalendar = false, enableDragToEisenhower = false, hideAddRow = false, overdueColumnOrder = false, eisenhowerSidebarFirst = false } = options;
  const sectionId = sectionIdForAdd ?? section.id;

  const wrap = document.createElement("div");
  wrap.className = "todo-section" + (tabMode ? " todo-section-tab-panel" : "");
  wrap.dataset.section = section.id;

  const isOverdueSection = section.id === "overdue";
  let header = null;
  if (!tabMode) {
    header = document.createElement("div");
    header.className = "todo-section-header" + (isOverdueSection ? " todo-section-header--no-collapse" : "");
    header.innerHTML = isOverdueSection
      ? `
      <span class="todo-section-label">${section.label}</span>
      <span class="todo-section-count">0</span>
    `
      : `
      <span class="todo-section-arrow">▼</span>
      <span class="todo-section-label">${section.label}</span>
      <span class="todo-section-count">0</span>
    `;
  } else {
    const countSpan = document.createElement("span");
    countSpan.className = "todo-section-count";
    countSpan.textContent = "0";
    countSpan.style.display = "none";
    wrap.appendChild(countSpan);
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "todo-table-wrap";
  const table = document.createElement("table");
  table.className = "todo-table";
  const colgroupOverdue = overdueColumnOrder
    ? (hideCategoryCol
        ? `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-overdue" style="width: 5rem">
      <col class="todo-col-kpi" style="min-width: 8rem; width: 10rem">
      <col class="todo-col-start" style="width: 4.5rem">
      <col class="todo-col-due" style="width: 4.5rem">
      <col class="todo-col-reminder" style="width: 7.5rem">
      <col class="todo-col-eisenhower" style="width: 6rem">
      <col class="todo-col-delete" style="width: 2.5rem">
    </colgroup>`
        : `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-overdue" style="width: 5rem">
      <col class="todo-col-kpi" style="min-width: 8rem; width: 10rem">
      <col class="todo-col-start" style="width: 4.5rem">
      <col class="todo-col-due" style="width: 4.5rem">
      <col class="todo-col-reminder" style="width: 7.5rem">
      <col class="todo-col-eisenhower" style="width: 6rem">
      <col class="todo-col-category" style="width: 5rem">
      <col class="todo-col-delete" style="width: 2.5rem">
    </colgroup>`)
    : null;
  const colgroupEisenhowerSidebarFirst = eisenhowerSidebarFirst
    ? (hideCategoryCol
        ? `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-eisenhower" style="width: 6rem">
      <col class="todo-col-kpi" style="min-width: 8rem; width: 10rem">
      <col class="todo-col-start" style="width: 4.5rem">
      <col class="todo-col-due" style="width: 4.5rem">
      <col class="todo-col-reminder" style="width: 7.5rem">
      <col class="todo-col-overdue" style="width: 5rem">
      <col class="todo-col-delete" style="width: 2.5rem">
    </colgroup>`
        : `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-eisenhower" style="width: 6rem">
      <col class="todo-col-kpi" style="min-width: 8rem; width: 10rem">
      <col class="todo-col-start" style="width: 4.5rem">
      <col class="todo-col-due" style="width: 4.5rem">
      <col class="todo-col-reminder" style="width: 7.5rem">
      <col class="todo-col-overdue" style="width: 5rem">
      <col class="todo-col-category" style="width: 5rem">
      <col class="todo-col-delete" style="width: 2.5rem">
    </colgroup>`)
    : null;
  const colgroupDefault = hideCategoryCol
    ? `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-kpi" style="min-width: 8rem; width: 10rem">
      <col class="todo-col-start" style="width: 4.5rem">
      <col class="todo-col-due" style="width: 4.5rem">
      <col class="todo-col-reminder" style="width: 7.5rem">
      <col class="todo-col-overdue" style="width: 5rem">
      <col class="todo-col-eisenhower" style="width: 6rem">
      <col class="todo-col-delete" style="width: 2.5rem">
    </colgroup>`
    : `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-kpi" style="min-width: 8rem; width: 10rem">
      <col class="todo-col-start" style="width: 4.5rem">
      <col class="todo-col-due" style="width: 4.5rem">
      <col class="todo-col-reminder" style="width: 7.5rem">
      <col class="todo-col-overdue" style="width: 5rem">
      <col class="todo-col-eisenhower" style="width: 6rem">
      <col class="todo-col-category" style="width: 5rem">
      <col class="todo-col-delete" style="width: 2.5rem">
    </colgroup>`;
  const colgroupHtml = colgroupOverdue || colgroupEisenhowerSidebarFirst || colgroupDefault;
  const theadCategoryTh = hideCategoryCol ? "" : `<th class="todo-th-category">${lastColHeader}</th>`;
  const theadEisenhowerSidebarFirst = eisenhowerSidebarFirst
    ? `<tr>
        <th class="todo-th-done"></th>
        <th class="todo-th-name">할일 이름</th>
        <th class="todo-th-eisenhower">우선순위</th>
        <th class="todo-th-kpi">KPI</th>
        <th class="todo-th-start">시작일</th>
        <th class="todo-th-due">마감일</th>
        <th class="todo-th-reminder">리마인더</th>
        <th class="todo-th-overdue">기한</th>
        ${theadCategoryTh}
        <th class="todo-th-delete"></th>
      </tr>`
    : null;
  const theadOverdue = overdueColumnOrder
    ? `<tr>
        <th class="todo-th-done"></th>
        <th class="todo-th-name">할일 이름</th>
        <th class="todo-th-overdue">기한</th>
        <th class="todo-th-kpi">KPI</th>
        <th class="todo-th-start">시작일</th>
        <th class="todo-th-due">마감일</th>
        <th class="todo-th-reminder">리마인더</th>
        <th class="todo-th-eisenhower">우선순위</th>
        ${theadCategoryTh}
        <th class="todo-th-delete"></th>
      </tr>`
    : `<tr>
        <th class="todo-th-done"></th>
        <th class="todo-th-name">할일 이름</th>
        <th class="todo-th-kpi">KPI</th>
        <th class="todo-th-start">시작일</th>
        <th class="todo-th-due">마감일</th>
        <th class="todo-th-reminder">리마인더</th>
        <th class="todo-th-overdue">기한</th>
        <th class="todo-th-eisenhower">우선순위</th>
        ${theadCategoryTh}
        <th class="todo-th-delete"></th>
      </tr>`;
  const theadHtml = theadEisenhowerSidebarFirst || theadOverdue;
  table.innerHTML = `
    ${colgroupHtml}
    <thead>
      ${theadHtml}
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  initialTasks.forEach((t) => {
    const taskId = t.taskId || getTaskId(t);
    t.taskId = taskId;
    const tr = createTaskRow(t, { showCategoryCol, hideCategoryCol, isSubtask: false, taskId, showCheckboxTypeMenu, enableDragToCalendar, enableDragToEisenhower, overdueColumnOrder, eisenhowerSidebarFirst });
    tr.dataset.sectionId = t.sectionId || "";
    tbody.appendChild(tr);
    const container = tr.querySelector(".todo-subtasks-container");
    if (container) {
      getSubtasks(taskId).forEach((st) => {
        const item = createSubtaskItem(taskId, st, updateCount);
        container.appendChild(item);
      });
    }
  });

  const addRow = document.createElement("tr");
  addRow.className = "todo-add-row";
  const addColspan = hideCategoryCol ? 9 : 10;
  addRow.innerHTML = `
    <td class="todo-add-cell todo-add-cell-btn">
      <button type="button" class="todo-add-btn" title="할 일 추가">${ADD_TASK_ICON}</button>
    </td>
    <td colspan="${addColspan - 1}" class="todo-add-cell todo-add-cell-fill"></td>
  `;
  if (!hideAddRow) tbody.insertBefore(addRow, tbody.firstChild);

  const countEl = () => (tabMode ? wrap.querySelector(".todo-section-count") : header?.querySelector(".todo-section-count"));

  function updateCount() {
    const el = countEl();
    if (el) el.textContent = String(tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length);
  }

  if (!hideAddRow) {
    addRow.querySelector(".todo-add-btn").addEventListener("click", () => {
      const taskData = showCategoryCol
        ? {
            sectionId: getSections()[0]?.id || "",
            sectionLabel: getSections()[0]?.label || "",
            classification: section.id,
          }
        : { sectionId };
      const taskId = getTaskId(taskData);
      taskData.taskId = taskId;
      const tr = createTaskRow(taskData, { showCategoryCol, hideCategoryCol, isSubtask: false, taskId, showCheckboxTypeMenu, enableDragToCalendar, enableDragToEisenhower, overdueColumnOrder, eisenhowerSidebarFirst });
      tbody.insertBefore(tr, addRow.nextSibling);
      updateCount();
      console.log("[DEBUG todo-row] + clicked, new row created", { taskId, sectionId: section.id });
      const nameInput = tr.querySelector(".todo-cell-name input");
      if (nameInput) {
        nameInput.focus();
      }
    });
  }

  const arrowEl = header?.querySelector(".todo-section-arrow");
  if (arrowEl) {
    arrowEl.addEventListener("click", () => {
      wrap.classList.toggle("is-collapsed");
    });
  }

  tableWrap.appendChild(table);
  if (header) wrap.appendChild(header);
  wrap.appendChild(tableWrap);
  updateCount();
  return { wrap, updateCount };
}

function collectTasksFromDOM(sectionsEl) {
  const tasks = [];
  const sectionIds = new Set(getSections().map((s) => s.id));
  sectionsEl?.querySelectorAll(".todo-section").forEach((sec) => {
    const secId = sec.dataset.section;
    const isCategoryView = sectionIds.has(secId);
    sec.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").forEach((row) => {
      const nameInput = row.querySelector(".todo-cell-name input");
      const startInput = row.querySelector(".todo-start-input-hidden");
      const dueInput = row.querySelector(".todo-due-input-hidden");
      const eisenhowerSelect = row.querySelector(".todo-eisenhower-select");
      const catCell = row.querySelector(".todo-cell-category");
      const catInput = catCell?.querySelector(".todo-category-input");
      const doneCheck = row.querySelector(".todo-done-check");
      const rowSectionId = row.dataset.sectionId || secId;
      const sectionLabel = getSections().find((s) => s.id === rowSectionId)?.label || "";
      const classification = catCell
        ? (isCategoryView ? (catInput ? catInput.value : catCell?.textContent || "").trim() : secId)
        : secId;
      const task = {
        name: nameInput?.value || "",
        startDate: startInput?.value || "",
        dueDate: dueInput?.value || "",
        startTime: row.dataset.startTime || "",
        endTime: row.dataset.endTime || "",
        eisenhower: eisenhowerSelect?.value || row.dataset.eisenhower || "",
        classification,
        sectionId: rowSectionId,
        sectionLabel,
        done: doneCheck?.checked || false,
        reminderDate: row.dataset.reminderDate || "",
        reminderTime: row.dataset.reminderTime || "",
      };
      if (row.dataset.isKpiTodo === "true") {
        task.isKpiTodo = true;
        task.kpiTodoId = row.dataset.kpiTodoId || "";
        task.storageKey = row.dataset.kpiStorageKey || "";
      }
      tasks.push(task);
    });
  });
  return tasks;
}

function renderSections(container, tasksData = [], options = {}) {
  const { tabMode = false, showCheckboxTypeMenu = null, enableDragToCalendar = false, enableDragToEisenhower = false, sectionsOverride = null, eisenhowerSidebarFirst = false } = options;
  container.innerHTML = "";
  const results = [];
  const sections = sectionsOverride || getSections();
  sections.forEach((section) => {
    const sectionTasks = tasksData.filter((t) => t.sectionId === section.id);
    const sectionOpts = {
      lastColHeader: "분류",
      initialTasks: sectionTasks,
      showCategoryCol: false,
      sectionIdForAdd: section.id === "overdue" ? null : (section.id === "tasks" ? "braindump" : section.id),
      hideCategoryCol: true,
      tabMode,
      showCheckboxTypeMenu,
      enableDragToCalendar,
      enableDragToEisenhower,
      hideAddRow: section.id === "overdue",
      overdueColumnOrder: section.id === "overdue",
      eisenhowerSidebarFirst: eisenhowerSidebarFirst && section.id !== "overdue",
    };
    const { wrap, updateCount } = createSection(section, sectionOpts);
    container.appendChild(wrap);
    results.push({ section, wrap, updateCount });
  });
  return results;
}

function isOverdue(dueStr) {
  if (!dueStr || !dueStr.trim()) return false;
  const parts = String(dueStr).trim().split(/[-/]/);
  if (parts.length < 3) return false;
  const due = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

export function render(options = {}) {
  const { hideToolbar = false, hideHeader = false, settingsSlot = null, addButtonSlot = null, enableDragToCalendar = false, enableDragToEisenhower = false, initialActiveTabIndex = 0, eisenhowerFilter = "", eisenhowerSidebarFirst = false } = options;
  const el = document.createElement("div");
  el.className = "app-tab-panel-content todo-list-view";

  const header = document.createElement("div");
  header.className = "todo-list-header";
  header.hidden = hideToolbar || hideHeader;
  const titleEl = document.createElement("h2");
  titleEl.className = "todo-list-title";
  titleEl.textContent = "할 일/일정";
  header.appendChild(titleEl);
  el.appendChild(header);

  const toolbar = document.createElement("div");
  toolbar.className = "todo-list-toolbar";
  toolbar.hidden = hideToolbar;
  const settingsBtn = document.createElement("button");
  settingsBtn.type = "button";
  settingsBtn.className = "todo-list-toolbar-btn todo-list-settings-btn";
  settingsBtn.title = "할 일 환경 설정";
  settingsBtn.innerHTML = '<img src="/toolbaricons/settings.svg" alt="" class="todo-list-settings-icon" width="18" height="18">';

  const initialSettings = getTodoSettings();
  let hideCompleted = initialSettings.hideCompleted;
  el.classList.toggle("hide-completed", hideCompleted);

  function doClearCompleted() {
    const removed = removeAllCompletedKpiTodos();
    const rowsToRemove = [];
    el.querySelectorAll(".todo-task-row").forEach((row) => {
      const check = row.querySelector(".todo-done-check");
      if (check?.checked && row.dataset.taskId) {
        rowsToRemove.push(row);
      }
    });
    rowsToRemove.forEach((r) => {
      clearSubtasks(r.dataset.taskId);
      r.remove();
    });
    el.querySelectorAll(".todo-subtask-item").forEach((item) => {
      const check = item.querySelector(".todo-done-check");
      if (check?.checked) {
        const parentTaskId = item.dataset.parentTaskId;
        const subtaskId = item.dataset.subtaskId;
        if (parentTaskId && subtaskId) removeSubtask(parentTaskId, subtaskId);
        item.remove();
      }
    });
    if (removed > 0 || rowsToRemove.length > 0) {
      el.querySelectorAll(".todo-section").forEach((sec) => {
        const count = sec.querySelectorAll(".todo-task-row").length;
        const countEl = sec.querySelector(".todo-section-count");
        if (countEl) countEl.textContent = count;
      });
      sectionResults.forEach(({ updateCount }) => updateCount());
      updateTabLabels();
    }
  }

  settingsBtn.addEventListener("click", () => {
    createTodoSettingsModal({
      onHideCompletedChange: (v) => {
        hideCompleted = v;
        el.classList.toggle("hide-completed", hideCompleted);
      },
      onClearCompleted: doClearCompleted,
      onColorsChange: () => {
        applyTabColors();
      },
    });
  });

  if (settingsSlot) {
    settingsSlot.appendChild(settingsBtn);
  } else {
    toolbar.appendChild(settingsBtn);
  }

  const toolbarRow = document.createElement("div");
  toolbarRow.className = "todo-list-toolbar-row";
  el.appendChild(toolbarRow);

  const categoryTabs = document.createElement("div");
  categoryTabs.className = "todo-category-tabs";
  const tabButtons = [];

  function applyTabColors() {
    /* 리스트 탭 컬러 테두리 제거 - 탭 스타일은 CSS로 통일 */
  }

  /* 할일/일정: 고정 5개 탭만 표시 (브레인덤프, 꿈, 부수입, 건강, 행복), 리스트 추가 비노출 */
  FIXED_SECTIONS.forEach((section) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "todo-category-tab";
    btn.dataset.section = section.id;
    btn.innerHTML = `<span class="todo-category-tab-label">${section.label}</span> <span class="todo-category-tab-count">0</span>`;
    tabButtons.push(btn);
    categoryTabs.appendChild(btn);
  });

  toolbarRow.appendChild(categoryTabs);
  if (!settingsSlot) {
    toolbarRow.appendChild(toolbar);
  }

  const listTabContextMenu = document.createElement("div");
  listTabContextMenu.className = "todo-list-tab-context-menu";
  listTabContextMenu.hidden = true;
  listTabContextMenu.innerHTML = `
    <button type="button" class="todo-list-tab-context-menu-item" data-action="edit">편집</button>
    <button type="button" class="todo-list-tab-context-menu-item" data-action="delete">삭제</button>
  `;
  document.body.appendChild(listTabContextMenu);

  let listTabContextTarget = null;
  const hideListTabMenu = () => {
    listTabContextMenu.hidden = true;
    listTabContextTarget = null;
  };
  listTabContextMenu.querySelector('[data-action="edit"]').addEventListener("click", () => {
    if (!listTabContextTarget) return;
    const sectionId = listTabContextTarget.dataset.section;
    const section = getCustomSections().find((s) => s.id === sectionId);
    if (!section) return;
    hideListTabMenu();
    showEditListModal({
      sectionId,
      currentLabel: section.label,
      onSuccess: (updated) => {
        listTabContextTarget.querySelector(".todo-category-tab-label").textContent = updated.label;
      },
    });
  });
  listTabContextMenu.querySelector('[data-action="delete"]').addEventListener("click", () => {
    if (!listTabContextTarget) return;
    const tabToRemove = listTabContextTarget;
    const sectionId = tabToRemove.dataset.section;
    const section = getCustomSections().find((s) => s.id === sectionId);
    if (!section) return;
    hideListTabMenu();
    showConfirmModal({
      title: "리스트 삭제",
      message: `"${section.label}" 리스트를 삭제하시겠습니까?`,
      confirmText: "삭제",
      cancelText: "취소",
      onConfirm: () => {
        const tabIndex = tabButtons.indexOf(tabToRemove);
        removeCustomSection(sectionId);
        removeCustomSectionTasks(sectionId);
        const panelResult = sectionResults.find((r) => r.wrap.dataset.section === sectionId);
        if (panelResult) {
          panelResult.wrap.remove();
          sectionResults.splice(sectionResults.indexOf(panelResult), 1);
        }
        tabToRemove.remove();
        tabButtons.splice(tabIndex, 1);
        if (activeSectionIndex >= tabIndex) activeSectionIndex = Math.max(0, activeSectionIndex - 1);
        if (activeSectionIndex >= tabButtons.length) activeSectionIndex = tabButtons.length - 1;
        tabButtons.forEach((b, i) => b.classList.toggle("active", i === activeSectionIndex));
        sectionResults.forEach((r, i) => r.wrap.classList.toggle("is-active", i === activeSectionIndex));
        updateTabLabels();
      },
    });
  });
  document.addEventListener("click", hideListTabMenu);
  document.addEventListener("contextmenu", hideListTabMenu);

  categoryTabs.addEventListener("contextmenu", (e) => {
    const tab = e.target.closest(".todo-category-tab:not(.todo-category-tab-add)");
    if (!tab) return;
    const sectionId = tab.dataset.section;
    if (!sectionId || !sectionId.startsWith("custom-")) return;
    e.preventDefault();
    e.stopPropagation();
    listTabContextTarget = tab;
    listTabContextMenu.hidden = false;
    listTabContextMenu.style.left = `${e.clientX}px`;
    listTabContextMenu.style.top = `${e.clientY}px`;
  });

  const sectionsWrap = document.createElement("div");
  sectionsWrap.className = "todo-sections-wrap todo-tab-panels";

  const { menu: checkboxTypeMenu, show: showCheckboxTypeMenu } = createTodoCheckboxTypeMenu();
  checkboxTypeMenu.hidden = true;
  el.appendChild(checkboxTypeMenu);

  const kpiTasks = getKpiTodosAsTasks();
  const sectionTasks = FIXED_SECTION_IDS_FOR_STORAGE.flatMap((sid) => loadSectionTasks(sid));
  const customTasks = getCustomSections().flatMap((s) => loadCustomSectionTasks(s.id));
  let allTasks = [...kpiTasks, ...sectionTasks, ...customTasks];
  if ((eisenhowerFilter || "").trim()) {
    const q = (eisenhowerFilter || "").trim();
    const EISENHOWER_LABELS = { "urgent-important": "긴급+중요", "important-not-urgent": "중요+여유", "urgent-not-important": "긴급+덜중요", "not-urgent-not-important": "여유+안중요" };
    const labelForQ = EISENHOWER_LABELS[q];
    allTasks = allTasks.filter((t) => {
      const v = (t.eisenhower || "").trim();
      return v === q || (labelForQ && v === labelForQ);
    });
  }
  const sectionResults = renderSections(sectionsWrap, allTasks, { tabMode: true, showCheckboxTypeMenu, enableDragToCalendar, enableDragToEisenhower, eisenhowerSidebarFirst, sectionsOverride: FIXED_SECTIONS });

  function updateTabLabels() {
    tabButtons.forEach((btn, i) => {
      const sec = sectionResults[i]?.wrap;
      const count = sec ? sec.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length : 0;
      btn.querySelector(".todo-category-tab-count").textContent = String(count);
    });
  }
  updateTabLabels();

  const safeIndex = Math.max(0, Math.min(initialActiveTabIndex, tabButtons.length - 1));
  let activeSectionIndex = safeIndex;
  sectionResults.forEach((r, i) => {
    r.wrap.classList.toggle("is-active", i === safeIndex);
  });

  tabButtons.forEach((btn, i) => {
    btn.addEventListener("click", () => {
      activeSectionIndex = i;
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      sectionResults.forEach((r, idx) => {
        r.wrap.classList.toggle("is-active", idx === i);
      });
    });
  });
  tabButtons.forEach((b, i) => b.classList.toggle("active", i === safeIndex));

  if (addButtonSlot) {
    const headerAddBtn = document.createElement("button");
    headerAddBtn.type = "button";
    headerAddBtn.className = "todo-add-btn todo-header-add-btn";
    headerAddBtn.title = "할 일 추가";
    headerAddBtn.innerHTML = ADD_TASK_ICON;
    headerAddBtn.addEventListener("click", () => {
      const idx = activeSectionIndex;
      if (idx < 0 || idx >= sectionResults.length) return;
      const { section, wrap, updateCount } = sectionResults[idx];
      if (section.id === "overdue") return;
      const tbody = wrap.querySelector("tbody");
      if (!tbody) return;
      const addRow = tbody.querySelector(".todo-add-row");
      const taskData = { sectionId: section.id, sectionLabel: section.label, name: "", done: false };
      const taskId = getTaskId(taskData);
      taskData.taskId = taskId;
      const tr = createTaskRow(taskData, { showCategoryCol: false, hideCategoryCol: true, isSubtask: false, taskId, showCheckboxTypeMenu, enableDragToCalendar, enableDragToEisenhower, overdueColumnOrder: false, eisenhowerSidebarFirst });
      if (addRow) {
        tbody.insertBefore(tr, addRow.nextSibling);
      } else if (tbody.firstChild) {
        tbody.insertBefore(tr, tbody.firstChild);
      } else {
        tbody.appendChild(tr);
      }
      updateCount();
      updateTabLabels();
      const nameInput = tr.querySelector(".todo-cell-name input");
      if (nameInput) nameInput.focus();
    });
    addButtonSlot.appendChild(headerAddBtn);
  }

  el.appendChild(sectionsWrap);

  const observer = new MutationObserver(() => {
    updateTabLabels();
  });
  sectionResults.forEach(({ wrap }) => {
    observer.observe(wrap.querySelector("tbody"), { childList: true });
  });

  // 우클릭 컨텍스트 메뉴: 태스크를 다른 리스트로 이동
  let contextMenuTargetRow = null;
  const { menu, show: showContextMenu, hide: hideContextMenu } = createBraindumpContextMenu((targetSectionId) => {
    const row = contextMenuTargetRow;
    if (!row) return;
    const section = row.closest(".todo-section");
    const fromSectionId = section?.dataset.section || row.dataset.sectionId || "";
    if (fromSectionId === targetSectionId) return;

    const oldTaskId = row.dataset.taskId || "";
    const subtasksToMove = getSubtasks(oldTaskId);

    const nameInput = row.querySelector(".todo-cell-name input");
    const startInput = row.querySelector(".todo-start-input-hidden");
    const dueInput = row.querySelector(".todo-due-input-hidden");
    const doneCheck = row.querySelector(".todo-done-check");
    const eisenhowerSelect = row.querySelector(".todo-eisenhower-select");
    const name = (nameInput?.value || "").trim();
    const startDate = startInput?.value || "";
    const dueDate = dueInput?.value || "";
    const startTime = row.dataset.startTime || "";
    const endTime = row.dataset.endTime || "";
    const eisenhower = eisenhowerSelect?.value || row.dataset.eisenhower || "";
    const done = doneCheck?.checked || false;
    const itemType = row.dataset.itemType || "todo";

    let result = { success: false };
    const kpiTodoId = row.dataset.kpiTodoId;
    const storageKey = row.dataset.kpiStorageKey;
    const taskPayload = { taskId: oldTaskId, name, startDate, dueDate, startTime, endTime, eisenhower, done, itemType };
    const sectionLabelMap = { dream: "꿈", sideincome: "부수입", health: "건강", happy: "행복", braindump: "브레인 덤프" };
    const getTargetLabel = (id) => sectionLabelMap[id] || getCustomSections().find((s) => s.id === id)?.label || id;

    if (kpiTodoId && storageKey) {
      if (targetSectionId.startsWith("custom-")) {
        const moved = removeKpiTodo(kpiTodoId, storageKey);
        if (moved) {
          try {
            const customRaw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
            const customObj = customRaw ? JSON.parse(customRaw) : {};
            if (!customObj[targetSectionId]) customObj[targetSectionId] = [];
            customObj[targetSectionId].push({ ...taskPayload, taskId: oldTaskId });
            localStorage.setItem(CUSTOM_SECTION_TASKS_KEY, JSON.stringify(customObj));
            result = { success: true, task: { name, startDate, dueDate, startTime, endTime, eisenhower, done, sectionId: targetSectionId, sectionLabel: getTargetLabel(targetSectionId), itemType, isKpiTodo: false, taskId: oldTaskId } };
          } catch (_) {}
        }
      } else {
        result = moveKpiTodoToSection(kpiTodoId, storageKey, targetSectionId);
      }
    } else if (name) {
      let moved = false;
      const fromIsKpi = KPI_SECTION_IDS.includes(fromSectionId);
      const targetIsKpi = KPI_SECTION_IDS.includes(targetSectionId);
      const fromUsesSectionStorage = fromIsKpi || fromSectionId === "braindump";
      const targetUsesSectionStorage = targetIsKpi || targetSectionId === "braindump";
      const fromIsCustom = fromSectionId.startsWith("custom-");
      const targetIsCustom = targetSectionId.startsWith("custom-");

      if (fromUsesSectionStorage && targetUsesSectionStorage) {
        moved = moveSectionTaskToSection(fromSectionId, oldTaskId, targetSectionId, taskPayload);
      } else if (fromIsCustom && targetIsCustom) {
        moved = moveCustomSectionTaskToSection(fromSectionId, oldTaskId, targetSectionId, taskPayload);
      } else if (fromUsesSectionStorage && targetIsCustom) {
        moved = (() => {
          try {
            const raw = localStorage.getItem(SECTION_TASKS_KEY);
            if (!raw) return false;
            const obj = JSON.parse(raw);
            const fromArr = obj[fromSectionId];
            if (!Array.isArray(fromArr)) return false;
            const idx = fromArr.findIndex((x) => (x.taskId || "") === oldTaskId);
            if (idx < 0) return false;
            fromArr.splice(idx, 1);
            localStorage.setItem(SECTION_TASKS_KEY, JSON.stringify(obj));
            const customRaw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
            const customObj = customRaw ? JSON.parse(customRaw) : {};
            if (!customObj[targetSectionId]) customObj[targetSectionId] = [];
            customObj[targetSectionId].push({ ...taskPayload, taskId: oldTaskId });
            localStorage.setItem(CUSTOM_SECTION_TASKS_KEY, JSON.stringify(customObj));
            return true;
          } catch (_) {}
          return false;
        })();
      } else if (fromIsCustom && targetUsesSectionStorage) {
        moved = (() => {
          try {
            const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
            if (!raw) return false;
            const obj = JSON.parse(raw);
            const fromArr = obj[fromSectionId];
            if (!Array.isArray(fromArr)) return false;
            const idx = fromArr.findIndex((x) => (x.taskId || "") === oldTaskId);
            if (idx < 0) return false;
            fromArr.splice(idx, 1);
            localStorage.setItem(CUSTOM_SECTION_TASKS_KEY, JSON.stringify(obj));
            const sectionRaw = localStorage.getItem(SECTION_TASKS_KEY);
            const sectionObj = sectionRaw ? JSON.parse(sectionRaw) : {};
            if (!sectionObj[targetSectionId]) sectionObj[targetSectionId] = [];
            sectionObj[targetSectionId].push({ ...taskPayload, taskId: oldTaskId });
            localStorage.setItem(SECTION_TASKS_KEY, JSON.stringify(sectionObj));
            return true;
          } catch (_) {}
          return false;
        })();
      }

      if (moved) {
        result = { success: true, task: { name, startDate, dueDate, startTime, endTime, eisenhower, done, sectionId: targetSectionId, sectionLabel: getTargetLabel(targetSectionId), itemType, isKpiTodo: false, taskId: oldTaskId } };
      }
    }

    if (result.success && result.task) {
      const targetResult = sectionResults.find((r) => r.wrap.dataset.section === targetSectionId);
      if (targetResult) {
        const targetTbody = targetResult.wrap.querySelector("tbody");
        const addRow = targetTbody?.querySelector(".todo-add-row");
        const taskData = result.task;
        const taskId = getTaskId(taskData);
        taskData.taskId = taskId;
        const newTr = createTaskRow(taskData, {
          hideCategoryCol: true,
          isSubtask: false,
          taskId,
          showCheckboxTypeMenu,
        });
        newTr.dataset.sectionId = targetSectionId;
        if (addRow) targetTbody.insertBefore(newTr, addRow.nextSibling);

        setSubtasks(taskId, subtasksToMove);
        const container = newTr.querySelector(".todo-subtasks-container");
        const updateCount = () => {
          const countEl = targetResult.wrap?.querySelector(".todo-section-count");
          if (countEl) countEl.textContent = String(targetTbody?.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length || 0);
        };
        subtasksToMove.forEach((st) => {
          const item = createSubtaskItem(taskId, st, updateCount);
          if (container) container.appendChild(item);
        });

        clearSubtasks(oldTaskId);
        targetResult.updateCount();
      }
      row.remove();
      sectionResults.find((r) => r.wrap === section)?.updateCount();
      updateTabLabels();
    }
  });
  document.body.appendChild(menu);

  sectionsWrap.addEventListener("contextmenu", (e) => {
    const row = e.target.closest(".todo-task-row:not(.todo-subtask-row)");
    if (!row) return;
    if (!e.target.closest(".todo-cell-name")) return;
    e.preventDefault();
    e.stopPropagation();
    contextMenuTargetRow = row;
    const section = row.closest(".todo-section");
    const sectionId = section?.dataset.section || "";
    showContextMenu(e.clientX, e.clientY, sectionId || null);
  });

  return el;
}

/** 아이젠하워 사이드바용: 할일(탭) + 기한 초과 섹션 */
export function renderTodoListForEisenhowerSidebar(options = {}) {
  const { enableDragToEisenhower = true } = options;
  const mainList = render({ hideToolbar: true, enableDragToEisenhower, eisenhowerSidebarFirst: true });
  mainList.classList.add("todo-list-eisenhower-sidebar");

  const kpiTasks = getKpiTodosAsTasks();
  const sectionTasks = FIXED_SECTION_IDS_FOR_STORAGE.flatMap((sid) => loadSectionTasks(sid));
  const customTasks = getCustomSections().flatMap((s) => loadCustomSectionTasks(s.id));
  const allTasks = [...kpiTasks, ...sectionTasks, ...customTasks];
  const overdueTasks = allTasks.filter((t) => isOverdue(t.dueDate) && !t.done).map((t) => ({ ...t, sectionId: "overdue" }));

  const overdueWrap = document.createElement("div");
  overdueWrap.className = "todo-eisenhower-overdue-section";
  renderSections(overdueWrap, overdueTasks, {
    tabMode: false,
    showCheckboxTypeMenu: null,
    enableDragToCalendar: false,
    enableDragToEisenhower,
    sectionsOverride: [{ id: "overdue", label: "기한 초과" }],
  });

  mainList.appendChild(overdueWrap);
  return mainList;
}

/** 날짜 정하기 사이드바용: 기한 초과 섹션만 반환 (할일 목록 60% / 기한 초과 40% 분할 시 아래 40%에 넣음) */
export function renderOverdueSection(options = {}) {
  const { enableDragToCalendar = true } = options;
  const kpiTasks = getKpiTodosAsTasks();
  const sectionTasks = FIXED_SECTION_IDS_FOR_STORAGE.flatMap((sid) => loadSectionTasks(sid));
  const customTasks = getCustomSections().flatMap((s) => loadCustomSectionTasks(s.id));
  const allTasks = [...kpiTasks, ...sectionTasks, ...customTasks];
  const overdueTasks = allTasks.filter((t) => isOverdue(t.dueDate) && !t.done).map((t) => ({ ...t, sectionId: "overdue" }));

  const overdueWrap = document.createElement("div");
  overdueWrap.className = "todo-eisenhower-overdue-section todo-overdue-in-date-sidebar";
  renderSections(overdueWrap, overdueTasks, {
    tabMode: false,
    showCheckboxTypeMenu: null,
    enableDragToCalendar,
    enableDragToEisenhower: false,
    sectionsOverride: [{ id: "overdue", label: "기한 초과" }],
  });
  return overdueWrap;
}
