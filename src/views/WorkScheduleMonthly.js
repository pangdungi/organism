/**
 * 근무표 먼슬리 뷰 - 근무일별 근무유형과 Hours를 캘린더에 표시
 *
 * @param {{ hoursOnly?: boolean, typeOnly?: boolean, onDayClick?: (dateKey: string) => void, onMonthLabelClick?: (ctx: { year: number, month: number }) => void }} opts
 *   - onDayClick: 날짜 셀 클릭 시 YYYY-MM-DD 전달(근무 등록 모달 등)
 *   - onMonthLabelClick: 상단 월 라벨 클릭 시 해당 달 연·월 전달
 */

import { applyWorkScheduleRowTimesFromTypes } from "../utils/workScheduleEntryResolve.js";
import { readWorkScheduleRowsFromMem } from "../utils/workScheduleModel.js";
import { workScheduleDiagLog } from "../utils/workScheduleDiag.js";

/** 근무표 월별보기에서 보고 있던 연·월 — 모달·탭 갱신 후에도 유지 (localStorage: 세션보다 안정적) */
const WS_MONTHLY_VIEW_YM_KEY = "lp-work-schedule-monthly-ym";

/** renderMain 등으로 번들은 유지·DOM만 바뀔 때 localStorage 타이밍보다 안전한 메모리 백업 */
let _monthlyViewCursorMem = /** @type {{ y: number; m: number } | null} */ (null);

function readStoredMonthlyYm() {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(WS_MONTHLY_VIEW_YM_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        const y = Number(o.y);
        const m = Number(o.m);
        if (Number.isFinite(y) && y >= 1970 && y <= 2100 && Number.isFinite(m) && m >= 0 && m <= 11) {
          _monthlyViewCursorMem = { y, m };
          workScheduleDiagLog("월별 커서: localStorage", _monthlyViewCursorMem);
          return { y, m };
        }
      }
    }
  } catch (e) {
    workScheduleDiagLog("월별 커서: localStorage 읽기 실패", e?.message || e);
  }
  if (_monthlyViewCursorMem) {
    workScheduleDiagLog("월별 커서: 메모리 폴백", _monthlyViewCursorMem);
    return _monthlyViewCursorMem;
  }
  workScheduleDiagLog("월별 커서: 없음 → 이번 달");
  return null;
}

function storeMonthlyYm(y, m) {
  _monthlyViewCursorMem = { y, m };
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(WS_MONTHLY_VIEW_YM_KEY, JSON.stringify({ y, m }));
    workScheduleDiagLog("월별 커서: 저장", { y, m });
  } catch (e) {
    workScheduleDiagLog("월별 커서: localStorage 저장 실패(메모리만 유지)", e?.message || e);
  }
}

/** 근무표 밖(저장 모달 등)에서 호출: 월별보기를 이 연·월로 맞춤 */
export function setWorkScheduleMonthlyViewCursor(year, monthIndex0) {
  const y = Number(year);
  const m = Number(monthIndex0);
  if (!Number.isFinite(y) || y < 1970 || y > 2100) return;
  if (!Number.isFinite(m) || m < 0 || m > 11) return;
  storeMonthlyYm(y, m);
}

function loadWorkScheduleRows() {
  try {
    const arr = readWorkScheduleRowsFromMem();
    if (Array.isArray(arr)) return applyWorkScheduleRowTimesFromTypes(arr);
  } catch (_) {}
  return [];
}

/** 날짜만 있고 근무유형/Hours/시간적립이 없는 항목은 캘린더에 표시하지 않음 */
function isMeaningfulForCalendar(row) {
  const hasType = (row.workType || "").trim();
  const hasHoursWorked = (row.hoursWorked || "").trim();
  const hasHours = (row.hours || "").trim();
  return !!(hasType || hasHoursWorked || hasHours);
}

function groupByDate(rows) {
  const map = {};
  rows.forEach((row) => {
    if (!isMeaningfulForCalendar(row)) return;
    const d = (row.workDate || "").slice(0, 10);
    if (!d) return;
    if (!map[d]) map[d] = [];
    map[d].push(row);
  });
  return map;
}

function getDaysInMonth(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

/** 월요일 시작 (0=월, 6=일) */
function getMondayBasedDow(date) {
  return (date.getDay() + 6) % 7;
}

function getCalendarGrid(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = getMondayBasedDow(first);
  const totalDays = last.getDate();

  const grid = [];
  let week = [];
  for (let i = 0; i < startDow; i++) {
    week.push(new Date(year, month, -(startDow - 1 - i)));
  }
  for (let d = 1; d <= totalDays; d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) {
      grid.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    const pad = 7 - week.length;
    for (let i = 1; i <= pad; i++) {
      week.push(new Date(year, month + 1, i));
    }
    grid.push(week);
  }
  return grid;
}

/** 로컬 달력 날짜(그리드 셀 Date) → YYYY-MM-DD. UTC(toISOString) 쓰면 타임존에서 하루 어긋남 */
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];
const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_NAMES_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/**
 * 근무표 내부에서 사용하는 먼슬리 캘린더 콘텐츠
 * @param {{ hoursOnly?: boolean, typeOnly?: boolean, onDayClick?: (dateKey: string) => void, onMonthLabelClick?: (ctx: { year: number, month: number }) => void }} opts
 *   - hoursOnly: true면 근무시간만 표시(필터 버튼 숨김)
 *   - typeOnly: true면 근무유형만 표시(필터 버튼 숨김). 근무표 「2. 월별보기」는 항상 이 모드
 */
export function renderMonthlyContent(opts = {}) {
  const hoursOnly = !!opts.hoursOnly;
  const typeOnly = !!opts.typeOnly;
  const noFilter = hoursOnly || typeOnly;
  const onDayClick = typeof opts.onDayClick === "function" ? opts.onDayClick : null;
  const onMonthLabelClick = typeof opts.onMonthLabelClick === "function" ? opts.onMonthLabelClick : null;
  const el = document.createElement("div");
  el.className = "work-schedule-monthly-content" + (noFilter ? " work-schedule-monthly-content--hours-only" : "");

  const nav = document.createElement("div");
  nav.className = "work-schedule-monthly-nav";

  const todayBtn = document.createElement("button");
  todayBtn.type = "button";
  todayBtn.className = "work-schedule-monthly-today-btn";
  todayBtn.textContent = "Today";
  todayBtn.title = "오늘 날짜가 있는 달로 이동";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "work-schedule-monthly-nav-btn";
  prevBtn.textContent = "<";
  prevBtn.title = "이전 달";

  const monthLabel = document.createElement("span");
  monthLabel.className = "work-schedule-monthly-label";
  if (onMonthLabelClick) {
    monthLabel.setAttribute("role", "button");
    monthLabel.tabIndex = 0;
    monthLabel.style.cursor = "pointer";
    monthLabel.title = "이 달의 날짜를 골라 근무를 등록합니다";
  }

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "work-schedule-monthly-nav-btn";
  nextBtn.textContent = ">";
  nextBtn.title = "다음 달";

  nav.appendChild(todayBtn);
  nav.appendChild(prevBtn);
  nav.appendChild(monthLabel);
  nav.appendChild(nextBtn);

  const topRow = document.createElement("div");
  topRow.className = "work-schedule-monthly-top-row";

  const filterRow = document.createElement("div");
  filterRow.className = "work-schedule-monthly-filter";
  if (!noFilter) {
    const btnHours = document.createElement("button");
    btnHours.type = "button";
    btnHours.className = "work-schedule-monthly-filter-btn active";
    btnHours.dataset.mode = "hours";
    btnHours.textContent = "근무시간";
    const btnType = document.createElement("button");
    btnType.type = "button";
    btnType.className = "work-schedule-monthly-filter-btn";
    btnType.dataset.mode = "type";
    btnType.textContent = "근무유형";
    filterRow.appendChild(btnHours);
    filterRow.appendChild(btnType);
  }
  topRow.appendChild(nav);
  if (!noFilter) topRow.appendChild(filterRow);
  el.appendChild(topRow);

  const calendarWrap = document.createElement("div");
  calendarWrap.className = "work-schedule-monthly-calendar";

  const nowInit = new Date();
  const storedYm = readStoredMonthlyYm();
  let currentYear = storedYm ? storedYm.y : nowInit.getFullYear();
  let currentMonth = storedYm ? storedYm.m : nowInit.getMonth();
  let displayMode = typeOnly ? "type" : "hours";

  if (!noFilter) {
    filterRow.querySelectorAll(".work-schedule-monthly-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        displayMode = btn.dataset.mode || "hours";
        filterRow.querySelectorAll(".work-schedule-monthly-filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderCalendar();
      });
    });
  }

  if (onMonthLabelClick) {
    const fire = () => onMonthLabelClick({ year: currentYear, month: currentMonth });
    monthLabel.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      fire();
    });
    monthLabel.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fire();
      }
    });
  }

  function renderCalendar() {
    const rows = loadWorkScheduleRows();
    const byDate = groupByDate(rows);
    const grid = getCalendarGrid(currentYear, currentMonth);

    monthLabel.textContent = `${MONTH_NAMES_SHORT[currentMonth]} ${currentYear}`;

    calendarWrap.innerHTML = "";

    const dayHeader = document.createElement("div");
    dayHeader.className = "work-schedule-monthly-weekdays";
    DAY_NAMES.forEach((name) => {
      const cell = document.createElement("div");
      cell.className = "work-schedule-monthly-weekday";
      cell.textContent = name;
      dayHeader.appendChild(cell);
    });
    calendarWrap.appendChild(dayHeader);

    grid.forEach((week) => {
      const weekRow = document.createElement("div");
      weekRow.className = "work-schedule-monthly-week";
      week.forEach((date) => {
        const cell = document.createElement("div");
        cell.className = "work-schedule-monthly-day";
        if (!date) {
          cell.classList.add("empty");
          weekRow.appendChild(cell);
          return;
        }
        const key = formatDateKey(date);
        cell.dataset.date = key;
        const isCurrentMonth = date.getFullYear() === currentYear && date.getMonth() === currentMonth;
        if (!isCurrentMonth) cell.classList.add("other-month");
        const now = new Date();
        const todayKey = formatDateKey(now);
        if (key === todayKey) cell.classList.add("today");
        if (date.getFullYear() !== currentYear || date.getMonth() !== currentMonth) {
          cell.classList.add("other-month");
        }
        const dayNum = document.createElement("div");
        dayNum.className = "work-schedule-monthly-day-num";
        dayNum.textContent = date.getDate();
        if (date.getDay() === 0) cell.classList.add("sun");
        if (date.getDay() === 6) cell.classList.add("sat");
        cell.appendChild(dayNum);

        if (onDayClick) {
          cell.style.cursor = "pointer";
          cell.title = "탭하여 이 날짜에 근무 등록";
          cell.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            /* 회색 칸(전·다음 달 날짜)을 눌렀을 때도 그 달이 열리도록, 클릭한 날짜의 연·월을 저장 */
            storeMonthlyYm(date.getFullYear(), date.getMonth());
            onDayClick(key);
          });
        }

        const entries = byDate[key] || [];
        const entriesEl = document.createElement("div");
        entriesEl.className = "work-schedule-monthly-day-entries";
        if (entries.length > 0) {
          const item = document.createElement("div");
          item.className = "work-schedule-monthly-entry";
          if (displayMode === "hours") {
            const total = entries.reduce((s, e) => s + (parseFloat(e.hoursWorked) || 0), 0);
            item.innerHTML = `<span class="work-schedule-monthly-hours">${total ? total + "h" : "-"}</span>`;
          } else if (displayMode === "type") {
            const types = [...new Set(entries.map((e) => (e.workType || "").trim()).filter(Boolean))];
            if (types.length === 0) {
              item.innerHTML = '<span class="work-schedule-monthly-type-pill is-placeholder">-</span>';
            } else {
              item.className = "work-schedule-monthly-entry work-schedule-monthly-entry--pills";
              types.forEach((t) => {
                const pill = document.createElement("span");
                pill.className = "work-schedule-monthly-type-pill is-default";
                pill.textContent = t;
                item.appendChild(pill);
              });
            }
          }
          entriesEl.appendChild(item);
        }
        cell.appendChild(entriesEl);
        weekRow.appendChild(cell);
      });
      calendarWrap.appendChild(weekRow);
    });
    storeMonthlyYm(currentYear, currentMonth);
  }

  todayBtn.addEventListener("click", () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    renderCalendar();
  });

  prevBtn.addEventListener("click", () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar();
  });

  nextBtn.addEventListener("click", () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar();
  });

  renderCalendar();
  el.appendChild(calendarWrap);

  return el;
}
