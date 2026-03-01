/**
 * 근무표 - 근무 일정 관리
 * 근무시간, 근무유형, 근무일, 시간(근무표), 메모
 */
import { renderMonthlyContent } from "./WorkScheduleMonthly.js";

const WORK_SCHEDULE_KEY = "work_schedule_rows";
const WORK_TYPE_OPTIONS_KEY = "work_schedule_type_options";
const DEFAULT_WORK_TYPE_OPTIONS = [
  "초과근무",
  "조기퇴근",
  "지급예정초과근무",
  "온콜",
  "온콜초과근무",
];
const PROTECTED_WORK_TYPES = ["초과근무", "조기퇴근"];

const DELETE_ICON =
  '<svg class="time-task-delete-icon" viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

function getWorkTypeOptions() {
  try {
    const raw = localStorage.getItem(WORK_TYPE_OPTIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((o) => (typeof o === "string" ? o : o.name));
      }
    }
  } catch (_) {}
  return [...DEFAULT_WORK_TYPE_OPTIONS];
}

function addWorkTypeOption(name) {
  const opts = getWorkTypeOptions();
  const trimmed = (name || "").trim();
  if (!trimmed || opts.includes(trimmed)) return opts;
  opts.unshift(trimmed);
  try {
    localStorage.setItem(WORK_TYPE_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

function removeWorkTypeOption(name) {
  if (PROTECTED_WORK_TYPES.includes(name)) return getWorkTypeOptions();
  const opts = getWorkTypeOptions().filter((o) => o !== name);
  try {
    localStorage.setItem(WORK_TYPE_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

function loadRows() {
  try {
    const raw = localStorage.getItem(WORK_SCHEDULE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch (_) {}
  return [];
}

function saveRows(rows) {
  try {
    localStorage.setItem(WORK_SCHEDULE_KEY, JSON.stringify(rows));
  } catch (_) {}
}

function getHoursSum(tableEl) {
  let sum = 0;
  tableEl?.querySelectorAll(".work-schedule-input-hours").forEach((input) => {
    const tr = input.closest?.(".work-schedule-row");
    if (tr && tr.style.display === "none") return;
    const v = parseFloat(input?.value);
    if (!Number.isNaN(v)) sum += v;
  });
  return sum;
}

function collectRowsFromDOM(tableEl) {
  const rows = [];
  tableEl?.querySelectorAll(".work-schedule-row").forEach((tr) => {
    const hoursInput = tr.querySelector(".work-schedule-input-hours");
    const hoursWorkedInput = tr.querySelector(
      ".work-schedule-input-hours-worked",
    );
    const typeInput = tr.querySelector(".work-schedule-input-type");
    const dateInput = tr.querySelector(".work-schedule-input-date");
    const memoInput = tr.querySelector(".work-schedule-input-memo");
    const nameInput = tr.querySelector(".work-schedule-input-name");
    rows.push({
      name: nameInput?.value || "",
      workType: typeInput?.value || "",
      hoursWorked: hoursWorkedInput?.value || "",
      workDate: dateInput?.value || "",
      hours: hoursInput?.value || "",
      memo: memoInput?.value || "",
    });
  });
  return rows;
}

function getRowsToSave(tableEl) {
  return collectRowsFromDOM(tableEl).filter((r) => {
    const hasAny =
      (r.name || "").trim() ||
      (r.workType || "").trim() ||
      (r.hoursWorked || "").trim() ||
      (r.workDate || "").trim() ||
      (r.hours || "").trim() ||
      (r.memo || "").trim();
    return !!hasAny;
  });
}

/** 근무유형 입력: 과제명처럼 Create/삭제 가능 */
function createWorkTypeInput(initialValue, onUpdate) {
  const wrap = document.createElement("div");
  wrap.className = "time-task-name-wrap work-schedule-type-wrap";

  const inputWrap = document.createElement("div");
  inputWrap.className = "time-task-input-wrap";

  const display = document.createElement("span");
  display.className = "work-schedule-type-display";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "time-input-task work-schedule-input-type";
  input.placeholder = "";
  if (initialValue) input.value = initialValue;

  function updateDisplay() {
    const val = (input.value || "").trim();
    display.textContent = val;
    display.className = "work-schedule-type-display";
    if (val === "초과근무") display.classList.add("is-overtime");
    else if (val === "조기퇴근") display.classList.add("is-early");
    else if (val) display.classList.add("is-default");
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
  if (initialValue) {
    showDisplay();
  } else {
    wrap.classList.add("is-editing");
  }

  const panel = document.createElement("div");
  panel.className = "time-task-name-panel work-schedule-type-panel";
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
    const all = getWorkTypeOptions();
    const matches = q ? all.filter((o) => o.toLowerCase().includes(q)) : all;
    const exactMatch = q && matches.some((o) => o.toLowerCase() === q);
    const showCreate = q && !exactMatch;

    panel.innerHTML = "";
    highlightedIndex = -1;

    if (matches.length === 0 && !showCreate) {
      panel.hidden = true;
      return;
    }

    const sep = document.createElement("div");
    sep.className = "time-task-name-separator";
    sep.textContent = "—";
    panel.appendChild(sep);

    matches.forEach((opt) => {
      const isProtected = PROTECTED_WORK_TYPES.includes(opt);
      const tagClass =
        opt === "초과근무"
          ? "work-schedule-tag-overtime"
          : opt === "조기퇴근"
            ? "work-schedule-tag-early"
            : "";
      const row = document.createElement("div");
      row.className =
        "time-task-name-option" +
        (isProtected ? " work-schedule-type-protected" : "");
      row.innerHTML =
        `<span class="time-task-tag ${tagClass}">${opt}</span>` +
        (isProtected
          ? ""
          : `<button type="button" class="time-task-delete-btn" title="삭제">${DELETE_ICON}</button>`);
      row.dataset.value = opt;
      const delBtn = row.querySelector(".time-task-delete-btn");
      row.addEventListener("click", (e) => {
        if (e.target.closest(".time-task-delete-btn")) return;
        input.value = opt;
        showDisplay();
        panel.hidden = true;
        input.blur();
        onUpdate?.();
      });
      if (delBtn) {
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeWorkTypeOption(opt);
          renderPanel(input.value);
        });
      }
      panel.appendChild(row);
    });

    if (showCreate) {
      const createRow = document.createElement("div");
      createRow.className = "time-task-name-option time-task-name-create";
      createRow.innerHTML = `<span class="time-task-create-label">Create</span><span class="time-task-tag">${(query || "").trim()}</span>`;
      createRow.dataset.value = (query || "").trim();
      createRow.dataset.isCreate = "true";
      createRow.addEventListener("click", () => {
        const val = (query || "").trim();
        addWorkTypeOption(val);
        input.value = val;
        showDisplay();
        panel.hidden = true;
        input.blur();
        onUpdate?.();
      });
      panel.appendChild(createRow);
    }

    highlightedIndex = 0;
    const opts = panel.querySelectorAll(".time-task-name-option");
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
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
      return;
    }
    const opts = panel.querySelectorAll(".time-task-name-option");
    if (opts.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, opts.length - 1);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) =>
        o.classList.toggle("is-highlighted", i === highlightedIndex),
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) =>
        o.classList.toggle("is-highlighted", i === highlightedIndex),
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const sel = opts[highlightedIndex >= 0 ? highlightedIndex : 0];
      if (sel) {
        const val = sel.dataset.value;
        if (sel.dataset.isCreate === "true") addWorkTypeOption(val);
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

function createRow(initialData = {}, onUpdate, viewEl, onFilterApply) {
  const tr = document.createElement("tr");
  tr.className = "work-schedule-row";

  const nameTd = document.createElement("td");
  nameTd.className = "work-schedule-cell work-schedule-cell-name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "work-schedule-input-name";
  nameInput.placeholder = "";
  nameInput.value = initialData.name || "";
  nameInput.addEventListener(
    "keydown",
    (e) => e.key === "Enter" && nameInput.blur(),
  );
  nameTd.appendChild(nameInput);
  tr.appendChild(nameTd);

  let typeInputWrap;
  const hoursWorkedInput = document.createElement("input");
  hoursWorkedInput.type = "number";
  hoursWorkedInput.className = "work-schedule-input-hours-worked";
  hoursWorkedInput.placeholder = "";
  hoursWorkedInput.step = "0.5";
  hoursWorkedInput.value = initialData.hoursWorked ?? "";

  const hoursInput = document.createElement("input");
  hoursInput.type = "number";
  hoursInput.className = "work-schedule-input-hours";
  hoursInput.placeholder = "";
  hoursInput.step = "0.5";

  function syncHoursFromWorkType() {
    const workType = (typeInputWrap?.input?.value || "").trim();
    const hw = parseFloat(hoursWorkedInput?.value);
    const hoursVal = Number.isNaN(hw) ? 0 : hw;
    if (workType === "조기퇴근") {
      hoursInput.value = hoursVal === 0 ? "" : String(-hoursVal);
      hoursInput.readOnly = true;
    } else if (workType === "초과근무") {
      hoursInput.value = hoursVal === 0 ? "" : String(hoursVal);
      hoursInput.readOnly = true;
    } else {
      hoursInput.value = "";
      hoursInput.readOnly = true;
    }
  }

  const rowOnUpdate = () => {
    syncHoursFromWorkType();
    onUpdate();
  };

  typeInputWrap = createWorkTypeInput(initialData.workType || "", rowOnUpdate);

  const typeTd = document.createElement("td");
  typeTd.className = "work-schedule-cell work-schedule-cell-type";
  typeTd.appendChild(typeInputWrap.wrap);
  tr.appendChild(typeTd);

  const hoursWorkedTd = document.createElement("td");
  hoursWorkedTd.className =
    "work-schedule-cell work-schedule-cell-hours-worked";
  hoursWorkedInput.addEventListener("input", rowOnUpdate);
  hoursWorkedInput.addEventListener(
    "keydown",
    (e) => e.key === "Enter" && hoursWorkedInput.blur(),
  );
  hoursWorkedTd.appendChild(hoursWorkedInput);
  tr.appendChild(hoursWorkedTd);

  function formatDateYYMMDD(val) {
    if (!val) return "";
    const [y, m, d] = val.split("-");
    if (!y || !m || !d) return val;
    return `${y.slice(-2)}/${m}/${d}`;
  }

  const dateTd = document.createElement("td");
  dateTd.className = "work-schedule-cell work-schedule-cell-date";
  const dateValue = initialData.workDate || "";
  const dateDisplay = document.createElement("span");
  dateDisplay.className = "work-schedule-date-display";
  dateDisplay.textContent = formatDateYYMMDD(dateValue);
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "work-schedule-input-date";
  dateInput.value = dateValue;
  dateInput.tabIndex = -1;
  dateInput.addEventListener("change", () => {
    dateDisplay.textContent = formatDateYYMMDD(dateInput.value);
    onUpdate();
    onFilterApply?.();
  });
  dateTd.addEventListener("click", (e) => {
    e.preventDefault();
    dateInput.focus();
    if (typeof dateInput.showPicker === "function") {
      dateInput.showPicker();
    }
  });
  dateTd.appendChild(dateDisplay);
  dateTd.appendChild(dateInput);
  tr.appendChild(dateTd);

  const hoursTd = document.createElement("td");
  hoursTd.className = "work-schedule-cell work-schedule-cell-hours";
  hoursInput.addEventListener(
    "keydown",
    (e) => e.key === "Enter" && hoursInput.blur(),
  );
  hoursTd.appendChild(hoursInput);
  tr.appendChild(hoursTd);

  syncHoursFromWorkType();

  const memoTd = document.createElement("td");
  memoTd.className = "work-schedule-cell work-schedule-cell-memo";
  const memoInput = document.createElement("input");
  memoInput.type = "text";
  memoInput.className = "work-schedule-input-memo";
  memoInput.placeholder = "";
  memoInput.value = initialData.memo || "";
  memoInput.addEventListener(
    "keydown",
    (e) => e.key === "Enter" && memoInput.blur(),
  );
  memoTd.appendChild(memoInput);
  tr.appendChild(memoTd);

  const actionsTd = document.createElement("td");
  actionsTd.className = "work-schedule-cell work-schedule-cell-actions";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "work-schedule-btn-delete";
  delBtn.textContent = "삭제";
  delBtn.title = "행 삭제";
  delBtn.addEventListener("click", () => {
    tr.remove();
    onUpdate();
  });
  actionsTd.appendChild(delBtn);
  tr.appendChild(actionsTd);

  return tr;
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content work-schedule-view";

  const header = document.createElement("div");
  header.className = "work-schedule-header";
  const h = document.createElement("h2");
  h.className = "work-schedule-title";
  h.textContent = "근무표";
  header.appendChild(h);
  const desc = document.createElement("p");
  desc.className = "work-schedule-desc";
  desc.textContent = "근무 시간, 유형, 일정을 기록하고 메모를 남기세요.";
  header.appendChild(desc);
  el.appendChild(header);

  const viewTabs = document.createElement("div");
  viewTabs.className = "work-schedule-view-tabs";
  viewTabs.innerHTML = `
    <button type="button" class="work-schedule-view-tab active" data-view="all">전체</button>
    <button type="button" class="work-schedule-view-tab" data-view="monthly">먼슬리</button>
  `;
  el.appendChild(viewTabs);

  const contentWrap = document.createElement("div");
  contentWrap.className = "work-schedule-content-wrap";
  el.appendChild(contentWrap);

  function renderTableView() {
    contentWrap.innerHTML = "";
    const now = new Date();
    let filterType = "month";
    let filterYear = now.getFullYear();
    let filterMonth = now.getMonth() + 1;
    let filterStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    let filterEndDate = filterStartDate;

    const filterBar = document.createElement("div");
    filterBar.className = "work-schedule-filter-bar";
    filterBar.innerHTML = `
      <div class="work-schedule-filter-tabs">
        <button type="button" class="work-schedule-filter-btn active" data-filter="month">월별</button>
        <button type="button" class="work-schedule-filter-btn" data-filter="week">일주일</button>
        <button type="button" class="work-schedule-filter-btn" data-filter="day">하루</button>
        <button type="button" class="work-schedule-filter-btn" data-filter="range">날짜선택</button>
      </div>
      <div class="work-schedule-filter-month-wrap" data-filter-wrap="month">
        <select class="work-schedule-filter-year"></select>
        <span>년</span>
        <select class="work-schedule-filter-month"></select>
        <span>월</span>
      </div>
      <div class="work-schedule-filter-range-wrap" data-filter-wrap="range" style="display:none">
        <input type="date" class="work-schedule-filter-start-date" />
        <span>~</span>
        <input type="date" class="work-schedule-filter-end-date" />
      </div>
    `;

    const yearSelect = filterBar.querySelector(".work-schedule-filter-year");
    const monthSelect = filterBar.querySelector(".work-schedule-filter-month");
    const startDateInput = filterBar.querySelector(
      ".work-schedule-filter-start-date",
    );
    const endDateInput = filterBar.querySelector(
      ".work-schedule-filter-end-date",
    );
    const monthWrap = filterBar.querySelector("[data-filter-wrap='month']");
    const rangeWrap = filterBar.querySelector("[data-filter-wrap='range']");

    for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y + "년";
      if (y === filterYear) opt.selected = true;
      yearSelect.appendChild(opt);
    }
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m + "월";
      if (m === filterMonth) opt.selected = true;
      monthSelect.appendChild(opt);
    }
    startDateInput.value = filterStartDate;
    endDateInput.value = filterEndDate;

    function isDateInRange(dateStr, type, y, m, start, end) {
      if (!dateStr) return true;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      if (type === "day") {
        const today = new Date();
        return (
          d.getFullYear() === today.getFullYear() &&
          d.getMonth() === today.getMonth() &&
          d.getDate() === today.getDate()
        );
      }
      if (type === "week") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        d.setHours(0, 0, 0, 0);
        return d >= weekAgo && d <= today;
      }
      if (type === "month") {
        return d.getFullYear() === y && d.getMonth() === m - 1;
      }
      if (type === "range" && start && end) {
        const s = new Date(start);
        const e = new Date(end);
        s.setHours(0, 0, 0, 0);
        e.setHours(23, 59, 59, 999);
        d.setHours(0, 0, 0, 0);
        return d >= s && d <= e;
      }
      return true;
    }

    function applyFilter() {
      const type = filterType;
      const y = parseInt(yearSelect.value, 10) || filterYear;
      const m = parseInt(monthSelect.value, 10) || filterMonth;
      const start = startDateInput.value || filterStartDate;
      const end = endDateInput.value || filterEndDate;
      tableWrap.querySelectorAll(".work-schedule-row").forEach((tr) => {
        const dateInput = tr.querySelector(".work-schedule-input-date");
        const dateStr = dateInput?.value || "";
        const show = isDateInRange(dateStr, type, y, m, start, end);
        tr.style.display = show ? "" : "none";
      });
      updateSum();
    }

    filterBar.querySelectorAll(".work-schedule-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        filterType = btn.dataset.filter;
        filterBar
          .querySelectorAll(".work-schedule-filter-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        monthWrap.style.display = filterType === "month" ? "" : "none";
        rangeWrap.style.display = filterType === "range" ? "" : "none";
        applyFilter();
      });
    });
    yearSelect.addEventListener("change", applyFilter);
    monthSelect.addEventListener("change", applyFilter);
    startDateInput.addEventListener("change", applyFilter);
    endDateInput.addEventListener("change", applyFilter);

    const tableWrap = document.createElement("div");
    tableWrap.className = "work-schedule-table-wrap";
    const table = document.createElement("table");
    table.className = "work-schedule-table";
    table.innerHTML = `
      <colgroup>
        <col class="work-schedule-col-name">
        <col class="work-schedule-col-type">
        <col class="work-schedule-col-hours-worked">
        <col class="work-schedule-col-date">
        <col class="work-schedule-col-hours">
        <col class="work-schedule-col-memo">
        <col class="work-schedule-col-actions">
      </colgroup>
      <thead>
        <tr>
          <th class="work-schedule-th-name">근무시간</th>
          <th class="work-schedule-th-type">근무유형</th>
          <th class="work-schedule-th-hours-worked">Hours</th>
          <th class="work-schedule-th-date">근무일</th>
          <th class="work-schedule-th-hours">시간적립</th>
          <th class="work-schedule-th-memo">메모</th>
          <th class="work-schedule-th-actions"></th>
        </tr>
      </thead>
      <tbody></tbody>
      <tfoot>
        <tr class="work-schedule-sum-row">
          <td colspan="4"></td>
          <td class="work-schedule-sum-cell"></td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    `;

    const tbody = table.querySelector("tbody");
    const tfoot = table.querySelector("tfoot");
    const addRow = document.createElement("tr");
    addRow.className = "work-schedule-row-add";
    const addCell = document.createElement("td");
    addCell.colSpan = 7;
    addCell.className = "work-schedule-cell-add";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "work-schedule-btn-add";
    addBtn.innerHTML = '<span class="work-schedule-add-icon">+</span>';
    addCell.appendChild(addBtn);
    addRow.appendChild(addCell);
    tfoot.appendChild(addRow);

    function save() {
      saveRows(getRowsToSave(tableWrap));
    }

    const sumCell = table.querySelector(".work-schedule-sum-cell");
    function updateSum() {
      const total = getHoursSum(tableWrap);
      sumCell.textContent = `${total} hrs`;
    }

    const onUpdate = () => {
      save();
      updateSum();
    };

    const initialRows = loadRows();
    initialRows.forEach((row) => {
      const tr = createRow(row, onUpdate, el, applyFilter);
      tbody.appendChild(tr);
    });

    addBtn.addEventListener("click", () => {
      const tr = createRow({}, onUpdate, el, applyFilter);
      tbody.appendChild(tr);
      applyFilter();
      save();
    });

    tableWrap.appendChild(table);
    contentWrap.appendChild(filterBar);
    contentWrap.appendChild(tableWrap);
    applyFilter();
  }

  function renderMonthlyView() {
    const tableWrap = contentWrap.querySelector(".work-schedule-table-wrap");
    if (tableWrap) {
      saveRows(getRowsToSave(tableWrap));
    }
    contentWrap.innerHTML = "";
    contentWrap.appendChild(renderMonthlyContent());
  }

  function switchView(view) {
    viewTabs.querySelectorAll(".work-schedule-view-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    if (view === "all") {
      renderTableView();
    } else {
      renderMonthlyView();
    }
  }

  viewTabs.querySelectorAll(".work-schedule-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  renderTableView();

  return el;
}
