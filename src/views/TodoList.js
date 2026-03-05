/**
 * 할일목록 - 토글 헤더 + Name, Due date + Add Task + 분류 드롭다운
 * KPI 할일(꿈/부수입/행복/건강) 연동: 마감일 없음, 꿈이름 자동, 분류=KPI이름
 */

import { getKpiTodosAsTasks, syncKpiTodoCompleted } from "../utils/kpiTodoSync.js";

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
  { id: "happy", label: "하면 행복한 일" },
  { id: "dream", label: "꿈" },
  { id: "sideincome", label: "부수입" },
  { id: "health", label: "건강" },
];

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
  const { showCategoryCol = false } = options;

  const tr = document.createElement("tr");
  tr.className = "todo-task-row";
  tr.dataset.sectionId = taskData.sectionId || "";
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
  nameTd.className = "todo-cell-name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = name;
  if (isKpiTodo) nameInput.readOnly = true;
  nameTd.appendChild(nameInput);

  const dueTd = document.createElement("td");
  dueTd.className = "todo-cell-due";
  const dueWrap = document.createElement("div");
  dueWrap.className = "todo-due-wrap";
  const dueDisplay = document.createElement("span");
  dueDisplay.className = "todo-due-display";
  if (dueDate && dueDate.includes("-")) {
    const [y, m, d] = dueDate.split("-");
    dueDisplay.innerHTML = y && m && d ? `<span class="todo-due-date-text">${y}/${m}/${d}</span>` : '<span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
  } else {
    dueDisplay.innerHTML =
      '<span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
  }
  const dueInput = document.createElement("input");
  dueInput.type = "date";
  dueInput.className = "todo-due-input-hidden";
  dueInput.value = dueDate;
  if (!isKpiTodo) {
    dueInput.addEventListener("change", () => {
      const val = dueInput.value;
      if (val) {
        const [y, m, d] = val.split("-");
        dueDisplay.innerHTML = `<span class="todo-due-date-text">${y}/${m}/${d}</span>`;
      } else {
        dueDisplay.innerHTML =
          '<span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
      }
    });
    dueWrap.addEventListener("click", () => {
      dueInput.focus();
      if (typeof dueInput.showPicker === "function") dueInput.showPicker();
      else dueInput.click();
    });
  } else {
    dueWrap.style.cursor = "default";
  }
  dueWrap.appendChild(dueDisplay);
  dueWrap.appendChild(dueInput);
  dueTd.appendChild(dueWrap);

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
  return tr;
}

function createSection(section, options = {}) {
  const { lastColHeader = "분류", initialTasks = [], showCategoryCol = false, sectionIdForAdd = null, hideCategoryCol = true } = options;
  const sectionId = sectionIdForAdd ?? section.id;

  const wrap = document.createElement("div");
  wrap.className = "todo-section";
  wrap.dataset.section = section.id;

  const header = document.createElement("div");
  header.className = "todo-section-header";
  header.innerHTML = `
    <span class="todo-section-arrow">▼</span>
    <span class="todo-section-label">${section.label}</span>
    <span class="todo-section-count">0</span>
  `;

  const tableWrap = document.createElement("div");
  tableWrap.className = "todo-table-wrap";
  const table = document.createElement("table");
  table.className = "todo-table";
  const colgroupHtml = hideCategoryCol
    ? `<colgroup>
      <col class="todo-col-done" style="width: 1rem">
      <col class="todo-col-name" style="width: 208px">
      <col class="todo-col-due" style="width: 2.7rem">
    </colgroup>`
    : `<colgroup>
      <col class="todo-col-done" style="width: 1rem">
      <col class="todo-col-name" style="width: 208px">
      <col class="todo-col-due" style="width: 2.7rem">
      <col class="todo-col-category" style="width: 5rem">
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
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  initialTasks.forEach((t) => {
    const tr = createTaskRow(t, { showCategoryCol, hideCategoryCol });
    tr.dataset.sectionId = t.sectionId || "";
    tbody.appendChild(tr);
  });

  const addRow = document.createElement("tr");
  addRow.className = "todo-add-row";
  addRow.innerHTML = `
    <td colspan="${hideCategoryCol ? 3 : 4}" class="todo-add-cell">
      <button type="button" class="todo-add-btn">+ Add Task</button>
    </td>
  `;
  tbody.appendChild(addRow);

  function updateCount() {
    header.querySelector(".todo-section-count").textContent =
      tbody.querySelectorAll(".todo-task-row").length;
  }

  addRow.querySelector(".todo-add-btn").addEventListener("click", () => {
    const taskData = showCategoryCol
      ? {
          sectionId: SECTIONS[0]?.id || "",
          sectionLabel: SECTIONS[0]?.label || "",
          classification: section.id,
        }
      : { sectionId };
    const tr = createTaskRow(taskData, { showCategoryCol, hideCategoryCol });
    tbody.insertBefore(tr, addRow);
    updateCount();
  });

  header.querySelector(".todo-section-arrow").addEventListener("click", () => {
    wrap.classList.toggle("is-collapsed");
  });

  tableWrap.appendChild(table);
  wrap.appendChild(header);
  wrap.appendChild(tableWrap);
  updateCount();
  return wrap;
}

function collectTasksFromDOM(sectionsEl) {
  const tasks = [];
  const sectionIds = new Set(SECTIONS.map((s) => s.id));
  sectionsEl?.querySelectorAll(".todo-section").forEach((sec) => {
    const secId = sec.dataset.section;
    const isCategoryView = sectionIds.has(secId);
    sec.querySelectorAll(".todo-task-row").forEach((row) => {
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

function renderSections(container, tasksData = []) {
  container.innerHTML = "";
  SECTIONS.forEach((section) => {
    const sectionTasks = tasksData.filter((t) => t.sectionId === section.id);
    const sec = createSection(section, {
      lastColHeader: "분류",
      initialTasks: sectionTasks,
      showCategoryCol: false,
      sectionIdForAdd: section.id,
      hideCategoryCol: true,
    });
    container.appendChild(sec);
  });
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content todo-list-view";

  const sectionsWrap = document.createElement("div");
  sectionsWrap.className = "todo-sections-wrap";

  const kpiTasks = getKpiTodosAsTasks();
  renderSections(sectionsWrap, kpiTasks);
  el.appendChild(sectionsWrap);

  return el;
}
