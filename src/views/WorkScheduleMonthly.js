/**
 * 근무표 먼슬리 뷰 - 근무일별 근무유형과 Hours를 캘린더에 표시
 *
 * @param {{ hoursOnly?: boolean, typeOnly?: boolean, typePillClassForName?: (typeName: string) => string, onDayClick?: (dateKey: string) => void, onEntryClick?: (ctx: { dateKey: string, rowId: string }) => void, onMonthLabelClick?: (ctx: { year: number, month: number }) => void }} opts
 *   - onDayClick: 날짜 셀 클릭 시 YYYY-MM-DD 전달(새 근무 추가)
 *   - onEntryClick: 캘린더에 찍힌 근무 칩 클릭 시 해당 행 id로 수정·삭제 모달
 *   - onMonthLabelClick: 상단 월 라벨 클릭 시 해당 달 연·월 전달
 */

import { applyWorkScheduleRowTimesFromTypes } from "../utils/workScheduleEntryResolve.js";
import { readWorkScheduleRowsFromMem } from "../utils/workScheduleModel.js";
import { workScheduleDiagLog } from "../utils/workScheduleDiag.js";

let _workScheduleMonthlyRerender = null;

export function setWorkScheduleMonthlyLiveRerender(fn) {
  _workScheduleMonthlyRerender = typeof fn === "function" ? fn : null;
}

/** 스탬프 캘린더 행만 칩으로 표시 */
function buildMonthlyTypeModePillItems(sortedWorkRows, _dateKey) {
  void _dateKey;
  const displays = sortedWorkRows
    .filter((e) => String(e.workType || "").trim())
    .map((e) => ({
      workType: String(e.workType || "").trim(),
      rowId: String(e.id),
      sortStart: String(e.startTime || "").trim(),
      sortKey: String(e.id),
    }));
  const sortPillGroup = (a, b) => {
    if (a.sortStart !== b.sortStart)
      return a.sortStart.localeCompare(b.sortStart);
    if (a.workType !== b.workType)
      return a.workType.localeCompare(b.workType, "ko");
    return a.sortKey.localeCompare(b.sortKey);
  };
  displays.sort(sortPillGroup);
  return { items: displays };
}

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

/**
 * 근무표 내부에서 사용하는 먼슬리 캘린더 콘텐츠
 * @param {{ hoursOnly?: boolean, typeOnly?: boolean, typePillClassForName?: (typeName: string) => string, onDayClick?: (dateKey: string) => void, onEntryClick?: (ctx: { dateKey: string, rowId: string }) => void, onMonthLabelClick?: (ctx: { year: number, month: number }) => void }} opts
 *   - hoursOnly: true면 근무시간만 표시(필터 버튼 숨김)
 *   - typeOnly: true면 근무유형만 표시(필터 버튼 숨김). 근무표 「2. 월별보기」는 항상 이 모드
 */
export function renderMonthlyContent(opts = {}) {
  const hoursOnly = !!opts.hoursOnly;
  const typeOnly = !!opts.typeOnly;
  const noFilter = hoursOnly || typeOnly;
  const onDayClick = typeof opts.onDayClick === "function" ? opts.onDayClick : null;
  const onEntryClick =
    typeof opts.onEntryClick === "function" ? opts.onEntryClick : null;
  const onMonthLabelClick = typeof opts.onMonthLabelClick === "function" ? opts.onMonthLabelClick : null;
  const typePillClassForName =
    typeof opts.typePillClassForName === "function" ? opts.typePillClassForName : null;
  const el = document.createElement("div");
  el.className =
    "work-schedule-monthly-content calendar-monthly-layout calendar-subview-monthly" +
    (noFilter ? " work-schedule-monthly-content--hours-only" : "");

  const main = document.createElement("div");
  main.className = "calendar-monthly-main";

  /** 일정 탭 월별 뷰와 동일 마크업 — `.calendar-monthly-layout` 변수·`.calendar-nav-controls` 스타일 적용 */
  const nav = document.createElement("div");
  nav.className = "calendar-monthly-nav";
  nav.innerHTML = `
    <span class="calendar-nav-date">
      <span class="calendar-nav-month"></span>
      <span class="calendar-nav-year"></span>
    </span>
    <div class="calendar-nav-controls">
      <button type="button" class="calendar-nav-prev" title="이전 달">&lt;</button>
      <button type="button" class="calendar-nav-today" title="오늘 날짜가 있는 달로 이동">Today</button>
      <button type="button" class="calendar-nav-next" title="다음 달">&gt;</button>
    </div>
  `;
  const navMonth = nav.querySelector(".calendar-nav-month");
  const navYear = nav.querySelector(".calendar-nav-year");
  const prevBtn = nav.querySelector(".calendar-nav-prev");
  const todayBtn = nav.querySelector(".calendar-nav-today");
  const nextBtn = nav.querySelector(".calendar-nav-next");
  const navDateEl = nav.querySelector(".calendar-nav-date");

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
    btnType.textContent = "그 외";
    filterRow.appendChild(btnHours);
    filterRow.appendChild(btnType);
  }

  const calendarWrap = document.createElement("div");
  calendarWrap.className = "work-schedule-monthly-calendar calendar-monthly-grid";

  main.appendChild(nav);
  if (!noFilter) main.appendChild(filterRow);
  main.appendChild(calendarWrap);
  el.appendChild(main);

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

  if (onMonthLabelClick && navDateEl) {
    navDateEl.setAttribute("role", "button");
    navDateEl.tabIndex = 0;
    navDateEl.style.cursor = "pointer";
    navDateEl.title = "이 달의 날짜를 골라 근무를 등록합니다";
    const fire = () => onMonthLabelClick({ year: currentYear, month: currentMonth });
    navDateEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      fire();
    });
    navDateEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fire();
      }
    });
  }

  function sortEntriesForDay(list) {
    return list.slice().sort((a, b) => {
      const sa = String(a?.startTime || "").trim();
      const sb = String(b?.startTime || "").trim();
      if (sa !== sb) return sa.localeCompare(sb);
      const ta = String(a?.workType || "").trim();
      const tb = String(b?.workType || "").trim();
      if (ta !== tb) return ta.localeCompare(tb);
      return String(a?.id || "").localeCompare(String(b?.id || ""));
    });
  }

  function renderCalendar() {
    const rows = loadWorkScheduleRows();
    const byDate = groupByDate(rows);
    const grid = getCalendarGrid(currentYear, currentMonth);

    if (navMonth) navMonth.textContent = MONTH_NAMES_EN[currentMonth];
    if (navYear) navYear.textContent = String(currentYear);

    calendarWrap.innerHTML = "";

    const dayHeader = document.createElement("div");
    dayHeader.className = "calendar-monthly-weekdays";
    DAY_NAMES.forEach((name) => {
      const cell = document.createElement("div");
      cell.className = "calendar-monthly-weekday";
      cell.textContent = name;
      dayHeader.appendChild(cell);
    });
    calendarWrap.appendChild(dayHeader);

    grid.forEach((week) => {
      const weekWrap = document.createElement("div");
      weekWrap.className = "calendar-monthly-week-wrap";
      const weekRow = document.createElement("div");
      weekRow.className = "calendar-monthly-week work-schedule-monthly-week";
      week.forEach((date) => {
        const cell = document.createElement("div");
        cell.className = "calendar-monthly-day work-schedule-monthly-day";
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
        dayNum.className = "calendar-monthly-day-num work-schedule-monthly-day-num";
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
            /* 저장된 달(상단 APR/MAY)은 prev/next/Today·저장 후에만 바꿈. 회색 칸(인접 달)을 눌러
             * 등록만 할 때는 로컬 커서를 건드리지 않음 — 실수로 5월로 고정되는 현상 방지 */
            onDayClick(key);
          });
        }

        const entries = sortEntriesForDay(byDate[key] || []);
        const entriesEl = document.createElement("div");
        entriesEl.className = "work-schedule-monthly-day-entries";
        const shouldRenderEntryBlock =
          (displayMode === "hours" && entries.length > 0) ||
          (displayMode === "type" && entries.length > 0);
        if (shouldRenderEntryBlock) {
          const item = document.createElement("div");
          item.className = "work-schedule-monthly-entry";
          if (displayMode === "hours") {
            item.classList.add("work-schedule-monthly-entry--segments");
            entries.forEach((e) => {
              const h = parseFloat(e.hoursWorked);
              const span = document.createElement("span");
              span.className = "work-schedule-monthly-hours";
              span.textContent =
                h && !Number.isNaN(h) ? `${h}h` : "-";
              if (onEntryClick && e.id) {
                span.style.cursor = "pointer";
                span.title = "탭하여 이 근무 수정·삭제";
                span.addEventListener("click", (ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  onEntryClick({ dateKey: key, rowId: String(e.id) });
                });
              }
              item.appendChild(span);
            });
          } else if (displayMode === "type") {
            item.className =
              "work-schedule-monthly-entry work-schedule-monthly-entry--pills";
            const { items: pillItems } = buildMonthlyTypeModePillItems(
              entries,
              key,
            );
            const hasAnyType = pillItems.some((p) => (p.workType || "").trim());
            if (!hasAnyType) {
              const ph = document.createElement("span");
              ph.className = "work-schedule-monthly-type-pill is-placeholder";
              ph.textContent = "-";
              item.appendChild(ph);
            } else {
              pillItems.forEach((p) => {
                const t = (p.workType || "").trim() || "-";
                const pill = document.createElement("span");
                const pillKind =
                  typePillClassForName && t !== "-"
                    ? (typePillClassForName(t) || "").trim()
                    : "";
                const resolvedKind = (pillKind || "is-default").trim();
                pill.className =
                  "work-schedule-monthly-type-pill " + resolvedKind;
                const textSpan = document.createElement("span");
                textSpan.className =
                  "work-schedule-monthly-type-pill-text";
                textSpan.textContent = t;
                pill.appendChild(textSpan);
                if (onEntryClick && p.rowId) {
                  pill.style.cursor = "pointer";
                  pill.title = "탭하여 이 근무 수정·삭제";
                  pill.addEventListener("click", (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    onEntryClick({ dateKey: key, rowId: String(p.rowId) });
                  });
                }
                item.appendChild(pill);
              });
            }
          }
          entriesEl.appendChild(item);
        }
        cell.appendChild(entriesEl);
        weekRow.appendChild(cell);
      });
      weekWrap.appendChild(weekRow);
      calendarWrap.appendChild(weekWrap);
    });
    storeMonthlyYm(currentYear, currentMonth);
  }

  function goPrevMonth() {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar();
  }

  function goNextMonth() {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar();
  }

  todayBtn.addEventListener("click", () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    renderCalendar();
  });

  prevBtn.addEventListener("click", goPrevMonth);
  nextBtn.addEventListener("click", goNextMonth);

  /* 터치 스와이프: 왼쪽으로 밀면 다음 달, 오른쪽으로 밀면 이전 달 */
  const LP_MONTHLY_SWIPE_MIN_DX = 56;
  const LP_MONTHLY_SWIPE_DOMINANCE = 1.25;
  let monthlySwipeStart = null;
  calendarWrap.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      monthlySwipeStart = { x: t.clientX, y: t.clientY };
    },
    { passive: true },
  );
  calendarWrap.addEventListener(
    "touchcancel",
    () => {
      monthlySwipeStart = null;
    },
    { passive: true },
  );
  calendarWrap.addEventListener(
    "touchend",
    (e) => {
      if (!monthlySwipeStart || e.changedTouches.length !== 1) {
        monthlySwipeStart = null;
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - monthlySwipeStart.x;
      const dy = t.clientY - monthlySwipeStart.y;
      monthlySwipeStart = null;
      if (Math.abs(dx) < LP_MONTHLY_SWIPE_MIN_DX) return;
      if (Math.abs(dx) < Math.abs(dy) * LP_MONTHLY_SWIPE_DOMINANCE) return;
      if (dx < 0) goNextMonth();
      else goPrevMonth();
    },
    { passive: true },
  );

  renderCalendar();

  return el;
}
