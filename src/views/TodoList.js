/**
 * 할일목록 - 토글 헤더 + Name, Due date + Add Task + 분류 드롭다운
 * KPI 할일(꿈/부수입/행복/건강) 연동: 마감일 없음, 꿈이름 자동, 분류=KPI이름
 */

import { getKpiTodosAsTasks, syncKpiTodoCompleted, removeAllCompletedKpiTodos, removeKpiTodo, updateKpiTodo } from "../utils/kpiTodoSync.js";
import { createTodoSettingsModal } from "../utils/todoSettingsModal.js";
import { getTodoSettings } from "../utils/todoSettings.js";
import { getSubtasks, addSubtask, updateSubtask, removeSubtask, clearSubtasks } from "../utils/todoSubtasks.js";

export function saveTodoListBeforeUnmount() {}

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
  '<img src="/toolbaricons/list.svg" alt="세부 할일" class="todo-list-icon" width="18" height="18">';

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

const SECTIONS = [
  { id: "braindump", label: "브레인덤프" },
  { id: "dream", label: "꿈" },
  { id: "sideincome", label: "부수입" },
  { id: "health", label: "건강" },
  { id: "happy", label: "행복" },
];

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
  nameInput.className = "todo-subtask-input";
  nameInput.value = name;
  nameInput.placeholder = "세부 할일 입력";
  nameInput.addEventListener("blur", () => {
    const val = (nameInput.value || "").trim();
    updateSubtask(parentTaskId, subtaskId, { name: val });
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nameInput.blur();
    }
  });
  inputGroup.appendChild(doneCheck);
  inputGroup.appendChild(nameInput);
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
  nameWrap.appendChild(inputGroup);
  nameWrap.appendChild(delBtn);
  wrap.appendChild(nameWrap);
  return wrap;
}

function createTaskRow(taskData = {}, options = {}) {
  const {
    name = "",
    dueDate = "",
    classification = "",
    sectionLabel = "",
    done = false,
    isKpiTodo = false,
    kpiTodoId = "",
    storageKey = "",
  } = taskData;
  const { showCategoryCol = false, isSubtask = false, taskId: optTaskId } = options;
  const taskId = optTaskId || getTaskId(taskData);

  const tr = document.createElement("tr");
  tr.className = "todo-task-row" + (isSubtask ? " todo-subtask-row" : "");
  tr.dataset.sectionId = taskData.sectionId || "";
  if (!isSubtask) tr.dataset.taskId = taskId;
  if (isKpiTodo) {
    tr.classList.add("todo-task-row--kpi");
    tr.dataset.isKpiTodo = "true";
    tr.dataset.kpiTodoId = kpiTodoId;
    tr.dataset.kpiStorageKey = storageKey;
  }

  const doneTd = document.createElement("td");
  doneTd.className = "todo-cell-done";
  const doneCheck = document.createElement("input");
  doneCheck.type = "checkbox";
  doneCheck.className = "todo-done-check";
  doneCheck.checked = done;
  doneCheck.addEventListener("change", () => {
    if (isKpiTodo && kpiTodoId && storageKey) {
      syncKpiTodoCompleted(kpiTodoId, storageKey, doneCheck.checked);
    }
  });
  doneTd.appendChild(doneCheck);

  const nameTd = document.createElement("td");
  nameTd.className = "todo-cell-name" + (isSubtask ? " todo-cell-name-subtask" : "");
  const nameWrap = document.createElement("div");
  nameWrap.className = "todo-cell-name-wrap";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = name;
  if (isKpiTodo && kpiTodoId && storageKey) {
    nameInput.addEventListener("blur", () => {
      const val = (nameInput.value || "").trim();
      if (val !== name) updateKpiTodo(kpiTodoId, storageKey, { text: val });
    });
  }
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nameInput.blur();
    }
  });
  nameWrap.appendChild(nameInput);
  if (!isSubtask) {
    const listBtn = document.createElement("button");
    listBtn.type = "button";
    listBtn.className = "todo-list-btn";
    listBtn.title = "세부 할일 추가";
    listBtn.innerHTML = LIST_ICON;
    listBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const section = tr.closest(".todo-section");
      const updateCount = () => {
        const countEl = section?.querySelector(".todo-section-count");
        if (countEl) countEl.textContent = String(tr.closest("tbody")?.querySelectorAll(".todo-task-row").length || 0);
      };
      addSubtask(taskId, { name: "", done: false });
      const subs = getSubtasks(taskId);
      const newItem = createSubtaskItem(taskId, subs[subs.length - 1], updateCount);
      const container = nameTd.querySelector(".todo-subtasks-container");
      if (container) container.appendChild(newItem);
      updateCount();
    });
    nameWrap.appendChild(listBtn);
  }
  nameTd.appendChild(nameWrap);
  if (!isSubtask) {
    const subtasksContainer = document.createElement("div");
    subtasksContainer.className = "todo-subtasks-container";
    nameTd.appendChild(subtasksContainer);
  }

  const dueTd = document.createElement("td");
  dueTd.className = "todo-cell-due";
  const dueWrap = document.createElement("div");
  dueWrap.className = "todo-due-wrap";
  const dueDisplay = document.createElement("span");
  dueDisplay.className = "todo-due-display";
  if (dueDate && dueDate.includes("-")) {
    const [y, m, d] = dueDate.split("-");
    dueDisplay.innerHTML = y && m && d ? `<span class="todo-due-date-text">${m}/${d}</span>` : '<span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
  } else {
    dueDisplay.innerHTML =
      '<span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
  }
  const dueInput = document.createElement("input");
  dueInput.type = "date";
  dueInput.className = "todo-due-input-hidden";
  dueInput.value = dueDate;
  const syncDueDisplay = () => {
    const val = dueInput.value;
    if (val && val.includes("-")) {
      const [y, m, d] = val.split("-");
      dueDisplay.innerHTML = y && m && d ? `<span class="todo-due-date-text">${m}/${d}</span>` : '<span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
    } else {
      dueDisplay.innerHTML =
        '<span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
    }
  };
  dueInput.addEventListener("change", () => {
    syncDueDisplay();
    if (isKpiTodo && kpiTodoId && storageKey) {
      updateKpiTodo(kpiTodoId, storageKey, { dueDate: dueInput.value });
    }
  });
  dueWrap.addEventListener("click", () => {
    dueInput.focus();
    if (dueInput._flatpickr) dueInput._flatpickr.open();
    else if (typeof dueInput.showPicker === "function") dueInput.showPicker();
    else dueInput.click();
  });
  if (isKpiTodo) {
    dueWrap.style.cursor = "pointer";
  }
  dueWrap.appendChild(dueDisplay);
  dueWrap.appendChild(dueInput);
  dueTd.appendChild(dueWrap);

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
    if (isKpiTodo && kpiTodoId && storageKey) {
      if (removeKpiTodo(kpiTodoId, storageKey)) tr.remove();
    } else {
      tr.remove();
    }
    section?.querySelector(".todo-section-count") &&
      (section.querySelector(".todo-section-count").textContent = tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length);
  });
  delTd.appendChild(delBtn);

  tr.appendChild(doneTd);
  tr.appendChild(nameTd);
  tr.appendChild(dueTd);
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
  return tr;
}

function createSection(section, options = {}) {
  const { lastColHeader = "분류", initialTasks = [], showCategoryCol = false, sectionIdForAdd = null, hideCategoryCol = true, tabMode = false } = options;
  const sectionId = sectionIdForAdd ?? section.id;

  const wrap = document.createElement("div");
  wrap.className = "todo-section" + (tabMode ? " todo-section-tab-panel" : "");
  wrap.dataset.section = section.id;

  let header = null;
  if (!tabMode) {
    header = document.createElement("div");
    header.className = "todo-section-header";
    header.innerHTML = `
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
  const colgroupHtml = hideCategoryCol
    ? `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-due" style="width: 5rem">
      <col class="todo-col-delete" style="width: 0">
    </colgroup>`
    : `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-due" style="width: 5rem">
      <col class="todo-col-category" style="width: 5rem">
      <col class="todo-col-delete" style="width: 0">
    </colgroup>`;
  const theadCategoryTh = hideCategoryCol ? "" : `<th class="todo-th-category">${lastColHeader}</th>`;
  table.innerHTML = `
    ${colgroupHtml}
    <thead>
      <tr>
        <th class="todo-th-done"></th>
        <th class="todo-th-name">Name</th>
        <th class="todo-th-due">마감일</th>
        ${theadCategoryTh}
        <th class="todo-th-delete"></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  initialTasks.forEach((t) => {
    const taskId = getTaskId(t);
    t.taskId = taskId;
    const tr = createTaskRow(t, { showCategoryCol, hideCategoryCol, isSubtask: false, taskId });
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
  addRow.innerHTML = `
    <td colspan="${hideCategoryCol ? 4 : 5}" class="todo-add-cell">
      <button type="button" class="todo-add-btn" title="할 일 추가">${ADD_TASK_ICON}</button>
    </td>
  `;
  tbody.appendChild(addRow);

  const countEl = () => (tabMode ? wrap.querySelector(".todo-section-count") : header?.querySelector(".todo-section-count"));

  function updateCount() {
    const el = countEl();
    if (el) el.textContent = String(tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length);
  }

  addRow.querySelector(".todo-add-btn").addEventListener("click", () => {
    const taskData = showCategoryCol
      ? {
          sectionId: SECTIONS[0]?.id || "",
          sectionLabel: SECTIONS[0]?.label || "",
          classification: section.id,
        }
      : { sectionId };
    const taskId = getTaskId(taskData);
    taskData.taskId = taskId;
    const tr = createTaskRow(taskData, { showCategoryCol, hideCategoryCol, isSubtask: false, taskId });
    tbody.insertBefore(tr, addRow);
    updateCount();
  });

  if (header) {
    header.querySelector(".todo-section-arrow").addEventListener("click", () => {
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
  const sectionIds = new Set(SECTIONS.map((s) => s.id));
  sectionsEl?.querySelectorAll(".todo-section").forEach((sec) => {
    const secId = sec.dataset.section;
    const isCategoryView = sectionIds.has(secId);
    sec.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").forEach((row) => {
      const nameInput = row.querySelector(".todo-cell-name input");
      const dueInput = row.querySelector(".todo-due-input-hidden");
      const catCell = row.querySelector(".todo-cell-category");
      const catInput = catCell?.querySelector(".todo-category-input");
      const doneCheck = row.querySelector(".todo-done-check");
      const rowSectionId = row.dataset.sectionId || secId;
      const sectionLabel = SECTIONS.find((s) => s.id === rowSectionId)?.label || "";
      const classification = catCell
        ? (isCategoryView ? (catInput ? catInput.value : catCell?.textContent || "").trim() : secId)
        : secId;
      const task = {
        name: nameInput?.value || "",
        dueDate: dueInput?.value || "",
        classification,
        sectionId: rowSectionId,
        sectionLabel,
        done: doneCheck?.checked || false,
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
  const { tabMode = false } = options;
  container.innerHTML = "";
  const results = [];
  SECTIONS.forEach((section) => {
    const sectionTasks = tasksData.filter((t) => t.sectionId === section.id);
    const { wrap, updateCount } = createSection(section, {
      lastColHeader: "분류",
      initialTasks: sectionTasks,
      showCategoryCol: false,
      sectionIdForAdd: section.id,
      hideCategoryCol: true,
      tabMode,
    });
    container.appendChild(wrap);
    results.push({ section, wrap, updateCount });
  });
  return results;
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content todo-list-view";

  const toolbar = document.createElement("div");
  toolbar.className = "todo-list-toolbar";
  const settingsBtn = document.createElement("button");
  settingsBtn.type = "button";
  settingsBtn.className = "todo-list-toolbar-btn todo-list-settings-btn";
  settingsBtn.title = "할일 환경설정";
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
      onColorsChange: (colors) => {
        applyTabColors(colors);
      },
    });
  });

  toolbar.appendChild(settingsBtn);
  el.appendChild(toolbar);

  const categoryTabs = document.createElement("div");
  categoryTabs.className = "todo-category-tabs";
  const tabButtons = [];
  const colors = getTodoSettings().sectionColors;

  function applyTabColors(sectionColors) {
    tabButtons.forEach((btn) => {
      const secId = btn.dataset.section;
      if (secId === "braindump") {
        btn.style.borderLeft = "";
        btn.style.paddingLeft = "";
        return;
      }
      const c = sectionColors?.[secId];
      if (c) {
        btn.style.borderLeft = `3px solid ${c}`;
        btn.style.paddingLeft = "calc(1rem - 3px)";
      } else {
        btn.style.borderLeft = "";
        btn.style.paddingLeft = "";
      }
    });
  }

  SECTIONS.forEach((section) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "todo-category-tab";
    btn.dataset.section = section.id;
    btn.innerHTML = `<span class="todo-category-tab-label">${section.label}</span> <span class="todo-category-tab-count">0</span>`;
    const c = section.id !== "braindump" ? colors[section.id] : null;
    if (c) {
      btn.style.borderLeft = `3px solid ${c}`;
      btn.style.paddingLeft = "calc(1rem - 3px)";
    }
    tabButtons.push(btn);
    categoryTabs.appendChild(btn);
  });
  el.appendChild(categoryTabs);

  const sectionsWrap = document.createElement("div");
  sectionsWrap.className = "todo-sections-wrap todo-tab-panels";

  const kpiTasks = getKpiTodosAsTasks();
  const sectionResults = renderSections(sectionsWrap, kpiTasks, { tabMode: true });

  function updateTabLabels() {
    tabButtons.forEach((btn, i) => {
      const sec = sectionResults[i]?.wrap;
      const count = sec ? sec.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length : 0;
      btn.querySelector(".todo-category-tab-count").textContent = String(count);
    });
  }
  updateTabLabels();

  let activeSectionIndex = 0;
  sectionResults.forEach((r, i) => {
    r.wrap.classList.toggle("is-active", i === 0);
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
  tabButtons[0]?.classList.add("active");

  el.appendChild(sectionsWrap);

  const observer = new MutationObserver(() => {
    updateTabLabels();
  });
  sectionResults.forEach(({ wrap }) => {
    observer.observe(wrap.querySelector("tbody"), { childList: true });
  });

  return el;
}
