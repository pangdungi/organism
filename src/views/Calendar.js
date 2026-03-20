/**
 * 캘린더 - 월별/2주/1주/1일 뷰
 * 월별: 왼쪽 미니멀 캘린더 + 오른쪽 태스크 사이드바
 * 할일목록: 인생 KPI와 동일한 구조
 */

import {
  render as renderTodoList,
  renderTodoListForEisenhowerSidebar,
  renderOverdueSection,
  saveTodoListBeforeUnmount,
  DRAG_TYPE_TODO_TO_CALENDAR,
  DRAG_TYPE_TODO_TO_EISENHOWER,
} from "./TodoList.js";
import {
  getKpiTodosAsTasks,
  addCalendarTodoToSection,
  syncKpiTodoCompleted,
  updateKpiTodo,
  removeKpiTodo,
} from "../utils/kpiTodoSync.js";
import { getSectionColor, getCustomSections, getTimeCategoryColorsForTimetable, getTimeCategoryColorsForTimetableExpected } from "../utils/todoSettings.js";
import { getKpisByCategory } from "../utils/kpiViewModal.js";
import { formatDeadlineRangeForDisplay, formatDeadlineRangeCompact } from "../utils/ganttModal.js";
import {
  getAccumulatedMinutes,
  minutesToHhMm,
  hhMmToMinutes,
} from "../utils/timeKpiSync.js";
import {
  renderTimeBudgetTablesForCalendar,
  getBudgetGoals,
  getTaskOptionByName,
  loadTimeRows,
  saveBudgetGoal,
  clearOverlapFromBudgetGoalsOnly,
  formatGoalDiff,
  parseTimeToHours,
} from "./Time.js";
import { showToast } from "../utils/showToast.js";

const CUSTOM_SECTION_TASKS_KEY = "todo-custom-section-tasks";
const SECTION_TASKS_KEY = "todo-section-tasks";
const KPI_SECTION_IDS = ["braindump", "dream", "sideincome", "health", "happy"];

const CALENDAR_DATE_DEBUG = true;
function dateDebug(tag, ...args) {
  if (CALENDAR_DATE_DEBUG && typeof console !== "undefined" && console.log) {
    console.log("[DATE-DEBUG] " + tag, ...args);
  }
}

function getSectionTasksForDate(dateKey) {
  const out = [];
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (!raw) return out;
    const obj = JSON.parse(raw);
    KPI_SECTION_IDS.forEach((sectionId) => {
      const arr = obj[sectionId];
      if (!Array.isArray(arr)) return;
      const sectionLabel =
        {
          dream: "꿈",
          sideincome: "부수입",
          health: "건강",
          happy: "행복",
          braindump: "브레인 덤프",
        }[sectionId] || sectionId;
      arr
        .filter(
          (t) =>
            (t.name || "").trim() !== "" &&
            (t.dueDate || "").slice(0, 10) === dateKey,
        )
        .forEach((t) =>
          out.push({
            name: t.name,
            startDate: (t.startDate || "").slice(0, 10),
            dueDate: (t.dueDate || "").slice(0, 10),
            startTime: t.startTime || "",
            endTime: t.endTime || "",
            sectionId,
            sectionLabel,
            itemType: t.itemType || "todo",
            done: !!t.done,
            taskId: t.taskId || "",
            eisenhower: (t.eisenhower || "").trim() || "",
            classification: "",
          }),
        );
    });
  } catch (_) {}
  return out;
}

function getSectionTasksWithDateRange() {
  const out = [];
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (!raw) return out;
    const obj = JSON.parse(raw);
    KPI_SECTION_IDS.forEach((sectionId) => {
      const arr = obj[sectionId];
      if (!Array.isArray(arr)) return;
      const sectionLabel =
        {
          dream: "꿈",
          sideincome: "부수입",
          health: "건강",
          happy: "행복",
          braindump: "브레인 덤프",
        }[sectionId] || sectionId;
      arr
        .filter(
          (t) =>
            (t.name || "").trim() !== "" &&
            (t.startDate || "").slice(0, 10) &&
            (t.dueDate || "").slice(0, 10),
        )
        .forEach((t) =>
          out.push({
            name: t.name,
            startDate: (t.startDate || "").slice(0, 10),
            dueDate: (t.dueDate || "").slice(0, 10),
            startTime: t.startTime || "",
            endTime: t.endTime || "",
            sectionId,
            sectionLabel,
            itemType: t.itemType || "todo",
            done: !!t.done,
            taskId: t.taskId || "",
            eisenhower: (t.eisenhower || "").trim() || "",
            classification: "",
          }),
        );
    });
  } catch (_) {}
  return out;
}

function updateSectionTaskDates(sectionId, taskId, startDate, dueDate) {
  dateDebug("updateSectionTaskDates IN", { sectionId, taskId, startDate, dueDate });
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (!raw) {
      dateDebug("updateSectionTaskDates: no localStorage");
      return false;
    }
    const obj = JSON.parse(raw);
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) {
      dateDebug("updateSectionTaskDates: no arr for", sectionId);
      return false;
    }
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (!t) {
      dateDebug("updateSectionTaskDates: task not found", { sectionId, taskId, taskIds: arr.map((x) => x.taskId) });
      return false;
    }
    t.startDate = (startDate || "").slice(0, 10) || "";
    t.dueDate = (dueDate || "").slice(0, 10) || "";
    localStorage.setItem(SECTION_TASKS_KEY, JSON.stringify(obj));
    dateDebug("updateSectionTaskDates OK", { sectionId, taskId, savedDueDate: t.dueDate });
    return true;
  } catch (err) {
    dateDebug("updateSectionTaskDates catch", err);
    return false;
  }
}

function updateSectionTaskTimes(sectionId, taskId, startTime, endTime) {
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.startTime = (startTime || "").trim() || "";
      t.endTime = (endTime || "").trim() || "";
      localStorage.setItem(SECTION_TASKS_KEY, JSON.stringify(obj));
      return true;
    }
  } catch (_) {}
  return false;
}

function updateSectionTaskDone(sectionId, taskId, done) {
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.done = !!done;
      localStorage.setItem(SECTION_TASKS_KEY, JSON.stringify(obj));
      return true;
    }
  } catch (_) {}
  return false;
}

function updateSectionTaskEisenhower(sectionId, taskId, eisenhower) {
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.eisenhower = (eisenhower || "").trim() || "";
      localStorage.setItem(SECTION_TASKS_KEY, JSON.stringify(obj));
      return true;
    }
  } catch (_) {}
  return false;
}

function updateCustomSectionTaskEisenhower(sectionId, taskId, eisenhower) {
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.eisenhower = (eisenhower || "").trim() || "";
      localStorage.setItem(CUSTOM_SECTION_TASKS_KEY, JSON.stringify(obj));
      return true;
    }
  } catch (_) {}
  return false;
}

function addSectionTaskToCalendar(sectionId, taskData) {
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    if (!obj[sectionId]) obj[sectionId] = [];
    const arr = obj[sectionId];
    const taskId =
      taskData.taskId ||
      `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    arr.push({
      taskId,
      name: (taskData.name || "").trim(),
      startDate: (taskData.startDate || "").slice(0, 10) || "",
      dueDate: (taskData.dueDate || "").slice(0, 10),
      startTime: taskData.startTime || "",
      endTime: taskData.endTime || "",
      done: !!taskData.done,
      itemType: taskData.itemType || "todo",
    });
    localStorage.setItem(SECTION_TASKS_KEY, JSON.stringify(obj));
    return true;
  } catch (_) {}
  return false;
}

/** rgba 색상의 투명도를 높임 (alpha 낮춤) */
function withMoreTransparency(color, alpha = 0.35) {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
  return color;
}
const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];
const MONTH_NAMES = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
];
const MONTH_NAMES_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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

/** 오늘을 포함한 2주 (월요일 시작, 2행 x 7열) */
function getCalendarGridFor2Weeks(weekOffset = 0) {
  const today = new Date();
  const mondayDow = getMondayBasedDow(today);
  const firstMonday = new Date(today);
  firstMonday.setDate(today.getDate() - mondayDow + weekOffset * 14);

  const grid = [];
  for (let w = 0; w < 2; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(firstMonday);
      date.setDate(firstMonday.getDate() + w * 7 + d);
      week.push(date);
    }
    grid.push(week);
  }
  return grid;
}

/** 오늘을 포함한 3주 (월요일 시작, 3행 x 7열) */
function getCalendarGridFor3Weeks(weekOffset = 0) {
  const today = new Date();
  const mondayDow = getMondayBasedDow(today);
  const firstMonday = new Date(today);
  firstMonday.setDate(today.getDate() - mondayDow + weekOffset * 21);

  const grid = [];
  for (let w = 0; w < 3; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(firstMonday);
      date.setDate(firstMonday.getDate() + w * 7 + d);
      week.push(date);
    }
    grid.push(week);
  }
  return grid;
}

/** 선택일 1일만 (1행 x 1열) - dayOffset: 0=오늘, 1=내일, -1=어제 */
function getCalendarGridFor1Day(dayOffset = 0) {
  const today = new Date();
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + dayOffset);
  return [[targetDate]];
}

/** 1주 (월~일 7일) - weekOffset: 0=이번 주, 1=다음 주, -1=지난 주 */
function getCalendarGridFor1Week(weekOffset = 0) {
  const today = new Date();
  const mondayDow = getMondayBasedDow(today);
  const firstMonday = new Date(today);
  firstMonday.setDate(today.getDate() - mondayDow + weekOffset * 7);
  const week = [];
  for (let d = 0; d < 7; d++) {
    const date = new Date(firstMonday);
    date.setDate(firstMonday.getDate() + d);
    week.push(date);
  }
  return week;
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
  { id: "braindump", label: "브레인 덤프" },
  { id: "dream", label: "꿈" },
  { id: "sideincome", label: "부수입" },
  { id: "health", label: "건강" },
  { id: "happy", label: "행복" },
];

function updateCustomSectionTaskDone(sectionId, taskId, done) {
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.done = !!done;
      localStorage.setItem(CUSTOM_SECTION_TASKS_KEY, JSON.stringify(obj));
    }
  } catch (_) {}
}

function updateCustomSectionTaskDates(sectionId, taskId, startDate, dueDate) {
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.startDate = (startDate || "").slice(0, 10) || "";
      t.dueDate = (dueDate || "").slice(0, 10) || "";
      localStorage.setItem(CUSTOM_SECTION_TASKS_KEY, JSON.stringify(obj));
      return true;
    }
  } catch (_) {}
  return false;
}

function updateCustomSectionTaskTimes(sectionId, taskId, startTime, endTime) {
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.startTime = (startTime || "").trim() || "";
      t.endTime = (endTime || "").trim() || "";
      localStorage.setItem(CUSTOM_SECTION_TASKS_KEY, JSON.stringify(obj));
      return true;
    }
  } catch (_) {}
  return false;
}

function addCalendarTodoToCustomSection(sectionId, taskData) {
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    if (!obj[sectionId]) obj[sectionId] = [];
    const arr = obj[sectionId];
    const taskId =
      taskData.taskId ||
      `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    arr.push({
      taskId,
      name: (taskData.name || "").trim(),
      startDate: (taskData.startDate || "").slice(0, 10) || "",
      dueDate: (taskData.dueDate || "").slice(0, 10) || "",
      startTime: taskData.startTime || "",
      endTime: taskData.endTime || "",
      done: !!taskData.done,
      itemType: taskData.itemType || "todo",
    });
    localStorage.setItem(CUSTOM_SECTION_TASKS_KEY, JSON.stringify(obj));
    return true;
  } catch (_) {}
  return false;
}

function addDaysToDateKey(dateKey, days) {
  const d = new Date(dateKey + "T12:00:00");
  d.setDate(d.getDate() + days);
  return formatDateKey(d);
}

/** 캘린더 할일의 시작일/마감일을 비워 할일목록으로 되돌리기 */
function revertTaskToTodoList(barData) {
  let ok = false;
  if (barData.kpiTodoId && barData.storageKey) {
    ok = updateKpiTodo(barData.kpiTodoId, barData.storageKey, {
      startDate: "",
      dueDate: "",
    });
  } else if (
    KPI_SECTION_IDS.includes(barData.sectionId) &&
    !barData.kpiTodoId
  ) {
    ok = updateSectionTaskDates(barData.sectionId, barData.taskId, "", "");
  } else if (barData.sectionId?.startsWith("custom-")) {
    ok = updateCustomSectionTaskDates(
      barData.sectionId,
      barData.taskId,
      "",
      "",
    );
  }
  return ok;
}

function getCustomSectionTasksForDate(dateKey) {
  const out = [];
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (!raw) return out;
    const obj = JSON.parse(raw);
    getCustomSections().forEach((sec) => {
      const arr = obj[sec.id];
      if (!Array.isArray(arr)) return;
      arr
        .filter(
          (t) =>
            (t.name || "").trim() !== "" &&
            (t.dueDate || "").slice(0, 10) === dateKey,
        )
        .forEach((t) =>
          out.push({
            name: t.name,
            startDate: (t.startDate || "").slice(0, 10),
            dueDate: (t.dueDate || "").slice(0, 10),
            startTime: t.startTime || "",
            endTime: t.endTime || "",
            sectionId: sec.id,
            sectionLabel: sec.label || sec.id,
            itemType: t.itemType || "todo",
            done: !!t.done,
            taskId: t.taskId || "",
            eisenhower: (t.eisenhower || "").trim() || "",
            classification: "",
          }),
        );
    });
  } catch (_) {}
  return out;
}

function getTasksForDate(dateKey, excludeSpanningTasks = false) {
  const kpiTasks = getKpiTodosAsTasks().filter(
    (t) => (t.dueDate || "").slice(0, 10) === dateKey,
  );
  const sectionTasks = getSectionTasksForDate(dateKey);
  const customTasks = getCustomSectionTasksForDate(dateKey);
  let tasks = [...kpiTasks, ...sectionTasks, ...customTasks];
  if (excludeSpanningTasks) {
    tasks = tasks.filter(
      (t) =>
        !((t.startDate || "").slice(0, 10) && (t.dueDate || "").slice(0, 10)),
    );
  }
  return tasks;
}

function getAllTasksForDateDisplay(dateKey) {
  const singleDay = getTasksForDate(dateKey, false);
  const rangeTasks = getAllTasksWithDateRange().filter((t) => {
    const s = (t.startDate || "").slice(0, 10);
    const d = (t.dueDate || "").slice(0, 10);
    return s && d && s <= dateKey && dateKey <= d;
  });
  const seen = new Set();
  return [...singleDay, ...rangeTasks].filter((t) => {
    const id =
      (t.taskId || t.name || "") + (t.startDate || "") + (t.dueDate || "");
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getAllTasksWithDateRange() {
  const kpi = getKpiTodosAsTasks();
  const sectionRange = getSectionTasksWithDateRange();
  const customRange = [];
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      getCustomSections().forEach((sec) => {
        const arr = obj[sec.id];
        if (!Array.isArray(arr)) return;
        arr
          .filter(
            (t) =>
              (t.name || "").trim() !== "" &&
              (t.startDate || "").slice(0, 10) &&
              (t.dueDate || "").slice(0, 10),
          )
          .forEach((t) =>
            customRange.push({
              name: t.name,
              startDate: (t.startDate || "").slice(0, 10),
              dueDate: (t.dueDate || "").slice(0, 10),
              startTime: t.startTime || "",
              endTime: t.endTime || "",
              sectionId: sec.id,
              sectionLabel: sec.label || sec.id,
              itemType: t.itemType || "todo",
              done: !!t.done,
              taskId: t.taskId || "",
              eisenhower: (t.eisenhower || "").trim() || "",
              classification: "",
            }),
          );
      });
    }
  } catch (_) {}
  const kpiWithRange = kpi
    .filter(
      (t) => (t.startDate || "").slice(0, 10) && (t.dueDate || "").slice(0, 10),
    )
    .map((t) => ({
      ...t,
      startDate: (t.startDate || "").slice(0, 10),
      dueDate: (t.dueDate || "").slice(0, 10),
    }));
  return [...kpiWithRange, ...sectionRange, ...customRange];
}

function createCalendarEventBubble(cellRect, dateKey, onSave, onClose) {
  document
    .querySelectorAll(".calendar-event-bubble")
    .forEach((el) => el.remove());
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
        <input type="text" name="calendar-event-name" class="calendar-event-bubble-input" placeholder="할일을 입력하세요" />
      </div>
      <button type="button" class="calendar-event-bubble-save">추가</button>
    </div>
  `;

  const close = () => {
    bubble.remove();
    onClose?.();
  };

  bubble
    .querySelector(".calendar-event-bubble-close")
    .addEventListener("click", close);
  setTimeout(() => {
    document.addEventListener("click", function outside(e) {
      if (!bubble.contains(e.target)) {
        document.removeEventListener("click", outside);
        close();
      }
    });
  }, 0);

  bubble
    .querySelector(".calendar-event-bubble-save")
    .addEventListener("click", () => {
      const name = (
        bubble.querySelector(".calendar-event-bubble-input").value || ""
      ).trim();
      const categoryId = bubble.querySelector(
        ".calendar-event-bubble-select",
      ).value;
      if (!name) return;
      let result = addCalendarTodoToSection(categoryId, {
        text: name,
        dueDate: dateKey,
        itemType: "todo",
      });
      if (!result.success && KPI_SECTION_IDS.includes(categoryId)) {
        const ok = addSectionTaskToCalendar(categoryId, {
          name,
          dueDate: dateKey,
          itemType: "todo",
        });
        if (ok) {
          result = {
            success: true,
            task: {
              name,
              dueDate: dateKey,
              sectionId: categoryId,
              itemType: "todo",
            },
          };
        }
      }
      if (result.success) {
        onSave?.(result.task);
        close();
      } else {
        const label =
          CALENDAR_CATEGORIES.find((c) => c.id === categoryId)?.label ||
          categoryId;
        alert(`${label} 카테고리에 KPI를 먼저 추가해주세요.`);
      }
    });

  bubble
    .querySelector(".calendar-event-bubble-input")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        bubble.querySelector(".calendar-event-bubble-save").click();
    });

  const BUBBLE_PADDING = 16;
  Object.assign(bubble.style, {
    position: "fixed",
    left: `${cellRect.left}px`,
    top: `${cellRect.bottom + 4}px`,
    zIndex: 1000,
  });

  document.body.appendChild(bubble);

  const bubbleHeight = bubble.getBoundingClientRect().height;
  if (cellRect.bottom + 4 + bubbleHeight > window.innerHeight - BUBBLE_PADDING) {
    bubble.style.top = `${cellRect.top - bubbleHeight - 4}px`;
    bubble.classList.add("calendar-event-bubble--above");
  }

  bubble.querySelector(".calendar-event-bubble-input").focus();
  return bubble;
}

const MAX_VISIBLE_BARS_PER_DAY = 3;

function createCalendarDayExpandBubble(cellRect, dateKey, tasks, onClose, options = {}) {
  const { positionBelow = false, onAdd = null } = options;
  const isMobile = window.matchMedia("(max-width: 767px)").matches;
  document
    .querySelectorAll(".calendar-event-bubble, .calendar-day-expand-overlay")
    .forEach((el) => el.remove());
  let overlayEl = null;
  if (isMobile) {
    overlayEl = document.createElement("div");
    overlayEl.className = "calendar-day-expand-overlay";
    document.body.appendChild(overlayEl);
  }
  const bubble = document.createElement("div");
  bubble.className = "calendar-event-bubble calendar-day-expand-bubble" + (isMobile ? " calendar-day-expand-bubble--mobile" : "");
  const taskItems = tasks
    .map(
      (t) => `
    <div class="calendar-day-expand-item" data-done="${!!t.done}">
      <span class="calendar-day-expand-checkbox ${t.done ? "checked" : ""}"></span>
      <span class="calendar-day-expand-text">${escapeHtml(t.name || "")}</span>
      ${t.startTime || t.endTime ? `<span class="calendar-day-expand-time">${[t.startTime, t.endTime].filter(Boolean).join(" ~ ")}</span>` : ""}
    </div>
  `,
    )
    .join("");
  const addBtnHtml = onAdd ? '<button type="button" class="calendar-day-expand-add-btn">할일 추가</button>' : "";
  bubble.innerHTML = `
    <div class="calendar-event-bubble-body">
      <div class="calendar-event-bubble-header">
        <span class="calendar-event-bubble-date">${dateKey.replace(/-/g, ". ")}</span>
        <button type="button" class="calendar-event-bubble-close" title="닫기">×</button>
      </div>
      <div class="calendar-day-expand-list">${taskItems || "<div class='calendar-day-expand-empty'>할일 없음</div>"}</div>
      ${addBtnHtml}
    </div>
  `;

  const close = () => {
    bubble.remove();
    if (overlayEl) overlayEl.remove();
    onClose?.();
  };

  if (overlayEl) overlayEl.addEventListener("click", close);

  bubble
    .querySelector(".calendar-event-bubble-close")
    .addEventListener("click", close);
  if (onAdd) {
    bubble.querySelector(".calendar-day-expand-add-btn")?.addEventListener("click", () => {
      close();
      onAdd();
    });
  }
  setTimeout(() => {
    document.addEventListener("click", function outside(e) {
      if (!bubble.contains(e.target) && !(overlayEl && overlayEl.contains(e.target))) {
        document.removeEventListener("click", outside);
        close();
      }
    });
  }, 0);

  const BUBBLE_PADDING = 16;
  let top = positionBelow
    ? cellRect.bottom + 4
    : Math.min(cellRect.top, window.innerHeight - 320);
  Object.assign(bubble.style, {
    position: "fixed",
    left: `${Math.min(cellRect.left, window.innerWidth - 280)}px`,
    top: `${top}px`,
    zIndex: 1002,
  });

  document.body.appendChild(bubble);

  if (positionBelow) {
    const bubbleHeight = bubble.getBoundingClientRect().height;
    if (cellRect.bottom + 4 + bubbleHeight > window.innerHeight - BUBBLE_PADDING) {
      bubble.style.top = `${cellRect.top - bubbleHeight - 4}px`;
    }
  }

  return bubble;
}

function createCalendarBarRevertBubble(
  clientX,
  clientY,
  barData,
  onSave,
  onClose,
) {
  document
    .querySelectorAll(".calendar-event-bubble")
    .forEach((el) => el.remove());
  const bubble = document.createElement("div");
  bubble.className =
    "calendar-event-bubble calendar-bar-date-edit-bubble calendar-bar-revert-bubble";
  bubble.innerHTML = `
    <div class="calendar-event-bubble-body">
      <div class="calendar-event-bubble-header">
        <span class="calendar-event-bubble-date">${escapeHtml(barData.name || "")}</span>
        <button type="button" class="calendar-event-bubble-close" title="닫기">×</button>
      </div>
      <p class="calendar-bar-revert-desc">시작일·마감일을 비우고 할일목록으로 되돌립니다.</p>
      <button type="button" class="calendar-event-bubble-revert calendar-bar-revert-btn">되돌려놓기</button>
    </div>
  `;

  const close = () => {
    bubble.remove();
    onClose?.();
  };

  bubble
    .querySelector(".calendar-event-bubble-close")
    .addEventListener("click", close);
  setTimeout(() => {
    document.addEventListener("click", function outside(e) {
      if (!bubble.contains(e.target)) {
        document.removeEventListener("click", outside);
        close();
      }
    });
  }, 0);

  bubble
    .querySelector(".calendar-bar-revert-btn")
    .addEventListener("click", () => {
      if (revertTaskToTodoList(barData)) {
        onSave?.();
        close();
      }
    });

  Object.assign(bubble.style, {
    position: "fixed",
    left: `${Math.min(clientX, window.innerWidth - 260)}px`,
    top: `${Math.min(clientY, window.innerHeight - 180)}px`,
    zIndex: 1001,
  });

  document.body.appendChild(bubble);
  return bubble;
}

function createCalendarBarDateEditBubble(
  clientX,
  clientY,
  barData,
  onSave,
  onClose,
) {
  document
    .querySelectorAll(".calendar-event-bubble")
    .forEach((el) => el.remove());
  const bubble = document.createElement("div");
  bubble.className = "calendar-event-bubble calendar-bar-date-edit-bubble";
  const startVal = (barData.startDate || "").slice(0, 10);
  const dueVal = (barData.dueDate || "").slice(0, 10);
  const hasRange = startVal && dueVal && startVal !== dueVal;
  bubble.innerHTML = `
    <div class="calendar-event-bubble-body">
      <div class="calendar-event-bubble-header">
        <span class="calendar-event-bubble-date">${escapeHtml(barData.name || "")}</span>
        <button type="button" class="calendar-event-bubble-close" title="닫기">×</button>
      </div>
      <div class="calendar-bar-date-edit-row">
        <label class="calendar-event-bubble-label">시작일</label>
        <div class="calendar-bar-date-edit-input-wrap">
          <input type="date" class="calendar-bar-date-edit-input" name="calendar-bar-date-start" data-field="start" value="${startVal}" />
          <button type="button" class="calendar-bar-date-edit-clear" title="시작일 제거 (단일일로 변경)">×</button>
        </div>
      </div>
      <div class="calendar-bar-date-edit-row">
        <label class="calendar-event-bubble-label">마감일</label>
        <input type="date" class="calendar-bar-date-edit-input" name="calendar-bar-date-due" data-field="due" value="${dueVal}" />
      </div>
      <button type="button" class="calendar-event-bubble-save">저장</button>
      ${hasRange ? '<button type="button" class="calendar-event-bubble-revert calendar-bar-revert-btn">되돌려놓기</button>' : ""}
    </div>
  `;

  const close = () => {
    bubble.remove();
    onClose?.();
  };

  bubble
    .querySelector(".calendar-event-bubble-close")
    .addEventListener("click", close);
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
  bubble
    .querySelector(".calendar-bar-date-edit-clear")
    ?.addEventListener("click", () => {
      if (startInput) {
        startInput.value = "";
        if (dueInput) dueInput.min = "";
      }
    });
  startInput?.addEventListener("change", () => {
    if (dueInput && startInput.value) dueInput.min = startInput.value;
  });
  dueInput?.addEventListener("change", () => {
    if (startInput && dueInput.value) startInput.max = dueInput.value;
  });
  if (startVal && dueInput) dueInput.min = startVal;
  if (dueVal && startInput) startInput.max = dueVal;

  bubble
    .querySelector(".calendar-event-bubble-save")
    .addEventListener("click", () => {
      const newStart = (startInput?.value || "").trim().slice(0, 10);
      const newDue = (dueInput?.value || "").trim().slice(0, 10);
      if (!newDue) {
        alert("마감일을 입력해 주세요.");
        return;
      }
      if (newStart && newStart > newDue) {
        alert("시작일은 마감일보다 이전이어야 합니다.");
        return;
      }
      let ok = false;
      if (barData.kpiTodoId && barData.storageKey) {
        ok = updateKpiTodo(barData.kpiTodoId, barData.storageKey, {
          startDate: newStart,
          dueDate: newDue,
        });
      } else if (
        KPI_SECTION_IDS.includes(barData.sectionId) &&
        barData.taskId
      ) {
        ok = updateSectionTaskDates(
          barData.sectionId,
          barData.taskId,
          newStart,
          newDue,
        );
      } else if (barData.sectionId?.startsWith("custom-")) {
        ok = updateCustomSectionTaskDates(
          barData.sectionId,
          barData.taskId,
          newStart,
          newDue,
        );
        if (!ok && (barData.name || "").trim()) {
          ok = addCalendarTodoToCustomSection(barData.sectionId, {
            taskId: barData.taskId,
            name: barData.name,
            startDate: newStart,
            dueDate: newDue,
            done: !!barData.done,
            itemType: barData.itemType || "todo",
          });
        }
      }
      if (ok) {
        onSave?.();
        close();
      }
    });

  const revertBtn = bubble.querySelector(".calendar-bar-revert-btn");
  if (revertBtn) {
    revertBtn.addEventListener("click", () => {
      if (revertTaskToTodoList(barData)) {
        onSave?.();
        close();
      }
    });
  }

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
      <button type="button" class="calendar-nav-prev" title="이전 달">&lt;</button>
      <button type="button" class="calendar-nav-today" title="오늘">오늘</button>
      <button type="button" class="calendar-nav-next" title="다음 달">&gt;</button>
    </div>
  `;

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-monthly-grid";

  function refreshTodoList() {
    const body = wrap.querySelector(".calendar-todo-sidebar-body");
    if (body) {
      const oldList = body.querySelector(".todo-list-in-sidebar");
      let activeIndex = 0;
      if (oldList) {
        const activeTab = oldList.querySelector(
          ".todo-category-tab:not(.todo-category-tab-add).active",
        );
        const tabs = oldList.querySelectorAll(
          ".todo-category-tab:not(.todo-category-tab-add)",
        );
        if (activeTab && tabs.length) {
          const idx = Array.from(tabs).indexOf(activeTab);
          if (idx >= 0) activeIndex = idx;
        }
        oldList.remove();
      }
      const newList = renderTodoList({
        hideToolbar: true,
        enableDragToCalendar: true,
        initialActiveTabIndex: activeIndex,
        eisenhowerFilter: "important-not-urgent",
      });
      newList.classList.add("todo-list-in-sidebar");
      body.appendChild(newList);
    }
  }

  function renderCalendar() {
    const grid = getCalendarGrid(currentYear, currentMonth);
    nav.querySelector(".calendar-nav-month").textContent =
      MONTH_NAMES_EN[currentMonth];
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
      const weekDateKeys = week
        .map((d) => (d ? formatDateKey(d) : ""))
        .filter(Boolean);
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
          const isMobile = window.matchMedia("(max-width: 767px)").matches;
          if (isMobile) {
            const tasks = getAllTasksForDateDisplay(key);
            createCalendarDayExpandBubble(rect, key, tasks, () => {}, {
              positionBelow: true,
              onAdd: () => {
                createCalendarEventBubble(rect, key, () => {
                  renderCalendar();
                  refreshTodoList();
                }, () => {});
              },
            });
          } else {
            createCalendarEventBubble(
              rect,
              key,
              () => {
                renderCalendar();
                refreshTodoList();
              },
              () => {},
            );
          }
        });
        cell.addEventListener("dragover", (e) => {
          if (e.dataTransfer.types.includes(DRAG_TYPE_TODO_TO_CALENDAR)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            cell.classList.add("calendar-day-drag-over");
          }
        });
        cell.addEventListener("dragleave", () => {
          cell.classList.remove("calendar-day-drag-over");
        });
        cell.addEventListener("drop", (e) => {
          cell.classList.remove("calendar-day-drag-over");
          const json = e.dataTransfer.getData(DRAG_TYPE_TODO_TO_CALENDAR);
          if (!json) return;
          e.preventDefault();
          e.stopPropagation();
          let payload;
          try {
            payload = JSON.parse(json);
          } catch (_) {
            return;
          }
          const targetDate = key;
          const oldStart = (payload.startDate || "").slice(0, 10);
          const oldDue = (payload.dueDate || "").slice(0, 10);
          let newStart = "";
          let newDue = targetDate;
          if (oldStart && oldDue && oldStart !== oldDue) {
            const startD = new Date(oldStart + "T12:00:00");
            const dueD = new Date(oldDue + "T12:00:00");
            const daysDiff = Math.round((dueD - startD) / 86400000);
            newStart = targetDate;
            newDue = addDaysToDateKey(targetDate, daysDiff);
          } else if (oldStart && oldDue) {
            newStart = targetDate;
          }
          let ok = false;
          if (payload.kpiTodoId && payload.storageKey) {
            ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
              startDate: newStart,
              dueDate: newDue,
            });
          } else if (
            payload.sectionId &&
            payload.sectionId.startsWith("custom-")
          ) {
            ok = updateCustomSectionTaskDates(
              payload.sectionId,
              payload.taskId,
              newStart,
              newDue,
            );
            if (!ok && (payload.name || "").trim()) {
              ok = addCalendarTodoToCustomSection(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
              });
            }
          } else if (
            KPI_SECTION_IDS.includes(payload.sectionId) &&
            (payload.name || "").trim()
          ) {
            if (payload.kpiTodoId && payload.storageKey) {
              ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
                startDate: newStart,
                dueDate: newDue,
              });
            } else {
              ok =
                updateSectionTaskDates(
                  payload.sectionId,
                  payload.taskId,
                  newStart,
                  newDue,
                ) ||
                addSectionTaskToCalendar(payload.sectionId, {
                  taskId: payload.taskId,
                  name: payload.name,
                  startDate: newStart,
                  dueDate: newDue,
                  done: !!payload.done,
                  itemType: payload.itemType || "todo",
                });
            }
          }
          dateDebug("drop on day", { targetDate: key, name: payload?.name, sectionId: payload?.sectionId, taskId: payload?.taskId, newStart, newDue, ok });
          if (ok) {
            renderCalendar();
            refreshTodoList();
          }
        });
        weekRow.appendChild(cell);
      });

      const barsEl = document.createElement("div");
      barsEl.className = "calendar-monthly-bars";
      const BAR_HEIGHT = window.matchMedia("(max-width: 767px)").matches ? 0.95 : 2.05;
      const overlaps = (a, b) =>
        a.left < b.left + b.width && b.left < a.left + a.width;
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
        const baseColor = getSectionColor(t.sectionId);
        const color = withMoreTransparency(baseColor);
        const isFirstSegment = barStart === t.startDate;
        allBars.push({
          left,
          width,
          name: t.name,
          color,
          isSingleDay: false,
          isFirstSegment,
          itemType: t.itemType || "todo",
          done: !!t.done,
          kpiTodoId: t.kpiTodoId,
          storageKey: t.storageKey,
          taskId: t.taskId,
          sectionId: t.sectionId,
          startDate: t.startDate,
          dueDate: t.dueDate,
        });
      });
      weekDateKeys.forEach((dateKey, dayIdx) => {
        getTasksForDate(dateKey, true).forEach((t) => {
          const left = (dayIdx / 7) * 100 + CELL_GAP / 7;
          const width = (1 / 7) * 100 - (CELL_GAP * 2) / 7;
          const baseColor = getSectionColor(t.sectionId);
          const color = withMoreTransparency(baseColor);
          allBars.push({
            left,
            width,
            name: t.name,
            color,
            isSingleDay: true,
            dayIdx,
            dateKey,
            itemType: t.itemType || "todo",
            done: !!t.done,
            kpiTodoId: t.kpiTodoId,
            storageKey: t.storageKey,
            taskId: t.taskId,
            sectionId: t.sectionId,
            startDate: t.startDate || "",
            dueDate: t.dueDate || dateKey,
          });
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
      const barsPerDay = weekDateKeys.map((_, dayIdx) =>
        allBars
          .filter((b) => b.isSingleDay && b.dayIdx === dayIdx)
          .sort((a, b) => a.row - b.row),
      );
      const effectiveMaxPerDay = weekDateKeys.map((_, dayIdx) => {
        const n = barsPerDay[dayIdx]?.length || 0;
        return n > MAX_VISIBLE_BARS_PER_DAY ? MAX_VISIBLE_BARS_PER_DAY - 1 : MAX_VISIBLE_BARS_PER_DAY;
      });
      allBars.forEach((b) => {
        if (b.isSingleDay && b.dayIdx != null) {
          const dayBars = barsPerDay[b.dayIdx];
          const idx = dayBars.indexOf(b);
          b.isOverflow = idx >= effectiveMaxPerDay[b.dayIdx];
        }
      });
      const visibleBars = allBars.filter((b) => !b.isOverflow);
      const maxRow = visibleBars.length ? Math.max(...visibleBars.map((b) => b.row), 0) : 0;
      const rowsNeeded = maxRow + 1;
      const BARS_TOP = window.matchMedia("(max-width: 767px)").matches ? 1.35 : 1.75;
      const BOTTOM_PAD = 0.6;
      const DEFAULT_ROW_HEIGHT_REM = BARS_TOP + 3 * BAR_HEIGHT + BOTTOM_PAD;
      const requiredHeight = BARS_TOP + rowsNeeded * BAR_HEIGHT + BOTTOM_PAD;
      weekRow.style.minHeight = `${Math.max(DEFAULT_ROW_HEIGHT_REM, requiredHeight)}rem`;
      const barsWithRow = allBars;
      barsWithRow.forEach((b) => {
        const isTodo = (b.itemType || "todo").toLowerCase() === "todo";
        const showCheckbox = isTodo && (b.isSingleDay || b.isFirstSegment);
        const bar = document.createElement("div");
        bar.className =
          "calendar-monthly-span-bar" +
          (b.isSingleDay
            ? " calendar-monthly-span-bar--todo"
            : " calendar-monthly-span-bar--range") +
          (showCheckbox ? " calendar-monthly-span-bar--has-checkbox" : "") +
          (b.isOverflow ? " calendar-monthly-span-bar--overflow" : "");
        bar.title = b.name;
        bar.style.cssText = `left:${b.left}%;width:${b.width}%;--bar-bg:${b.color};top:${0.15 + b.row * BAR_HEIGHT}rem`;
        if (b.isSingleDay) {
          if (isTodo) {
            bar.innerHTML = `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            bar.style.setProperty("--schedule-icon-color", b.color);
            bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" style="border-color:${b.color}"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          }
        } else {
          if (isTodo) {
            bar.innerHTML = showCheckbox
              ? `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`
              : "";
          } else {
            if (b.isFirstSegment) {
              bar.style.setProperty("--schedule-icon-color", b.color);
              bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" style="border-color:${b.color}"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
            } else {
              bar.innerHTML = "";
            }
          }
        }
        if (isTodo && b.done) {
          bar.classList.add("is-completed");
          bar
            .querySelector(".calendar-monthly-span-bar-checkbox-inner")
            ?.classList.add("checked");
        }
        if (isTodo) {
          const toggleDone = (e) => {
            e.stopPropagation();
            const newDone = !b.done;
            if (b.kpiTodoId && b.storageKey) {
              syncKpiTodoCompleted(b.kpiTodoId, b.storageKey, newDone);
            } else if (KPI_SECTION_IDS.includes(b.sectionId) && b.taskId) {
              updateSectionTaskDone(b.sectionId, b.taskId, newDone);
            } else if (b.sectionId?.startsWith("custom-") && b.taskId) {
              updateCustomSectionTaskDone(b.sectionId, b.taskId, newDone);
            }
            b.done = newDone;
            bar.classList.toggle("is-completed", newDone);
            bar
              .querySelector(".calendar-monthly-span-bar-checkbox-inner")
              ?.classList.toggle("checked", newDone);
            refreshTodoList();
          };
          if (!window.matchMedia("(max-width: 767px)").matches) bar.addEventListener("click", toggleDone);
        }
        if (!b.isSingleDay && b.startDate && b.dueDate) {
            bar.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            createCalendarBarDateEditBubble(
              e.clientX,
              e.clientY,
              b,
              () => {
                renderCalendar();
                refreshTodoList();
              },
              () => {},
            );
          });
        }
        if (b.isSingleDay && b.dueDate) {
          bar.draggable = true;
          bar.classList.add("calendar-monthly-span-bar--draggable");
          bar.addEventListener("dragstart", (e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData(
              "application/json",
              JSON.stringify({
                name: b.name,
                dueDate: b.dueDate,
                startDate: b.startDate || "",
                kpiTodoId: b.kpiTodoId,
                storageKey: b.storageKey,
                taskId: b.taskId,
                sectionId: b.sectionId,
                done: !!b.done,
                itemType: b.itemType || "todo",
              }),
            );
            e.dataTransfer.setData("text/plain", b.name || "");
            bar.classList.add("calendar-monthly-span-bar--dragging");
          });
          bar.addEventListener("dragend", () => {
            bar.classList.remove("calendar-monthly-span-bar--dragging");
          });
          bar.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            createCalendarBarRevertBubble(
              e.clientX,
              e.clientY,
              b,
              () => {
                renderCalendar();
                refreshTodoList();
              },
              () => {},
            );
          });
        }
        barsEl.appendChild(bar);
      });
      const moreEl = document.createElement("div");
      moreEl.className = "calendar-day-more-overlay";
      moreEl.style.cssText =
        "display:grid;grid-template-columns:repeat(7,1fr);position:absolute;inset:0;pointer-events:none;align-content:flex-end;padding:0.2rem 0;";
      weekDateKeys.forEach((dateKey, dayIdx) => {
        const totalCount = barsPerDay[dayIdx]?.length || 0;
        const effectiveMax = effectiveMaxPerDay[dayIdx] ?? MAX_VISIBLE_BARS_PER_DAY;
        const overflowCount = totalCount - effectiveMax;
        const showCount = overflowCount > 0;
        const displayCount = overflowCount;
        const cell = weekRow.querySelector(
          `.calendar-monthly-day[data-date="${dateKey}"]`,
        );
        const slot = document.createElement("div");
        slot.style.cssText =
          "display:flex;justify-content:center;align-items:flex-end;padding:0 0.15rem;";
        if (showCount && cell) {
          const moreBtn = document.createElement("button");
          moreBtn.type = "button";
          moreBtn.className = "calendar-day-more-btn";
          moreBtn.style.pointerEvents = "auto";
          moreBtn.textContent = `+${displayCount}`;
          moreBtn.title = "더보기";
          moreBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const rect = cell.getBoundingClientRect();
            const tasks = getAllTasksForDateDisplay(dateKey);
            createCalendarDayExpandBubble(rect, dateKey, tasks, () => {});
          });
          slot.appendChild(moreBtn);
        }
        moreEl.appendChild(slot);
      });
      weekWrap.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (
          e.dataTransfer.types.includes(DRAG_TYPE_TODO_TO_CALENDAR) ||
          e.dataTransfer.types.includes("application/json")
        ) {
          e.dataTransfer.dropEffect = "move";
          let cell = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest(".calendar-monthly-day:not(.empty)");
          if (!cell) {
            const cells = weekRow.querySelectorAll(
              ".calendar-monthly-day:not(.empty)",
            );
            for (const c of cells) {
              const r = c.getBoundingClientRect();
              if (
                e.clientX >= r.left &&
                e.clientX <= r.right &&
                e.clientY >= r.top &&
                e.clientY <= r.bottom
              ) {
                cell = c;
                break;
              }
            }
          }
          weekWrap
            .querySelectorAll(".calendar-day-drag-over")
            .forEach((el) => el.classList.remove("calendar-day-drag-over"));
          if (cell) cell.classList.add("calendar-day-drag-over");
        }
      });
      weekWrap.addEventListener("dragleave", (e) => {
        if (!weekWrap.contains(e.relatedTarget)) {
          weekWrap
            .querySelectorAll(".calendar-day-drag-over")
            .forEach((el) => el.classList.remove("calendar-day-drag-over"));
        }
      });
      weekWrap.addEventListener("drop", (e) => {
        weekWrap
          .querySelectorAll(".calendar-day-drag-over")
          .forEach((el) => el.classList.remove("calendar-day-drag-over"));
        e.preventDefault();
        let json =
          e.dataTransfer.getData(DRAG_TYPE_TODO_TO_CALENDAR) ||
          e.dataTransfer.getData("application/json");
        if (!json) return;
        let payload;
        try {
          payload = JSON.parse(json);
        } catch (_) {
          return;
        }
        let cell = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest(".calendar-monthly-day:not(.empty)");
        if (!cell) {
          const cells = weekRow.querySelectorAll(
            ".calendar-monthly-day:not(.empty)",
          );
          for (const c of cells) {
            const r = c.getBoundingClientRect();
            if (
              e.clientX >= r.left &&
              e.clientX <= r.right &&
              e.clientY >= r.top &&
              e.clientY <= r.bottom
            ) {
              cell = c;
              break;
            }
          }
        }
        if (!cell?.dataset?.date) return;
        const targetDate = cell.dataset.date;
        const oldStart = (payload.startDate || "").slice(0, 10);
        const oldDue = (payload.dueDate || "").slice(0, 10);
        let newStart = "";
        let newDue = targetDate;
        if (oldStart && oldDue && oldStart !== oldDue) {
          const startD = new Date(oldStart + "T12:00:00");
          const dueD = new Date(oldDue + "T12:00:00");
          const daysDiff = Math.round((dueD - startD) / 86400000);
          newStart = targetDate;
          newDue = addDaysToDateKey(targetDate, daysDiff);
        } else if (oldStart && oldDue) {
          newStart = targetDate;
        }
        let ok = false;
        if (payload.kpiTodoId && payload.storageKey) {
          ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
            startDate: newStart,
            dueDate: newDue,
          });
        } else if (
          payload.sectionId &&
          payload.sectionId.startsWith("custom-")
        ) {
          ok = updateCustomSectionTaskDates(
            payload.sectionId,
            payload.taskId,
            newStart,
            newDue,
          );
          if (!ok && (payload.name || "").trim()) {
            ok = addCalendarTodoToCustomSection(payload.sectionId, {
              taskId: payload.taskId,
              name: payload.name,
              startDate: newStart,
              dueDate: newDue,
              done: !!payload.done,
              itemType: payload.itemType || "todo",
            });
          }
        } else if (
          KPI_SECTION_IDS.includes(payload.sectionId) &&
          (payload.name || "").trim()
        ) {
          if (payload.kpiTodoId && payload.storageKey) {
            ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
              startDate: newStart,
              dueDate: newDue,
            });
          } else {
            ok =
              updateSectionTaskDates(
                payload.sectionId,
                payload.taskId,
                newStart,
                newDue,
              ) ||
              addSectionTaskToCalendar(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
              });
          }
        }
        if (ok) {
          renderCalendar();
          refreshTodoList();
        }
      });
      weekWrap.appendChild(weekRow);
      weekWrap.appendChild(barsEl);
      weekWrap.appendChild(moreEl);
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
      <span class="calendar-todo-sidebar-title">날짜 잡아서 해야 할일</span>
      <button type="button" class="calendar-todo-sidebar-collapse" title="사이드바 접기">
        <span class="calendar-todo-sidebar-collapse-text">접기</span>
      </button>
    </div>
    <div class="calendar-todo-sidebar-body">
      <div class="calendar-todo-sidebar-main"></div>
      <div class="calendar-todo-sidebar-overdue"></div>
    </div>
  `;
  const body = todoSidebar.querySelector(".calendar-todo-sidebar-body");
  const mainWrap = body.querySelector(".calendar-todo-sidebar-main");
  const overdueWrapEl = body.querySelector(".calendar-todo-sidebar-overdue");
  const todoListEl = renderTodoList({
    hideToolbar: true,
    enableDragToCalendar: true,
    eisenhowerFilter: "important-not-urgent",
  });
  todoListEl.classList.add("todo-list-in-sidebar");
  mainWrap.appendChild(todoListEl);
  overdueWrapEl.appendChild(renderOverdueSection({ enableDragToCalendar: true }));
  (() => {
    const collapseBtn = todoSidebar.querySelector(".calendar-todo-sidebar-collapse");
    const titleEl = todoSidebar.querySelector(".calendar-todo-sidebar-title");
    const collapseTextEl = todoSidebar.querySelector(".calendar-todo-sidebar-collapse-text");
    collapseBtn.addEventListener("click", () => {
      sidebarCollapsed = !sidebarCollapsed;
      todoSidebar.classList.toggle("collapsed", sidebarCollapsed);
      collapseBtn.title = sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기";
      titleEl.textContent = sidebarCollapsed ? "할일" : "날짜 잡아서 해야 할일";
      if (collapseTextEl) collapseTextEl.textContent = sidebarCollapsed ? "할일" : "접기";
    });
  })();
  wrap.appendChild(todoSidebar);

  wrap.addEventListener("dragend", () => {
    wrap
      .querySelectorAll(".calendar-day-drag-over")
      .forEach((el) => el.classList.remove("calendar-day-drag-over"));
  });

  renderCalendar();

  return wrap;
}

function render2WeekView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout";

  let weekOffset = 0;

  const calendarSection = document.createElement("div");
  calendarSection.className = "calendar-monthly-main";

  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    calendarSection.appendChild(tabsWrapper);
  }

  const nav = document.createElement("div");
  nav.className = "calendar-nav";
  nav.innerHTML = `
    <span class="calendar-nav-date">
      <span class="calendar-nav-month"></span>
      <span class="calendar-nav-year"></span>
    </span>
    <div class="calendar-nav-controls">
      <button type="button" class="calendar-nav-prev" title="이전 2주">&lt;</button>
      <button type="button" class="calendar-nav-today" title="오늘">오늘</button>
      <button type="button" class="calendar-nav-next" title="다음 2주">&gt;</button>
    </div>
  `;
  nav.classList.add("calendar-monthly-nav");

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-monthly-grid";

  function refreshTodoList() {
    const body = wrap.querySelector(".calendar-todo-sidebar-body");
    if (body) {
      const mainWrap = body.querySelector(".calendar-todo-sidebar-main") || body;
      const oldList = mainWrap.querySelector(".todo-list-in-sidebar");
      let activeIndex = 0;
      if (oldList) {
        const activeTab = oldList.querySelector(
          ".todo-category-tab:not(.todo-category-tab-add).active",
        );
        const tabs = oldList.querySelectorAll(
          ".todo-category-tab:not(.todo-category-tab-add)",
        );
        if (activeTab && tabs.length) {
          const idx = Array.from(tabs).indexOf(activeTab);
          if (idx >= 0) activeIndex = idx;
        }
        oldList.remove();
      }
      const newList = renderTodoList({
        hideToolbar: true,
        enableDragToCalendar: true,
        initialActiveTabIndex: activeIndex,
        eisenhowerFilter: "important-not-urgent",
      });
      newList.classList.add("todo-list-in-sidebar");
      mainWrap.appendChild(newList);
    }
  }

  function format2WeekNavRange(grid) {
    if (!grid[0]?.[0] || !grid[1]?.[6]) return "";
    const d1 = grid[0][0];
    const d2 = grid[1][6];
    const sameYear = d1.getFullYear() === d2.getFullYear();
    const s1 = `${d1.getMonth() + 1}.${d1.getDate()}`;
    const s2 = sameYear
      ? `${d2.getMonth() + 1}.${d2.getDate()}`
      : `${d2.getFullYear()}.${d2.getMonth() + 1}.${d2.getDate()}`;
    return `${s1} ~ ${s2}`;
  }

  function renderCalendar() {
    const grid = getCalendarGridFor2Weeks(weekOffset);
    nav.querySelector(".calendar-nav-month").textContent =
      format2WeekNavRange(grid);
    nav.querySelector(".calendar-nav-year").textContent = grid[0]?.[0]
      ? String(grid[0][0].getFullYear())
      : "";

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
    const primaryMonth = grid[0]?.[0]?.getMonth() ?? new Date().getMonth();
    const rangeTasks = getAllTasksWithDateRange();

    grid.forEach((week) => {
      const weekWrap = document.createElement("div");
      weekWrap.className = "calendar-monthly-week-wrap";
      const weekRow = document.createElement("div");
      weekRow.className = "calendar-monthly-week";
      const weekDateKeys = week
        .map((d) => (d ? formatDateKey(d) : ""))
        .filter(Boolean);
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

        const isCurrentMonth = date.getMonth() === primaryMonth;
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
          createCalendarEventBubble(
            rect,
            key,
            () => {
              renderCalendar();
              refreshTodoList();
            },
            () => {},
          );
        });
        cell.addEventListener("dragover", (e) => {
          if (e.dataTransfer.types.includes(DRAG_TYPE_TODO_TO_CALENDAR)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            cell.classList.add("calendar-day-drag-over");
          }
        });
        cell.addEventListener("dragleave", () => {
          cell.classList.remove("calendar-day-drag-over");
        });
        cell.addEventListener("drop", (e) => {
          cell.classList.remove("calendar-day-drag-over");
          const json = e.dataTransfer.getData(DRAG_TYPE_TODO_TO_CALENDAR);
          if (!json) return;
          e.preventDefault();
          e.stopPropagation();
          let payload;
          try {
            payload = JSON.parse(json);
          } catch (_) {
            return;
          }
          const targetDate = key;
          const oldStart = (payload.startDate || "").slice(0, 10);
          const oldDue = (payload.dueDate || "").slice(0, 10);
          let newStart = "";
          let newDue = targetDate;
          if (oldStart && oldDue && oldStart !== oldDue) {
            const startD = new Date(oldStart + "T12:00:00");
            const dueD = new Date(oldDue + "T12:00:00");
            const daysDiff = Math.round((dueD - startD) / 86400000);
            newStart = targetDate;
            newDue = addDaysToDateKey(targetDate, daysDiff);
          } else if (oldStart && oldDue) {
            newStart = targetDate;
          }
          let ok = false;
          if (payload.kpiTodoId && payload.storageKey) {
            ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
              startDate: newStart,
              dueDate: newDue,
            });
          } else if (
            payload.sectionId &&
            payload.sectionId.startsWith("custom-")
          ) {
            ok = updateCustomSectionTaskDates(
              payload.sectionId,
              payload.taskId,
              newStart,
              newDue,
            );
            if (!ok && (payload.name || "").trim()) {
              ok = addCalendarTodoToCustomSection(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
              });
            }
          } else if (
            KPI_SECTION_IDS.includes(payload.sectionId) &&
            (payload.name || "").trim()
          ) {
            if (payload.kpiTodoId && payload.storageKey) {
              ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
                startDate: newStart,
                dueDate: newDue,
              });
            } else {
              ok =
                updateSectionTaskDates(
                  payload.sectionId,
                  payload.taskId,
                  newStart,
                  newDue,
                ) ||
                addSectionTaskToCalendar(payload.sectionId, {
                  taskId: payload.taskId,
                  name: payload.name,
                  startDate: newStart,
                  dueDate: newDue,
                  done: !!payload.done,
                  itemType: payload.itemType || "todo",
                });
            }
          }
          dateDebug("drop on day", { targetDate: key, name: payload?.name, sectionId: payload?.sectionId, taskId: payload?.taskId, newStart, newDue, ok });
          if (ok) {
            renderCalendar();
            refreshTodoList();
          }
        });
        weekRow.appendChild(cell);
      });

      const barsEl = document.createElement("div");
      barsEl.className = "calendar-monthly-bars";
      const BAR_HEIGHT = window.matchMedia("(max-width: 767px)").matches ? 0.95 : 2.05;
      const overlaps = (a, b) =>
        a.left < b.left + b.width && b.left < a.left + a.width;
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
        const baseColor = getSectionColor(t.sectionId);
        const color = withMoreTransparency(baseColor);
        const isFirstSegment = barStart === t.startDate;
        allBars.push({
          left,
          width,
          name: t.name,
          color,
          isSingleDay: false,
          isFirstSegment,
          itemType: t.itemType || "todo",
          done: !!t.done,
          kpiTodoId: t.kpiTodoId,
          storageKey: t.storageKey,
          taskId: t.taskId,
          sectionId: t.sectionId,
          startDate: t.startDate,
          dueDate: t.dueDate,
        });
      });
      weekDateKeys.forEach((dateKey, dayIdx) => {
        getTasksForDate(dateKey, true).forEach((t) => {
          const left = (dayIdx / 7) * 100 + CELL_GAP / 7;
          const width = (1 / 7) * 100 - (CELL_GAP * 2) / 7;
          const baseColor = getSectionColor(t.sectionId);
          const color = withMoreTransparency(baseColor);
          allBars.push({
            left,
            width,
            name: t.name,
            color,
            isSingleDay: true,
            dayIdx,
            dateKey,
            itemType: t.itemType || "todo",
            done: !!t.done,
            kpiTodoId: t.kpiTodoId,
            storageKey: t.storageKey,
            taskId: t.taskId,
            sectionId: t.sectionId,
            startDate: t.startDate || "",
            dueDate: t.dueDate || dateKey,
          });
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
      const barsPerDay = weekDateKeys.map((_, dayIdx) =>
        allBars
          .filter((b) => b.isSingleDay && b.dayIdx === dayIdx)
          .sort((a, b) => a.row - b.row),
      );
      const effectiveMaxPerDay = weekDateKeys.map((_, dayIdx) => {
        const n = barsPerDay[dayIdx]?.length || 0;
        return n > MAX_VISIBLE_BARS_PER_DAY ? MAX_VISIBLE_BARS_PER_DAY - 1 : MAX_VISIBLE_BARS_PER_DAY;
      });
      allBars.forEach((b) => {
        if (b.isSingleDay && b.dayIdx != null) {
          const dayBars = barsPerDay[b.dayIdx];
          const idx = dayBars.indexOf(b);
          b.isOverflow = idx >= effectiveMaxPerDay[b.dayIdx];
        }
      });
      const visibleBars = allBars.filter((b) => !b.isOverflow);
      const maxRow = visibleBars.length ? Math.max(...visibleBars.map((b) => b.row), 0) : 0;
      const rowsNeeded = maxRow + 1;
      const BARS_TOP = window.matchMedia("(max-width: 767px)").matches ? 1.35 : 1.75;
      const BOTTOM_PAD = 0.6;
      const DEFAULT_ROW_HEIGHT_REM = BARS_TOP + 3 * BAR_HEIGHT + BOTTOM_PAD;
      const requiredHeight = BARS_TOP + rowsNeeded * BAR_HEIGHT + BOTTOM_PAD;
      weekRow.style.minHeight = `${Math.max(DEFAULT_ROW_HEIGHT_REM, requiredHeight)}rem`;
      const barsWithRow = allBars;
      barsWithRow.forEach((b) => {
        const isTodo = (b.itemType || "todo").toLowerCase() === "todo";
        const showCheckbox = isTodo && (b.isSingleDay || b.isFirstSegment);
        const bar = document.createElement("div");
        bar.className =
          "calendar-monthly-span-bar" +
          (b.isSingleDay
            ? " calendar-monthly-span-bar--todo"
            : " calendar-monthly-span-bar--range") +
          (showCheckbox ? " calendar-monthly-span-bar--has-checkbox" : "") +
          (b.isOverflow ? " calendar-monthly-span-bar--overflow" : "");
        bar.title = b.name;
        bar.style.cssText = `left:${b.left}%;width:${b.width}%;--bar-bg:${b.color};top:${0.15 + b.row * BAR_HEIGHT}rem`;
        if (b.isSingleDay) {
          if (isTodo) {
            bar.innerHTML = `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            bar.style.setProperty("--schedule-icon-color", b.color);
            bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" style="border-color:${b.color}"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          }
        } else {
          if (isTodo) {
            bar.innerHTML = showCheckbox
              ? `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`
              : "";
          } else {
            if (b.isFirstSegment) {
              bar.style.setProperty("--schedule-icon-color", b.color);
              bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" style="border-color:${b.color}"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
            } else {
              bar.innerHTML = "";
            }
          }
        }
        if (isTodo && b.done) {
          bar.classList.add("is-completed");
          bar
            .querySelector(".calendar-monthly-span-bar-checkbox-inner")
            ?.classList.add("checked");
        }
        if (isTodo) {
          const toggleDone = (e) => {
            e.stopPropagation();
            const newDone = !b.done;
            if (b.kpiTodoId && b.storageKey) {
              syncKpiTodoCompleted(b.kpiTodoId, b.storageKey, newDone);
            } else if (b.sectionId?.startsWith("custom-") && b.taskId) {
              updateCustomSectionTaskDone(b.sectionId, b.taskId, newDone);
            }
            b.done = newDone;
            bar.classList.toggle("is-completed", newDone);
            bar
              .querySelector(".calendar-monthly-span-bar-checkbox-inner")
              ?.classList.toggle("checked", newDone);
            refreshTodoList();
          };
          if (!window.matchMedia("(max-width: 767px)").matches) bar.addEventListener("click", toggleDone);
        }
        if (!b.isSingleDay && b.startDate && b.dueDate) {
            bar.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            createCalendarBarDateEditBubble(
              e.clientX,
              e.clientY,
              b,
              () => {
                renderCalendar();
                refreshTodoList();
              },
              () => {},
            );
          });
        }
        if (b.isSingleDay && b.dueDate) {
          bar.draggable = true;
          bar.classList.add("calendar-monthly-span-bar--draggable");
          bar.addEventListener("dragstart", (e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData(
              "application/json",
              JSON.stringify({
                name: b.name,
                dueDate: b.dueDate,
                startDate: b.startDate || "",
                kpiTodoId: b.kpiTodoId,
                storageKey: b.storageKey,
                taskId: b.taskId,
                sectionId: b.sectionId,
                done: !!b.done,
                itemType: b.itemType || "todo",
              }),
            );
            e.dataTransfer.setData("text/plain", b.name || "");
            bar.classList.add("calendar-monthly-span-bar--dragging");
          });
          bar.addEventListener("dragend", () => {
            bar.classList.remove("calendar-monthly-span-bar--dragging");
          });
          bar.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            createCalendarBarRevertBubble(
              e.clientX,
              e.clientY,
              b,
              () => {
                renderCalendar();
                refreshTodoList();
              },
              () => {},
            );
          });
        }
        barsEl.appendChild(bar);
      });
      const moreEl = document.createElement("div");
      moreEl.className = "calendar-day-more-overlay";
      moreEl.style.cssText =
        "display:grid;grid-template-columns:repeat(7,1fr);position:absolute;inset:0;pointer-events:none;align-content:flex-end;padding:0.2rem 0;";
      weekDateKeys.forEach((dateKey, dayIdx) => {
        const totalCount = barsPerDay[dayIdx]?.length || 0;
        const effectiveMax = effectiveMaxPerDay[dayIdx] ?? MAX_VISIBLE_BARS_PER_DAY;
        const overflowCount = totalCount - effectiveMax;
        const showCount = overflowCount > 0;
        const displayCount = overflowCount;
        const cell = weekRow.querySelector(
          `.calendar-monthly-day[data-date="${dateKey}"]`,
        );
        const slot = document.createElement("div");
        slot.style.cssText =
          "display:flex;justify-content:center;align-items:flex-end;padding:0 0.15rem;";
        if (showCount && cell) {
          const moreBtn = document.createElement("button");
          moreBtn.type = "button";
          moreBtn.className = "calendar-day-more-btn";
          moreBtn.style.pointerEvents = "auto";
          moreBtn.textContent = `+${displayCount}`;
          moreBtn.title = "더보기";
          moreBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const rect = cell.getBoundingClientRect();
            const tasks = getAllTasksForDateDisplay(dateKey);
            createCalendarDayExpandBubble(rect, dateKey, tasks, () => {});
          });
          slot.appendChild(moreBtn);
        }
        moreEl.appendChild(slot);
      });
      weekWrap.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (
          e.dataTransfer.types.includes(DRAG_TYPE_TODO_TO_CALENDAR) ||
          e.dataTransfer.types.includes("application/json")
        ) {
          e.dataTransfer.dropEffect = "move";
          let cell = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest(".calendar-monthly-day:not(.empty)");
          if (!cell) {
            const cells = weekRow.querySelectorAll(
              ".calendar-monthly-day:not(.empty)",
            );
            for (const c of cells) {
              const r = c.getBoundingClientRect();
              if (
                e.clientX >= r.left &&
                e.clientX <= r.right &&
                e.clientY >= r.top &&
                e.clientY <= r.bottom
              ) {
                cell = c;
                break;
              }
            }
          }
          weekWrap
            .querySelectorAll(".calendar-day-drag-over")
            .forEach((el) => el.classList.remove("calendar-day-drag-over"));
          if (cell) cell.classList.add("calendar-day-drag-over");
        }
      });
      weekWrap.addEventListener("dragleave", (e) => {
        if (!weekWrap.contains(e.relatedTarget)) {
          weekWrap
            .querySelectorAll(".calendar-day-drag-over")
            .forEach((el) => el.classList.remove("calendar-day-drag-over"));
        }
      });
      weekWrap.addEventListener("drop", (e) => {
        weekWrap
          .querySelectorAll(".calendar-day-drag-over")
          .forEach((el) => el.classList.remove("calendar-day-drag-over"));
        e.preventDefault();
        let json =
          e.dataTransfer.getData(DRAG_TYPE_TODO_TO_CALENDAR) ||
          e.dataTransfer.getData("application/json");
        if (!json) return;
        let payload;
        try {
          payload = JSON.parse(json);
        } catch (_) {
          return;
        }
        let cell = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest(".calendar-monthly-day:not(.empty)");
        if (!cell) {
          const cells = weekRow.querySelectorAll(
            ".calendar-monthly-day:not(.empty)",
          );
          for (const c of cells) {
            const r = c.getBoundingClientRect();
            if (
              e.clientX >= r.left &&
              e.clientX <= r.right &&
              e.clientY >= r.top &&
              e.clientY <= r.bottom
            ) {
              cell = c;
              break;
            }
          }
        }
        if (!cell?.dataset?.date) return;
        const targetDate = cell.dataset.date;
        const oldStart = (payload.startDate || "").slice(0, 10);
        const oldDue = (payload.dueDate || "").slice(0, 10);
        let newStart = "";
        let newDue = targetDate;
        if (oldStart && oldDue && oldStart !== oldDue) {
          const startD = new Date(oldStart + "T12:00:00");
          const dueD = new Date(oldDue + "T12:00:00");
          const daysDiff = Math.round((dueD - startD) / 86400000);
          newStart = targetDate;
          newDue = addDaysToDateKey(targetDate, daysDiff);
        } else if (oldStart && oldDue) {
          newStart = targetDate;
        }
        let ok = false;
        if (payload.kpiTodoId && payload.storageKey) {
          ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
            startDate: newStart,
            dueDate: newDue,
          });
        } else if (
          payload.sectionId &&
          payload.sectionId.startsWith("custom-")
        ) {
          ok = updateCustomSectionTaskDates(
            payload.sectionId,
            payload.taskId,
            newStart,
            newDue,
          );
          if (!ok && (payload.name || "").trim()) {
            ok = addCalendarTodoToCustomSection(payload.sectionId, {
              taskId: payload.taskId,
              name: payload.name,
              startDate: newStart,
              dueDate: newDue,
              done: !!payload.done,
              itemType: payload.itemType || "todo",
            });
          }
        } else if (
          KPI_SECTION_IDS.includes(payload.sectionId) &&
          (payload.name || "").trim()
        ) {
          if (payload.kpiTodoId && payload.storageKey) {
            ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
              startDate: newStart,
              dueDate: newDue,
            });
          } else {
            ok =
              updateSectionTaskDates(
                payload.sectionId,
                payload.taskId,
                newStart,
                newDue,
              ) ||
              addSectionTaskToCalendar(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
              });
          }
        }
        if (ok) {
          renderCalendar();
          refreshTodoList();
        }
      });
      weekWrap.appendChild(weekRow);
      weekWrap.appendChild(barsEl);
      weekWrap.appendChild(moreEl);
      calendarGrid.appendChild(weekWrap);
    });
  }

  nav.querySelector(".calendar-nav-today").addEventListener("click", () => {
    weekOffset = 0;
    renderCalendar();
  });
  nav.querySelector(".calendar-nav-prev").addEventListener("click", () => {
    weekOffset--;
    renderCalendar();
  });
  nav.querySelector(".calendar-nav-next").addEventListener("click", () => {
    weekOffset++;
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
      <span class="calendar-todo-sidebar-title">날짜 잡아서 해야 할일</span>
      <button type="button" class="calendar-todo-sidebar-collapse" title="사이드바 접기">
        <span class="calendar-todo-sidebar-collapse-text">접기</span>
      </button>
    </div>
    <div class="calendar-todo-sidebar-body">
      <div class="calendar-todo-sidebar-main"></div>
      <div class="calendar-todo-sidebar-overdue"></div>
    </div>
  `;
  const body = todoSidebar.querySelector(".calendar-todo-sidebar-body");
  const mainWrap = body.querySelector(".calendar-todo-sidebar-main");
  const overdueWrapEl = body.querySelector(".calendar-todo-sidebar-overdue");
  const todoListEl = renderTodoList({
    hideToolbar: true,
    enableDragToCalendar: true,
    eisenhowerFilter: "important-not-urgent",
  });
  todoListEl.classList.add("todo-list-in-sidebar");
  mainWrap.appendChild(todoListEl);
  overdueWrapEl.appendChild(renderOverdueSection({ enableDragToCalendar: true }));
  (() => {
    const collapseBtn = todoSidebar.querySelector(".calendar-todo-sidebar-collapse");
    const titleEl = todoSidebar.querySelector(".calendar-todo-sidebar-title");
    const collapseTextEl = todoSidebar.querySelector(".calendar-todo-sidebar-collapse-text");
    collapseBtn.addEventListener("click", () => {
      sidebarCollapsed = !sidebarCollapsed;
      todoSidebar.classList.toggle("collapsed", sidebarCollapsed);
      collapseBtn.title = sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기";
      titleEl.textContent = sidebarCollapsed ? "할일" : "날짜 잡아서 해야 할일";
      if (collapseTextEl) collapseTextEl.textContent = sidebarCollapsed ? "할일" : "접기";
    });
  })();
  wrap.appendChild(todoSidebar);

  wrap.addEventListener("dragend", () => {
    wrap
      .querySelectorAll(".calendar-day-drag-over")
      .forEach((el) => el.classList.remove("calendar-day-drag-over"));
  });

  renderCalendar();

  return wrap;
}

function render3WeekView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout";

  let weekOffset = 0;

  const calendarSection = document.createElement("div");
  calendarSection.className = "calendar-monthly-main";

  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    calendarSection.appendChild(tabsWrapper);
  }

  const nav = document.createElement("div");
  nav.className = "calendar-nav";
  nav.innerHTML = `
    <span class="calendar-nav-date">
      <span class="calendar-nav-month"></span>
      <span class="calendar-nav-year"></span>
    </span>
    <div class="calendar-nav-controls">
      <button type="button" class="calendar-nav-prev" title="이전 3주">&lt;</button>
      <button type="button" class="calendar-nav-today" title="오늘">오늘</button>
      <button type="button" class="calendar-nav-next" title="다음 3주">&gt;</button>
    </div>
  `;
  nav.classList.add("calendar-monthly-nav");

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-monthly-grid";

  function refreshTodoList() {
    const body = wrap.querySelector(".calendar-todo-sidebar-body");
    if (body) {
      const mainWrap = body.querySelector(".calendar-todo-sidebar-main") || body;
      const oldList = mainWrap.querySelector(".todo-list-in-sidebar");
      let activeIndex = 0;
      if (oldList) {
        const activeTab = oldList.querySelector(
          ".todo-category-tab:not(.todo-category-tab-add).active",
        );
        const tabs = oldList.querySelectorAll(
          ".todo-category-tab:not(.todo-category-tab-add)",
        );
        if (activeTab && tabs.length) {
          const idx = Array.from(tabs).indexOf(activeTab);
          if (idx >= 0) activeIndex = idx;
        }
        oldList.remove();
      }
      const newList = renderTodoList({
        hideToolbar: true,
        enableDragToCalendar: true,
        initialActiveTabIndex: activeIndex,
        eisenhowerFilter: "important-not-urgent",
      });
      newList.classList.add("todo-list-in-sidebar");
      mainWrap.appendChild(newList);
    }
  }

  function format3WeekNavRange(grid) {
    if (!grid[0]?.[0] || !grid[2]?.[6]) return "";
    const d1 = grid[0][0];
    const d2 = grid[2][6];
    const sameYear = d1.getFullYear() === d2.getFullYear();
    const s1 = `${d1.getMonth() + 1}.${d1.getDate()}`;
    const s2 = sameYear
      ? `${d2.getMonth() + 1}.${d2.getDate()}`
      : `${d2.getFullYear()}.${d2.getMonth() + 1}.${d2.getDate()}`;
    return `${s1} ~ ${s2}`;
  }

  function renderCalendar() {
    const grid = getCalendarGridFor3Weeks(weekOffset);
    nav.querySelector(".calendar-nav-month").textContent =
      format3WeekNavRange(grid);
    nav.querySelector(".calendar-nav-year").textContent = grid[0]?.[0]
      ? String(grid[0][0].getFullYear())
      : "";

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
    const primaryMonth = grid[0]?.[0]?.getMonth() ?? new Date().getMonth();
    const rangeTasks = getAllTasksWithDateRange();

    grid.forEach((week) => {
      const weekWrap = document.createElement("div");
      weekWrap.className = "calendar-monthly-week-wrap";
      const weekRow = document.createElement("div");
      weekRow.className = "calendar-monthly-week";
      const weekDateKeys = week
        .map((d) => (d ? formatDateKey(d) : ""))
        .filter(Boolean);
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

        const isCurrentMonth = date.getMonth() === primaryMonth;
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
          createCalendarEventBubble(
            rect,
            key,
            () => {
              renderCalendar();
              refreshTodoList();
            },
            () => {},
          );
        });
        cell.addEventListener("dragover", (e) => {
          if (e.dataTransfer.types.includes(DRAG_TYPE_TODO_TO_CALENDAR)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            cell.classList.add("calendar-day-drag-over");
          }
        });
        cell.addEventListener("dragleave", () => {
          cell.classList.remove("calendar-day-drag-over");
        });
        cell.addEventListener("drop", (e) => {
          cell.classList.remove("calendar-day-drag-over");
          const json = e.dataTransfer.getData(DRAG_TYPE_TODO_TO_CALENDAR);
          if (!json) return;
          e.preventDefault();
          e.stopPropagation();
          let payload;
          try {
            payload = JSON.parse(json);
          } catch (_) {
            return;
          }
          const targetDate = key;
          const oldStart = (payload.startDate || "").slice(0, 10);
          const oldDue = (payload.dueDate || "").slice(0, 10);
          let newStart = "";
          let newDue = targetDate;
          if (oldStart && oldDue && oldStart !== oldDue) {
            const startD = new Date(oldStart + "T12:00:00");
            const dueD = new Date(oldDue + "T12:00:00");
            const daysDiff = Math.round((dueD - startD) / 86400000);
            newStart = targetDate;
            newDue = addDaysToDateKey(targetDate, daysDiff);
          } else if (oldStart && oldDue) {
            newStart = targetDate;
          }
          let ok = false;
          if (payload.kpiTodoId && payload.storageKey) {
            ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
              startDate: newStart,
              dueDate: newDue,
            });
          } else if (
            payload.sectionId &&
            payload.sectionId.startsWith("custom-")
          ) {
            ok = updateCustomSectionTaskDates(
              payload.sectionId,
              payload.taskId,
              newStart,
              newDue,
            );
            if (!ok && (payload.name || "").trim()) {
              ok = addCalendarTodoToCustomSection(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
              });
            }
          } else if (
            KPI_SECTION_IDS.includes(payload.sectionId) &&
            (payload.name || "").trim()
          ) {
            if (payload.kpiTodoId && payload.storageKey) {
              ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
                startDate: newStart,
                dueDate: newDue,
              });
            } else {
              ok =
                updateSectionTaskDates(
                  payload.sectionId,
                  payload.taskId,
                  newStart,
                  newDue,
                ) ||
                addSectionTaskToCalendar(payload.sectionId, {
                  taskId: payload.taskId,
                  name: payload.name,
                  startDate: newStart,
                  dueDate: newDue,
                  done: !!payload.done,
                  itemType: payload.itemType || "todo",
                });
            }
          }
          dateDebug("drop on day", { targetDate: key, name: payload?.name, sectionId: payload?.sectionId, taskId: payload?.taskId, newStart, newDue, ok });
          if (ok) {
            renderCalendar();
            refreshTodoList();
          }
        });
        weekRow.appendChild(cell);
      });

      const barsEl = document.createElement("div");
      barsEl.className = "calendar-monthly-bars";
      const BAR_HEIGHT = window.matchMedia("(max-width: 767px)").matches ? 0.95 : 2.05;
      const overlaps = (a, b) =>
        a.left < b.left + b.width && b.left < a.left + a.width;
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
        const baseColor = getSectionColor(t.sectionId);
        const color = withMoreTransparency(baseColor);
        const isFirstSegment = barStart === t.startDate;
        allBars.push({
          left,
          width,
          name: t.name,
          color,
          isSingleDay: false,
          isFirstSegment,
          itemType: t.itemType || "todo",
          done: !!t.done,
          kpiTodoId: t.kpiTodoId,
          storageKey: t.storageKey,
          taskId: t.taskId,
          sectionId: t.sectionId,
          startDate: t.startDate,
          dueDate: t.dueDate,
        });
      });
      weekDateKeys.forEach((dateKey, dayIdx) => {
        getTasksForDate(dateKey, true).forEach((t) => {
          const left = (dayIdx / 7) * 100 + CELL_GAP / 7;
          const width = (1 / 7) * 100 - (CELL_GAP * 2) / 7;
          const baseColor = getSectionColor(t.sectionId);
          const color = withMoreTransparency(baseColor);
          allBars.push({
            left,
            width,
            name: t.name,
            color,
            isSingleDay: true,
            dayIdx,
            dateKey,
            itemType: t.itemType || "todo",
            done: !!t.done,
            kpiTodoId: t.kpiTodoId,
            storageKey: t.storageKey,
            taskId: t.taskId,
            sectionId: t.sectionId,
            startDate: t.startDate || "",
            dueDate: t.dueDate || dateKey,
          });
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
      const barsPerDay = weekDateKeys.map((_, dayIdx) =>
        allBars
          .filter((b) => b.isSingleDay && b.dayIdx === dayIdx)
          .sort((a, b) => a.row - b.row),
      );
      const effectiveMaxPerDay = weekDateKeys.map((_, dayIdx) => {
        const n = barsPerDay[dayIdx]?.length || 0;
        return n > MAX_VISIBLE_BARS_PER_DAY ? MAX_VISIBLE_BARS_PER_DAY - 1 : MAX_VISIBLE_BARS_PER_DAY;
      });
      allBars.forEach((b) => {
        if (b.isSingleDay && b.dayIdx != null) {
          const dayBars = barsPerDay[b.dayIdx];
          const idx = dayBars.indexOf(b);
          b.isOverflow = idx >= effectiveMaxPerDay[b.dayIdx];
        }
      });
      const visibleBars = allBars.filter((b) => !b.isOverflow);
      const maxRow = visibleBars.length ? Math.max(...visibleBars.map((b) => b.row), 0) : 0;
      const rowsNeeded = maxRow + 1;
      const BARS_TOP = window.matchMedia("(max-width: 767px)").matches ? 1.35 : 1.75;
      const BOTTOM_PAD = 0.6;
      const DEFAULT_ROW_HEIGHT_REM = BARS_TOP + 3 * BAR_HEIGHT + BOTTOM_PAD;
      const requiredHeight = BARS_TOP + rowsNeeded * BAR_HEIGHT + BOTTOM_PAD;
      weekRow.style.minHeight = `${Math.max(DEFAULT_ROW_HEIGHT_REM, requiredHeight)}rem`;
      const barsWithRow = allBars;
      barsWithRow.forEach((b) => {
        const isTodo = (b.itemType || "todo").toLowerCase() === "todo";
        const bar = document.createElement("div");
        const showCheckbox = isTodo && (b.isSingleDay || b.isFirstSegment);
        bar.className =
          "calendar-monthly-span-bar" +
          (b.isSingleDay
            ? " calendar-monthly-span-bar--todo"
            : " calendar-monthly-span-bar--range") +
          (showCheckbox ? " calendar-monthly-span-bar--has-checkbox" : "") +
          (b.isOverflow ? " calendar-monthly-span-bar--overflow" : "");
        bar.title = b.name;
        bar.style.cssText = `left:${b.left}%;width:${b.width}%;--bar-bg:${b.color};top:${0.15 + b.row * BAR_HEIGHT}rem`;
        if (b.isSingleDay) {
          if (isTodo) {
            bar.innerHTML = `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            bar.innerHTML = `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          }
          bar.dataset.date = b.dateKey || "";
          bar.dataset.sectionId = b.sectionId || "";
          bar.dataset.taskId = b.taskId || "";
          bar.dataset.kpiTodoId = b.kpiTodoId || "";
          bar.dataset.storageKey = b.storageKey || "";
          bar.dataset.done = b.done ? "true" : "false";
          bar.dataset.itemType = b.itemType || "todo";
          const toggleDone = () => {
            let newDone = !bar.dataset.done;
            if (b.kpiTodoId && b.storageKey) {
              syncKpiTodoCompleted(b.kpiTodoId, b.storageKey, newDone);
            } else if (b.sectionId && b.taskId) {
              if ((b.sectionId || "").startsWith("custom-")) {
                updateCustomSectionTaskDone(b.sectionId, b.taskId, newDone);
              } else {
                updateSectionTaskDone(b.sectionId, b.taskId, newDone);
              }
            }
            bar.dataset.done = newDone ? "true" : "false";
            bar.classList.toggle("is-completed", newDone);
            bar
              .querySelector(".calendar-monthly-span-bar-checkbox-inner")
              ?.classList.toggle("checked", newDone);
            renderCalendar();
            refreshTodoList();
          };
          if (!window.matchMedia("(max-width: 767px)").matches) bar.addEventListener("click", toggleDone);
        } else {
          if (isTodo) {
            bar.innerHTML = showCheckbox
              ? `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`
              : "";
          } else {
            bar.innerHTML = b.isFirstSegment ? `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>` : "";
          }
          if (isTodo && b.done) {
            bar.classList.add("is-completed");
            bar
              .querySelector(".calendar-monthly-span-bar-checkbox-inner")
              ?.classList.add("checked");
          }
          if (isTodo) {
            bar.addEventListener("click", (e) => {
              e.stopPropagation();
              const newDone = !b.done;
              if (b.kpiTodoId && b.storageKey) {
                syncKpiTodoCompleted(b.kpiTodoId, b.storageKey, newDone);
              } else if (b.sectionId && b.taskId) {
                if ((b.sectionId || "").startsWith("custom-")) {
                  updateCustomSectionTaskDone(b.sectionId, b.taskId, newDone);
                } else {
                  updateSectionTaskDone(b.sectionId, b.taskId, newDone);
                }
              }
              b.done = newDone;
              bar.classList.toggle("is-completed", newDone);
              bar
                .querySelector(".calendar-monthly-span-bar-checkbox-inner")
                ?.classList.toggle("checked", newDone);
              renderCalendar();
              refreshTodoList();
            });
          }
        }
        if (!b.isSingleDay && b.startDate && b.dueDate) {
          bar.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            createCalendarBarDateEditBubble(
              e.clientX,
              e.clientY,
              b,
              () => {
                renderCalendar();
                refreshTodoList();
              },
              () => {},
            );
          });
        }
        if (b.isSingleDay && b.dueDate) {
          bar.draggable = true;
          bar.classList.add("calendar-monthly-span-bar--draggable");
          bar.addEventListener("dragstart", (e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData(
              "application/json",
              JSON.stringify({
                name: b.name,
                dueDate: b.dueDate,
                startDate: b.startDate || "",
                kpiTodoId: b.kpiTodoId,
                storageKey: b.storageKey,
                taskId: b.taskId,
                sectionId: b.sectionId,
                done: !!b.done,
                itemType: b.itemType || "todo",
              }),
            );
            e.dataTransfer.setData("text/plain", b.name || "");
            bar.classList.add("calendar-monthly-span-bar--dragging");
          });
          bar.addEventListener("dragend", () => {
            bar.classList.remove("calendar-monthly-span-bar--dragging");
          });
          bar.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            createCalendarBarRevertBubble(
              e.clientX,
              e.clientY,
              b,
              () => {
                renderCalendar();
                refreshTodoList();
              },
              () => {},
            );
          });
        }
        barsEl.appendChild(bar);
      });
      const moreEl = document.createElement("div");
      moreEl.className = "calendar-day-more-overlay";
      moreEl.style.cssText =
        "display:grid;grid-template-columns:repeat(7,1fr);position:absolute;inset:0;pointer-events:none;align-content:flex-end;padding:0.2rem 0;";
      weekDateKeys.forEach((dateKey, dayIdx) => {
        const totalCount = barsPerDay[dayIdx]?.length || 0;
        const effectiveMax = effectiveMaxPerDay[dayIdx] ?? MAX_VISIBLE_BARS_PER_DAY;
        const overflowCount = totalCount - effectiveMax;
        const showCount = overflowCount > 0;
        const displayCount = overflowCount;
        const cell = weekRow.querySelector(
          `.calendar-monthly-day[data-date="${dateKey}"]`,
        );
        const slot = document.createElement("div");
        slot.style.cssText =
          "display:flex;justify-content:center;align-items:flex-end;padding:0 0.15rem;";
        if (showCount && cell) {
          const moreBtn = document.createElement("button");
          moreBtn.type = "button";
          moreBtn.className = "calendar-day-more-btn";
          moreBtn.style.pointerEvents = "auto";
          moreBtn.textContent = `+${displayCount}`;
          moreBtn.title = "더보기";
          moreBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const rect = cell.getBoundingClientRect();
            const tasks = getAllTasksForDateDisplay(dateKey);
            createCalendarDayExpandBubble(rect, dateKey, tasks, () => {});
          });
          slot.appendChild(moreBtn);
        }
        moreEl.appendChild(slot);
      });
      weekWrap.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (
          e.dataTransfer.types.includes(DRAG_TYPE_TODO_TO_CALENDAR) ||
          e.dataTransfer.types.includes("application/json")
        ) {
          e.dataTransfer.dropEffect = "move";
          let cell = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest(".calendar-monthly-day:not(.empty)");
          if (!cell) {
            const cells = weekRow.querySelectorAll(
              ".calendar-monthly-day:not(.empty)",
            );
            for (const c of cells) {
              const r = c.getBoundingClientRect();
              if (
                e.clientX >= r.left &&
                e.clientX <= r.right &&
                e.clientY >= r.top &&
                e.clientY <= r.bottom
              ) {
                cell = c;
                break;
              }
            }
          }
          weekWrap
            .querySelectorAll(".calendar-day-drag-over")
            .forEach((el) => el.classList.remove("calendar-day-drag-over"));
          if (cell) cell.classList.add("calendar-day-drag-over");
        }
      });
      weekWrap.addEventListener("dragleave", (e) => {
        if (!weekWrap.contains(e.relatedTarget)) {
          weekWrap
            .querySelectorAll(".calendar-day-drag-over")
            .forEach((el) => el.classList.remove("calendar-day-drag-over"));
        }
      });
      weekWrap.addEventListener("drop", (e) => {
        weekWrap
          .querySelectorAll(".calendar-day-drag-over")
          .forEach((el) => el.classList.remove("calendar-day-drag-over"));
        e.preventDefault();
        let json =
          e.dataTransfer.getData(DRAG_TYPE_TODO_TO_CALENDAR) ||
          e.dataTransfer.getData("application/json");
        if (!json) return;
        let payload;
        try {
          payload = JSON.parse(json);
        } catch (_) {
          return;
        }
        let cell = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest(".calendar-monthly-day:not(.empty)");
        if (!cell) {
          const cells = weekRow.querySelectorAll(
            ".calendar-monthly-day:not(.empty)",
          );
          for (const c of cells) {
            const r = c.getBoundingClientRect();
            if (
              e.clientX >= r.left &&
              e.clientX <= r.right &&
              e.clientY >= r.top &&
              e.clientY <= r.bottom
            ) {
              cell = c;
              break;
            }
          }
        }
        if (!cell) return;
        const targetDate = cell.dataset.date || "";
        if (!targetDate) return;
        const oldStart = (payload.startDate || "").slice(0, 10);
        const oldDue = (payload.dueDate || "").slice(0, 10);
        let newStart = "";
        let newDue = targetDate;
        if (oldStart && oldDue && oldStart !== oldDue) {
          const startD = new Date(oldStart + "T12:00:00");
          const dueD = new Date(oldDue + "T12:00:00");
          const daysDiff = Math.round((dueD - startD) / 86400000);
          newStart = targetDate;
          newDue = addDaysToDateKey(targetDate, daysDiff);
        } else if (oldStart && oldDue) {
          newStart = targetDate;
        }
        let ok = false;
        if (payload.kpiTodoId && payload.storageKey) {
          ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
            startDate: newStart,
            dueDate: newDue,
          });
        } else if (
          payload.sectionId &&
          payload.sectionId.startsWith("custom-")
        ) {
          ok = updateCustomSectionTaskDates(
            payload.sectionId,
            payload.taskId,
            newStart,
            newDue,
          );
          if (!ok && (payload.name || "").trim()) {
            ok = addCalendarTodoToCustomSection(payload.sectionId, {
              taskId: payload.taskId,
              name: payload.name,
              startDate: newStart,
              dueDate: newDue,
              done: !!payload.done,
              itemType: payload.itemType || "todo",
            });
          }
        } else if (
          KPI_SECTION_IDS.includes(payload.sectionId) &&
          (payload.name || "").trim()
        ) {
          if (payload.kpiTodoId && payload.storageKey) {
            ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
              startDate: newStart,
              dueDate: newDue,
            });
          } else {
            ok =
              updateSectionTaskDates(
                payload.sectionId,
                payload.taskId,
                newStart,
                newDue,
              ) ||
              addSectionTaskToCalendar(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
              });
          }
        }
        if (ok) {
          renderCalendar();
          refreshTodoList();
        }
      });
      weekWrap.appendChild(weekRow);
      weekWrap.appendChild(barsEl);
      weekWrap.appendChild(moreEl);
      calendarGrid.appendChild(weekWrap);
    });
  }

  nav.querySelector(".calendar-nav-today").addEventListener("click", () => {
    weekOffset = 0;
    renderCalendar();
  });
  nav.querySelector(".calendar-nav-prev").addEventListener("click", () => {
    weekOffset--;
    renderCalendar();
  });
  nav.querySelector(".calendar-nav-next").addEventListener("click", () => {
    weekOffset++;
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
      <span class="calendar-todo-sidebar-title">날짜 잡아서 해야 할일</span>
      <button type="button" class="calendar-todo-sidebar-collapse" title="사이드바 접기">
        <span class="calendar-todo-sidebar-collapse-text">접기</span>
      </button>
    </div>
    <div class="calendar-todo-sidebar-body">
      <div class="calendar-todo-sidebar-main"></div>
      <div class="calendar-todo-sidebar-overdue"></div>
    </div>
  `;
  const body = todoSidebar.querySelector(".calendar-todo-sidebar-body");
  const mainWrap = body.querySelector(".calendar-todo-sidebar-main");
  const overdueWrapEl = body.querySelector(".calendar-todo-sidebar-overdue");
  const todoListEl = renderTodoList({
    hideToolbar: true,
    enableDragToCalendar: true,
    eisenhowerFilter: "important-not-urgent",
  });
  todoListEl.classList.add("todo-list-in-sidebar");
  mainWrap.appendChild(todoListEl);
  overdueWrapEl.appendChild(renderOverdueSection({ enableDragToCalendar: true }));
  (() => {
    const collapseBtn = todoSidebar.querySelector(".calendar-todo-sidebar-collapse");
    const titleEl = todoSidebar.querySelector(".calendar-todo-sidebar-title");
    const collapseTextEl = todoSidebar.querySelector(".calendar-todo-sidebar-collapse-text");
    collapseBtn.addEventListener("click", () => {
      sidebarCollapsed = !sidebarCollapsed;
      todoSidebar.classList.toggle("collapsed", sidebarCollapsed);
      collapseBtn.title = sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기";
      titleEl.textContent = sidebarCollapsed ? "할일" : "날짜 잡아서 해야 할일";
      if (collapseTextEl) collapseTextEl.textContent = sidebarCollapsed ? "할일" : "접기";
    });
  })();
  wrap.appendChild(todoSidebar);

  wrap.addEventListener("dragend", () => {
    wrap
      .querySelectorAll(".calendar-day-drag-over")
      .forEach((el) => el.classList.remove("calendar-day-drag-over"));
  });

  renderCalendar();

  return wrap;
}

/** 표→타임테이블 실시간 동기화: DOM에서 현재 입력값 직접 수집 (표 값 변경 시 즉시 반영) */
const TT_SYNC_DEBUG = true;
if (typeof window !== "undefined") window.TT_SYNC_DEBUG = TT_SYNC_DEBUG;
function collectLiveScheduledFromBudgetColumn(budgetColumn) {
  if (!budgetColumn) {
    if (TT_SYNC_DEBUG) console.log("[TT-SYNC] collectLiveScheduled: no budgetColumn");
    return {};
  }
  const byTask = {};
  const rows = budgetColumn.querySelectorAll(
    ".time-daily-budget-table-block tbody tr, .calendar-1day-todo-table tbody tr",
  );
  if (TT_SYNC_DEBUG) console.log("[TT-SYNC] collectLiveScheduled: rows found", rows.length);
  rows.forEach((row, idx) => {
    if (row.classList.contains("time-row-add")) return;
    const name = (row.dataset.taskName || "").trim();
    if (!name) return;
    const inputs = row.querySelectorAll(".time-budget-scheduled-input");
    const startRaw = inputs[0]?.value ?? row.dataset.scheduledStart ?? "";
    const endRaw = inputs[1]?.value ?? row.dataset.scheduledEnd ?? "";
    const start = String(startRaw).trim();
    const end = String(endRaw).trim();
    if (TT_SYNC_DEBUG && (start || end)) {
      console.log(`[TT-SYNC] row ${idx} ${name}: start="${start}" end="${end}" (input[0]=${inputs[0]?.value ?? "?"} input[1]=${inputs[1]?.value ?? "?"})`);
    }
    if (!start || !end) return;
    const st = `${start}-${end}`;
    if (!byTask[name]) byTask[name] = [];
    byTask[name].push(st);
  });
  if (TT_SYNC_DEBUG) console.log("[TT-SYNC] collectLiveScheduled result", JSON.stringify(byTask));
  return byTask;
}

/** dateStr(YYYY-MM-DD) 기준 전날 키 반환 */
function getYesterdayKey(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "";
  const parts = dateStr.trim().split(/[\/\-]/).map(Number);
  if (parts.length < 3) return "";
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  dt.setDate(dt.getDate() - 1);
  return formatDateKey(dt);
}

/** 1일 뷰 시간표(예상/실제) 오버레이만 생성 - budget 테이블 재구성 없이 시간표만 갱신용 */
function build1DayTimetableOverlays(targetKey, budgetColumn, actualDateKey) {
  const storedGoals = getBudgetGoals(targetKey);
  const liveFromDom = collectLiveScheduledFromBudgetColumn(budgetColumn);
  const budgetGoals = { ...storedGoals };
  Object.entries(liveFromDom).forEach(([task, times]) => {
    budgetGoals[task] = { ...(budgetGoals[task] || {}), scheduledTimes: times };
  });
  if (TT_SYNC_DEBUG) {
    console.log("[TT-SYNC] build1DayTimetableOverlays", {
      targetKey,
      liveFromDom,
      merged: Object.fromEntries(
        Object.entries(budgetGoals).map(([k, v]) => [k, v?.scheduledTimes ?? v?.scheduledTime]),
      ),
    });
  }
  const allTimeRows = loadTimeRows();
  const tasks = getAllTasksForDateDisplay(targetKey);
  const parseDateFromTimeStr = (str) => {
    if (!str || typeof str !== "string") return "";
    const m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    return m
      ? `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
      : "";
  };
  const normDate = (s) => (s || "").replace(/\//g, "-").trim().slice(0, 10);
  const actualFilterKey = actualDateKey || targetKey;
  const actualRows = allTimeRows.filter(
    (r) => normDate(r.date || parseDateFromTimeStr(r.startTime)) === actualFilterKey,
  );
  if (TT_SYNC_DEBUG) {
    console.log("[시간가계부→캘린더] build1DayTimetableOverlays actualRows", {
      targetKey,
      actualFilterKey,
      totalFromStorage: allTimeRows.length,
      filteredForDate: actualRows.length,
      rows: actualRows.map((r) => ({ task: r.taskName, start: r.startTime, end: r.endTime })),
    });
  }
  const parseHhMmToMinutes = (s) => {
    if (!s || !s.trim()) return null;
    const str = String(s).trim();
    const m = str.match(/^(\d{1,2}):?(\d{0,2})$/);
    if (m) return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
    const m4 = str.match(/^(\d{3,4})$/);
    if (m4) {
      const digits = m4[1];
      const h = digits.length === 4 ? parseInt(digits.slice(0, 2), 10) : parseInt(digits.slice(0, 1), 10);
      const min = parseInt(digits.slice(-2), 10) || 0;
      return (h || 0) * 60 + Math.min(59, min);
    }
    return null;
  };
  const parseDateTimeToMinutes = (str) => {
    if (!str || typeof str !== "string") return null;
    const m = str.match(/[T\s](\d{1,2}):?(\d{2})?/);
    if (!m) return null;
    return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
  };
  const tryOverlap = (
    slotStartMin,
    slotEndMin,
    startMin,
    endMin,
    prod,
    taskName,
  ) => {
    if (startMin == null || endMin == null) return null;
    const overlapStart = Math.max(slotStartMin, startMin);
    const overlapEnd = Math.min(slotEndMin, endMin);
    if (overlapStart < overlapEnd) {
      return {
        prod,
        taskName: taskName || "",
        overlapStartMin: overlapStart,
        overlapEndMin: overlapEnd,
      };
    }
    return null;
  };
  const SLOTS_PER_DAY = 24;
  const MIN_PER_SLOT = 60;
  const getScheduledTimesForTask = (data) => {
    if (!data) return [];
    if (Array.isArray(data.scheduledTimes))
      return data.scheduledTimes.filter((s) => s && String(s).trim());
    if (data.scheduledTime && String(data.scheduledTime).trim())
      return [String(data.scheduledTime).trim()];
    return [];
  };
  const fmt = (m) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  /** 과제별로 스팬 직접 생성 - 슬롯 경계에 갇히지 않고 실제 시작/마감 시간 사용 */
  const buildExpectedSpansFromTasks = () => {
    const spans = [];
    for (const [taskName, data] of Object.entries(budgetGoals)) {
      const times = getScheduledTimesForTask(data);
      const taskFromList = tasks.find((t) => (t.name || "").trim() === taskName);
      for (const st of times) {
        if (!st.trim()) continue;
        const parts = st.trim().split("-");
        const startMin = parseHhMmToMinutes(parts[0]);
        const endMin = parts[1] ? parseHhMmToMinutes(parts[1]) : null;
        if (startMin == null || endMin == null) continue;
        const startSlot = Math.floor(startMin / MIN_PER_SLOT);
        const endSlot = Math.min(
          SLOTS_PER_DAY - 1,
          Math.floor((endMin - 1) / MIN_PER_SLOT),
        );
        const opt = getTaskOptionByName(taskName);
        const prod = opt?.productivity || "other";
        const span = {
          startSlot,
          endSlot: Math.max(endSlot, startSlot),
          startMin,
          endMin,
          taskName,
          prod,
          startDisplay: fmt(startMin),
          endDisplay: fmt(endMin),
        };
        if (taskFromList) {
          span.sectionId = taskFromList.sectionId;
          span._task = taskFromList;
          span._taskKey = taskFromList.kpiTodoId || taskFromList.taskId || taskFromList.name;
        }
        spans.push(span);
      }
    }
    for (const t of tasks) {
      const st = (t.startTime || "").trim();
      const et = (t.endTime || "").trim();
      if (!st || !et) continue;
      const startMin = parseHhMmToMinutes(st);
      const endMin = parseHhMmToMinutes(et);
      if (startMin == null || endMin == null) continue;
      const startSlot = Math.floor(startMin / MIN_PER_SLOT);
      const endSlot = Math.min(
        SLOTS_PER_DAY - 1,
        Math.floor((endMin - 1) / MIN_PER_SLOT),
      );
      const prod = getTaskOptionByName(t.name)?.productivity || "other";
      spans.push({
        startSlot,
        endSlot: Math.max(endSlot, startSlot),
        startMin,
        endMin,
        taskName: t.name,
        prod,
        sectionId: t.sectionId,
        startDisplay: fmt(startMin),
        endDisplay: fmt(endMin),
        _task: t,
        _taskKey: t.kpiTodoId || t.taskId || t.name,
      });
    }
    const sorted = spans.sort((a, b) => a.startMin - b.startMin);
    if (TT_SYNC_DEBUG) {
      console.log("[TT-SYNC] buildExpectedSpansFromTasks raw", sorted.length, sorted.map((s) => ({
        task: s.taskName,
        start: s.startDisplay,
        end: s.endDisplay,
        startMin: s.startMin,
        endMin: s.endMin,
      })));
    }
    const validSorted = sorted.filter((s) => s.endMin > s.startMin);
    const withLanes = assignLanesToSpans(validSorted);
    const normalized = withLanes.spans.map((s) => ({
      ...s,
      startDisplay: fmt(s.startMin),
      endDisplay: fmt(s.endMin),
    }));
    if (TT_SYNC_DEBUG) {
      console.log("[TT-SYNC] assignLanesToSpans result", normalized.length, "maxLane:", withLanes.maxLane, normalized.map((s) => ({
        task: s.taskName,
        start: s.startDisplay,
        end: s.endDisplay,
        lane: s.lane,
      })));
    }
    return { spans: normalized, maxLane: withLanes.maxLane };
  };
  /** 겹치는 스팬에 레인 할당. 연속된 과제(이전 종료 시각 = 다음 시작 시각)는 같은 레인에 연결해 한 줄로 표시 */
  const assignLanesToSpans = (spans) => {
    const laneEnds = [];
    let maxLane = 0;
    for (const span of spans) {
      let lane = 0;
      /* 이전 과제 종료 시각과 현재 과제 시작 시각이 같거나 1분 이내면 같은 레인(연속)으로 처리 */
      while (lane < laneEnds.length && span.startMin < laneEnds[lane] - 1) lane++;
      if (lane >= laneEnds.length) laneEnds.push(span.endMin);
      else laneEnds[lane] = span.endMin;
      span.lane = lane;
      maxLane = Math.max(maxLane, lane);
    }
    return { spans, maxLane };
  };
  const getSlotExpected = (slotIndex) => {
    const slotStartMin = slotIndex * MIN_PER_SLOT;
    const slotEndMin = (slotIndex + 1) * MIN_PER_SLOT;
    for (const [taskName, data] of Object.entries(budgetGoals)) {
      const times = getScheduledTimesForTask(data);
      for (const st of times) {
        if (!st.trim()) continue;
        const parts = st.trim().split("-");
        const startMin = parseHhMmToMinutes(parts[0]);
        const endMin = parts[1] ? parseHhMmToMinutes(parts[1]) : null;
        if (startMin == null || endMin == null) continue;
        const opt = getTaskOptionByName(taskName);
        const prod = opt?.productivity || "other";
        const res = tryOverlap(
          slotStartMin,
          slotEndMin,
          startMin,
          endMin,
          prod,
          taskName,
        );
        if (res) return res;
      }
    }
    for (const t of tasks) {
      const st = (t.startTime || "").trim();
      const et = (t.endTime || "").trim();
      if (!st || !et) continue;
      const startMin = parseHhMmToMinutes(st);
      const endMin = parseHhMmToMinutes(et);
      if (startMin == null || endMin == null) continue;
      const prod = getTaskOptionByName(t.name)?.productivity || "other";
      const res = tryOverlap(
        slotStartMin,
        slotEndMin,
        startMin,
        endMin,
        prod,
        t.name,
      );
      if (res)
        return {
          ...res,
          _task: t,
          _taskKey: t.kpiTodoId || t.taskId || t.name,
        };
    }
    return null;
  };
  const getSlotActual = (slotIndex) => {
    const slotStartMin = slotIndex * MIN_PER_SLOT;
    const slotEndMin = (slotIndex + 1) * MIN_PER_SLOT;
    for (const r of actualRows) {
      const startMin = parseDateTimeToMinutes(r.startTime);
      const endMin = parseDateTimeToMinutes(r.endTime);
      if (startMin == null || endMin == null) continue;
      const prod =
        r.productivity ||
        getTaskOptionByName(r.taskName)?.productivity ||
        "other";
      const res = tryOverlap(
        slotStartMin,
        slotEndMin,
        startMin,
        endMin,
        prod,
        r.taskName,
      );
      if (res) return res;
    }
    return null;
  };
  const prodColorsActual = getTimeCategoryColorsForTimetable();
  const prodColorsExpected = getTimeCategoryColorsForTimetableExpected();
  const buildSpans = (getSlot) => {
    const slotInfos = [];
    for (let i = 0; i < SLOTS_PER_DAY; i++) slotInfos.push(getSlot(i));
    const spans = [];
    for (let i = 0; i < SLOTS_PER_DAY; ) {
      const cur = slotInfos[i];
      if (!cur || !cur.taskName) {
        i++;
        continue;
      }
      let endSlot = i;
      const startMin = cur.overlapStartMin ?? i * MIN_PER_SLOT;
      const key = cur._taskKey || cur.taskName;
      while (endSlot + 1 < SLOTS_PER_DAY) {
        const next = slotInfos[endSlot + 1];
        const nextKey = next?._taskKey || next?.taskName;
        if (!next || !next.taskName || nextKey !== key) break;
        endSlot++;
      }
      const last = slotInfos[endSlot];
      const endMin = last?.overlapEndMin ?? (endSlot + 1) * MIN_PER_SLOT;
      const fmtMin = (m) =>
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      spans.push({
        startSlot: i,
        endSlot,
        startMin,
        endMin,
        taskName: cur.taskName,
        prod: cur.prod,
        sectionId: cur._task?.sectionId,
        startDisplay: fmtMin(startMin),
        endDisplay: fmtMin(endMin),
        _task: cur._task,
      });
      i = endSlot + 1;
    }
    return spans;
  };
  const expectedResult = buildExpectedSpansFromTasks();
  const expectedSpans = expectedResult.spans;
  const expectedMaxLane = expectedResult.maxLane;
  const buildActualSpansFromRows = () => {
    const spans = [];
    const toMinutes = (str) => parseDateTimeToMinutes(str) ?? parseHhMmToMinutes(str);
    for (const r of actualRows) {
      const startMin = toMinutes(r.startTime);
      const endMin = toMinutes(r.endTime);
      if (startMin == null || endMin == null || endMin <= startMin) continue;
      const prod = r.productivity || getTaskOptionByName(r.taskName)?.productivity || "other";
      spans.push({
        startMin,
        endMin,
        taskName: r.taskName || "",
        prod,
        startDisplay: fmt(startMin),
        endDisplay: fmt(endMin),
      });
    }
    const sorted = spans.sort((a, b) => a.startMin - b.startMin);
    const withLanes = assignLanesToSpans(sorted);
    return {
      spans: withLanes.spans.map((s) => ({
        ...s,
        startSlot: Math.floor(s.startMin / MIN_PER_SLOT),
        endSlot: Math.min(SLOTS_PER_DAY - 1, Math.floor((s.endMin - 1) / MIN_PER_SLOT)),
        startDisplay: fmt(s.startMin),
        endDisplay: fmt(s.endMin),
      })),
      maxLane: withLanes.maxLane,
    };
  };
  const actualResult = buildActualSpansFromRows();
  const actualSpans = actualResult.spans;
  const actualMaxLane = actualResult.maxLane;
  const SECTION_IDS_FOR_LIST_COLOR = [
    "braindump",
    "dream",
    "sideincome",
    "health",
    "happy",
  ];
  const createOverlay = (spans, colors, isActual, maxLane = 0) => {
    if (!isActual && TT_SYNC_DEBUG) {
      console.log("[TT-SYNC] createOverlay expected spans", spans.length, spans.map((s) => ({
        task: s.taskName,
        start: s.startDisplay,
        end: s.endDisplay,
        lane: s.lane,
      })));
    }
    const overlay = document.createElement("div");
    overlay.className = `calendar-1day-time-fill-overlay calendar-1day-time-fill-overlay--${isActual ? "actual" : "expected"}`;
    const laneCount = Math.max(1, maxLane + 1);
    const groups = isActual ? spans.map((s) => [s]) : spans.map((s) => [s]);
    for (const group of groups) {
      const first = group[0];
      const last = group[group.length - 1];
      const blockStartMin = first.startMin;
      const blockEndMin = last.endMin;
      const blockStartSlot = Math.floor(blockStartMin / MIN_PER_SLOT);
      const blockEndSlot = Math.min(
        SLOTS_PER_DAY - 1,
        Math.floor((blockEndMin - 1) / MIN_PER_SLOT),
      );
      const blockHeightMin = (blockEndSlot - blockStartSlot + 1) * MIN_PER_SLOT;
      const actualBlockMin = blockEndMin - blockStartMin;
      const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      if (TT_SYNC_DEBUG && !isActual) {
        console.log("[TT-SYNC] blockFill", {
          tasks: group.map((s) => `${s.taskName} ${s.startDisplay}~${s.endDisplay}`),
          blockStartMin,
          blockEndMin,
          blockStartMinFmt: fmt(blockStartMin),
          blockEndMinFmt: fmt(blockEndMin),
          blockStartSlot,
          blockEndSlot,
          blockHeightMin,
          actualBlockMin,
          heightPct: blockHeightMin > 0 && actualBlockMin < blockHeightMin
            ? ((actualBlockMin / blockHeightMin) * 100).toFixed(1) + "%"
            : "100%",
          slotStartMin: blockStartSlot * MIN_PER_SLOT,
          startOffset: blockStartMin - blockStartSlot * MIN_PER_SLOT,
        });
      }
      const useLaneLayout = laneCount > 1;
      const blockFill = document.createElement("div");
      blockFill.className =
        "calendar-1day-time-slot-fill calendar-1day-time-slot-fill--block calendar-1day-time-slot-fill--span" +
        (useLaneLayout ? " calendar-1day-time-slot-fill--lane" : "");
      const MIN_PER_DAY = 24 * 60;
      if (useLaneLayout) {
        /* position: absolute로 겹치는 블록을 오버레이 기준 나란히 배치 (이미지처럼) */
        const lane = first.lane ?? 0;
        blockFill.style.position = "absolute";
        blockFill.style.left = `${(lane / laneCount) * 100}%`;
        blockFill.style.width = `${100 / laneCount}%`;
        blockFill.style.top = `calc(2.5rem + ${blockStartMin} * (100% - 2.5rem) / ${MIN_PER_DAY})`;
        blockFill.style.height = `calc(${actualBlockMin} * (100% - 2.5rem) / ${MIN_PER_DAY})`;
      } else {
        blockFill.style.gridRow = `${blockStartSlot + 2} / ${blockEndSlot + 3}`;
      }
      const heightPct =
        blockHeightMin > 0 && actualBlockMin < blockHeightMin
          ? ((actualBlockMin / blockHeightMin) * 100).toFixed(1)
          : "100";
      blockFill.dataset.debugBlock = `${fmt(blockStartMin)}~${fmt(blockEndMin)} slot${blockStartSlot}-${blockEndSlot} h=${blockHeightMin}m actual=${actualBlockMin}m height=${heightPct}%`;
      /* 실제 시작/종료 시간에 맞춰 색칠 (04:50 종료면 05:00까지 넘치지 않도록) - 레인 레이아웃이 아닐 때만 */
      if (!useLaneLayout && blockHeightMin > 0) {
        const slotStartMin = blockStartSlot * MIN_PER_SLOT;
        const startOffset = blockStartMin - slotStartMin;
        if (startOffset > 0) {
          blockFill.style.top = `${(startOffset / blockHeightMin) * 100}%`;
        }
        if (actualBlockMin < blockHeightMin) {
          blockFill.style.height = `${(actualBlockMin / blockHeightMin) * 100}%`;
        }
      }
      blockFill.style.display = "flex";
      blockFill.style.flexDirection = "column";
      blockFill.style.gap = "0";
      blockFill.style.padding = "0";
      blockFill.style.overflow = "hidden";
      if (useLaneLayout) {
        const lane = first.lane ?? 0;
        blockFill.style.borderRadius = lane === 0 ? "0.375rem 0 0 0.375rem" : lane === laneCount - 1 ? "0 0.375rem 0.375rem 0" : "0";
      } else {
        blockFill.style.borderRadius = "0.375rem";
        blockFill.style.border = "none";
      }
      if (!useLaneLayout) {
        blockFill.style.position = "relative";
        blockFill.style.width = "100%";
      }
      blockFill.style.boxSizing = "border-box";
      /* 타임박스: 왼쪽 진한 실선, 살짝 둥근 모서리, 투명 컬러 채움 */
      let firstBorderColor = null;
      for (const sp of group) {
        let c;
        if (
          !isActual &&
          sp.sectionId &&
          (SECTION_IDS_FOR_LIST_COLOR.includes(sp.sectionId) ||
            (sp.sectionId || "").startsWith("custom-"))
        ) {
          const baseColor = getSectionColor(sp.sectionId);
          c = {
            bg: withMoreTransparency(baseColor, 0.08),
            border: withMoreTransparency(baseColor, 0.55),
          };
        } else {
          c = colors[sp.prod];
        }
        if (!c) continue;
        if (!firstBorderColor) firstBorderColor = c.border;
        /* actualBlockMin 기준으로 세그먼트 비율 계산 - 블록 높이 축소 시에도 세그먼트가 블록 전체를 채우도록 */
        const segHeightPct =
          actualBlockMin > 0 ? ((sp.endMin - sp.startMin) / actualBlockMin) * 100 : 0;
        const seg = document.createElement("div");
        seg.className = "calendar-1day-time-slot-fill-seg";
        seg.style.flex = `0 0 ${segHeightPct}%`;
        seg.style.minHeight = "2.5rem";
        seg.style.width = "100%";
        seg.style.display = "flex";
        seg.style.alignItems = "flex-start";
        seg.style.padding = "0.25rem 0.375rem 0.25rem 0.5rem";
        seg.style.backgroundColor = c.bg;
        seg.style.boxSizing = "border-box";
        const labelWrap = document.createElement("div");
        labelWrap.className = "calendar-1day-time-slot-label-wrap";
        const labelName = document.createElement("span");
        labelName.className = "calendar-1day-time-slot-label-name";
        labelName.textContent = sp.taskName || "";
        const labelTime = document.createElement("span");
        labelTime.className = "calendar-1day-time-slot-label-time";
        labelTime.textContent = `${sp.startDisplay} ~ ${sp.endDisplay}`;
        labelWrap.appendChild(labelName);
        labelWrap.appendChild(labelTime);
        seg.appendChild(labelWrap);
        blockFill.appendChild(seg);
      }
      if (firstBorderColor) {
        blockFill.style.borderLeft = `0.125rem solid ${firstBorderColor}`;
      }
      overlay.appendChild(blockFill);
    }
    return overlay;
  };
  return {
    expected: createOverlay(expectedSpans, prodColorsExpected, false, expectedMaxLane),
    actual: createOverlay(actualSpans, prodColorsActual, true, actualMaxLane),
  };
}

function render1DayView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-1day-view";

  let dayOffset = 0;

  /* 1번 레이아웃: 탭을 최상단 전체 영역에 배치 */
  const topRow = document.createElement("div");
  topRow.className = "calendar-view-top-row calendar-view-top-row--1day";
  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    topRow.appendChild(tabsWrapper);
  }
  wrap.appendChild(topRow);

  const contentRow = document.createElement("div");
  contentRow.className = "calendar-view-1day-content-row";

  const calendarSection = document.createElement("div");
  calendarSection.className = "calendar-monthly-main";

  const nav = document.createElement("div");
  nav.className = "calendar-nav";
  nav.innerHTML = `
    <span class="calendar-nav-date">
      <span class="calendar-nav-month"></span>
      <span class="calendar-nav-year"></span>
    </span>
    <div class="calendar-nav-controls">
      <button type="button" class="calendar-nav-prev" title="이전 날">&lt;</button>
      <button type="button" class="calendar-nav-today" title="오늘">오늘</button>
      <button type="button" class="calendar-nav-next" title="다음 날">&gt;</button>
    </div>
  `;
  nav.classList.add("calendar-monthly-nav");

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-monthly-grid";

  function refreshTodoList() {
    /* 1일 뷰는 KPI 사이드바 사용, 할일 목록 없음 */
  }

  function getKpiTodosForKpi(kpiId) {
    return getKpiTodosAsTasks().filter((t) => t.kpiId === kpiId);
  }

  function renderKpiTodoListHtml(kpiId, storageKey) {
    const todos = getKpiTodosForKpi(kpiId);
    const itemsHtml = todos
      .map(
        (t) => `
      <div class="calendar-kpi-todo-item ${t.done ? "is-completed" : ""}" data-kpi-todo-id="${escapeHtml(t.kpiTodoId)}" data-storage-key="${escapeHtml(storageKey)}">
        <label class="calendar-kpi-todo-check-wrap">
          <input type="checkbox" class="calendar-kpi-todo-check" ${t.done ? "checked" : ""} />
        </label>
        <span class="calendar-kpi-todo-text">${escapeHtml(t.name)}</span>
        <button type="button" class="calendar-kpi-todo-del" title="삭제">×</button>
      </div>
    `,
      )
      .join("");
    return `
      <div class="calendar-kpi-todo-list">${itemsHtml || '<p class="calendar-kpi-todo-empty">할일 없음</p>'}</div>
    `;
  }

  function renderKpiSidebarContent(list, onRefresh) {
    if (!list || list.length === 0) {
      return '<p class="calendar-kpi-sidebar-empty">KPI가 없습니다.</p>';
    }
    return list
      .map((k) => {
        const kpiId = k.kpiId || "";
        const storageKey = k.storageKey || "";
        const todoCount = getKpiTodosForKpi(kpiId).length;
        const investedMins = getAccumulatedMinutes(k.name);
        const targetMins = k.targetTimeRequired
          ? hhMmToMinutes(k.targetTimeRequired)
          : 0;
        const accumulatedMins = targetMins > 0 ? investedMins : 0;
        const timeProgress =
          targetMins > 0
            ? Math.min(100, (accumulatedMins / targetMins) * 100)
            : 0;
        const remainingMins = Math.max(0, targetMins - accumulatedMins);
        const timeCircleHtml =
          targetMins > 0
            ? `
          <div class="dream-kpi-time-circle-wrap">
            <div class="dream-kpi-time-circle" role="progressbar" aria-valuenow="${timeProgress}" aria-valuemin="0" aria-valuemax="100">
              <svg viewBox="0 0 36 36">
                <path class="dream-kpi-time-circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path class="dream-kpi-time-circle-fill" stroke-dasharray="${timeProgress}, ${100 - timeProgress}" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div class="dream-kpi-time-circle-label">
                <span class="dream-kpi-time-accumulated">${minutesToHhMm(accumulatedMins)}</span>
                <span class="dream-kpi-time-sep">/</span>
                <span class="dream-kpi-time-target">${escapeHtml(k.targetTimeRequired)}</span>
              </div>
            </div>
            <div class="dream-kpi-time-remaining">남은 ${minutesToHhMm(remainingMins)}</div>
          </div>
        `
            : "";
        const hasTimeTarget = targetMins > 0;
        return `
        <div class="kpi-view-card dream-kpi-card calendar-kpi-card ${!hasTimeTarget ? "calendar-kpi-card-no-time" : ""}" data-kpi-id="${escapeHtml(kpiId)}" data-storage-key="${escapeHtml(storageKey)}">
          <div class="dream-kpi-card-inner calendar-kpi-card-inner">
            <div class="dream-kpi-card-name">${escapeHtml(k.name)}</div>
            <div class="dream-kpi-card-target-num">${k.targetValue ? escapeHtml(String(k.targetValue).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) + (k.unit ? '<span class="dream-kpi-card-unit"> ' + escapeHtml(k.unit) + "</span>" : "") : "—"}</div>
            ${k.targetStartDate || k.targetDeadline ? `<div class="dream-kpi-card-deadline">${escapeHtml(formatDeadlineRangeCompact(k.targetStartDate, k.targetDeadline))}</div>` : ""}
            <div class="dream-kpi-card-progress">
              <div class="dream-kpi-card-progress-bar"><div class="dream-kpi-card-progress-fill" style="width:${k.progress}%"></div></div>
              <div class="dream-kpi-card-progress-text">${escapeHtml(k.progressText)}</div>
            </div>
            <div class="dream-kpi-card-invested">지금까지 투자한 시간 <span class="dream-kpi-card-invested-value">${minutesToHhMm(investedMins)}</span></div>
            ${timeCircleHtml}
          </div>
          <button type="button" class="calendar-kpi-card-todos-toggle">할일 (${todoCount}개)</button>
          <div class="calendar-kpi-card-todos"></div>
        </div>
      `;
      })
      .join("");
  }

  let expandedKpiId = null;

  function refreshKpiSidebar(taskStats = {}) {
    const body = wrap.querySelector(".calendar-kpi-sidebar-body");
    if (!body) return;
    const totalDone = Object.values(taskStats).reduce(
      (s, x) => s + (x.done || 0),
      0,
    );
    const totalAll = Object.values(taskStats).reduce(
      (s, x) => s + (x.total || 0),
      0,
    );
    const progressPct =
      totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;
    const SECTION_LABELS = {
      dream: "꿈",
      sideincome: "부수입",
      health: "건강",
      happy: "행복",
    };
    const byCategory = ["dream", "sideincome", "health", "happy"]
      .filter((sid) => taskStats[sid]?.total > 0)
      .map((sid) => {
        const s = taskStats[sid];
        return `${s.label} ${s.done}/${s.total}`;
      });
    let html = `
      <div class="calendar-sidebar-progress-card">
        <div class="calendar-sidebar-progress-label">오늘의 진행률</div>
        <div class="calendar-sidebar-progress-bar-wrap">
          <div class="calendar-sidebar-progress-bar" style="width:${progressPct}%"></div>
        </div>
        <div class="calendar-sidebar-progress-value">${totalDone} / ${totalAll}</div>
        ${byCategory.length > 0 ? `<div class="calendar-sidebar-progress-by-category">${byCategory.join(" · ")}</div>` : ""}
      </div>
    `;
    body.innerHTML = html;
  }

  function attachKpiTodoListeners(todosEl, kpiId, storageKey) {
    if (!todosEl) return;
    todosEl.querySelectorAll(".calendar-kpi-todo-check").forEach((check) => {
      check.addEventListener("change", (e) => {
        e.stopPropagation();
        const item = check.closest(".calendar-kpi-todo-item");
        const kpiTodoId = item?.dataset?.kpiTodoId;
        if (kpiTodoId) {
          syncKpiTodoCompleted(kpiTodoId, storageKey, !!check.checked);
          refreshKpiSidebar();
          renderCalendar();
        }
      });
    });
    todosEl.querySelectorAll(".calendar-kpi-todo-del").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const item = btn.closest(".calendar-kpi-todo-item");
        const kpiTodoId = item?.dataset?.kpiTodoId;
        if (kpiTodoId && removeKpiTodo(kpiTodoId, storageKey)) {
          refreshKpiSidebar();
          renderCalendar();
        }
      });
    });
  }

  function attachKpiSidebarListeners(body) {
    body.querySelectorAll(".calendar-kpi-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const cat = tab.dataset.category;
        body
          .querySelectorAll(".calendar-kpi-tab")
          .forEach((t) => t.classList.remove("active"));
        body
          .querySelectorAll(".calendar-kpi-panel")
          .forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        const panel = body.querySelector(
          `.calendar-kpi-panel[data-category="${cat}"]`,
        );
        if (panel) panel.classList.add("active");
      });
    });
    body.querySelectorAll(".calendar-kpi-card").forEach((card) => {
      const toggleBtn = card.querySelector(".calendar-kpi-card-todos-toggle");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const kpiId = card.dataset.kpiId;
          const storageKey = card.dataset.storageKey;
          if (!kpiId || !storageKey) return;
          const wasExpanded = card.classList.contains("is-expanded");
          body.querySelectorAll(".calendar-kpi-card").forEach((c) => {
            c.classList.remove("is-expanded");
            c.querySelector(".calendar-kpi-card-todos")?.replaceChildren();
          });
          if (!wasExpanded) {
            expandedKpiId = kpiId;
            card.classList.add("is-expanded");
            const todosEl = card.querySelector(".calendar-kpi-card-todos");
            if (todosEl) {
              todosEl.innerHTML = renderKpiTodoListHtml(kpiId, storageKey);
              attachKpiTodoListeners(todosEl, kpiId, storageKey);
            }
          } else {
            expandedKpiId = null;
          }
        });
      }
    });
  }

  function buildKpiSidebarHtml() {
    const byCategory = getKpisByCategory();
    const categoryOrder = ["꿈", "건강", "부수입", "행복"];
    const CATEGORY_ICONS = { 꿈: "✨", 부수입: "💰", 행복: "😊", 건강: "💪" };
    let tabsHtml = "";
    let panelsHtml = "";
    let totalCount = 0;
    categoryOrder.forEach((cat, i) => {
      const list = byCategory[cat] || [];
      totalCount += list.length;
      const icon = CATEGORY_ICONS[cat] || "";
      const isActive = i === 0;
      tabsHtml += `
        <button type="button" class="calendar-kpi-tab ${isActive ? "active" : ""}" data-category="${escapeHtml(cat)}">
          <span class="calendar-kpi-tab-icon">${icon}</span>
          ${escapeHtml(cat)}
          <span class="calendar-kpi-tab-count">${list.length}</span>
        </button>
      `;
      panelsHtml += `
        <div class="calendar-kpi-panel ${isActive ? "active" : ""}" data-category="${escapeHtml(cat)}">
          <div class="kpi-view-cards">${renderKpiSidebarContent(list)}</div>
        </div>
      `;
    });
    return { tabsHtml, panelsHtml, totalCount };
  }

  function format1DayNavDate(dayOffset) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const M = d.getMonth() + 1;
    const dd = String(d.getDate()).padStart(2, "0");
    return `${M}.${dd}`;
  }

  function renderCalendar() {
    document
      .querySelectorAll(".calendar-1day-drag-drop-line")
      .forEach((el) => el.remove());
    document
      .querySelectorAll(".calendar-1day-resize-preview-line")
      .forEach((el) => el.remove());
    const grid = getCalendarGridFor1Day(dayOffset);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + dayOffset);
    nav.querySelector(".calendar-nav-month").textContent =
      format1DayNavDate(dayOffset);
    nav.querySelector(".calendar-nav-year").textContent = String(
      targetDate.getFullYear(),
    );

    calendarGrid.innerHTML = "";
    calendarGrid.className =
      "calendar-monthly-grid calendar-1day-time-grid calendar-1day-split-layout";

    const targetKey = formatDateKey(targetDate);

    const budgetColumn = document.createElement("div");
    budgetColumn.className = "calendar-1day-budget-column";
    const timeColumn = document.createElement("div");
    timeColumn.className = "calendar-1day-time-column";

    const tasks = getAllTasksForDateDisplay(targetKey);
    const budgetGoals = getBudgetGoals(targetKey);

    const createHhMmInput = () => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "time-budget-time-input";
      input.name = "calendar-time-budget";
      input.placeholder = "hh:mm";
      input.maxLength = 5;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          input.blur();
          return;
        }
        if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
      });
      input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "");
      });
      input.addEventListener("blur", () => {
        const digits = input.value.replace(/\D/g, "");
        if (digits.length === 0 || digits.length === 1) {
          input.value = "";
          return;
        }
        const pad = (s) => String(s || "").padStart(2, "0");
        const h = Math.min(23, parseInt(digits.slice(0, 2), 10) || 0);
        const m = Math.min(59, parseInt(digits.slice(2, 4), 10) || 0);
        input.value = `${pad(h)}:${pad(m)}`;
      });
      return input;
    };

    const EISENHOWER_LABELS_1DAY = {
      "urgent-important": "긴급+중요",
      "important-not-urgent": "중요+여유",
      "urgent-not-important": "긴급+덜중요",
      "not-urgent-not-important": "여유+안중요",
      "not-urgent-": "여유+안중요",
    };
    const EISENHOWER_KEY_BY_LABEL_1DAY = { "긴급+중요": "urgent-important", "중요+여유": "important-not-urgent", "긴급+덜중요": "urgent-not-important", "여유+안중요": "not-urgent-not-important" };
    const todoTable = document.createElement("table");
    todoTable.className = "calendar-1day-todo-table time-daily-budget-table";
    todoTable.innerHTML = `
      <thead><tr><th>오늘의 할일</th><th>KPI</th><th>우선순위</th></tr></thead>
      <tbody></tbody>
    `;
    const todoTbody = todoTable.querySelector("tbody");

    const EISENHOWER_ORDER = ["urgent-important", "important-not-urgent", "urgent-not-important", "not-urgent-not-important"];
    const sortedTasks = [...tasks].sort((a, b) => {
      const aq = (a.eisenhower || "").trim();
      const bq = (b.eisenhower || "").trim();
      const ai = aq ? EISENHOWER_ORDER.indexOf(aq) : 999;
      const bi = bq ? EISENHOWER_ORDER.indexOf(bq) : 999;
      return ai - bi;
    });

    sortedTasks.forEach((t) => {
      const isTodo = (t.itemType || "todo").toLowerCase() === "todo";
      const baseColor = getSectionColor(t.sectionId);
      const color = withMoreTransparency(baseColor);
      const bar = document.createElement("div");
      bar.className =
        "calendar-monthly-span-bar calendar-monthly-span-bar--todo" +
        (isTodo ? " calendar-monthly-span-bar--has-checkbox" : "");
      bar.title = t.name;
      bar.style.cssText = `--bar-bg:${color}`;
      if (isTodo) {
        bar.innerHTML = `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(t.name || "")}</span>`;
      } else {
        bar.style.setProperty("--schedule-icon-color", color);
        bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" style="border-color:${color}"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(t.name || "")}</span>`;
      }
      if (isTodo && t.done) {
        bar.classList.add("is-completed");
        bar
          .querySelector(".calendar-monthly-span-bar-checkbox-inner")
          ?.classList.add("checked");
      }
      if (isTodo) {
        bar.addEventListener("click", (e) => {
          e.stopPropagation();
          const newDone = !t.done;
          if (t.kpiTodoId && t.storageKey) {
            syncKpiTodoCompleted(t.kpiTodoId, t.storageKey, newDone);
          } else if (KPI_SECTION_IDS.includes(t.sectionId) && t.taskId) {
            updateSectionTaskDone(t.sectionId, t.taskId, newDone);
          } else if (t.sectionId?.startsWith("custom-") && t.taskId) {
            updateCustomSectionTaskDone(t.sectionId, t.taskId, newDone);
          }
          t.done = newDone;
          bar.classList.toggle("is-completed", newDone);
          bar
            .querySelector(".calendar-monthly-span-bar-checkbox-inner")
            ?.classList.toggle("checked", newDone);
          const SECTION_LABELS_LOCAL = {
            dream: "꿈",
            sideincome: "부수입",
            health: "건강",
            happy: "행복",
          };
          const updatedStats = {};
          ["dream", "sideincome", "health", "happy"].forEach((sid) => {
            const sectionTasks = tasks.filter((task) => task.sectionId === sid);
            updatedStats[sid] = {
              done: sectionTasks.filter((task) => task.done).length,
              total: sectionTasks.length,
              label: SECTION_LABELS_LOCAL[sid] || sid,
            };
          });
          refreshKpiSidebar(updatedStats);
          refreshTodoList();
        });
      }
      if (t.dueDate) {
        bar.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          createCalendarBarRevertBubble(
            e.clientX,
            e.clientY,
            t,
            () => {
              renderCalendar();
              refreshTodoList();
            },
            () => {},
          );
        });
      }

      const tr = document.createElement("tr");
      tr.dataset.taskName = (t.name || "").trim();
      const nameTd = document.createElement("td");
      nameTd.appendChild(bar);
      tr.appendChild(nameTd);
      const kpiTd = document.createElement("td");
      kpiTd.className = "calendar-1day-todo-kpi-cell";
      kpiTd.textContent = (t.classification || "").trim() || "";
      tr.appendChild(kpiTd);
      const priorityTd = document.createElement("td");
      priorityTd.className = "calendar-1day-todo-priority-cell";
      priorityTd.textContent = (t.eisenhower || "").trim()
        ? (EISENHOWER_LABELS_1DAY[(t.eisenhower || "").trim()] || (t.eisenhower || "").trim())
        : "";
      tr.appendChild(priorityTd);
      todoTbody.appendChild(tr);
    });

    const todoSection = document.createElement("div");
    todoSection.className = "calendar-1day-todo-section";
    const todoSectionHeader = document.createElement("div");
    todoSectionHeader.className = "calendar-1day-todo-section-header";
    todoSectionHeader.textContent = "2. 투두리스트 확인";
    const todoSectionBody = document.createElement("div");
    todoSectionBody.className = "calendar-1day-todo-section-body";
    todoSectionBody.appendChild(todoTable);

    todoSection.appendChild(todoSectionHeader);
    todoSection.appendChild(todoSectionBody);

    const SECTION_LABELS = {
      dream: "꿈",
      sideincome: "부수입",
      health: "건강",
      happy: "행복",
      braindump: "브레인 덤프",
    };
    const taskStats = {};
    ["dream", "sideincome", "health", "happy"].forEach((sid) => {
      const sectionTasks = tasks.filter((t) => t.sectionId === sid);
      const total = sectionTasks.length;
      const done = sectionTasks.filter((t) => t.done).length;
      taskStats[sid] = { done, total, label: SECTION_LABELS[sid] || sid };
    });

    const onScheduledUpdate = (dateStr) => {
      if (TT_SYNC_DEBUG) console.log("[TT-SYNC] onScheduledUpdate called", dateStr);
      requestAnimationFrame(() => {
        const inner = wrap.querySelector(".calendar-1day-time-table-inner");
        const budgetCol = wrap.querySelector(".calendar-1day-budget-column");
        if (!inner || !dateStr) {
          if (TT_SYNC_DEBUG) console.log("[TT-SYNC] skip: no inner or dateStr", { inner: !!inner, dateStr });
          return;
        }
        if (!budgetCol) {
          if (TT_SYNC_DEBUG) console.warn("[TT-SYNC] skip: no budgetColumn in DOM");
          return;
        }
        if (TT_SYNC_DEBUG) console.log("[TT-SYNC] building overlays from live DOM");
        const actualDateKey = wrap.dataset.actualShowsYesterday === "true" ? getYesterdayKey(dateStr) : undefined;
        const { expected, actual } = build1DayTimetableOverlays(dateStr, budgetCol, actualDateKey);
        const oldExp = inner.querySelector(
          ".calendar-1day-time-fill-overlay--expected",
        );
        const oldAct = inner.querySelector(
          ".calendar-1day-time-fill-overlay--actual",
        );
        if (oldExp) oldExp.replaceWith(expected);
        else inner.appendChild(expected);
        if (oldAct) oldAct.replaceWith(actual);
        else inner.appendChild(actual);
        const labels = [...expected.querySelectorAll(".calendar-1day-time-slot-label")].map((e) => e.textContent);
        if (TT_SYNC_DEBUG) console.log("[TT-SYNC] overlay replaced, labels:", labels);
      });
    };
    const onOverlapCleared = () => {
      requestAnimationFrame(() => {
        /* 입력 중일 때 재렌더하면 입력 필드가 사라져 '01' 등 입력이 안 되는 문제 방지 */
        if (budgetColumn.contains(document.activeElement)) return;
        renderCalendar();
      });
    };
    renderTimeBudgetTablesForCalendar(
      budgetColumn,
      targetKey,
      todoSection,
      onScheduledUpdate,
      onOverlapCleared,
    );
    calendarGrid.appendChild(budgetColumn);
    refreshKpiSidebar(taskStats);
    calendarGrid.appendChild(timeColumn);

    /* 구분선 */
    const divider = document.createElement("div");
    divider.className = "calendar-1day-divider";
    timeColumn.appendChild(divider);

    /* 시간 테이블 - 예상 시간 + 실제 시간기록 모두 표시, 생산성별 색상 */
    const timeTable = document.createElement("div");
    timeTable.className = "calendar-1day-time-table";
    const allTimeRows = loadTimeRows();
    function parseDateFromTimeStr(str) {
      if (!str || typeof str !== "string") return "";
      const m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      return m
        ? `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
        : "";
    }
    const normDate = (s) => (s || "").replace(/\//g, "-").trim().slice(0, 10);
    const actualRows = allTimeRows.filter(
      (r) =>
        normDate(r.date || parseDateFromTimeStr(r.startTime)) === targetKey,
    );
    const parseHhMmToMinutes = (s) => {
      if (!s || !s.trim()) return null;
      const m = String(s)
        .trim()
        .match(/^(\d{1,2}):?(\d{0,2})$/);
      if (!m) return null;
      return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
    };
    const parseDateTimeToMinutes = (str) => {
      if (!str || typeof str !== "string") return null;
      const m = str.match(/[T\s](\d{1,2}):?(\d{2})?/);
      if (!m) return null;
      return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
    };
    const tryOverlap = (
      slotStartMin,
      slotEndMin,
      startMin,
      endMin,
      prod,
      taskName,
    ) => {
      if (startMin == null || endMin == null) return null;
      const overlapStart = Math.max(slotStartMin, startMin);
      const overlapEnd = Math.min(slotEndMin, endMin);
      if (overlapStart < overlapEnd) {
        return {
          prod,
          taskName: taskName || "",
          overlapStartMin: overlapStart,
          overlapEndMin: overlapEnd,
        };
      }
      return null;
    };
    const SLOTS_PER_DAY = 24;
    const MIN_PER_SLOT = 60;
    const getScheduledTimesForTaskLocal = (data) => {
      if (!data) return [];
      if (Array.isArray(data.scheduledTimes))
        return data.scheduledTimes.filter((s) => s && String(s).trim());
      if (data.scheduledTime && String(data.scheduledTime).trim())
        return [String(data.scheduledTime).trim()];
      return [];
    };
    const getSlotExpected = (slotIndex) => {
      const slotStartMin = slotIndex * MIN_PER_SLOT;
      const slotEndMin = (slotIndex + 1) * MIN_PER_SLOT;
      for (const [taskName, data] of Object.entries(budgetGoals)) {
        const times = getScheduledTimesForTaskLocal(data);
        for (const st of times) {
          if (!st.trim()) continue;
          const parts = st.trim().split("-");
          const startMin = parseHhMmToMinutes(parts[0]);
          const endMin = parts[1] ? parseHhMmToMinutes(parts[1]) : null;
          if (startMin == null || endMin == null) continue;
          const opt = getTaskOptionByName(taskName);
          const prod = opt?.productivity || "other";
          const res = tryOverlap(
            slotStartMin,
            slotEndMin,
            startMin,
            endMin,
            prod,
            taskName,
          );
          if (res) return res;
        }
      }
      for (const t of tasks) {
        const st = (t.startTime || "").trim();
        const et = (t.endTime || "").trim();
        if (!st || !et) continue;
        const startMin = parseHhMmToMinutes(st);
        const endMin = parseHhMmToMinutes(et);
        if (startMin == null || endMin == null) continue;
        const prod = getTaskOptionByName(t.name)?.productivity || "other";
        const res = tryOverlap(
          slotStartMin,
          slotEndMin,
          startMin,
          endMin,
          prod,
          t.name,
        );
        if (res)
          return {
            ...res,
            _task: t,
            _taskKey: t.kpiTodoId || t.taskId || t.name,
          };
      }
      return null;
    };
    const getSlotActual = (slotIndex) => {
      const slotStartMin = slotIndex * MIN_PER_SLOT;
      const slotEndMin = (slotIndex + 1) * MIN_PER_SLOT;
      for (const r of actualRows) {
        const startMin = parseDateTimeToMinutes(r.startTime);
        const endMin = parseDateTimeToMinutes(r.endTime);
        if (startMin == null || endMin == null) continue;
        const prod =
          r.productivity ||
          getTaskOptionByName(r.taskName)?.productivity ||
          "other";
        const res = tryOverlap(
          slotStartMin,
          slotEndMin,
          startMin,
          endMin,
          prod,
          r.taskName,
        );
        if (res) return res;
      }
      return null;
    };
    const prodColorsActual = getTimeCategoryColorsForTimetable();
    const prodColorsExpected = getTimeCategoryColorsForTimetableExpected();
    const buildSpans = (getSlot) => {
      const slotInfos = [];
      for (let i = 0; i < SLOTS_PER_DAY; i++) slotInfos.push(getSlot(i));
      const spans = [];
      for (let i = 0; i < SLOTS_PER_DAY; ) {
        const cur = slotInfos[i];
        if (!cur || !cur.taskName) {
          i++;
          continue;
        }
        let endSlot = i;
        const startMin = cur.overlapStartMin ?? i * MIN_PER_SLOT;
        const key = cur._taskKey || cur.taskName;
        while (endSlot + 1 < SLOTS_PER_DAY) {
          const next = slotInfos[endSlot + 1];
          const nextKey = next?._taskKey || next?.taskName;
          if (!next || !next.taskName || nextKey !== key) break;
          endSlot++;
        }
        const last = slotInfos[endSlot];
        const endMin = last?.overlapEndMin ?? (endSlot + 1) * MIN_PER_SLOT;
        const fmt = (m) =>
          `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        spans.push({
          startSlot: i,
          endSlot,
          startMin,
          endMin,
          taskName: cur.taskName,
          prod: cur.prod,
          sectionId: cur._task?.sectionId,
          startDisplay: fmt(startMin),
          endDisplay: fmt(endMin),
          _task: cur._task,
        });
        i = endSlot + 1;
      }
      return spans;
    };
    const expectedSpans = buildSpans(getSlotExpected);
    const actualSpans = buildSpans(getSlotActual);
    timeTable.className =
      "calendar-1day-time-table calendar-1day-time-table--compare";
    const headerRow = document.createElement("div");
    headerRow.className = "calendar-1day-time-header";
    headerRow.style.gridColumn = "1 / -1";
    headerRow.style.gridRow = "1";
    const headerLabel = document.createElement("div");
    headerLabel.className = "calendar-1day-time-header-label";
    headerLabel.textContent = "";
    const headerExpected = document.createElement("div");
    headerExpected.className = "calendar-1day-time-header-cell";
    headerExpected.textContent = "예상";
    const headerActual = document.createElement("div");
    headerActual.className = "calendar-1day-time-header-cell calendar-1day-time-header-cell--actual-toggle";
    headerActual.style.cursor = "pointer";
    headerActual.title = "클릭하여 오늘/어제 실제 데이터 전환";
    const updateActualHeaderLabel = () => {
      const showYesterday = wrap.dataset.actualShowsYesterday === "true";
      headerActual.innerHTML = `<span class="calendar-1day-actual-toggle-date">${showYesterday ? "어제" : "오늘"}</span> 실제 <span class="calendar-1day-actual-toggle-icon" aria-hidden="true">⇄</span>`;
    };
    updateActualHeaderLabel();
    headerActual.addEventListener("click", () => {
      const cur = wrap.dataset.actualShowsYesterday === "true";
      wrap.dataset.actualShowsYesterday = cur ? "false" : "true";
      updateActualHeaderLabel();
      refreshTimetableOverlays({ detail: { dateStr: targetKey } });
    });
    headerRow.appendChild(headerLabel);
    headerRow.appendChild(headerExpected);
    headerRow.appendChild(headerActual);
    timeTable.appendChild(headerRow);
    for (let i = 0; i < SLOTS_PER_DAY; i++) {
      const row = document.createElement("div");
      row.className = "calendar-1day-time-row";
      row.style.gridColumn = "1";
      row.style.gridRow = `${i + 2}`;
      const timeLabel = document.createElement("div");
      timeLabel.className = "calendar-1day-time-label";
      timeLabel.textContent = `${String(i).padStart(2, "0")}:00`;
      row.appendChild(timeLabel);
      timeTable.appendChild(row);
      const slotExpected = document.createElement("div");
      slotExpected.className =
        "calendar-1day-time-slot calendar-1day-time-slot--expected";
      slotExpected.style.gridColumn = "2";
      slotExpected.style.gridRow = `${i + 2}`;
      slotExpected.dataset.slotIndex = String(i);
      timeTable.appendChild(slotExpected);
      const slotActual = document.createElement("div");
      slotActual.className =
        "calendar-1day-time-slot calendar-1day-time-slot--actual";
      slotActual.style.gridColumn = "3";
      slotActual.style.gridRow = `${i + 2}`;
      timeTable.appendChild(slotActual);
    }
    const actualDateKeyForInit = wrap.dataset.actualShowsYesterday === "true" ? getYesterdayKey(targetKey) : undefined;
    const { expected: fillOverlayExpected, actual: fillOverlayActual } =
      build1DayTimetableOverlays(targetKey, budgetColumn, actualDateKeyForInit);
    const timeTableWrap = document.createElement("div");
    timeTableWrap.className = "calendar-1day-time-table-wrap";
    const timeTableInner = document.createElement("div");
    timeTableInner.className = "calendar-1day-time-table-inner";
    timeTableInner.appendChild(timeTable);
    timeTableInner.appendChild(fillOverlayExpected);
    timeTableInner.appendChild(fillOverlayActual);
    timeTableWrap.appendChild(timeTableInner);
    timeColumn.appendChild(timeTableWrap);
    wrap.dataset.dateStr = targetKey;
  }

  nav.querySelector(".calendar-nav-today").addEventListener("click", () => {
    dayOffset = 0;
    renderCalendar();
  });
  nav.querySelector(".calendar-nav-prev").addEventListener("click", () => {
    dayOffset--;
    renderCalendar();
  });
  nav.querySelector(".calendar-nav-next").addEventListener("click", () => {
    dayOffset++;
    renderCalendar();
  });

  calendarSection.appendChild(nav);
  calendarSection.appendChild(calendarGrid);
  contentRow.appendChild(calendarSection);
  wrap.appendChild(contentRow);

  wrap.addEventListener("dragend", () => {
    window.__calendarDragDuration = 60;
    wrap
      .querySelectorAll(".calendar-day-drag-over")
      .forEach((el) => el.classList.remove("calendar-day-drag-over"));
    wrap
      .querySelectorAll(".calendar-1day-slot-drag-over")
      .forEach((el) => el.classList.remove("calendar-1day-slot-drag-over"));
    wrap
      .querySelector(".calendar-1day-time-fill-overlay--expected")
      ?.classList.remove("calendar-1day-overlay-drag-over");
    document
      .querySelectorAll(".calendar-1day-drag-drop-line")
      .forEach((el) => el.remove());
  });

  const refreshTimetableOverlays = (e) => {
    const source = e?.type || "unknown";
    const wrapInDoc = document.contains(wrap);
    const dateStr = e?.detail?.dateStr || wrap.dataset?.dateStr;
    const timeTableInner = wrap.querySelector(
      ".calendar-1day-time-table-inner",
    );
    if (TT_SYNC_DEBUG) {
      console.log("[시간가계부→캘린더] refreshTimetableOverlays", {
        source,
        wrapInDoc,
        dateStr,
        hasTimeTableInner: !!timeTableInner,
        willRefresh: wrapInDoc && timeTableInner && dateStr,
      });
    }
    if (!wrapInDoc) return;
    if (timeTableInner && dateStr) {
      const budgetCol = wrap.querySelector(".calendar-1day-budget-column");
      const actualDateKey = wrap.dataset.actualShowsYesterday === "true" ? getYesterdayKey(dateStr) : undefined;
      const { expected, actual } = build1DayTimetableOverlays(dateStr, budgetCol, actualDateKey);
      const oldExpected = timeTableInner.querySelector(
        ".calendar-1day-time-fill-overlay--expected",
      );
      const oldActual = timeTableInner.querySelector(
        ".calendar-1day-time-fill-overlay--actual",
      );
      if (oldExpected) oldExpected.replaceWith(expected);
      else timeTableInner.appendChild(expected);
      if (oldActual) oldActual.replaceWith(actual);
      else timeTableInner.appendChild(actual);
    } else if (!timeTableInner || !dateStr) {
      renderCalendar();
    }
  };

  document.addEventListener(
    "calendar-budget-scheduled-updated",
    (e) => refreshTimetableOverlays(e),
  );
  document.addEventListener(
    "calendar-time-rows-updated",
    (e) => refreshTimetableOverlays(e),
  );

  renderCalendar();

  return wrap;
}

function renderTodoView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-view-todo";

  /* 1번 레이아웃: 탭 | 플러스 버튼 | 설정 버튼 한 줄에 배치 */
  const topRow = document.createElement("div");
  topRow.className = "calendar-view-top-row calendar-view-top-row--todo calendar-view-top-row--with-settings";
  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    topRow.appendChild(tabsWrapper);
  }
  wrap.appendChild(topRow);

  const todoMain = document.createElement("div");
  todoMain.className = "calendar-monthly-main calendar-todo-main";

  const todoContent = document.createElement("div");
  todoContent.className = "calendar-todo-content";
  const todoListEl = renderTodoList({ hideHeader: true, settingsSlot: topRow });
  todoContent.appendChild(todoListEl);
  todoMain.appendChild(todoContent);

  wrap.appendChild(todoMain);

  return wrap;
}

function render1WeekView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-1week-view";

  let weekOffset = 0;

  const calendarSection = document.createElement("div");
  calendarSection.className = "calendar-monthly-main";

  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    calendarSection.appendChild(tabsWrapper);
  }

  const nav = document.createElement("div");
  nav.className = "calendar-nav";
  nav.innerHTML = `
    <span class="calendar-nav-date">
      <span class="calendar-nav-month"></span>
      <span class="calendar-nav-year"></span>
    </span>
    <div class="calendar-nav-controls">
      <button type="button" class="calendar-nav-prev" title="이전 주">&lt;</button>
      <button type="button" class="calendar-nav-today" title="이번 주">오늘</button>
      <button type="button" class="calendar-nav-next" title="다음 주">&gt;</button>
    </div>
  `;
  nav.classList.add("calendar-monthly-nav");

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-monthly-grid";

  function refreshTodoList() {
    const body = wrap.querySelector(".calendar-todo-sidebar-body");
    if (body) {
      const oldList = body.querySelector(".todo-list-in-sidebar");
      let activeIndex = 0;
      if (oldList) {
        const activeTab = oldList.querySelector(
          ".todo-category-tab:not(.todo-category-tab-add).active",
        );
        const tabs = oldList.querySelectorAll(
          ".todo-category-tab:not(.todo-category-tab-add)",
        );
        if (activeTab && tabs.length) {
          const idx = Array.from(tabs).indexOf(activeTab);
          if (idx >= 0) activeIndex = idx;
        }
        oldList.remove();
      }
      const newList = renderTodoList({
        hideToolbar: true,
        enableDragToCalendar: true,
        initialActiveTabIndex: activeIndex,
      });
      newList.classList.add("todo-list-in-sidebar");
      body.appendChild(newList);
    }
  }

  function format1WeekNavRange(week) {
    if (!week[0] || !week[6]) return "";
    const d1 = week[0];
    const d2 = week[6];
    const sameYear = d1.getFullYear() === d2.getFullYear();
    const s1 = `${d1.getMonth() + 1}.${d1.getDate()}`;
    const s2 = sameYear
      ? `${d2.getMonth() + 1}.${d2.getDate()}`
      : `${d2.getFullYear()}.${d2.getMonth() + 1}.${d2.getDate()}`;
    return `${s1} ~ ${s2}`;
  }

  function renderCalendar() {
    const week = getCalendarGridFor1Week(weekOffset);
    const grid = [week];
    nav.querySelector(".calendar-nav-month").textContent =
      format1WeekNavRange(week);
    nav.querySelector(".calendar-nav-year").textContent = week[0]
      ? String(week[0].getFullYear())
      : "";

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
    const primaryMonth = week[0]?.getMonth() ?? new Date().getMonth();
    const rangeTasks = getAllTasksWithDateRange();

    grid.forEach((weekRow) => {
      const weekWrap = document.createElement("div");
      weekWrap.className = "calendar-monthly-week-wrap";
      const weekRowEl = document.createElement("div");
      weekRowEl.className = "calendar-monthly-week";
      const weekDateKeys = weekRow
        .map((d) => (d ? formatDateKey(d) : ""))
        .filter(Boolean);
      const firstDayKey = weekDateKeys[0] || "";
      const lastDayKey = weekDateKeys[weekDateKeys.length - 1] || "";

      weekRow.forEach((date) => {
        const cell = document.createElement("div");
        cell.className = "calendar-monthly-day";
        if (!date) {
          cell.classList.add("empty");
          weekRowEl.appendChild(cell);
          return;
        }
        const key = formatDateKey(date);
        cell.dataset.date = key;
        const dayNum = document.createElement("div");
        dayNum.className = "calendar-monthly-day-num";
        dayNum.textContent = date.getDate();

        const isCurrentMonth = date.getMonth() === primaryMonth;
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
          createCalendarEventBubble(
            rect,
            key,
            () => {
              renderCalendar();
              refreshTodoList();
            },
            () => {},
          );
        });
        cell.addEventListener("dragover", (e) => {
          if (e.dataTransfer.types.includes(DRAG_TYPE_TODO_TO_CALENDAR)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            cell.classList.add("calendar-day-drag-over");
          }
        });
        cell.addEventListener("dragleave", () => {
          cell.classList.remove("calendar-day-drag-over");
        });
        cell.addEventListener("drop", (e) => {
          cell.classList.remove("calendar-day-drag-over");
          const json = e.dataTransfer.getData(DRAG_TYPE_TODO_TO_CALENDAR);
          if (!json) return;
          e.preventDefault();
          e.stopPropagation();
          let payload;
          try {
            payload = JSON.parse(json);
          } catch (_) {
            return;
          }
          const targetDate = key;
          const oldStart = (payload.startDate || "").slice(0, 10);
          const oldDue = (payload.dueDate || "").slice(0, 10);
          let newStart = "";
          let newDue = targetDate;
          if (oldStart && oldDue && oldStart !== oldDue) {
            const startD = new Date(oldStart + "T12:00:00");
            const dueD = new Date(oldDue + "T12:00:00");
            const daysDiff = Math.round((dueD - startD) / 86400000);
            newStart = targetDate;
            newDue = addDaysToDateKey(targetDate, daysDiff);
          } else if (oldStart && oldDue) {
            newStart = targetDate;
          }
          let ok = false;
          if (payload.kpiTodoId && payload.storageKey) {
            ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
              startDate: newStart,
              dueDate: newDue,
            });
          } else if (
            payload.sectionId &&
            payload.sectionId.startsWith("custom-")
          ) {
            ok = updateCustomSectionTaskDates(
              payload.sectionId,
              payload.taskId,
              newStart,
              newDue,
            );
            if (!ok && (payload.name || "").trim()) {
              ok = addCalendarTodoToCustomSection(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
              });
            }
          } else if (
            KPI_SECTION_IDS.includes(payload.sectionId) &&
            (payload.name || "").trim()
          ) {
            if (payload.kpiTodoId && payload.storageKey) {
              ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
                startDate: newStart,
                dueDate: newDue,
              });
            } else {
              ok =
                updateSectionTaskDates(
                  payload.sectionId,
                  payload.taskId,
                  newStart,
                  newDue,
                ) ||
                addSectionTaskToCalendar(payload.sectionId, {
                  taskId: payload.taskId,
                  name: payload.name,
                  startDate: newStart,
                  dueDate: newDue,
                  done: !!payload.done,
                  itemType: payload.itemType || "todo",
                });
            }
          }
          if (ok) {
            renderCalendar();
            refreshTodoList();
          }
        });
        weekRowEl.appendChild(cell);
      });

      const barsEl = document.createElement("div");
      barsEl.className = "calendar-monthly-bars";
      const BAR_HEIGHT = window.matchMedia("(max-width: 767px)").matches ? 0.95 : 2.05;
      const overlaps = (a, b) =>
        a.left < b.left + b.width && b.left < a.left + a.width;
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
        const baseColor = getSectionColor(t.sectionId);
        const color = withMoreTransparency(baseColor);
        const isFirstSegment = barStart === t.startDate;
        allBars.push({
          left,
          width,
          name: t.name,
          color,
          isSingleDay: false,
          isFirstSegment,
          itemType: t.itemType || "todo",
          done: !!t.done,
          kpiTodoId: t.kpiTodoId,
          storageKey: t.storageKey,
          taskId: t.taskId,
          sectionId: t.sectionId,
          startDate: t.startDate,
          dueDate: t.dueDate,
        });
      });
      weekDateKeys.forEach((dateKey, dayIdx) => {
        getTasksForDate(dateKey, true).forEach((t) => {
          const left = (dayIdx / 7) * 100 + CELL_GAP / 7;
          const width = (1 / 7) * 100 - (CELL_GAP * 2) / 7;
          const baseColor = getSectionColor(t.sectionId);
          const color = withMoreTransparency(baseColor);
          allBars.push({
            left,
            width,
            name: t.name,
            color,
            isSingleDay: true,
            dayIdx,
            dateKey,
            itemType: t.itemType || "todo",
            done: !!t.done,
            kpiTodoId: t.kpiTodoId,
            storageKey: t.storageKey,
            taskId: t.taskId,
            sectionId: t.sectionId,
            startDate: t.startDate || "",
            dueDate: t.dueDate || dateKey,
          });
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
      const barsPerDay = weekDateKeys.map((_, dayIdx) =>
        allBars
          .filter((b) => b.isSingleDay && b.dayIdx === dayIdx)
          .sort((a, b) => a.row - b.row),
      );
      const effectiveMaxPerDay = weekDateKeys.map((_, dayIdx) => {
        const n = barsPerDay[dayIdx]?.length || 0;
        return n > MAX_VISIBLE_BARS_PER_DAY ? MAX_VISIBLE_BARS_PER_DAY - 1 : MAX_VISIBLE_BARS_PER_DAY;
      });
      allBars.forEach((b) => {
        if (b.isSingleDay && b.dayIdx != null) {
          const dayBars = barsPerDay[b.dayIdx];
          const idx = dayBars.indexOf(b);
          b.isOverflow = idx >= effectiveMaxPerDay[b.dayIdx];
        }
      });
      const visibleBars = allBars.filter((b) => !b.isOverflow);
      const maxRow = visibleBars.length ? Math.max(...visibleBars.map((b) => b.row), 0) : 0;
      const rowsNeeded = maxRow + 1;
      const BARS_TOP = window.matchMedia("(max-width: 767px)").matches ? 1.35 : 1.75;
      const BOTTOM_PAD = 0.6;
      const DEFAULT_ROW_HEIGHT_REM = BARS_TOP + 3 * BAR_HEIGHT + BOTTOM_PAD;
      const requiredHeight = BARS_TOP + rowsNeeded * BAR_HEIGHT + BOTTOM_PAD;
      weekRowEl.style.minHeight = `${Math.max(DEFAULT_ROW_HEIGHT_REM, requiredHeight)}rem`;
      const barsWithRow = allBars;
      barsWithRow.forEach((b) => {
        const isTodo = (b.itemType || "todo").toLowerCase() === "todo";
        const bar = document.createElement("div");
        const showCheckbox = isTodo && (b.isSingleDay || b.isFirstSegment);
        bar.className =
          "calendar-monthly-span-bar" +
          (b.isSingleDay
            ? " calendar-monthly-span-bar--todo"
            : " calendar-monthly-span-bar--range") +
          (showCheckbox ? " calendar-monthly-span-bar--has-checkbox" : "") +
          (b.isOverflow ? " calendar-monthly-span-bar--overflow" : "");
        bar.title = b.name;
        bar.style.cssText = `left:${b.left}%;width:${b.width}%;--bar-bg:${b.color};top:${0.15 + b.row * BAR_HEIGHT}rem`;
        if (b.isSingleDay) {
          if (isTodo) {
            bar.innerHTML = `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            bar.innerHTML = `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          }
          bar.dataset.date = b.dateKey || "";
          bar.dataset.sectionId = b.sectionId || "";
          bar.dataset.taskId = b.taskId || "";
          bar.dataset.kpiTodoId = b.kpiTodoId || "";
          bar.dataset.storageKey = b.storageKey || "";
          bar.dataset.done = b.done ? "true" : "false";
          bar.dataset.itemType = b.itemType || "todo";
          const toggleDone = () => {
            let newDone = !bar.dataset.done;
            if (b.kpiTodoId && b.storageKey) {
              syncKpiTodoCompleted(b.kpiTodoId, b.storageKey, newDone);
            } else if (b.sectionId && b.taskId) {
              if ((b.sectionId || "").startsWith("custom-")) {
                updateCustomSectionTaskDone(b.sectionId, b.taskId, newDone);
              } else {
                updateSectionTaskDone(b.sectionId, b.taskId, newDone);
              }
            }
            bar.dataset.done = newDone ? "true" : "false";
            bar.classList.toggle("is-completed", newDone);
            bar
              .querySelector(".calendar-monthly-span-bar-checkbox-inner")
              ?.classList.toggle("checked", newDone);
            renderCalendar();
            refreshTodoList();
          };
          if (!window.matchMedia("(max-width: 767px)").matches) bar.addEventListener("click", toggleDone);
        } else {
          if (isTodo) {
            bar.innerHTML = showCheckbox
              ? `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`
              : "";
          } else {
            bar.innerHTML = b.isFirstSegment ? `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>` : "";
          }
          if (isTodo && b.done) {
            bar.classList.add("is-completed");
            bar
              .querySelector(".calendar-monthly-span-bar-checkbox-inner")
              ?.classList.add("checked");
          }
          if (isTodo) {
            bar.addEventListener("click", (e) => {
              e.stopPropagation();
              const newDone = !b.done;
              if (b.kpiTodoId && b.storageKey) {
                syncKpiTodoCompleted(b.kpiTodoId, b.storageKey, newDone);
              } else if (b.sectionId && b.taskId) {
                if ((b.sectionId || "").startsWith("custom-")) {
                  updateCustomSectionTaskDone(b.sectionId, b.taskId, newDone);
                } else {
                  updateSectionTaskDone(b.sectionId, b.taskId, newDone);
                }
              }
              b.done = newDone;
              bar.classList.toggle("is-completed", newDone);
              bar
                .querySelector(".calendar-monthly-span-bar-checkbox-inner")
                ?.classList.toggle("checked", newDone);
              renderCalendar();
              refreshTodoList();
            });
          }
        }
        if (!b.isSingleDay && b.startDate && b.dueDate) {
          bar.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            createCalendarBarDateEditBubble(
              e.clientX,
              e.clientY,
              b,
              () => {
                renderCalendar();
                refreshTodoList();
              },
              () => {},
            );
          });
        }
        if (b.isSingleDay && b.dueDate) {
          bar.draggable = true;
          bar.classList.add("calendar-monthly-span-bar--draggable");
          bar.addEventListener("dragstart", (e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData(
              "application/json",
              JSON.stringify({
                name: b.name,
                dueDate: b.dueDate,
                startDate: b.startDate || "",
                kpiTodoId: b.kpiTodoId,
                storageKey: b.storageKey,
                taskId: b.taskId,
                sectionId: b.sectionId,
                done: !!b.done,
                itemType: b.itemType || "todo",
              }),
            );
            e.dataTransfer.setData("text/plain", b.name || "");
            bar.classList.add("calendar-monthly-span-bar--dragging");
          });
          bar.addEventListener("dragend", () => {
            bar.classList.remove("calendar-monthly-span-bar--dragging");
          });
          bar.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            createCalendarBarRevertBubble(
              e.clientX,
              e.clientY,
              b,
              () => {
                renderCalendar();
                refreshTodoList();
              },
              () => {},
            );
          });
        }
        barsEl.appendChild(bar);
      });
      const moreEl = document.createElement("div");
      moreEl.className = "calendar-day-more-overlay";
      moreEl.style.cssText =
        "display:grid;grid-template-columns:repeat(7,1fr);position:absolute;inset:0;pointer-events:none;align-content:flex-end;padding:0.2rem 0;";
      weekDateKeys.forEach((dateKey, dayIdx) => {
        const totalCount = barsPerDay[dayIdx]?.length || 0;
        const effectiveMax = effectiveMaxPerDay[dayIdx] ?? MAX_VISIBLE_BARS_PER_DAY;
        const overflowCount = totalCount - effectiveMax;
        const showCount = overflowCount > 0;
        const displayCount = overflowCount;
        const cell = weekRowEl.querySelector(
          `.calendar-monthly-day[data-date="${dateKey}"]`,
        );
        const slot = document.createElement("div");
        slot.style.cssText =
          "display:flex;justify-content:center;align-items:flex-end;padding:0 0.15rem;";
        if (showCount && cell) {
          const moreBtn = document.createElement("button");
          moreBtn.type = "button";
          moreBtn.className = "calendar-day-more-btn";
          moreBtn.style.pointerEvents = "auto";
          moreBtn.textContent = `+${displayCount}`;
          moreBtn.title = "더보기";
          moreBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const rect = cell.getBoundingClientRect();
            const tasks = getAllTasksForDateDisplay(dateKey);
            createCalendarDayExpandBubble(rect, dateKey, tasks, () => {});
          });
          slot.appendChild(moreBtn);
        }
        moreEl.appendChild(slot);
      });
      weekWrap.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (
          e.dataTransfer.types.includes(DRAG_TYPE_TODO_TO_CALENDAR) ||
          e.dataTransfer.types.includes("application/json")
        ) {
          e.dataTransfer.dropEffect = "move";
          let cell = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest(".calendar-monthly-day:not(.empty)");
          if (!cell) {
            const cells = weekRowEl.querySelectorAll(
              ".calendar-monthly-day:not(.empty)",
            );
            for (const c of cells) {
              const r = c.getBoundingClientRect();
              if (
                e.clientX >= r.left &&
                e.clientX <= r.right &&
                e.clientY >= r.top &&
                e.clientY <= r.bottom
              ) {
                cell = c;
                break;
              }
            }
          }
          weekWrap
            .querySelectorAll(".calendar-day-drag-over")
            .forEach((el) => el.classList.remove("calendar-day-drag-over"));
          if (cell) cell.classList.add("calendar-day-drag-over");
        }
      });
      weekWrap.addEventListener("dragleave", (e) => {
        if (!weekWrap.contains(e.relatedTarget)) {
          weekWrap
            .querySelectorAll(".calendar-day-drag-over")
            .forEach((el) => el.classList.remove("calendar-day-drag-over"));
        }
      });
      weekWrap.addEventListener("drop", (e) => {
        weekWrap
          .querySelectorAll(".calendar-day-drag-over")
          .forEach((el) => el.classList.remove("calendar-day-drag-over"));
        e.preventDefault();
        let json =
          e.dataTransfer.getData(DRAG_TYPE_TODO_TO_CALENDAR) ||
          e.dataTransfer.getData("application/json");
        if (!json) return;
        let payload;
        try {
          payload = JSON.parse(json);
        } catch (_) {
          return;
        }
        let cell = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest(".calendar-monthly-day:not(.empty)");
        if (!cell) {
          const cells = weekRowEl.querySelectorAll(
            ".calendar-monthly-day:not(.empty)",
          );
          for (const c of cells) {
            const r = c.getBoundingClientRect();
            if (
              e.clientX >= r.left &&
              e.clientX <= r.right &&
              e.clientY >= r.top &&
              e.clientY <= r.bottom
            ) {
              cell = c;
              break;
            }
          }
        }
        if (!cell) return;
        const targetDate = cell.dataset.date || "";
        if (!targetDate) return;
        const oldStart = (payload.startDate || "").slice(0, 10);
        const oldDue = (payload.dueDate || "").slice(0, 10);
        let newStart = "";
        let newDue = targetDate;
        if (oldStart && oldDue && oldStart !== oldDue) {
          const startD = new Date(oldStart + "T12:00:00");
          const dueD = new Date(oldDue + "T12:00:00");
          const daysDiff = Math.round((dueD - startD) / 86400000);
          newStart = targetDate;
          newDue = addDaysToDateKey(targetDate, daysDiff);
        } else if (oldStart && oldDue) {
          newStart = targetDate;
        }
        let ok = false;
        if (payload.kpiTodoId && payload.storageKey) {
          ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
            startDate: newStart,
            dueDate: newDue,
          });
        } else if (
          payload.sectionId &&
          payload.sectionId.startsWith("custom-")
        ) {
          ok = updateCustomSectionTaskDates(
            payload.sectionId,
            payload.taskId,
            newStart,
            newDue,
          );
          if (!ok && (payload.name || "").trim()) {
            ok = addCalendarTodoToCustomSection(payload.sectionId, {
              taskId: payload.taskId,
              name: payload.name,
              startDate: newStart,
              dueDate: newDue,
              done: !!payload.done,
              itemType: payload.itemType || "todo",
            });
          }
        } else if (
          KPI_SECTION_IDS.includes(payload.sectionId) &&
          (payload.name || "").trim()
        ) {
          if (payload.kpiTodoId && payload.storageKey) {
            ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
              startDate: newStart,
              dueDate: newDue,
            });
          } else {
            ok =
              updateSectionTaskDates(
                payload.sectionId,
                payload.taskId,
                newStart,
                newDue,
              ) ||
              addSectionTaskToCalendar(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
              });
          }
        }
        if (ok) {
          renderCalendar();
          refreshTodoList();
        }
      });
      weekWrap.appendChild(weekRowEl);
      weekWrap.appendChild(barsEl);
      weekWrap.appendChild(moreEl);
      calendarGrid.appendChild(weekWrap);
    });
  }

  nav.querySelector(".calendar-nav-today").addEventListener("click", () => {
    weekOffset = 0;
    renderCalendar();
  });
  nav.querySelector(".calendar-nav-prev").addEventListener("click", () => {
    weekOffset--;
    renderCalendar();
  });
  nav.querySelector(".calendar-nav-next").addEventListener("click", () => {
    weekOffset++;
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
      <span class="calendar-todo-sidebar-title">날짜 잡아서 해야 할일</span>
      <button type="button" class="calendar-todo-sidebar-collapse" title="사이드바 접기">
        <span class="calendar-todo-sidebar-collapse-text">접기</span>
      </button>
    </div>
    <div class="calendar-todo-sidebar-body">
      <div class="calendar-todo-sidebar-main"></div>
      <div class="calendar-todo-sidebar-overdue"></div>
    </div>
  `;
  const body = todoSidebar.querySelector(".calendar-todo-sidebar-body");
  const mainWrap = body.querySelector(".calendar-todo-sidebar-main");
  const overdueWrapEl = body.querySelector(".calendar-todo-sidebar-overdue");
  const todoListEl = renderTodoList({
    hideToolbar: true,
    enableDragToCalendar: true,
    eisenhowerFilter: "important-not-urgent",
  });
  todoListEl.classList.add("todo-list-in-sidebar");
  mainWrap.appendChild(todoListEl);
  overdueWrapEl.appendChild(renderOverdueSection({ enableDragToCalendar: true }));
  (() => {
    const collapseBtn = todoSidebar.querySelector(".calendar-todo-sidebar-collapse");
    const titleEl = todoSidebar.querySelector(".calendar-todo-sidebar-title");
    const collapseTextEl = todoSidebar.querySelector(".calendar-todo-sidebar-collapse-text");
    collapseBtn.addEventListener("click", () => {
      sidebarCollapsed = !sidebarCollapsed;
      todoSidebar.classList.toggle("collapsed", sidebarCollapsed);
      collapseBtn.title = sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기";
      titleEl.textContent = sidebarCollapsed ? "할일" : "날짜 잡아서 해야 할일";
      if (collapseTextEl) collapseTextEl.textContent = sidebarCollapsed ? "할일" : "접기";
    });
  })();
  wrap.appendChild(todoSidebar);

  wrap.addEventListener("dragend", () => {
    wrap
      .querySelectorAll(".calendar-day-drag-over")
      .forEach((el) => el.classList.remove("calendar-day-drag-over"));
  });

  renderCalendar();

  return wrap;
}

/** 연간 뷰: 왼쪽 월 라벨, 오른쪽 해당 월 날짜 셀 한 행 (Year Planner 구조), 요일 미표시, 클릭 시 할일 목록 버블 */
function renderAnnualView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-annual-view";

  let currentYear = new Date().getFullYear();
  const todayKey = formatDateKey(new Date());

  const calendarSection = document.createElement("div");
  calendarSection.className = "calendar-monthly-main calendar-annual-main";
  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    calendarSection.appendChild(tabsWrapper);
  }

  const nav = document.createElement("div");
  nav.className = "calendar-monthly-nav calendar-annual-nav";
  nav.innerHTML = `
    <span class="calendar-nav-date">
      <span class="calendar-nav-year">${currentYear}</span>
      <span class="calendar-annual-label">년</span>
    </span>
    <div class="calendar-nav-controls">
      <button type="button" class="calendar-nav-prev" title="이전 해">&lt;</button>
      <button type="button" class="calendar-nav-today" title="올해">오늘</button>
      <button type="button" class="calendar-nav-next" title="다음 해">&gt;</button>
    </div>
  `;
  calendarSection.appendChild(nav);

  const gridWrap = document.createElement("div");
  gridWrap.className = "calendar-annual-grid-wrap";
  const table = document.createElement("div");
  table.className = "calendar-annual-table";

  function renderYear() {
    nav.querySelector(".calendar-nav-year").textContent = String(currentYear);
    table.innerHTML = "";

    for (let month = 0; month < 12; month++) {
      const lastDay = new Date(currentYear, month + 1, 0).getDate();
      const row = document.createElement("div");
      row.className = "calendar-annual-row";

      const monthLabel = document.createElement("div");
      monthLabel.className = "calendar-annual-row-month";
      monthLabel.textContent = MONTH_NAMES[month];
      row.appendChild(monthLabel);

      const daysRow = document.createElement("div");
      daysRow.className = "calendar-annual-row-days";
      for (let d = 1; d <= lastDay; d++) {
        const date = new Date(currentYear, month, d);
        const key = formatDateKey(date);
        const dow = date.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const cell = document.createElement("div");
        cell.className = "calendar-annual-cell";
        cell.dataset.dateKey = key;
        if (key === todayKey) cell.classList.add("today");
        if (isWeekend) cell.classList.add("weekend");
        const dayNum = document.createElement("span");
        dayNum.className = "calendar-annual-cell-num";
        dayNum.textContent = d;
        cell.appendChild(dayNum);
        if (getTasksForDate(key).length > 0) {
          const dot = document.createElement("span");
          dot.className = "calendar-annual-cell-dot";
          cell.appendChild(dot);
        }
        cell.addEventListener("click", () => {
          const rect = cell.getBoundingClientRect();
          const tasks = getAllTasksForDateDisplay(key);
          createCalendarDayExpandBubble(rect, key, tasks, () => {});
        });
        daysRow.appendChild(cell);
      }
      row.appendChild(daysRow);
      table.appendChild(row);
    }
  }

  renderYear();
  gridWrap.appendChild(table);
  calendarSection.appendChild(gridWrap);
  wrap.appendChild(calendarSection);

  nav.querySelector(".calendar-nav-today").addEventListener("click", () => {
    currentYear = new Date().getFullYear();
    renderYear();
  });
  nav.querySelector(".calendar-nav-prev").addEventListener("click", () => {
    currentYear--;
    renderYear();
  });
  nav.querySelector(".calendar-nav-next").addEventListener("click", () => {
    currentYear++;
    renderYear();
  });

  return wrap;
}

const CALENDAR_SUB_VIEWS = [
  { id: "monthly", label: "월별" },
  { id: "2week", label: "2주" },
  { id: "1week", label: "1주" },
  { id: "annual", label: "연간" },
];

const MOBILE_SCHEDULE_CAL_SUB_VIEWS = [
  { id: "monthly", label: "월별" },
  { id: "1week", label: "1주" },
];

/**
 * 할일/일정 > 날짜 정하기 하위 뷰(월별·2주·1주·연간) 공통 셸
 * @param {HTMLElement|null} tabsElement 상단 할일/일정 1~4번 탭(없으면 null)
 * @param {{ subViewsList?: {id:string,label:string}[], storageKey?: string, forceInitialMonthlyOnMobile?: boolean }} opts
 */
function createCalendarSubViewRoot(tabsElement, opts = {}) {
  const subViewsList = opts.subViewsList || CALENDAR_SUB_VIEWS;
  const storageKey = opts.storageKey || "calendar-sub-view";
  const forceInitialMonthlyOnMobile = !!opts.forceInitialMonthlyOnMobile;

  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-view-with-subtabs";

  const topRow = document.createElement("div");
  topRow.className = "calendar-view-top-row";
  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    topRow.appendChild(tabsWrapper);
  }

  const subTabs = document.createElement("div");
  subTabs.className = "calendar-sub-tabs";
  subViewsList.forEach((v, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "time-view-tab calendar-sub-tab" + (i === 0 ? " active" : "");
    btn.dataset.subView = v.id;
    const labelSpan = document.createElement("span");
    labelSpan.className = "calendar-sub-tab-label";
    labelSpan.textContent = v.label;
    btn.appendChild(labelSpan);
    subTabs.appendChild(btn);
  });
  wrap.appendChild(topRow);

  const contentArea = document.createElement("div");
  contentArea.className = "calendar-view-content-area";
  wrap.appendChild(contentArea);

  const savedSubView = localStorage.getItem(storageKey) || "monthly";
  const isMobile = window.matchMedia("(max-width: 767px)").matches;
  const inList = subViewsList.some((v) => v.id === savedSubView);
  const initialSubView =
    forceInitialMonthlyOnMobile && isMobile
      ? "monthly"
      : inList
        ? savedSubView
        : subViewsList[0]?.id || "monthly";

  function placeSubTabsInNav() {
    const nav = contentArea.querySelector(".calendar-monthly-nav");
    const controls = contentArea.querySelector(".calendar-nav-controls");
    if (nav && controls && subTabs.parentNode !== nav) {
      subTabs.remove();
      nav.insertBefore(subTabs, controls);
    }
  }

  function renderSubView(subViewId) {
    if (subTabs.parentNode) subTabs.remove();
    contentArea.innerHTML = "";
    dateDebug("renderSubView: saving before switch", {
      subViewId,
      hasSidebar: !!contentArea.querySelector(".calendar-todo-sidebar-body"),
    });
    saveTodoListBeforeUnmount(contentArea);
    if (subViewId === "monthly") {
      contentArea.appendChild(renderMonthlyView(null));
    } else if (subViewId === "2week") {
      contentArea.appendChild(render2WeekView(null));
    } else if (subViewId === "1week") {
      contentArea.appendChild(render1WeekView(null));
    } else if (subViewId === "annual") {
      contentArea.appendChild(renderAnnualView(null));
    }
    placeSubTabsInNav();
    localStorage.setItem(storageKey, subViewId);
  }

  subTabs.querySelectorAll(".calendar-sub-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      subTabs
        .querySelectorAll(".calendar-sub-tab")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderSubView(btn.dataset.subView);
    });
  });

  const activeBtn = subTabs.querySelector(
    `[data-sub-view="${initialSubView}"]`,
  );
  if (activeBtn) {
    subTabs
      .querySelectorAll(".calendar-sub-tab")
      .forEach((b) => b.classList.remove("active"));
    activeBtn.classList.add("active");
  }
  renderSubView(initialSubView);

  return wrap;
}

function renderCalendarView(tabsElement) {
  return createCalendarSubViewRoot(tabsElement, {
    subViewsList: CALENDAR_SUB_VIEWS,
    storageKey: "calendar-sub-view",
    forceInitialMonthlyOnMobile: true,
  });
}

/** 모바일 하단 '캘린더' 탭: 할일/일정의 월별·1주 뷰만 (상단 서브탭만 표시) */
export function renderMobileScheduleCalendar() {
  const el = document.createElement("div");
  el.className =
    "app-tab-panel-content calendar-view calendar-view--mobile-schedule";

  const header = document.createElement("div");
  header.className = "calendar-view-header dream-view-header-wrap";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "SCHEDULE";
  const titleEl = document.createElement("h1");
  titleEl.className = "dream-view-title calendar-view-title";
  titleEl.textContent = "캘린더";
  header.appendChild(label);
  header.appendChild(titleEl);
  el.appendChild(header);

  const contentWrap = document.createElement("div");
  contentWrap.className = "calendar-content-wrap";
  contentWrap.appendChild(
    createCalendarSubViewRoot(null, {
      subViewsList: MOBILE_SCHEDULE_CAL_SUB_VIEWS,
      storageKey: "calendar-mobile-schedule-sub-view",
      forceInitialMonthlyOnMobile: false,
    }),
  );
  el.appendChild(contentWrap);
  return el;
}

function renderEisenhowerView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-view-eisenhower";

  /* 1번 레이아웃: 탭을 최상단 전체 영역에 배치 */
  const topRow = document.createElement("div");
  topRow.className = "calendar-view-top-row calendar-view-top-row--eisenhower";
  if (tabsElement) {
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    topRow.appendChild(tabsWrapper);
  }
  wrap.appendChild(topRow);

  const contentRow = document.createElement("div");
  contentRow.className = "calendar-view-eisenhower-content-row";

  const calendarSection = document.createElement("div");
  calendarSection.className = "calendar-monthly-main";

  const eisenhowerWrap = document.createElement("div");
  eisenhowerWrap.className = "calendar-eisenhower-wrap";
  eisenhowerWrap.innerHTML = `
    <div class="calendar-eisenhower-matrix">
      <div class="calendar-eisenhower-quadrant calendar-eisenhower-q1" data-quadrant="urgent-important">
        <span class="calendar-eisenhower-quadrant-badge">0</span>
        <h3 class="calendar-eisenhower-quadrant-title">지금 당장 해야 해</h3>
        <span class="calendar-eisenhower-quadrant-tag">긴급 + 중요</span>
        <ul class="calendar-eisenhower-quadrant-tasks"></ul>
      </div>
      <div class="calendar-eisenhower-quadrant calendar-eisenhower-q2" data-quadrant="important-not-urgent">
        <span class="calendar-eisenhower-quadrant-badge">0</span>
        <h3 class="calendar-eisenhower-quadrant-title">날짜 잡아서 해</h3>
        <span class="calendar-eisenhower-quadrant-tag">중요 + 여유 있음</span>
        <ul class="calendar-eisenhower-quadrant-tasks"></ul>
      </div>
      <div class="calendar-eisenhower-quadrant calendar-eisenhower-q3" data-quadrant="urgent-not-important">
        <span class="calendar-eisenhower-quadrant-badge">0</span>
        <h3 class="calendar-eisenhower-quadrant-title">다른 사람한테 맡겨</h3>
        <span class="calendar-eisenhower-quadrant-tag">긴급 + 별로 안 중요</span>
        <ul class="calendar-eisenhower-quadrant-tasks"></ul>
      </div>
      <div class="calendar-eisenhower-quadrant calendar-eisenhower-q4" data-quadrant="not-urgent-not-important">
        <span class="calendar-eisenhower-quadrant-badge">0</span>
        <h3 class="calendar-eisenhower-quadrant-title">그냥 하지 마</h3>
        <span class="calendar-eisenhower-quadrant-tag">별로 안 중요 + 여유 있음</span>
        <ul class="calendar-eisenhower-quadrant-tasks"></ul>
      </div>
    </div>
  `;
  eisenhowerWrap.style.flex = "1 1 0";
  eisenhowerWrap.style.minWidth = "0";
  eisenhowerWrap.style.minHeight = "0";
  calendarSection.appendChild(eisenhowerWrap);

  contentRow.appendChild(calendarSection);

  const EISENHOWER_SIDEBAR_WIDTH_KEY = "calendar-eisenhower-sidebar-width";
  const DEFAULT_SIDEBAR_WIDTH = 420;
  const MIN_SIDEBAR_WIDTH = 200;
  const MAX_SIDEBAR_WIDTH = 600;

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "calendar-eisenhower-resize-handle";
  resizeHandle.title = "드래그하여 너비 조절";
  contentRow.appendChild(resizeHandle);

  const todoSidebar = document.createElement("aside");
  todoSidebar.className = "calendar-todo-sidebar";
  let sidebarCollapsed = false;
  const savedWidth = parseInt(
    localStorage.getItem(EISENHOWER_SIDEBAR_WIDTH_KEY),
    10,
  );
  const sidebarWidth = Number.isFinite(savedWidth)
    ? Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, savedWidth))
    : DEFAULT_SIDEBAR_WIDTH;
  todoSidebar.style.width = `${sidebarWidth}px`;
  todoSidebar.innerHTML = `
    <div class="calendar-todo-sidebar-header">
      <span class="calendar-todo-sidebar-title">할일</span>
      <button type="button" class="calendar-todo-sidebar-collapse" title="사이드바 접기">
        <span class="calendar-todo-sidebar-collapse-text">접기</span>
      </button>
    </div>
    <div class="calendar-todo-sidebar-body" title="우선순위 취소: 사분면 항목을 여기로 드래그"></div>
  `;
  const todoListEl = renderTodoListForEisenhowerSidebar({
    enableDragToEisenhower: true,
  });
  todoSidebar
    .querySelector(".calendar-todo-sidebar-body")
    .appendChild(todoListEl);
  const titleEl = todoSidebar.querySelector(".calendar-todo-sidebar-title");
  const collapseTextEl = todoSidebar.querySelector(".calendar-todo-sidebar-collapse-text");
  todoSidebar
    .querySelector(".calendar-todo-sidebar-collapse")
    .addEventListener("click", () => {
      sidebarCollapsed = !sidebarCollapsed;
      todoSidebar.classList.toggle("collapsed", sidebarCollapsed);
      titleEl.textContent = "할일";
      if (collapseTextEl) collapseTextEl.textContent = sidebarCollapsed ? "할일" : "접기";
      if (sidebarCollapsed) {
        todoSidebar.style.width = "";
      } else {
        const w = parseInt(
          localStorage.getItem(EISENHOWER_SIDEBAR_WIDTH_KEY),
          10,
        );
        todoSidebar.style.width = Number.isFinite(w)
          ? `${Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, w))}px`
          : `${sidebarWidth}px`;
      }
      todoSidebar.querySelector(".calendar-todo-sidebar-collapse").title =
        sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기";
    });
  contentRow.appendChild(todoSidebar);
  wrap.appendChild(contentRow);

  let resizeStartX = 0;
  let resizeStartWidth = 0;
  resizeHandle.addEventListener("mousedown", (e) => {
    if (sidebarCollapsed) return;
    e.preventDefault();
    resizeStartX = e.clientX;
    resizeStartWidth = todoSidebar.offsetWidth;
    resizeHandle.classList.add("resizing");
    const onMove = (ev) => {
      const delta = ev.clientX - resizeStartX;
      const newWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, resizeStartWidth - delta),
      );
      todoSidebar.style.width = `${newWidth}px`;
    };
    const onUp = () => {
      resizeHandle.classList.remove("resizing");
      const w = todoSidebar.offsetWidth;
      localStorage.setItem(EISENHOWER_SIDEBAR_WIDTH_KEY, String(w));
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  function getAllTasksForEisenhower() {
    const tasks = [];
    getKpiTodosAsTasks().forEach((t) =>
      tasks.push({ ...t, taskId: t.kpiTodoId || t.taskId || "" }),
    );
    try {
      const sectionRaw = localStorage.getItem(SECTION_TASKS_KEY);
      if (sectionRaw) {
        const obj = JSON.parse(sectionRaw);
        KPI_SECTION_IDS.forEach((sectionId) => {
          const arr = obj[sectionId];
          if (!Array.isArray(arr)) return;
          const sectionLabel =
            {
              dream: "꿈",
              sideincome: "부수입",
              health: "건강",
              happy: "행복",
              braindump: "브레인 덤프",
            }[sectionId] || sectionId;
          arr
            .filter((t) => (t.name || "").trim() !== "")
            .forEach((t) =>
              tasks.push({
                ...t,
                sectionId,
                sectionLabel,
                taskId: t.taskId || "",
                isKpiTodo: false,
              }),
            );
        });
      }
      const customRaw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
      if (customRaw) {
        const obj = JSON.parse(customRaw);
        getCustomSections().forEach((s) => {
          const arr = obj[s.id];
          if (!Array.isArray(arr)) return;
          arr
            .filter((t) => (t.name || "").trim() !== "")
            .forEach((t) =>
              tasks.push({
                ...t,
                sectionId: s.id,
                sectionLabel: s.label || s.id,
                taskId: t.taskId || "",
                isKpiTodo: false,
              }),
            );
        });
      }
    } catch (_) {}
    return tasks;
  }

  const EISENHOWER_LABELS = {
    "urgent-important": "긴급+중요",
    "important-not-urgent": "중요+여유",
    "urgent-not-important": "긴급+덜중요",
    "not-urgent-not-important": "여유+안중요",
  };
  /** 한글 레이블 → quadrant 키 (역매핑, 기존 데이터 호환) */
  const EISENHOWER_KEY_BY_LABEL = {
    "긴급+중요": "urgent-important",
    "중요+여유": "important-not-urgent",
    "긴급+덜중요": "urgent-not-important",
    "여유+안중요": "not-urgent-not-important",
  };

  function updateQuadrants() {
    const allTasks = getAllTasksForEisenhower();
    const byQuadrant = {
      "urgent-important": [],
      "important-not-urgent": [],
      "urgent-not-important": [],
      "not-urgent-not-important": [],
    };
    allTasks.forEach((t) => {
      const raw = (t.eisenhower || "").trim();
      const q = EISENHOWER_KEY_BY_LABEL[raw] || raw;
      if (byQuadrant[q]) byQuadrant[q].push(t);
    });
    eisenhowerWrap
      .querySelectorAll(".calendar-eisenhower-quadrant")
      .forEach((quad) => {
        const q = quad.dataset.quadrant;
        const list = byQuadrant[q] || [];
        const ul = quad.querySelector(".calendar-eisenhower-quadrant-tasks");
        const badge = quad.querySelector(".calendar-eisenhower-quadrant-badge");
        if (ul) {
          ul.innerHTML = "";
          list.forEach((t) => {
            const li = document.createElement("li");
            li.className = "calendar-eisenhower-task-item";
            li.draggable = true;
            li.dataset.taskId = t.taskId || "";
            li.dataset.sectionId = t.sectionId || "";
            li.dataset.isKpiTodo = t.isKpiTodo ? "true" : "false";
            li.dataset.kpiTodoId = t.kpiTodoId || "";
            li.dataset.kpiStorageKey = t.storageKey || "";
            const cb = document.createElement("span");
            cb.className = "calendar-eisenhower-task-checkbox";
            if (t.done) {
              cb.textContent = "✓";
              cb.classList.add("checked");
            }
            const nameSpan = document.createElement("span");
            nameSpan.className = "calendar-eisenhower-task-name";
            nameSpan.textContent = (t.name || "").trim() || "—";
            li.appendChild(cb);
            li.appendChild(nameSpan);
            li.addEventListener("dragstart", (e) => {
              e.stopPropagation();
              const rowTaskId =
                t.isKpiTodo && t.kpiTodoId && t.storageKey
                  ? `kpi-${t.kpiTodoId}-${t.storageKey}`
                  : t.taskId || "";
              const payload = {
                taskId: rowTaskId,
                sectionId: t.sectionId || "",
                name: (t.name || "").trim(),
                startDate: (t.startDate || "").slice(0, 10) || "",
                isKpiTodo: !!t.isKpiTodo,
                kpiTodoId: t.kpiTodoId || "",
                storageKey: t.storageKey || "",
              };
              e.dataTransfer.setData(
                DRAG_TYPE_TODO_TO_EISENHOWER,
                JSON.stringify(payload),
              );
              e.dataTransfer.effectAllowed = "move";
              li.classList.add("calendar-eisenhower-task-dragging");
            });
            li.addEventListener("dragend", () => {
              li.classList.remove("calendar-eisenhower-task-dragging");
            });
            ul.appendChild(li);
          });
        }
        if (badge) badge.textContent = String(list.length);
      });
  }

  function handleQuadrantDrop(quad, e) {
    quad.classList.remove("calendar-eisenhower-quadrant-drag-over");
    if (!e.dataTransfer.types.includes(DRAG_TYPE_TODO_TO_EISENHOWER)) return;
    e.preventDefault();
    const raw = e.dataTransfer.getData(DRAG_TYPE_TODO_TO_EISENHOWER);
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (_) {
      return;
    }
    const quadrant = quad.dataset.quadrant;
    const label = EISENHOWER_LABELS[quadrant] || quadrant;
    const {
      taskId,
      sectionId,
      name,
      startDate,
      isKpiTodo,
      kpiTodoId,
      storageKey,
    } = payload;
    if (!name) return;
    saveTodoListBeforeUnmount(wrap);
    const todayKey = formatDateKey(new Date());
    const isUrgentImportant = quadrant === "urgent-important";
    let ok = false;
    if (isKpiTodo && kpiTodoId && storageKey) {
      const updates = { eisenhower: label };
      if (isUrgentImportant) updates.dueDate = todayKey;
      ok = updateKpiTodo(kpiTodoId, storageKey, updates);
    } else if ((sectionId || "").startsWith("custom-")) {
      ok = updateCustomSectionTaskEisenhower(sectionId, taskId, label);
      if (ok && isUrgentImportant) {
        updateCustomSectionTaskDates(
          sectionId,
          taskId,
          startDate || "",
          todayKey,
        );
      }
    } else {
      ok = updateSectionTaskEisenhower(sectionId, taskId, label);
      if (ok && isUrgentImportant) {
        updateSectionTaskDates(sectionId, taskId, startDate || "", todayKey);
      }
    }
    if (ok) {
      updateQuadrants();
      const row = todoListEl.querySelector(`tr[data-task-id="${taskId}"]`);
      if (row) {
        row.dataset.eisenhower = label;
        const displaySpan = row.querySelector(".todo-eisenhower-display");
        if (displaySpan) displaySpan.textContent = label;
        if (isUrgentImportant) {
          const dueInput = row.querySelector(".todo-due-input-hidden");
          const dueDisplay = row.querySelector(".todo-due-display");
          if (dueInput) dueInput.value = todayKey;
          if (dueDisplay && todayKey) {
            const [y, m, d] = todayKey.split("-");
            dueDisplay.innerHTML =
              y && m && d
                ? `<span class="todo-due-date-text">${m}/${d}</span>`
                : dueDisplay.innerHTML;
          }
        }
      }
    }
  }

  /** 사분면 → 할일 사이드바 드롭 시 우선순위 취소 */
  function handleSidebarDropClearEisenhower(e) {
    const sidebarBody = e.currentTarget;
    sidebarBody.classList.remove("calendar-todo-sidebar-drag-over");
    if (!e.dataTransfer.types.includes(DRAG_TYPE_TODO_TO_EISENHOWER)) return;
    e.preventDefault();
    const raw = e.dataTransfer.getData(DRAG_TYPE_TODO_TO_EISENHOWER);
    if (!raw) return;
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (_) {
      return;
    }
    const { taskId, sectionId, name, isKpiTodo, kpiTodoId, storageKey } =
      payload;
    if (!name) return;
    saveTodoListBeforeUnmount(wrap);
    let ok = false;
    if (isKpiTodo && kpiTodoId && storageKey) {
      ok = updateKpiTodo(kpiTodoId, storageKey, { eisenhower: "" });
    } else if ((sectionId || "").startsWith("custom-")) {
      ok = updateCustomSectionTaskEisenhower(sectionId, taskId, "");
    } else {
      ok = updateSectionTaskEisenhower(sectionId, taskId, "");
    }
    if (ok) {
      updateQuadrants();
      const row = todoListEl.querySelector(`tr[data-task-id="${taskId}"]`);
      if (row) {
        row.dataset.eisenhower = "";
        const displaySpan = row.querySelector(".todo-eisenhower-display");
        if (displaySpan) displaySpan.textContent = "";
      }
    }
  }

  eisenhowerWrap
    .querySelectorAll(".calendar-eisenhower-quadrant")
    .forEach((quad) => {
      quad.addEventListener("dragover", (e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE_TODO_TO_EISENHOWER)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          quad.classList.add("calendar-eisenhower-quadrant-drag-over");
        }
      });
      quad.addEventListener("dragleave", (e) => {
        if (!quad.contains(e.relatedTarget)) {
          quad.classList.remove("calendar-eisenhower-quadrant-drag-over");
        }
      });
      quad.addEventListener("drop", (e) => handleQuadrantDrop(quad, e));
      const ul = quad.querySelector(".calendar-eisenhower-quadrant-tasks");
      if (ul) {
        ul.addEventListener("dragover", (e) => {
          if (e.dataTransfer.types.includes(DRAG_TYPE_TODO_TO_EISENHOWER)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            quad.classList.add("calendar-eisenhower-quadrant-drag-over");
          }
        });
        ul.addEventListener("dragleave", (e) => {
          if (!ul.contains(e.relatedTarget)) {
            quad.classList.remove("calendar-eisenhower-quadrant-drag-over");
          }
        });
        ul.addEventListener("drop", (e) => handleQuadrantDrop(quad, e));
      }
    });

  const sidebarBody = todoSidebar.querySelector(".calendar-todo-sidebar-body");
  if (sidebarBody) {
    sidebarBody.addEventListener("dragover", (e) => {
      if (e.dataTransfer.types.includes(DRAG_TYPE_TODO_TO_EISENHOWER)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        sidebarBody.classList.add("calendar-todo-sidebar-drag-over");
      }
    });
    sidebarBody.addEventListener("dragleave", (e) => {
      if (!sidebarBody.contains(e.relatedTarget)) {
        sidebarBody.classList.remove("calendar-todo-sidebar-drag-over");
      }
    });
    sidebarBody.addEventListener("drop", handleSidebarDropClearEisenhower);
  }

  updateQuadrants();

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

  const header = document.createElement("div");
  header.className = "calendar-view-header dream-view-header-wrap";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "SCHEDULE";
  const titleEl = document.createElement("h1");
  titleEl.className = "dream-view-title calendar-view-title";
  titleEl.textContent = "할일/일정";
  header.appendChild(label);
  header.appendChild(titleEl);
  el.appendChild(header);

  const tabs = document.createElement("div");
  tabs.className = "time-view-tabs calendar-tabs";
  tabs.innerHTML = `
    <button type="button" class="time-view-tab active" data-view="todo" data-mobile-label="할일">1. 할일 쏟아내기</button>
    <button type="button" class="time-view-tab" data-view="eisenhower">2. 우선순위 정렬</button>
    <button type="button" class="time-view-tab" data-view="calendar" data-mobile-label="캘린더">3. 날짜 정하기</button>
    <button type="button" class="time-view-tab" data-view="1day" data-mobile-label="타임라인">4. 오늘 해치우기</button>
  `;
  el.appendChild(tabs);

  const contentWrap = document.createElement("div");
  contentWrap.className = "calendar-content-wrap";

  let currentView = "todo";

  function renderContent(view) {
    const onlySaveWhenFullTodoList = currentView === "todo" || currentView === "eisenhower";
    if (onlySaveWhenFullTodoList) {
      saveTodoListBeforeUnmount(contentWrap);
    }
    currentView = view;
    if (contentWrap.contains(tabs)) {
      el.insertBefore(tabs, contentWrap);
    }
    contentWrap.innerHTML = "";
    if (view === "todo") {
      contentWrap.appendChild(renderTodoView(tabs));
    } else if (view === "calendar") {
      contentWrap.appendChild(renderCalendarView(tabs));
    } else if (view === "1day") {
      contentWrap.appendChild(render1DayView(tabs));
    } else if (view === "eisenhower") {
      contentWrap.appendChild(renderEisenhowerView(tabs));
    } else {
      const labels = {};
      contentWrap.appendChild(renderPlaceholderView(tabs, labels[view] || ""));
    }
  }

  tabs.querySelectorAll(".time-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs
        .querySelectorAll(".time-view-tab")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderContent(btn.dataset.view);
    });
  });

  renderContent("todo");
  el.appendChild(contentWrap);

  return el;
}

/** 홈 등 다른 화면에서 오늘 해치우기 캘린더만 삽입할 때 사용. tabsElement는 null 가능 */
export { render1DayView };
