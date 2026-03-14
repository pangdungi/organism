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
    week.push(null);
  }
  for (let d = 1; d <= totalDays; d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) {
      grid.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
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

/** 근무표 내부에서 사용하는 먼슬리 캘린더 콘텐츠 */
export function renderMonthlyContent() {
  const el = document.createElement("div");
  el.className = "work-schedule-monthly-content";

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
  el.appendChild(nav);

  const calendarWrap = document.createElement("div");
  calendarWrap.className = "work-schedule-monthly-calendar";

  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();

  function renderCalendar() {
    const rows = loadWorkScheduleRows();
    const byDate = groupByDate(rows);
    const grid = getCalendarGrid(currentYear, currentMonth);

    monthLabel.textContent = `${MONTH_NAMES_EN[currentMonth]} ${currentYear}`;

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
        const dayNum = document.createElement("div");
        dayNum.className = "work-schedule-monthly-day-num";
        dayNum.textContent = date.getDate();
        if (date.getDay() === 0) cell.classList.add("sun");
        if (date.getDay() === 6) cell.classList.add("sat");
        cell.appendChild(dayNum);

        const entries = byDate[key] || [];
        const entriesEl = document.createElement("div");
        entriesEl.className = "work-schedule-monthly-day-entries";
        entries.forEach((entry) => {
          const item = document.createElement("div");
          item.className = "work-schedule-monthly-entry";
          const type = (entry.workType || "").trim();
          const hours = entry.hours ?? entry.hoursWorked ?? "";
          const tagClass = "";
          item.innerHTML = `<span class="work-schedule-monthly-type ${tagClass}">${type || "-"}</span><span class="work-schedule-monthly-hours">${hours ? hours + "h" : ""}</span>`;
          entriesEl.appendChild(item);
        });
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
