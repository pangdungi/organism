/**
 * 루틴/해빗트랙커
 * 큰 루틴(아코디언) → 세부 루틴(테이블 행) 구조
 * 루틴추가 → 팝업(큰 루틴 이름, 시작일, 종료일) → 아코디언+테이블
 * 테이블 내 +추가 → 루틴 1-1, 1-2, 1-3... 세부 행 추가
 * 추가된 루틴은 시간가계부 과제(생산적>행복)에 자동 연동
 */

import {
  syncRoutineToTimeTasks,
  removeRoutineFromTimeTasks,
  syncRoutineRenameToTimeTasks,
} from "../utils/routineTimeSync.js";

const STORAGE_KEY = "routine-track-list";

const ROUTINE_PASTEL_COLORS = [
  "#e07a5f",
  "#81b29a",
  "#f2cc8f",
  "#a8dadc",
  "#e9c46a",
  "#b8b5ff",
  "#ffb4a2",
  "#95d5b2",
  "#ffd6a5",
  "#a0c4ff",
];

function loadRoutines() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(migrateRoutine);
      }
    }
  } catch (_) {}
  return [];
}

function migrateRoutine(r) {
  let out = { ...r };
  if (!out.items || !Array.isArray(out.items)) {
    const itemId = out.id + "-item-0";
    out.items = [{ id: itemId, name: out.name || "루틴 1-1" }];
  }
  if (!out.color || !ROUTINE_PASTEL_COLORS.includes(out.color)) {
    out.color = ROUTINE_PASTEL_COLORS[0];
  }
  return out;
}

function saveRoutines(routines) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        routines.map((r) => ({
          id: r.id,
          name: r.name,
          start: r.start,
          end: r.end,
          days: r.days,
          items: r.items || [],
          color: r.color || ROUTINE_PASTEL_COLORS[0],
        }))
      )
    );
  } catch (_) {}
}

function getDaysBetween(startStr, endStr) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

function formatRoutinePeriod(startStr, endStr) {
  if (!startStr || !endStr) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const start = new Date(startStr);
  const end = new Date(endStr);
  const s = `${pad(start.getMonth() + 1)}/${pad(start.getDate())}`;
  const e = `${pad(end.getMonth() + 1)}/${pad(end.getDate())}`;
  return `${s} ~ ${e}`;
}

function getCheckKey(routineId, itemId, dayIndex) {
  return `rt-check-${routineId}-${itemId}-${dayIndex}`;
}

function loadCheckState(routineId, itemId, dayIndex) {
  try {
    return localStorage.getItem(getCheckKey(routineId, itemId, dayIndex)) === "1";
  } catch (_) {}
  return false;
}

function saveCheckState(routineId, itemId, dayIndex, checked) {
  try {
    const key = getCheckKey(routineId, itemId, dayIndex);
    if (checked) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch (_) {}
}

function getRoutineSuccessRate(routine) {
  const items = routine.items || [];
  const days = routine.days || 0;
  if (items.length === 0 || days === 0) return { success: 0, total: 0, pct: 0 };
  let successCount = 0;
  for (let d = 0; d < days; d++) {
    const allChecked = items.every((it) => loadCheckState(routine.id, it.id, d));
    if (allChecked) successCount++;
  }
  const pct = Math.round((successCount / days) * 100);
  return { success: successCount, total: days, pct };
}

function createAddRoutineModal(onAdd) {
  const modal = document.createElement("div");
  modal.className = "routine-add-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="routine-add-backdrop"></div>
    <div class="routine-add-panel">
      <div class="routine-add-header">
        <h3 class="routine-add-title">루틴 추가</h3>
        <button type="button" class="routine-add-close" title="닫기">×</button>
      </div>
      <div class="routine-add-body">
        <div class="routine-add-field">
          <label>루틴 이름</label>
          <input type="text" class="routine-add-name" placeholder="예: 모닝루틴" />
        </div>
        <div class="routine-add-field">
          <label>시작일</label>
          <input type="date" class="routine-add-start" />
        </div>
        <div class="routine-add-field">
          <label>종료일</label>
          <input type="date" class="routine-add-end" />
        </div>
        <div class="routine-add-field">
          <label>색상</label>
          <div class="routine-add-color-picker"></div>
        </div>
      </div>
      <div class="routine-add-actions">
        <button type="button" class="routine-add-btn-cancel">취소</button>
        <button type="button" class="routine-add-btn-confirm">추가</button>
      </div>
    </div>
  `;

  const backdrop = modal.querySelector(".routine-add-backdrop");
  const closeBtn = modal.querySelector(".routine-add-close");
  const cancelBtn = modal.querySelector(".routine-add-btn-cancel");
  const confirmBtn = modal.querySelector(".routine-add-btn-confirm");
  const nameInput = modal.querySelector(".routine-add-name");
  const startInput = modal.querySelector(".routine-add-start");
  const endInput = modal.querySelector(".routine-add-end");
  const colorPickerEl = modal.querySelector(".routine-add-color-picker");

  ROUTINE_PASTEL_COLORS.forEach((color, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "routine-color-swatch" + (i === 0 ? " selected" : "");
    btn.style.backgroundColor = color;
    btn.dataset.color = color;
    btn.title = color;
    colorPickerEl.appendChild(btn);
  });
  let selectedColor = ROUTINE_PASTEL_COLORS[0];
  colorPickerEl.querySelectorAll(".routine-color-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      colorPickerEl.querySelectorAll(".routine-color-swatch").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedColor = btn.dataset.color;
    });
  });

  function close() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  function open() {
    nameInput.value = "";
    startInput.value = "";
    endInput.value = "";
    selectedColor = ROUTINE_PASTEL_COLORS[0];
    colorPickerEl.querySelectorAll(".routine-color-swatch").forEach((b, i) => {
      b.classList.toggle("selected", i === 0);
    });
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    nameInput.focus();
  }

  function handleConfirm() {
    const name = nameInput.value.trim();
    const start = startInput.value;
    const end = endInput.value;
    if (!name) {
      nameInput.focus();
      return;
    }
    if (!start || !end) {
      if (!start) startInput.focus();
      else endInput.focus();
      return;
    }
    if (new Date(end) < new Date(start)) {
      endInput.focus();
      return;
    }
    const days = getDaysBetween(start, end);
    if (days > 365) return;
    close();
    onAdd({ name, start, end, days, color: selectedColor });
  }

  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);
  confirmBtn.addEventListener("click", handleConfirm);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleConfirm();
  });

  return { modal, open };
}

function createEditRoutineModal(onSave, onDelete) {
  const modal = document.createElement("div");
  modal.className = "routine-add-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="routine-add-backdrop"></div>
    <div class="routine-add-panel">
      <div class="routine-add-header">
        <h3 class="routine-add-title">루틴 수정</h3>
        <button type="button" class="routine-add-close" title="닫기">×</button>
      </div>
      <div class="routine-add-body">
        <div class="routine-add-field">
          <label>루틴 이름</label>
          <input type="text" class="routine-add-name" placeholder="예: 모닝루틴" />
        </div>
        <div class="routine-add-field">
          <label>시작일</label>
          <input type="date" class="routine-add-start" />
        </div>
        <div class="routine-add-field">
          <label>종료일</label>
          <input type="date" class="routine-add-end" />
        </div>
        <div class="routine-add-field">
          <label>색상</label>
          <div class="routine-add-color-picker"></div>
        </div>
        <div class="routine-add-field routine-add-actions-delete">
          <button type="button" class="routine-add-btn-delete">이 루틴 삭제 (복구불가)</button>
        </div>
      </div>
      <div class="routine-add-actions">
        <button type="button" class="routine-add-btn-cancel">취소</button>
        <button type="button" class="routine-add-btn-confirm">저장</button>
      </div>
    </div>
  `;

  const backdrop = modal.querySelector(".routine-add-backdrop");
  const closeBtn = modal.querySelector(".routine-add-close");
  const cancelBtn = modal.querySelector(".routine-add-btn-cancel");
  const confirmBtn = modal.querySelector(".routine-add-btn-confirm");
  const deleteBtn = modal.querySelector(".routine-add-btn-delete");
  const nameInput = modal.querySelector(".routine-add-name");
  const startInput = modal.querySelector(".routine-add-start");
  const endInput = modal.querySelector(".routine-add-end");
  const colorPickerEl = modal.querySelector(".routine-add-color-picker");

  ROUTINE_PASTEL_COLORS.forEach((color) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "routine-color-swatch";
    btn.style.backgroundColor = color;
    btn.dataset.color = color;
    btn.title = color;
    colorPickerEl.appendChild(btn);
  });
  let selectedColor = ROUTINE_PASTEL_COLORS[0];
  colorPickerEl.querySelectorAll(".routine-color-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      colorPickerEl.querySelectorAll(".routine-color-swatch").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedColor = btn.dataset.color;
    });
  });

  function close() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  function open(routine) {
    modal._editingRoutine = routine;
    nameInput.value = routine.name || "";
    startInput.value = routine.start || "";
    endInput.value = routine.end || "";
    selectedColor = routine.color && ROUTINE_PASTEL_COLORS.includes(routine.color) ? routine.color : ROUTINE_PASTEL_COLORS[0];
    colorPickerEl.querySelectorAll(".routine-color-swatch").forEach((b) => {
      b.classList.toggle("selected", b.dataset.color === selectedColor);
    });
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    nameInput.focus();
  }

  function handleConfirm() {
    const routine = modal._editingRoutine;
    if (!routine) return;
    const name = nameInput.value.trim();
    const start = startInput.value;
    const end = endInput.value;
    if (!name) {
      nameInput.focus();
      return;
    }
    if (!start || !end) {
      if (!start) startInput.focus();
      else endInput.focus();
      return;
    }
    if (new Date(end) < new Date(start)) {
      endInput.focus();
      return;
    }
    const days = getDaysBetween(start, end);
    if (days > 365) return;
    close();
    onSave(routine, { name, start, end, days, color: selectedColor });
  }

  deleteBtn.addEventListener("click", () => {
    const routine = modal._editingRoutine;
    if (routine && onDelete) {
      close();
      onDelete(routine);
    }
  });

  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);
  confirmBtn.addEventListener("click", handleConfirm);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleConfirm();
  });

  return { modal, open };
}

function createRoutineAccordion(routine, onItemChange, onRoutineEdit, openEditModal) {
  const accordion = document.createElement("div");
  accordion.className = "routine-accordion";
  accordion.dataset.routineId = routine.id;
  const routineColor = routine.color && ROUTINE_PASTEL_COLORS.includes(routine.color) ? routine.color : ROUTINE_PASTEL_COLORS[0];
  accordion.style.setProperty("--routine-color", routineColor);

  const header = document.createElement("div");
  header.className = "routine-accordion-header";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "routine-accordion-toggle";
  toggleBtn.textContent = "▼";

  const titleWrap = document.createElement("div");
  titleWrap.className = "routine-accordion-title-wrap";
  const titleSpan = document.createElement("span");
  titleSpan.className = "routine-accordion-title";
  titleSpan.textContent = routine.name || "루틴";

  const periodStr = formatRoutinePeriod(routine.start, routine.end);
  const periodSpan = document.createElement("span");
  periodSpan.className = "routine-accordion-period";
  periodSpan.textContent = periodStr;
  if (!periodStr) periodSpan.style.display = "none";

  const progressWrap = document.createElement("div");
  progressWrap.className = "routine-accordion-progress-wrap";
  progressWrap.innerHTML = `
    <div class="routine-accordion-progress-bar">
      <div class="routine-accordion-progress-fill"></div>
      <span class="routine-accordion-progress-pct">0%</span>
    </div>
  `;

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "routine-accordion-edit-btn";
  editBtn.textContent = "수정";
  editBtn.title = "루틴 수정";

  titleWrap.appendChild(titleSpan);
  titleWrap.appendChild(periodSpan);
  titleWrap.appendChild(progressWrap);
  titleWrap.appendChild(editBtn);

  function updateProgressBar() {
    const { success, total, pct } = getRoutineSuccessRate(routine);
    const fill = progressWrap.querySelector(".routine-accordion-progress-fill");
    const pctEl = progressWrap.querySelector(".routine-accordion-progress-pct");
    if (fill) fill.style.width = pct + "%";
    if (pctEl) pctEl.textContent = pct === 100 ? "완료" : pct + "%";
  }
  header.appendChild(toggleBtn);
  header.appendChild(titleWrap);

  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openEditModal?.(routine);
  });

  const body = document.createElement("div");
  body.className = "routine-accordion-body";

  const scrollWrap = document.createElement("div");
  scrollWrap.className = "routine-track-scroll-wrap";
  const table = document.createElement("table");
  table.className = "routine-track-table";

  const colgroup = document.createElement("colgroup");
  const colName = document.createElement("col");
  colName.className = "routine-track-col-name";
  colName.style.width = "120px";
  colgroup.appendChild(colName);
  for (let i = 0; i < routine.days; i++) {
    const col = document.createElement("col");
    col.className = "routine-track-col-day";
    col.style.width = "40px";
    colgroup.appendChild(col);
  }
  const colActions = document.createElement("col");
  colActions.className = "routine-track-col-actions";
  colActions.style.width = "50px";
  colgroup.appendChild(colActions);
  table.appendChild(colgroup);

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const nameTh = document.createElement("th");
  nameTh.className = "routine-track-th routine-track-th-name routine-track-sticky";
  nameTh.textContent = "세부루틴";
  headerRow.appendChild(nameTh);
  for (let i = 1; i <= routine.days; i++) {
    const th = document.createElement("th");
    th.className = "routine-track-th routine-track-th-day routine-track-day-toggle" + (i === 1 ? " routine-track-first-day" : "");
    th.textContent = `D${i}`;
    th.title = "클릭 시 해당 날짜 전체 선택/해제";
    const dayIndex = i - 1;
    th.addEventListener("click", () => {
      const rows = tbody.querySelectorAll(".routine-track-row");
      const allChecked = items.every((it) => loadCheckState(routine.id, it.id, dayIndex));
      const newState = !allChecked;
      for (const tr of rows) {
        const itemId = tr.dataset.itemId;
        const item = items.find((x) => x.id === itemId);
        if (!item) continue;
        const checkCells = tr.querySelectorAll(".routine-track-cell.routine-track-check");
        const td = checkCells[dayIndex];
        const input = td?.querySelector('input[type="checkbox"]');
        if (input) {
          input.checked = newState;
          saveCheckState(routine.id, item.id, dayIndex, newState);
          td.classList.toggle("is-checked", newState);
        }
      }
      updateProgressBar();
    });
    headerRow.appendChild(th);
  }
  const actionsTh = document.createElement("th");
  actionsTh.className = "routine-track-th routine-track-th-actions";
  headerRow.appendChild(actionsTh);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const items = routine.items || [];

  function addItemRow(item, index) {
    const tr = document.createElement("tr");
    tr.className = "routine-track-row";
    tr.dataset.itemId = item.id;

    const nameTd = document.createElement("td");
    nameTd.className = "routine-track-cell routine-track-name routine-track-sticky";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "routine-track-name-input";
    nameInput.placeholder = `루틴 1-${index + 1}`;
    nameInput.value = item.name;
    nameInput.addEventListener("input", () => onItemChange(routine.id, item.id, nameInput.value));
    nameInput.addEventListener("change", () => onItemChange(routine.id, item.id, nameInput.value));
    nameTd.appendChild(nameInput);
    tr.appendChild(nameTd);

    for (let i = 0; i < routine.days; i++) {
      const td = document.createElement("td");
      td.className = "routine-track-cell routine-track-check" + (i === 0 ? " routine-track-first-day" : "");
      const label = document.createElement("label");
      label.className = "routine-track-check-wrap";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "routine-track-check";
      input.checked = loadCheckState(routine.id, item.id, i);
      if (input.checked) td.classList.add("is-checked");
      input.addEventListener("change", () => {
        saveCheckState(routine.id, item.id, i, input.checked);
        td.classList.toggle("is-checked", input.checked);
        updateProgressBar();
      });
      label.appendChild(input);
      td.appendChild(label);
      tr.appendChild(td);
    }

    const delTd = document.createElement("td");
    delTd.className = "routine-track-cell routine-track-actions";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "routine-track-del-btn";
    delBtn.textContent = "삭제";
    delBtn.title = "세부 루틴 삭제";
    delBtn.addEventListener("click", () => {
      routine.items = routine.items.filter((x) => x.id !== item.id);
      onItemChange(routine.id, null, null);
      tr.remove();
      updateProgressBar();
    });
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);

    return tr;
  }

  const addRow = document.createElement("tr");
  addRow.className = "routine-track-add-row";
  const addNameCell = document.createElement("td");
  addNameCell.className = "routine-track-add-cell routine-track-cell routine-track-name";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "routine-track-add-row-btn";
  addBtn.innerHTML = '<img src="/toolbaricons/add-square.svg" alt="" class="routine-add-icon" width="18" height="18"> 추가';
  addBtn.addEventListener("click", () => {
    const itemId = routine.id + "-item-" + Date.now();
    const item = { id: itemId, name: `루틴 1-${items.length + 1}` };
    routine.items.push(item);
    onItemChange(routine.id, null, null);
    const tr = addItemRow(item, items.length - 1);
    tbody.insertBefore(tr, addRow);
    updateProgressBar();
  });
  addNameCell.appendChild(addBtn);
  addRow.appendChild(addNameCell);
  for (let i = 0; i < routine.days; i++) {
    const td = document.createElement("td");
    td.className = "routine-track-add-cell routine-track-cell routine-track-check" + (i === 0 ? " routine-track-first-day" : "");
    addRow.appendChild(td);
  }
  const addActionsCell = document.createElement("td");
  addActionsCell.className = "routine-track-add-cell routine-track-cell routine-track-actions";
  addRow.appendChild(addActionsCell);

  items.forEach((item, index) => {
    tbody.appendChild(addItemRow(item, index));
  });
  tbody.appendChild(addRow);

  table.appendChild(tbody);
  scrollWrap.appendChild(table);
  body.appendChild(scrollWrap);

  accordion.appendChild(header);
  accordion.appendChild(body);

  function toggleAccordion() {
    accordion.classList.toggle("is-collapsed");
    toggleBtn.textContent = accordion.classList.contains("is-collapsed") ? "▶" : "▼";
  }

  toggleBtn.addEventListener("click", toggleAccordion);
  header.addEventListener("click", (e) => {
    if (!titleWrap.contains(e.target) && !toggleBtn.contains(e.target)) {
      toggleAccordion();
    }
  });

  accordion._updateTitle = (name) => {
    titleSpan.textContent = name || "루틴";
  };

  accordion._updateProgress = updateProgressBar;

  updateProgressBar();

  return accordion;
}

let accordionListEl;
let routines = [];
let accordionMap = {};

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content routine-view";

  const headerRow = document.createElement("div");
  headerRow.className = "routine-view-header";
  const h = document.createElement("h2");
  h.textContent = "루틴/해빗트랙커";
  headerRow.appendChild(h);
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "routine-add-btn";
  addBtn.innerHTML = '<img src="/toolbaricons/add-square.svg" alt="" class="routine-add-icon" width="18" height="18"> 루틴추가';
  headerRow.appendChild(addBtn);
  el.appendChild(headerRow);

  const viewTabs = document.createElement("div");
  viewTabs.className = "routine-view-tabs";
  viewTabs.innerHTML = `
    <button type="button" class="routine-view-tab active" data-view="track">트랙커</button>
    <button type="button" class="routine-view-tab" data-view="dashboard">대시보드</button>
  `;
  el.appendChild(viewTabs);

  const contentWrap = document.createElement("div");
  contentWrap.className = "routine-view-content";

  const trackPanel = document.createElement("div");
  trackPanel.className = "routine-view-panel routine-view-panel-track";

  accordionListEl = document.createElement("div");
  accordionListEl.className = "routine-accordion-list";

  const emptyMsg = document.createElement("p");
  emptyMsg.className = "routine-empty-msg";
  emptyMsg.textContent = "루틴추가 버튼을 눌러 큰 루틴을 추가하세요.";
  emptyMsg.hidden = true;
  trackPanel.appendChild(emptyMsg);
  trackPanel.appendChild(accordionListEl);

  const dashboardPanel = document.createElement("div");
  dashboardPanel.className = "routine-view-panel routine-view-panel-dashboard";
  dashboardPanel.hidden = true;

  contentWrap.appendChild(trackPanel);
  contentWrap.appendChild(dashboardPanel);
  el.appendChild(contentWrap);

  const { modal: editModal, open: openEdit } = createEditRoutineModal(
    (routine, data) => {
      const oldRoutine = { ...routine, name: routine.name };
      routine.name = data.name;
      routine.start = data.start;
      routine.end = data.end;
      routine.days = data.days;
      routine.color = data.color || ROUTINE_PASTEL_COLORS[0];
      if (oldRoutine.name !== data.name) {
        syncRoutineRenameToTimeTasks(oldRoutine, routine);
      }
      saveRoutines(routines);

      const accordion = accordionMap[routine.id];
      const wasCollapsed = accordion?.classList.contains("is-collapsed");
      const nextSibling = accordion?.nextElementSibling;
      if (accordion) accordion.remove();
      const newAccordion = createAccordionForRoutine(routine);
      accordionMap[routine.id] = newAccordion;
      accordionListEl.insertBefore(newAccordion, nextSibling || null);
      if (wasCollapsed) newAccordion.classList.add("is-collapsed");
      newAccordion._updateTitle(routine.name);
    },
    (routine) => {
      removeRoutineFromTimeTasks(routine);
      routines = routines.filter((r) => r.id !== routine.id);
      saveRoutines(routines);
      const accordion = accordionMap[routine.id];
      if (accordion) accordion.remove();
      delete accordionMap[routine.id];
      updateEmptyState();
    }
  );

  function createAccordionForRoutine(routine) {
    return createRoutineAccordion(
      routine,
      (rid, itemId, name) => {
        const r = routines.find((x) => x.id === rid);
        if (itemId != null && name !== null) {
          const it = r?.items?.find((x) => x.id === itemId);
          if (it) it.name = name;
        }
        saveRoutines(routines);
        if (r) syncRoutineToTimeTasks(r);
      },
      null,
      openEdit
    );
  }

  const { modal, open } = createAddRoutineModal((data) => {
    const id = "rt-" + Date.now();
    const routine = {
      id,
      name: data.name,
      start: data.start,
      end: data.end,
      days: data.days,
      items: [{ id: id + "-item-0", name: "루틴 1-1" }],
      color: data.color || ROUTINE_PASTEL_COLORS[0],
    };
    routines.push(routine);
    saveRoutines(routines);
    syncRoutineToTimeTasks(routine);
    updateEmptyState();

    const accordion = createAccordionForRoutine(routine);
    accordionMap[routine.id] = accordion;
    accordionListEl.appendChild(accordion);
  });

  el.appendChild(modal);
  el.appendChild(editModal);

  function updateEmptyState() {
    emptyMsg.hidden = routines.length > 0;
  }
  addBtn.addEventListener("click", () => open());

  function switchView(view) {
    trackPanel.hidden = view !== "track";
    dashboardPanel.hidden = view !== "dashboard";
    viewTabs.querySelectorAll(".routine-view-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
  }

  viewTabs.querySelectorAll(".routine-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  function createAccordionForRoutine(routine) {
    return createRoutineAccordion(
      routine,
      (rid, itemId, name) => {
        const r = routines.find((x) => x.id === rid);
        if (itemId != null && name !== null) {
          const it = r?.items?.find((x) => x.id === itemId);
          if (it) it.name = name;
        }
        saveRoutines(routines);
        if (r) syncRoutineToTimeTasks(r);
      },
      null,
      openEdit
    );
  }

  routines = loadRoutines();
  routines.forEach((routine) => {
    if (!routine.items || routine.items.length === 0) {
      routine.items = [{ id: routine.id + "-item-0", name: "루틴 1-1" }];
    }
    const accordion = createAccordionForRoutine(routine);
    accordionMap[routine.id] = accordion;
    accordionListEl.appendChild(accordion);
  });
  updateEmptyState();

  return el;
}
