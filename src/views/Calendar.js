/**
 * 캘린더 - 월별/2주/1주/1일 뷰
 * 월별: 왼쪽 미니멀 캘린더 + 오른쪽 태스크 사이드바
 * 할일목록: 인생 KPI와 동일한 구조
 */

import { render as renderTodoList, saveTodoListBeforeUnmount } from "./TodoList.js";
import { getKpiTodosAsTasks, addCalendarTodoToSection, addCalendarTodoToBraindump, syncKpiTodoCompleted, updateKpiTodo } from "../utils/kpiTodoSync.js";
import { getSectionColor } from "../utils/todoSettings.js";

const BRAINDUMP_STORAGE_KEY = "todo-braindump-tasks";
const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];
const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
const MONTH_NAMES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
    week.push(new Date(year, month, 1 - startDow + i));
  }
  for (let d = 1; d <= totalDays; d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) {
      grid.push(week);
      week = [];
    }
  }
  let nextMonthDay = 1;
  while (week.length > 0 && week.length < 7) {
    week.push(new Date(year, month + 1, nextMonthDay++));
  }
  if (week.length === 7) {
    grid.push(week);
  }
  return grid;
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

const CALENDAR_CATEGORIES = [
  { id: "braindump", label: "브레인덤프" },
  { id: "dream", label: "꿈" },
  { id: "sideincome", label: "부수입" },
  { id: "health", label: "건강" },
  { id: "happy", label: "행복" },
];

function updateBraindumpTaskDone(taskId, done) {
  try {
    const raw = localStorage.getItem(BRAINDUMP_STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.done = !!done;
      localStorage.setItem(BRAINDUMP_STORAGE_KEY, JSON.stringify(arr));
    }
  } catch (_) {}
}

function updateBraindumpTaskDoneByName(name, startDate, dueDate, done) {
  try {
    const raw = localStorage.getItem(BRAINDUMP_STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    const t = arr.find((x) => (x.name || "").trim() === (name || "").trim() && (x.startDate || "").slice(0, 10) === (startDate || "").slice(0, 10) && (x.dueDate || "").slice(0, 10) === (dueDate || "").slice(0, 10));
    if (t) {
      t.done = !!done;
      localStorage.setItem(BRAINDUMP_STORAGE_KEY, JSON.stringify(arr));
    }
  } catch (_) {}
}

function updateBraindumpTaskDates(taskId, startDate, dueDate) {
  try {
    const raw = localStorage.getItem(BRAINDUMP_STORAGE_KEY);
    if (!raw) return false;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.startDate = (startDate || "").slice(0, 10) || "";
      t.dueDate = (dueDate || "").slice(0, 10) || "";
      localStorage.setItem(BRAINDUMP_STORAGE_KEY, JSON.stringify(arr));
      return true;
    }
  } catch (_) {}
  return false;
}

function updateBraindumpTaskDatesByName(name, oldStart, oldDue, startDate, dueDate) {
  try {
    const raw = localStorage.getItem(BRAINDUMP_STORAGE_KEY);
    if (!raw) return false;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.name || "").trim() === (name || "").trim() && (x.startDate || "").slice(0, 10) === (oldStart || "").slice(0, 10) && (x.dueDate || "").slice(0, 10) === (oldDue || "").slice(0, 10));
    if (t) {
      t.startDate = (startDate || "").slice(0, 10) || "";
      t.dueDate = (dueDate || "").slice(0, 10) || "";
      localStorage.setItem(BRAINDUMP_STORAGE_KEY, JSON.stringify(arr));
      return true;
    }
  } catch (_) {}
  return false;
}

function getBraindumpTasksForDate(dateKey) {
  try {
    const raw = localStorage.getItem(BRAINDUMP_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((t) => (t.name || "").trim() !== "" && (t.dueDate || "").slice(0, 10) === dateKey)
      .map((t) => ({
        name: t.name,
        startDate: t.startDate || "",
        dueDate: t.dueDate,
        sectionId: "braindump",
        itemType: t.itemType || "todo",
        done: !!t.done,
        taskId: t.taskId || "",
      }));
  } catch (_) {}
  return [];
}

function getTasksForDate(dateKey, excludeSpanningTasks = false) {
  const kpiTasks = getKpiTodosAsTasks().filter((t) => (t.dueDate || "").slice(0, 10) === dateKey);
  const braindumpTasks = getBraindumpTasksForDate(dateKey);
  let tasks = [...braindumpTasks, ...kpiTasks];
  if (excludeSpanningTasks) {
    tasks = tasks.filter((t) => !((t.startDate || "").slice(0, 10) && (t.dueDate || "").slice(0, 10)));
  }
  return tasks;
}

function getAllTasksWithDateRange() {
  const kpi = getKpiTodosAsTasks();
  const braindump = [];
  try {
    const raw = localStorage.getItem(BRAINDUMP_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr
          .filter((t) => (t.name || "").trim() !== "" && (t.startDate || "").slice(0, 10) && (t.dueDate || "").slice(0, 10))
          .forEach((t) =>
            braindump.push({
              name: t.name,
              startDate: (t.startDate || "").slice(0, 10),
              dueDate: (t.dueDate || "").slice(0, 10),
              sectionId: "braindump",
              itemType: t.itemType || "todo",
              done: !!t.done,
              taskId: t.taskId || "",
            })
          );
      }
    }
  } catch (_) {}
  const kpiWithRange = kpi.filter((t) => (t.startDate || "").slice(0, 10) && (t.dueDate || "").slice(0, 10)).map((t) => ({ ...t, startDate: (t.startDate || "").slice(0, 10), dueDate: (t.dueDate || "").slice(0, 10) }));
  return [...braindump, ...kpiWithRange];
}

function createCalendarEventBubble(cellRect, dateKey, onSave, onClose) {
  document.querySelectorAll(".calendar-event-bubble").forEach((el) => el.remove());
  const bubble = document.createElement("div");
  bubble.className = "calendar-event-bubble";
  bubble.innerHTML = `
    <div class="calendar-event-bubble-tail"></div>
    <div class="calendar-event-bubble-body">
      <div class="calendar-event-bubble-header">
        <span class="calendar-event-bubble-date">${dateKey.replace(/-/g, ". ")}</span>
        <button type="button" class="calendar-event-bubble-close" title="닫기">×</button>
      </div>
      <div class="calendar-event-bubble-category">
        <label class="calendar-event-bubble-label">카테고리</label>
        <select class="calendar-event-bubble-select">
          ${CALENDAR_CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join("")}
        </select>
      </div>
      <div class="calendar-event-bubble-name">
        <input type="text" class="calendar-event-bubble-input" placeholder="할일 입력" />
      </div>
      <button type="button" class="calendar-event-bubble-save">추가</button>
    </div>
  `;

  const close = () => {
    bubble.remove();
    onClose?.();
  };

  bubble.querySelector(".calendar-event-bubble-close").addEventListener("click", close);
  setTimeout(() => {
    document.addEventListener("click", function outside(e) {
      if (!bubble.contains(e.target)) {
        document.removeEventListener("click", outside);
        close();
      }
    });
  }, 0);

  bubble.querySelector(".calendar-event-bubble-save").addEventListener("click", () => {
    const name = (bubble.querySelector(".calendar-event-bubble-input").value || "").trim();
    const categoryId = bubble.querySelector(".calendar-event-bubble-select").value;
    if (!name) return;
    const result =
      categoryId === "braindump"
        ? addCalendarTodoToBraindump({ text: name, dueDate: dateKey, itemType: "todo" })
        : addCalendarTodoToSection(categoryId, { text: name, dueDate: dateKey, itemType: "todo" });
    if (result.success) {
      onSave?.(result.task);
      close();
    } else {
      const label = CALENDAR_CATEGORIES.find((c) => c.id === categoryId)?.label || categoryId;
      alert(`${label} 카테고리에 KPI를 먼저 추가해주세요.`);
    }
  });

  bubble.querySelector(".calendar-event-bubble-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") bubble.querySelector(".calendar-event-bubble-save").click();
  });

  Object.assign(bubble.style, {
    position: "fixed",
    left: `${cellRect.left}px`,
    top: `${cellRect.bottom + 4}px`,
    zIndex: 1000,
  });

  document.body.appendChild(bubble);
  bubble.querySelector(".calendar-event-bubble-input").focus();
  return bubble;
}

function createCalendarBarDateEditBubble(clientX, clientY, barData, onSave, onClose) {
  document.querySelectorAll(".calendar-bar-date-edit-bubble").forEach((el) => el.remove());
  const bubble = document.createElement("div");
  bubble.className = "calendar-event-bubble calendar-bar-date-edit-bubble";
  const startVal = (barData.startDate || "").slice(0, 10);
  const dueVal = (barData.dueDate || "").slice(0, 10);
  bubble.innerHTML = `
    <div class="calendar-event-bubble-body">
      <div class="calendar-event-bubble-header">
        <span class="calendar-event-bubble-date">${escapeHtml(barData.name || "")}</span>
        <button type="button" class="calendar-event-bubble-close" title="닫기">×</button>
      </div>
      <div class="calendar-bar-date-edit-row">
        <label class="calendar-event-bubble-label">시작일</label>
        <input type="date" class="calendar-bar-date-edit-input" data-field="start" value="${startVal}" />
      </div>
      <div class="calendar-bar-date-edit-row">
        <label class="calendar-event-bubble-label">마감일</label>
        <input type="date" class="calendar-bar-date-edit-input" data-field="due" value="${dueVal}" />
      </div>
      <button type="button" class="calendar-event-bubble-save">저장</button>
    </div>
  `;

  const close = () => {
    bubble.remove();
    onClose?.();
  };

  bubble.querySelector(".calendar-event-bubble-close").addEventListener("click", close);
  setTimeout(() => {
    document.addEventListener("click", function outside(e) {
      if (!bubble.contains(e.target)) {
        document.removeEventListener("click", outside);
        close();
      }
    });
  }, 0);

  const startInput = bubble.querySelector('input[data-field="start"]');
  const dueInput = bubble.querySelector('input[data-field="due"]');
  startInput?.addEventListener("change", () => {
    if (dueInput && startInput.value) dueInput.min = startInput.value;
  });
  dueInput?.addEventListener("change", () => {
    if (startInput && dueInput.value) startInput.max = dueInput.value;
  });
  if (startVal && dueInput) dueInput.min = startVal;
  if (dueVal && startInput) startInput.max = dueVal;

  bubble.querySelector(".calendar-event-bubble-save").addEventListener("click", () => {
    const newStart = (startInput?.value || "").trim().slice(0, 10);
    const newDue = (dueInput?.value || "").trim().slice(0, 10);
    if (!newStart || !newDue) {
      alert("시작일과 마감일을 모두 입력해 주세요.");
      return;
    }
    if (newStart > newDue) {
      alert("시작일은 마감일보다 이전이어야 합니다.");
      return;
    }
    let ok = false;
    if (barData.kpiTodoId && barData.storageKey) {
      ok = updateKpiTodo(barData.kpiTodoId, barData.storageKey, { startDate: newStart, dueDate: newDue });
    } else if (barData.sectionId === "braindump" && barData.taskId) {
      ok = updateBraindumpTaskDates(barData.taskId, newStart, newDue);
    } else if (barData.sectionId === "braindump") {
      ok = updateBraindumpTaskDatesByName(barData.name, barData.startDate, barData.dueDate, newStart, newDue);
    }
    if (ok) {
      onSave?.();
      close();
    }
  });

  Object.assign(bubble.style, {
    position: "fixed",
    left: `${Math.min(clientX, window.innerWidth - 260)}px`,
    top: `${Math.min(clientY, window.innerHeight - 220)}px`,
    zIndex: 1001,
  });

  document.body.appendChild(bubble);
  bubble.querySelector('input[data-field="start"]')?.focus();
  return bubble;
}

function renderMonthlyView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout";

  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();

  const calendarSection = document.createElement("div");
  calendarSection.className = "calendar-monthly-main";

  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    calendarSection.appendChild(tabsWrapper);
  }

  const nav = document.createElement("div");
  nav.className = "calendar-monthly-nav";
  nav.innerHTML = `
    <span class="calendar-nav-date">
      <span class="calendar-nav-month"></span>
      <span class="calendar-nav-year"></span>
    </span>
    <div class="calendar-nav-controls">
      <button type="button" class="calendar-nav-prev" title="이전 달">‹</button>
      <button type="button" class="calendar-nav-today" title="오늘">오늘</button>
      <button type="button" class="calendar-nav-next" title="다음 달">›</button>
    </div>
  `;

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-monthly-grid";

  function refreshTodoList() {
    const body = wrap.querySelector(".calendar-todo-sidebar-body");
    if (body) {
      const oldList = body.querySelector(".todo-list-in-sidebar");
      if (oldList) oldList.remove();
      const newList = renderTodoList({ hideToolbar: true });
      newList.classList.add("todo-list-in-sidebar");
      body.appendChild(newList);
    }
  }

  function renderCalendar() {
    const grid = getCalendarGrid(currentYear, currentMonth);
    nav.querySelector(".calendar-nav-month").textContent = MONTH_NAMES_EN[currentMonth];
    nav.querySelector(".calendar-nav-year").textContent = String(currentYear);

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
    const rangeTasks = getAllTasksWithDateRange();

    grid.forEach((week) => {
      const weekWrap = document.createElement("div");
      weekWrap.className = "calendar-monthly-week-wrap";
      const weekRow = document.createElement("div");
      weekRow.className = "calendar-monthly-week";
      const weekDateKeys = week.map((d) => (d ? formatDateKey(d) : "")).filter(Boolean);
      const firstDayKey = weekDateKeys[0] || "";
      const lastDayKey = weekDateKeys[weekDateKeys.length - 1] || "";

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

        cell.style.cursor = "pointer";
        cell.addEventListener("click", (e) => {
          if (e.target.closest(".calendar-event-bubble")) return;
          e.stopPropagation();
          const rect = cell.getBoundingClientRect();
          createCalendarEventBubble(rect, key, () => {
            renderCalendar();
            refreshTodoList();
          }, () => {});
        });
        weekRow.appendChild(cell);
      });

      const barsEl = document.createElement("div");
      barsEl.className = "calendar-monthly-bars";
      const BAR_HEIGHT = 1.5;
      const overlaps = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width;
      const allBars = [];
      const CELL_GAP = 3.5;
      rangeTasks.forEach((t) => {
        const barStart = t.startDate > firstDayKey ? t.startDate : firstDayKey;
        const barEnd = t.dueDate < lastDayKey ? t.dueDate : lastDayKey;
        if (barStart > barEnd) return;
        const startIdx = weekDateKeys.indexOf(barStart);
        const endIdx = weekDateKeys.indexOf(barEnd);
        if (startIdx < 0 || endIdx < 0) return;
        const left = (startIdx / 7) * 100 + CELL_GAP / 7;
        const width = ((endIdx - startIdx + 1) / 7) * 100 - (CELL_GAP * 2) / 7;
        const color = t.sectionId === "braindump" ? "rgba(148, 163, 184, 0.6)" : getSectionColor(t.sectionId);
        allBars.push({ left, width, name: t.name, color, isSingleDay: false, itemType: t.itemType || "todo", done: !!t.done, kpiTodoId: t.kpiTodoId, storageKey: t.storageKey, taskId: t.taskId, sectionId: t.sectionId, startDate: t.startDate, dueDate: t.dueDate });
      });
      weekDateKeys.forEach((dateKey, dayIdx) => {
        getTasksForDate(dateKey, true).forEach((t) => {
          const left = (dayIdx / 7) * 100 + CELL_GAP / 7;
          const width = (1 / 7) * 100 - (CELL_GAP * 2) / 7;
          const color = t.sectionId === "braindump" ? "rgba(148, 163, 184, 0.6)" : getSectionColor(t.sectionId);
          allBars.push({ left, width, name: t.name, color, isSingleDay: true, itemType: t.itemType || "todo", done: !!t.done, kpiTodoId: t.kpiTodoId, storageKey: t.storageKey, taskId: t.taskId, sectionId: t.sectionId, startDate: t.startDate || "", dueDate: t.dueDate || dateKey });
        });
      });
      const rowBars = [];
      allBars.forEach((b) => {
        let row = 0;
        while (rowBars[row] && rowBars[row].some((r) => overlaps(r, b))) row++;
        if (!rowBars[row]) rowBars[row] = [];
        rowBars[row].push(b);
        b.row = row;
      });
      const barsWithRow = allBars;
      barsWithRow.forEach((b) => {
        const isTodo = (b.itemType || "todo").toLowerCase() === "todo";
        const bar = document.createElement("div");
        bar.className = "calendar-monthly-span-bar" + (b.isSingleDay ? " calendar-monthly-span-bar--todo" : " calendar-monthly-span-bar--range") + (isTodo ? " calendar-monthly-span-bar--has-checkbox" : "");
        bar.title = b.name;
        const bg = b.isSingleDay ? "transparent" : b.color;
        bar.style.cssText = `left:${b.left}%;width:${b.width}%;background:${bg};top:${0.15 + b.row * BAR_HEIGHT}rem`;
        if (b.isSingleDay) {
          if (isTodo) {
            bar.innerHTML = `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            bar.style.setProperty("--schedule-icon-color", b.color);
            bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" style="border-color:${b.color}"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          }
        } else {
          if (isTodo) {
            bar.innerHTML = `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            bar.style.setProperty("--schedule-icon-color", b.color);
            bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" style="border-color:${b.color}"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          }
        }
        if (isTodo && b.done) {
          bar.classList.add("is-completed");
          bar.querySelector(".calendar-monthly-span-bar-checkbox-inner")?.classList.add("checked");
        }
        if (isTodo) {
          const toggleDone = (e) => {
            e.stopPropagation();
            const newDone = !b.done;
              if (b.kpiTodoId && b.storageKey) {
                syncKpiTodoCompleted(b.kpiTodoId, b.storageKey, newDone);
              } else if (b.sectionId === "braindump" && b.taskId) {
                updateBraindumpTaskDone(b.taskId, newDone);
              } else if (b.sectionId === "braindump") {
                updateBraindumpTaskDoneByName(b.name, b.startDate, b.dueDate, newDone);
              }
              b.done = newDone;
              bar.classList.toggle("is-completed", newDone);
              bar.querySelector(".calendar-monthly-span-bar-checkbox-inner")?.classList.toggle("checked", newDone);
              refreshTodoList();
            };
          bar.addEventListener("click", toggleDone);
        }
        if (!b.isSingleDay && b.startDate && b.dueDate) {
          bar.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            createCalendarBarDateEditBubble(e.clientX, e.clientY, b, () => {
              renderCalendar();
              refreshTodoList();
            }, () => {});
          });
        }
        if (b.isSingleDay && b.dueDate) {
          bar.draggable = true;
          bar.classList.add("calendar-monthly-span-bar--draggable");
          bar.addEventListener("dragstart", (e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("application/json", JSON.stringify({ name: b.name, dueDate: b.dueDate, startDate: b.startDate || "", kpiTodoId: b.kpiTodoId, storageKey: b.storageKey, taskId: b.taskId, sectionId: b.sectionId }));
            e.dataTransfer.setData("text/plain", b.name || "");
            bar.classList.add("calendar-monthly-span-bar--dragging");
          });
          bar.addEventListener("dragend", () => {
            bar.classList.remove("calendar-monthly-span-bar--dragging");
          });
        }
        barsEl.appendChild(bar);
      });
      weekWrap.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      weekWrap.addEventListener("drop", (e) => {
        e.preventDefault();
        const json = e.dataTransfer.getData("application/json");
        if (!json) return;
        let payload;
        try {
          payload = JSON.parse(json);
        } catch (_) {
          return;
        }
        let cell = document.elementFromPoint(e.clientX, e.clientY)?.closest(".calendar-monthly-day:not(.empty)");
        if (!cell) {
          const cells = weekRow.querySelectorAll(".calendar-monthly-day:not(.empty)");
          for (const c of cells) {
            const r = c.getBoundingClientRect();
            if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
              cell = c;
              break;
            }
          }
        }
        if (!cell?.dataset?.date) return;
        const targetDate = cell.dataset.date;
        if (targetDate === payload.dueDate) return;
        let ok = false;
        if (payload.kpiTodoId && payload.storageKey) {
          ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, { dueDate: targetDate });
        } else if (payload.sectionId === "braindump" && payload.taskId) {
          ok = updateBraindumpTaskDates(payload.taskId, payload.startDate || targetDate, targetDate);
        } else if (payload.sectionId === "braindump") {
          ok = updateBraindumpTaskDatesByName(payload.name, payload.startDate, payload.dueDate, payload.startDate || targetDate, targetDate);
        }
        if (ok) {
          renderCalendar();
          refreshTodoList();
        }
      });
      weekWrap.appendChild(weekRow);
      weekWrap.appendChild(barsEl);
      calendarGrid.appendChild(weekWrap);
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

  const todoSidebar = document.createElement("aside");
  todoSidebar.className = "calendar-todo-sidebar";
  let sidebarCollapsed = false;
  todoSidebar.innerHTML = `
    <div class="calendar-todo-sidebar-header">
      <span class="calendar-todo-sidebar-title">할 일</span>
      <button type="button" class="calendar-todo-sidebar-collapse" title="사이드바 접기">
        <svg class="calendar-todo-sidebar-collapse-icon" viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>
    <div class="calendar-todo-sidebar-body"></div>
  `;
  const todoListEl = renderTodoList({ hideToolbar: true });
  todoListEl.classList.add("todo-list-in-sidebar");
  todoSidebar.querySelector(".calendar-todo-sidebar-body").appendChild(todoListEl);
  todoSidebar.querySelector(".calendar-todo-sidebar-collapse").addEventListener("click", () => {
    sidebarCollapsed = !sidebarCollapsed;
    todoSidebar.classList.toggle("collapsed", sidebarCollapsed);
    todoSidebar.querySelector(".calendar-todo-sidebar-collapse").title = sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기";
  });
  wrap.appendChild(todoSidebar);

  renderCalendar();

  return wrap;
}

function renderTodoView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout";

  const todoMain = document.createElement("div");
  todoMain.className = "calendar-monthly-main calendar-todo-main";

  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    todoMain.appendChild(tabsWrapper);
  }

  const todoContent = document.createElement("div");
  todoContent.className = "calendar-todo-content";
  const todoListEl = renderTodoList();
  todoContent.appendChild(todoListEl);
  todoMain.appendChild(todoContent);

  wrap.appendChild(todoMain);

  return wrap;
}

function renderPlaceholderView(tabsElement, label) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout";

  const main = document.createElement("div");
  main.className = "calendar-monthly-main";

  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    main.appendChild(tabsWrapper);
  }

  const placeholderWrap = document.createElement("div");
  placeholderWrap.className = "calendar-placeholder-wrap";
  const placeholder = document.createElement("p");
  placeholder.className = "calendar-placeholder";
  placeholder.textContent = `${label} (준비 중)`;
  placeholderWrap.appendChild(placeholder);
  main.appendChild(placeholderWrap);

  wrap.appendChild(main);

  return wrap;
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content calendar-view";

  const tabs = document.createElement("div");
  tabs.className = "time-view-tabs calendar-tabs";
  tabs.innerHTML = `
    <button type="button" class="time-view-tab active" data-view="todo">할 일</button>
    <button type="button" class="time-view-tab" data-view="monthly">월별</button>
    <button type="button" class="time-view-tab" data-view="2week">2주</button>
    <button type="button" class="time-view-tab" data-view="1week">1주</button>
    <button type="button" class="time-view-tab" data-view="1day">1일</button>
  `;
  el.appendChild(tabs);

  const contentWrap = document.createElement("div");
  contentWrap.className = "calendar-content-wrap";

  let currentView = "todo";

  function renderContent(view) {
    if (currentView === "todo" || currentView === "monthly") {
      saveTodoListBeforeUnmount(contentWrap);
    }
    currentView = view;
    if (contentWrap.contains(tabs)) {
      el.insertBefore(tabs, contentWrap);
    }
    contentWrap.innerHTML = "";
    if (view === "todo") {
      contentWrap.appendChild(renderTodoView(tabs));
    } else if (view === "monthly") {
      contentWrap.appendChild(renderMonthlyView(tabs));
    } else {
      const labels = { "2week": "2주", "1week": "1주", "1day": "1일" };
      contentWrap.appendChild(renderPlaceholderView(tabs, labels[view]));
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
