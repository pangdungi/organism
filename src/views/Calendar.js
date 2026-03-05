/**
 * 캘린더 - 월별/2주/1주/1일 뷰
 * 월별: 왼쪽 미니멀 캘린더 + 오른쪽 태스크 사이드바
 * 할일목록: 인생 KPI와 동일한 구조
 */

import { render as renderTodoList, saveTodoListBeforeUnmount } from "./TodoList.js";
import { showKpiViewModal } from "../utils/kpiViewModal.js";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

function getCalendarGrid(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = first.getDay();
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

function renderMonthlyView() {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout";

  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();

  const calendarSection = document.createElement("div");
  calendarSection.className = "calendar-monthly-main";

  const nav = document.createElement("div");
  nav.className = "calendar-monthly-nav";
  nav.innerHTML = `
    <button type="button" class="calendar-nav-today" title="오늘">Today</button>
    <span class="calendar-nav-month-label">Month</span>
    <button type="button" class="calendar-nav-prev" title="이전 달">‹</button>
    <span class="calendar-nav-current"></span>
    <button type="button" class="calendar-nav-next" title="다음 달">›</button>
  `;

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-monthly-grid";

  function renderCalendar() {
    const grid = getCalendarGrid(currentYear, currentMonth);
    nav.querySelector(".calendar-nav-current").textContent = `${currentYear}년 ${MONTH_NAMES[currentMonth]}`;

    calendarGrid.innerHTML = "";

    const dayHeader = document.createElement("div");
    dayHeader.className = "calendar-monthly-weekdays";
    DAY_NAMES.forEach((name) => {
      const cell = document.createElement("div");
      cell.className = "calendar-monthly-weekday";
      cell.textContent = name;
      dayHeader.appendChild(cell);
    });
    calendarGrid.appendChild(dayHeader);

    const todayKey = formatDateKey(new Date());

    grid.forEach((week) => {
      const weekRow = document.createElement("div");
      weekRow.className = "calendar-monthly-week";
      week.forEach((date) => {
        const cell = document.createElement("div");
        cell.className = "calendar-monthly-day";
        if (!date) {
          cell.classList.add("empty");
          weekRow.appendChild(cell);
          return;
        }
        const key = formatDateKey(date);
        cell.dataset.date = key;
        const dayNum = document.createElement("div");
        dayNum.className = "calendar-monthly-day-num";
        dayNum.textContent = date.getDate();

        const isCurrentMonth = date.getMonth() === currentMonth;
        if (!isCurrentMonth) cell.classList.add("other-month");
        if (key === todayKey) cell.classList.add("today");
        if (date.getDay() === 0) cell.classList.add("sun");
        if (date.getDay() === 6) cell.classList.add("sat");

        cell.appendChild(dayNum);
        const entriesEl = document.createElement("div");
        entriesEl.className = "calendar-monthly-day-entries";
        cell.appendChild(entriesEl);
        weekRow.appendChild(cell);
      });
      calendarGrid.appendChild(weekRow);
    });
  }

  nav.querySelector(".calendar-nav-today").addEventListener("click", () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    renderCalendar();
  });
  nav.querySelector(".calendar-nav-prev").addEventListener("click", () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar();
  });
  nav.querySelector(".calendar-nav-next").addEventListener("click", () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar();
  });

  calendarSection.appendChild(nav);
  calendarSection.appendChild(calendarGrid);
  wrap.appendChild(calendarSection);

  let tasksCollapsed = false;

  const tasksSidebar = document.createElement("aside");
  tasksSidebar.className = "calendar-tasks-sidebar";
  tasksSidebar.innerHTML = `
    <div class="calendar-tasks-header">
      <span class="calendar-tasks-title">Tasks</span>
      <div class="calendar-tasks-actions">
        <button type="button" class="calendar-tasks-search" title="검색">🔍</button>
        <button type="button" class="calendar-tasks-collapse" title="접기">‹</button>
      </div>
    </div>
  `;

  const collapseBtn = tasksSidebar.querySelector(".calendar-tasks-collapse");
  collapseBtn.addEventListener("click", () => {
    tasksCollapsed = !tasksCollapsed;
    tasksSidebar.classList.toggle("collapsed", tasksCollapsed);
    collapseBtn.textContent = tasksCollapsed ? "›" : "‹";
  });

  wrap.appendChild(tasksSidebar);
  renderCalendar();

  return wrap;
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content calendar-view";

  const headerRow = document.createElement("div");
  headerRow.className = "calendar-header-row";
  const h = document.createElement("h2");
  h.textContent = "캘린더";
  headerRow.appendChild(h);
  const kpiViewBtn = document.createElement("button");
  kpiViewBtn.type = "button";
  kpiViewBtn.className = "calendar-kpi-view-btn";
  kpiViewBtn.textContent = "KPI 보기";
  kpiViewBtn.addEventListener("click", () => showKpiViewModal());
  headerRow.appendChild(kpiViewBtn);
  el.appendChild(headerRow);

  const tabs = document.createElement("div");
  tabs.className = "time-view-tabs calendar-tabs";
  tabs.innerHTML = `
    <button type="button" class="time-view-tab active" data-view="todo">할일목록</button>
    <button type="button" class="time-view-tab" data-view="monthly">월별캘린더</button>
    <button type="button" class="time-view-tab" data-view="2week">2주캘린더</button>
    <button type="button" class="time-view-tab" data-view="1week">1주캘린더</button>
    <button type="button" class="time-view-tab" data-view="1day">1일캘린더</button>
  `;
  el.appendChild(tabs);

  const contentWrap = document.createElement("div");
  contentWrap.className = "calendar-content-wrap";

  let currentView = "todo";

  function renderContent(view) {
    if (currentView === "todo" && view !== "todo") {
      saveTodoListBeforeUnmount(contentWrap);
    }
    currentView = view;
    contentWrap.innerHTML = "";
    if (view === "todo") {
      contentWrap.appendChild(renderTodoList());
    } else if (view === "monthly") {
      contentWrap.appendChild(renderMonthlyView());
    } else {
      const labels = { "2week": "2주캘린더", "1week": "1주캘린더", "1day": "1일캘린더" };
      contentWrap.innerHTML = `<p class="calendar-placeholder">${labels[view]} (준비 중)</p>`;
    }
  }

  tabs.querySelectorAll(".time-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.querySelectorAll(".time-view-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderContent(btn.dataset.view);
    });
  });

  renderContent("todo");
  el.appendChild(contentWrap);

  return el;
}
