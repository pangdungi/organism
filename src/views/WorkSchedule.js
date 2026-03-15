/**
 * 근무표 - 근무 일정 관리
 * 근무시간, 근무유형, 근무일, 시간(근무표), 메모
 */
import { renderMonthlyContent } from "./WorkScheduleMonthly.js";

const WORK_SCHEDULE_KEY = "work_schedule_rows";
const WORK_TYPE_OPTIONS_KEY = "work_schedule_type_options";
const WORK_SCHEDULE_DAILY_HOURS_KEY = "work_schedule_daily_hours";
const TIME_ROWS_KEY = "time_task_log_rows";
const DEFAULT_WORK_TYPE_OPTIONS = [
  "정규근무",
  "초과근무",
  "야간근무",
  "주말근무",
  "공휴일근무",
  "당직/대기",
  "출장",
  "재택근무",
  "연차 유급휴가",
  "반차(오전)",
  "반차(오후)",
  "대체휴일",
  "공휴일",
  "특별휴가",
  "유급 병가",
  "무급병가",
  "출산휴가",
  "지각",
  "조기퇴근",
  "외출 후 미복귀",
  "무단결근",
  "승인된 결근",
  "교육/훈련",
  "군복무",
  "공무출석",
];
const PROTECTED_WORK_TYPES = ["정규근무", "초과근무", "조기퇴근"];

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

function getDailyHours() {
  try {
    const v = localStorage.getItem(WORK_SCHEDULE_DAILY_HOURS_KEY);
    if (v != null && v !== "") {
      const n = parseFloat(v);
      if (!Number.isNaN(n) && n >= 0) return n;
    }
  } catch (_) {}
  return 8.5;
}

function setDailyHours(val) {
  const n = parseFloat(val);
  if (Number.isNaN(n) || n < 0) return;
  try {
    localStorage.setItem(WORK_SCHEDULE_DAILY_HOURS_KEY, String(n));
  } catch (_) {}
}

/** 시간적립 표시 문구: Hours - 하루근무시간 → "+ N시간" / "- N시간" */
function formatTimeAccumulation(diff) {
  if (diff == null || Number.isNaN(diff)) return "";
  if (Math.abs(diff) < 0.01) return "0";
  const abs = Math.abs(diff);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  const str = m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  if (diff > 0) return `+ ${str}`;
  return `- ${str}`;
}

/** 시간기록(time_task_log_rows)에서 근무하기 행만 로드 */
function loadTimeRows() {
  try {
    const raw = localStorage.getItem(TIME_ROWS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch (_) {}
  return [];
}

/** "09:00" 또는 "2026-03-13 09:00" 형태에서 시각(0~24) 추출. 날짜의 2026 등이 시간으로 잡히지 않도록 HH:MM 패턴만 사용 */
function parseTimeToHours(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim();
  const withColon = s.match(/(\d{1,2}):(\d{2})\s*$/);
  if (withColon) {
    const h = parseInt(withColon[1], 10) || 0;
    const m = parseInt(withColon[2], 10) || 0;
    if (h >= 0 && h <= 24 && m >= 0 && m < 60) return h + m / 60;
  }
  const timeOnly = s.match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnly) {
    const h = parseInt(timeOnly[1], 10) || 0;
    const m = parseInt(timeOnly[2], 10) || 0;
    if (h >= 0 && h <= 24 && m >= 0 && m < 60) return h + m / 60;
  }
  return null;
}

/** 시간기록의 근무하기 → 근무표 행 형식으로 변환 (근무시간, Hours, 근무일 채움, 근무유형/메모는 유지용) */
function getWorkRowsFromTimeRecord() {
  const timeRows = loadTimeRows();
  const workTaskName = "근무하기";
  const rows = timeRows
    .filter((r) => (r.taskName || "").trim() === workTaskName)
    .filter((r) => r.startTime && r.endTime && r.date)
    .map((r) => {
      const startH = parseTimeToHours(r.startTime);
      const endH = parseTimeToHours(r.endTime);
      if (startH == null || endH == null) return null;
      const duration = endH > startH ? endH - startH : 24 - startH + endH;
      const toTimeString = (hours) => {
        if (hours == null || Number.isNaN(hours)) return "";
        const h = Math.floor(hours) % 24;
        const m = Math.round((hours - Math.floor(hours)) * 60);
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      };
      const startStr = toTimeString(startH);
      const endStr = toTimeString(endH);
      const dateStr = String(r.date || "").trim().replace(/\//g, "-").slice(0, 10);
      return {
        name: startStr && endStr ? `${startStr}~${endStr}` : "",
        hoursWorked: duration > 0 ? String(Math.round(duration * 100) / 100) : "",
        workDate: dateStr,
        workType: "",
        memo: "",
      };
    })
    .filter(Boolean);
  return rows;
}

/** 근무표 = 시간기록의 "근무하기"만 표시. 저장된 근무유형·메모는 동일 날짜+근무시간일 때만 유지 (시간기록에 없는 과거 행은 더 이상 누적하지 않음) */
function getMergedInitialRows() {
  const fromTime = getWorkRowsFromTimeRecord();
  const saved = loadRows();
  const key = (r) => `${r.workDate || ""}|${(r.name || "").trim()}`;
  return fromTime.map((t) => {
    const match = saved.find((s) => key(s) === key(t));
    return {
      ...t,
      workType: match?.workType ?? t.workType,
      memo: match?.memo ?? t.memo,
    };
  });
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
    const hoursWorkedInput = tr.querySelector(".work-schedule-input-hours-worked");
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
    const hasAny = (r.name || "").trim() || (r.workType || "").trim() || (r.hoursWorked || "").trim() || (r.workDate || "").trim() || (r.hours || "").trim() || (r.memo || "").trim();
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
    if (val) display.classList.add("is-default");
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
    renderPanel("");
  });

  input.addEventListener("focus", () => {
    showInput();
    renderPanel("");
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
      const tagClass = "";
      const row = document.createElement("div");
      row.className = "time-task-name-option" + (isProtected ? " work-schedule-type-protected" : "");
      row.innerHTML =
        `<span class="time-task-tag ${tagClass}">${opt}</span>` +
        (isProtected ? "" : `<button type="button" class="time-task-delete-btn" title="삭제">${DELETE_ICON}</button>`);
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

function createRow(initialData = {}, onUpdate, viewEl, onFilterApply, getDailyHours) {
  const tr = document.createElement("tr");
  tr.className = "work-schedule-row";

  const nameTd = document.createElement("td");
  nameTd.className = "work-schedule-cell work-schedule-cell-name";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "work-schedule-input-name";
  nameInput.placeholder = "";
  nameInput.value = initialData.name || "";
  nameInput.addEventListener("keydown", (e) => e.key === "Enter" && nameInput.blur());
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
  hoursInput.hidden = true;

  const timeAccumulationDisplay = document.createElement("span");
  timeAccumulationDisplay.className = "work-schedule-time-accumulation-display";

  function updateTimeAccumulationDisplay() {
    const daily = typeof getDailyHours === "function" ? getDailyHours() : getDailyHours;
    const dailyH = Number.isNaN(daily) || daily == null ? 8.5 : parseFloat(daily);
    const hw = parseFloat(hoursWorkedInput?.value);
    if (Number.isNaN(hw) || hoursWorkedInput.value === "") {
      timeAccumulationDisplay.textContent = "";
      hoursInput.value = "";
      return;
    }
    const diff = hw - dailyH;
    timeAccumulationDisplay.textContent = formatTimeAccumulation(diff);
    hoursInput.value = String(diff);
  }

  const rowOnUpdate = () => {
    updateTimeAccumulationDisplay();
    onUpdate();
  };

  typeInputWrap = createWorkTypeInput(initialData.workType || "", rowOnUpdate);

  const typeTd = document.createElement("td");
  typeTd.className = "work-schedule-cell work-schedule-cell-type";
  typeTd.appendChild(typeInputWrap.wrap);
  tr.appendChild(typeTd);

  const hoursWorkedTd = document.createElement("td");
  hoursWorkedTd.className = "work-schedule-cell work-schedule-cell-hours-worked";
  hoursWorkedInput.addEventListener("input", rowOnUpdate);
  hoursWorkedInput.addEventListener("keydown", (e) => e.key === "Enter" && hoursWorkedInput.blur());
  hoursWorkedTd.appendChild(hoursWorkedInput);
  tr.appendChild(hoursWorkedTd);

  function formatDateYYMMDD(val) {
    if (!val) return "";
    const [y, m, d] = val.split("-");
    if (!y || !m || !d) return val;
    return `${y}/${m}/${d}`;
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
  hoursTd.appendChild(timeAccumulationDisplay);
  hoursTd.appendChild(hoursInput);
  tr.appendChild(hoursTd);

  updateTimeAccumulationDisplay();

  const memoTd = document.createElement("td");
  memoTd.className = "work-schedule-cell work-schedule-cell-memo";
  const memoInput = document.createElement("input");
  memoInput.type = "text";
  memoInput.className = "work-schedule-input-memo";
  memoInput.placeholder = "";
  memoInput.value = initialData.memo || "";
  memoInput.addEventListener("keydown", (e) => e.key === "Enter" && memoInput.blur());
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
  header.className = "work-schedule-header dream-view-header-wrap";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "WORK SCHEDULE";
  const h = document.createElement("h1");
  h.className = "dream-view-title work-schedule-title";
  h.textContent = "근무표";
  header.appendChild(label);
  header.appendChild(h);
  el.appendChild(header);

  const viewTabs = document.createElement("div");
  viewTabs.className = "work-schedule-view-tabs";
  viewTabs.innerHTML = `
    <button type="button" class="work-schedule-view-tab active" data-view="all">1. 근무기록 트랙커</button>
    <button type="button" class="work-schedule-view-tab" data-view="monthly">2. 월별보기</button>
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

    function formatDateForDayFilter(dateStr) {
      if (!dateStr || dateStr.length < 10) return "";
      const d = new Date(dateStr + "T12:00:00");
      if (isNaN(d.getTime())) return "";
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const weekday = d.toLocaleDateString("ko-KR", { weekday: "short" });
      return `${month}월 ${day}일 (${weekday})`;
    }

    const dailyHoursWrap = document.createElement("div");
    dailyHoursWrap.className = "work-schedule-daily-hours-wrap";
    const dailyHoursLabel = document.createElement("label");
    dailyHoursLabel.className = "work-schedule-daily-hours-label";
    dailyHoursLabel.textContent = "하루 근무시간 입력하기 ";
    const dailyHoursInput = document.createElement("input");
    dailyHoursInput.type = "number";
    dailyHoursInput.className = "work-schedule-daily-hours-input";
    dailyHoursInput.min = "0";
    dailyHoursInput.step = "0.5";
    dailyHoursInput.placeholder = "8.5 (8시간 30분)";
    dailyHoursInput.value = String(getDailyHours());
    dailyHoursInput.title = "8시간 30분이면 8.5 입력";
    dailyHoursLabel.appendChild(dailyHoursInput);
    dailyHoursWrap.appendChild(dailyHoursLabel);

    const filterBar = document.createElement("div");
    filterBar.className = "work-schedule-filter-bar";
    filterBar.innerHTML = `
      <div class="time-filter-tabs">
        <button type="button" class="time-filter-btn active" data-filter="month">월별</button>
        <button type="button" class="time-filter-btn" data-filter="week">일주일</button>
        <button type="button" class="time-filter-btn" data-filter="day">하루</button>
        <button type="button" class="time-filter-btn" data-filter="range">날짜 선택</button>
      </div>
      <div class="time-filter-day-wrap" data-filter-wrap="day" style="display:none">
        <span class="time-filter-day-display">${formatDateForDayFilter(filterStartDate)}</span>
        <div class="time-filter-day-nav">
          <button type="button" class="time-filter-day-prev" aria-label="이전 날짜">&lt;</button>
          <button type="button" class="time-filter-day-next" aria-label="다음 날짜">&gt;</button>
        </div>
      </div>
      <div class="time-filter-month-wrap" data-filter-wrap="month">
        <div class="asset-cashflow-dropdown-wrap">
          <button type="button" class="time-period-trigger asset-cashflow-trigger" id="work-schedule-month-trigger">${filterMonth}월</button>
          <div class="time-period-panel asset-cashflow-panel" id="work-schedule-month-panel">
            ${Array.from({ length: 12 }, (_, i) => {
              const m = i + 1;
              return `<div class="time-period-option" data-value="${m}">${m}월</div>`;
            }).join("")}
          </div>
        </div>
        <div class="asset-cashflow-year-nav">
          <button type="button" class="asset-cashflow-year-btn" aria-label="이전 연도">&lt;</button>
          <span class="asset-cashflow-year-display">${filterYear}</span>
          <button type="button" class="asset-cashflow-year-btn" aria-label="다음 연도">&gt;</button>
        </div>
      </div>
      <div class="time-filter-range-wrap" data-filter-wrap="range" style="display:none">
        <input type="date" class="time-filter-start-date" />
        <span>~</span>
        <input type="date" class="time-filter-end-date" />
      </div>
    `;

    const dayWrap = filterBar.querySelector("[data-filter-wrap='day']");
    const monthWrap = filterBar.querySelector("[data-filter-wrap='month']");
    const rangeWrap = filterBar.querySelector("[data-filter-wrap='range']");
    const dayDisplay = filterBar.querySelector(".time-filter-day-display");
    const dayPrevBtn = filterBar.querySelector(".time-filter-day-prev");
    const dayNextBtn = filterBar.querySelector(".time-filter-day-next");
    const startDateInput = filterBar.querySelector(".time-filter-start-date");
    const endDateInput = filterBar.querySelector(".time-filter-end-date");
    const monthTrigger = filterBar.querySelector("#work-schedule-month-trigger");
    const monthPanel = filterBar.querySelector("#work-schedule-month-panel");
    const monthDropdownWrap = filterBar.querySelector(".time-filter-month-wrap .asset-cashflow-dropdown-wrap");
    const yearDisplay = filterBar.querySelector(".asset-cashflow-year-display");
    const yearPrevBtn = filterBar.querySelector(".time-filter-month-wrap .asset-cashflow-year-btn:first-child");
    const yearNextBtn = filterBar.querySelector(".time-filter-month-wrap .asset-cashflow-year-btn:last-child");

    monthPanel.querySelectorAll(".time-period-option").forEach((o) => {
      o.classList.toggle("is-selected", o.dataset.value === String(filterMonth));
    });

    monthTrigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      monthPanel.classList.toggle("is-open");
      monthDropdownWrap.classList.toggle("is-open");
    });
    monthPanel.querySelectorAll(".time-period-option").forEach((o) => {
      o.addEventListener("click", (e) => {
        e.stopPropagation();
        filterMonth = parseInt(o.dataset.value, 10);
        monthTrigger.textContent = `${filterMonth}월`;
        monthPanel.classList.remove("is-open");
        monthDropdownWrap.classList.remove("is-open");
        monthPanel.querySelectorAll(".time-period-option").forEach((opt) => {
          opt.classList.toggle("is-selected", opt.dataset.value === String(filterMonth));
        });
        applyFilter();
      });
    });
    yearPrevBtn.addEventListener("click", () => {
      filterYear -= 1;
      yearDisplay.textContent = filterYear;
      applyFilter();
    });
    yearNextBtn.addEventListener("click", () => {
      filterYear += 1;
      yearDisplay.textContent = filterYear;
      applyFilter();
    });
    document.addEventListener("click", (e) => {
      if (!monthDropdownWrap?.contains(e.target)) {
        monthPanel?.classList.remove("is-open");
        monthDropdownWrap?.classList.remove("is-open");
      }
    });

    function updateDayDisplay() {
      if (dayDisplay) dayDisplay.textContent = formatDateForDayFilter(filterStartDate);
    }

    dayPrevBtn?.addEventListener("click", () => {
      const d = new Date(filterStartDate + "T12:00:00");
      d.setDate(d.getDate() - 1);
      filterStartDate = filterEndDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      startDateInput.value = filterStartDate;
      endDateInput.value = filterEndDate;
      updateDayDisplay();
      applyFilter();
    });
    dayNextBtn?.addEventListener("click", () => {
      const d = new Date(filterStartDate + "T12:00:00");
      d.setDate(d.getDate() + 1);
      filterStartDate = filterEndDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      startDateInput.value = filterStartDate;
      endDateInput.value = filterEndDate;
      updateDayDisplay();
      applyFilter();
    });

    startDateInput.value = filterStartDate;
    endDateInput.value = filterEndDate;

    function isDateInRange(dateStr, type, y, m, start, end) {
      if (!dateStr) return true;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      if (type === "day" && start) {
        const sel = new Date(start + "T12:00:00");
        return d.getFullYear() === sel.getFullYear() && d.getMonth() === sel.getMonth() && d.getDate() === sel.getDate();
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
      const y = filterYear;
      const m = filterMonth;
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

    filterBar.querySelectorAll(".time-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        filterType = btn.dataset.filter;
        filterBar.querySelectorAll(".time-filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        dayWrap.style.display = filterType === "day" ? "" : "none";
        monthWrap.style.display = filterType === "month" ? "" : "none";
        rangeWrap.style.display = filterType === "range" ? "" : "none";
        if (filterType === "day") updateDayDisplay();
        applyFilter();
      });
    });
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
      const sign = total > 0 ? "+ " : total < 0 ? "" : "";
      sumCell.textContent = total === 0 ? "0 hrs" : `${sign}${total} hrs`;
    }

    const onUpdate = () => {
      save();
      updateSum();
    };

    const getDailyHoursFn = () => parseFloat(dailyHoursInput?.value) || 8.5;

    function refreshAllRowsTimeAccumulation() {
      const dailyH = getDailyHoursFn();
      tableWrap.querySelectorAll(".work-schedule-row").forEach((tr) => {
        const display = tr.querySelector(".work-schedule-time-accumulation-display");
        const hoursWorkedInput = tr.querySelector(".work-schedule-input-hours-worked");
        const hoursInput = tr.querySelector(".work-schedule-input-hours");
        if (!display || !hoursWorkedInput) return;
        const hw = parseFloat(hoursWorkedInput.value);
        if (Number.isNaN(hw) || hoursWorkedInput.value === "") {
          display.textContent = "";
          if (hoursInput) hoursInput.value = "";
          return;
        }
        const diff = hw - dailyH;
        display.textContent = formatTimeAccumulation(diff);
        if (hoursInput) hoursInput.value = String(diff);
      });
      updateSum();
    }

    dailyHoursInput.addEventListener("input", () => {
      setDailyHours(dailyHoursInput.value);
      refreshAllRowsTimeAccumulation();
    });
    dailyHoursInput.addEventListener("change", () => {
      setDailyHours(dailyHoursInput.value);
      refreshAllRowsTimeAccumulation();
    });

    const initialRows = getMergedInitialRows();
    initialRows.forEach((row) => {
      const tr = createRow(row, onUpdate, el, applyFilter, getDailyHoursFn);
      tbody.appendChild(tr);
    });

    addBtn.addEventListener("click", () => {
      const tr = createRow({}, onUpdate, el, applyFilter, getDailyHoursFn);
      tbody.appendChild(tr);
      applyFilter();
      save();
    });

    tableWrap.appendChild(table);
    const topRow = document.createElement("div");
    topRow.className = "work-schedule-top-row";
    topRow.appendChild(dailyHoursWrap);
    topRow.appendChild(filterBar);
    contentWrap.appendChild(topRow);
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
