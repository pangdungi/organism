/**
 * 근무표 먼슬리 뷰 - 근무일별 근무유형과 Hours를 캘린더에 표시
 */

const WORK_SCHEDULE_KEY = "work_schedule_rows";

function loadWorkScheduleRows() {
  try {
    const raw = localStorage.getItem(WORK_SCHEDULE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
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

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
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
 * @param {{ hoursOnly?: boolean }} opts - hoursOnly: true면 근무시간만 표시(필터 버튼 숨김, 모바일 캘린더 탭용)
 */
export function renderMonthlyContent(opts = {}) {
  const hoursOnly = !!opts.hoursOnly;
  const el = document.createElement("div");
  el.className = "work-schedule-monthly-content" + (hoursOnly ? " work-schedule-monthly-content--hours-only" : "");

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
  if (!hoursOnly) {
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
    const btnBalance = document.createElement("button");
    btnBalance.type = "button";
    btnBalance.className = "work-schedule-monthly-filter-btn";
    btnBalance.dataset.mode = "balance";
    btnBalance.textContent = "밸런스";
    filterRow.appendChild(btnHours);
    filterRow.appendChild(btnType);
    filterRow.appendChild(btnBalance);
  }
  topRow.appendChild(nav);
  if (!hoursOnly) topRow.appendChild(filterRow);
  el.appendChild(topRow);

  const calendarWrap = document.createElement("div");
  calendarWrap.className = "work-schedule-monthly-calendar";

  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();
  let displayMode = "hours";

  if (!hoursOnly) {
    filterRow.querySelectorAll(".work-schedule-monthly-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        displayMode = btn.dataset.mode || "hours";
        filterRow.querySelectorAll(".work-schedule-monthly-filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderCalendar();
      });
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
            const types = entries.map((e) => (e.workType || "").trim() || "-").filter(Boolean);
            item.innerHTML = `<span class="work-schedule-monthly-type">${types.length ? types.join(", ") : "-"}</span>`;
          } else {
            const totalBalance = entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
            const sign = totalBalance > 0 ? "+ " : totalBalance < 0 ? "" : "";
            item.innerHTML = `<span class="work-schedule-monthly-hours">${totalBalance !== 0 ? sign + totalBalance + "h" : "0h"}</span>`;
          }
          entriesEl.appendChild(item);
        }
        cell.appendChild(entriesEl);
        weekRow.appendChild(cell);
      });
      calendarWrap.appendChild(weekRow);
    });
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
