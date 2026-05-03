/**
 * 캘린더 - 월별/2주/1주/1일 뷰
 * 월별: 왼쪽 미니멀 캘린더 + 오른쪽 태스크 사이드바
 * 할일목록: 인생 KPI와 동일한 구조
 */

import {
  render as renderTodoList,
  renderTodoListForEisenhowerSidebar,
  saveTodoListBeforeUnmount,
  DRAG_TYPE_TODO_TO_CALENDAR,
  DRAG_TYPE_TODO_TO_EISENHOWER,
} from "./TodoList.js";
import {
  getKpiTodosAsTasks,
  syncKpiTodoCompleted,
  updateKpiTodo,
  removeKpiTodo,
  clearKpiTodoCalendarRevertSnapshot,
} from "../utils/kpiTodoSync.js";
import { confirmKpiTodoDelete } from "../utils/confirmModal.js";
import {
  getSectionColor,
  getCustomSections,
  getTimeCategoryColorsForTimetable,
  getTimeCategoryColorsForTimetableExpected,
} from "../utils/todoSettings.js";
import {
  registerEisenhowerQuadrantsRefresh,
  refreshEisenhowerQuadrantsIfActive,
} from "../utils/eisenhowerQuadrantsBridge.js";
import { getKpisByCategory } from "../utils/kpiViewModal.js";
import {
  formatDeadlineRangeForDisplay,
  formatDeadlineRangeCompact,
} from "../utils/ganttModal.js";
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
import { supabase } from "../supabase.js";
import {
  persistSectionTasksAndSchedule,
  persistCustomSectionTasksAndSchedule,
  pullCalendarSectionTasksFromSupabase,
  upsertCalendarSectionTaskDirectFromModal,
  upsertCalendarSectionTaskRowFromSessionMemory,
} from "../utils/todoSectionTasksSupabase.js";
import {
  pullTimeLedgerEntriesForDateRange,
  timeLedgerLocalTodayYmd,
  timeLedgerLocalYesterdayYmd,
} from "../utils/timeLedgerEntriesSupabase.js";
import { pullTimeLedgerTasksFromSupabase } from "../utils/timeLedgerTasksSupabase.js";
import {
  readSectionTasksObject,
  readCustomSectionTasksObject,
} from "../utils/todoSectionTasksModel.js";
import { markTodoAddPendingServerLog } from "../utils/lpTabDataSourceLog.js";
import {
  flushAllPendingTimeDailyBudgetSync,
  pullTimeDailyBudgetFromSupabase,
} from "../utils/timeDailyBudgetSupabase.js";
import { logLpRender } from "../utils/lpRenderDebugLog.js";
const KPI_SECTION_IDS = ["braindump", "dream", "sideincome", "health", "happy"];

/** 할일/일정 패널은 할일만 표시 — 저장값으로 빈 화면·탭 초기화 방지 */
const CALENDAR_MAIN_VIEW_STORAGE_KEY = "lp-calendar-main-subview";
const VALID_CALENDAR_MAIN_VIEWS = new Set(["todo"]);

function persistCalendarMainViewIfValid(view) {
  if (!view || !VALID_CALENDAR_MAIN_VIEWS.has(view)) return;
  try {
    localStorage.setItem(CALENDAR_MAIN_VIEW_STORAGE_KEY, view);
  } catch (_) {}
}

/** 할일 사이드바(우선순위·날짜 뷰)에서 마감 등 수정 후 목록·기한초과 블록을 다시 그림 */
let _lpTodoDatesChangedListenerAttached = false;
function lpEnsureTodoDatesChangedListener() {
  if (_lpTodoDatesChangedListenerAttached) return;
  _lpTodoDatesChangedListenerAttached = true;
  document.addEventListener("lp-todo-dates-changed", (ev) => {
    const t = ev.target;
    if (!t || typeof t.closest !== "function") return;
    if (
      !t.closest(".todo-list-eisenhower-sidebar") &&
      !t.closest(".todo-list-in-sidebar")
    ) {
      return;
    }
    const eisenRoot = t.closest(".calendar-view-eisenhower");
    if (
      eisenRoot &&
      typeof eisenRoot._lpRefreshEisenhowerTodoSidebar === "function"
    ) {
      eisenRoot._lpRefreshEisenhowerTodoSidebar();
      return;
    }
    const listIn = t.closest(".todo-list-in-sidebar");
    if (listIn) {
      const layout = listIn.closest(".calendar-monthly-layout");
      if (layout && typeof layout._lpRefreshDateTodoSidebar === "function") {
        layout._lpRefreshDateTodoSidebar();
      }
    }
  });
}
lpEnsureTodoDatesChangedListener();

/** 오늘 실제 세그먼트 상·하 구분선 — 생산성 테두리 색(rgb) + 낮은 알파로 연하게 */
function rgbaToSoftHorizontalEdge(borderRgba, alpha = 0.28) {
  const m = String(borderRgba || "").match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i,
  );
  if (!m) return `rgba(61, 74, 62, ${alpha})`;
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
}

const CALENDAR_DATE_DEBUG = false;
function dateDebug(_tag, ..._args) {
  void CALENDAR_DATE_DEBUG;
}

/** 날짜 정하기 사이드바: 한 사분면(중요+여유)만 vs 사이드 메뉴 캘린더=우선순위 탭과 동일 전체 목록 */
const LP_CAL_TODO_SIDEBAR_QUADRANT = "quadrant";
const LP_CAL_TODO_SIDEBAR_FULL = "full";

function lpCalendarTodoSidebarExpandedTitle(sidebarMode) {
  return sidebarMode === LP_CAL_TODO_SIDEBAR_FULL
    ? "할일"
    : "날짜 잡아서 해야 할일";
}

/** 할일 일정 메인 탭과 동일 CSS 스코프: .calendar-view-todo > .calendar-todo-content */
function lpWrapCalendarTodoSidebarListEl(todoListEl) {
  todoListEl.classList.add("todo-list-in-sidebar");
  const root = document.createElement("div");
  root.className = "calendar-view-todo calendar-todo-sidebar-parity";
  const content = document.createElement("div");
  content.className = "calendar-todo-content";
  root.appendChild(content);
  content.appendChild(todoListEl);
  return root;
}

function lpCalendarDateSidebarTodoListOpts(sidebarMode, extra = {}) {
  const base = {
    hideHeader: true,
    categoryToolbarRightActions: true,
    enableDragToCalendar: true,
    ...extra,
  };
  if (sidebarMode === LP_CAL_TODO_SIDEBAR_FULL) {
    return {
      ...base,
      enableDragToEisenhower: false,
      eisenhowerSidebarFirst: true,
    };
  }
  return {
    ...base,
    eisenhowerFilter: "important-not-urgent",
  };
}

function lpBindCalendarDateTodoSidebarCollapse(todoSidebar, sidebarMode) {
  let sidebarCollapsed = true;
  const collapseBtn = todoSidebar.querySelector(
    ".calendar-todo-sidebar-collapse",
  );
  const titleEl = todoSidebar.querySelector(".calendar-todo-sidebar-title");
  const collapseTextEl = todoSidebar.querySelector(
    ".calendar-todo-sidebar-collapse-text",
  );
  if (!collapseBtn || !titleEl) return;
  collapseBtn.addEventListener("click", () => {
    sidebarCollapsed = !sidebarCollapsed;
    todoSidebar.classList.toggle("collapsed", sidebarCollapsed);
    collapseBtn.title = sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기";
    if (sidebarMode === LP_CAL_TODO_SIDEBAR_FULL) {
      titleEl.textContent = "할일";
    } else {
      titleEl.textContent = sidebarCollapsed ? "할일" : "날짜 잡아서 해야 할일";
    }
    if (collapseTextEl)
      collapseTextEl.textContent = sidebarCollapsed ? "할일" : "접기";
  });
}

/** 1일 뷰: document 리스너는 한 번만 — 탭 전환·재진입 시 핸들러만 교체 (누적 방지) */
let oneDayTimetableRefreshHandler = null;
function ensureOneDayTimetableDocumentListeners() {
  if (ensureOneDayTimetableDocumentListeners._bound) return;
  ensureOneDayTimetableDocumentListeners._bound = true;
  const run = (e) => {
    oneDayTimetableRefreshHandler?.(e);
  };
  document.addEventListener("calendar-budget-scheduled-updated", run);
  document.addEventListener("calendar-time-rows-updated", run);
}

function getSectionTasksForDate(dateKey) {
  const out = [];
  try {
    const obj = readSectionTasksObject();
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
            _calPrevStart:
              (t._calPrevStart || "").toString().slice(0, 10) || "",
            _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
          }),
        );
    });
  } catch (_) {}
  return out;
}

function getSectionTasksWithDateRange() {
  const out = [];
  try {
    const obj = readSectionTasksObject();
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
            _calPrevStart:
              (t._calPrevStart || "").toString().slice(0, 10) || "",
            _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
          }),
        );
    });
  } catch (_) {}
  return out;
}

function updateSectionTaskDates(
  sectionId,
  taskId,
  startDate,
  dueDate,
  opts = {},
) {
  const { recordCalendarSidebarRevert = false } = opts;
  dateDebug("updateSectionTaskDates IN", {
    sectionId,
    taskId,
    startDate,
    dueDate,
  });
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) {
      dateDebug("updateSectionTaskDates: no arr for", sectionId);
      return false;
    }
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (!t) {
      dateDebug("updateSectionTaskDates: task not found", {
        sectionId,
        taskId,
        taskIds: arr.map((x) => x.taskId),
      });
      return false;
    }
    if (recordCalendarSidebarRevert) {
      t._calPrevStart = (t.startDate || "").slice(0, 10) || "";
      t._calPrevDue = (t.dueDate || "").slice(0, 10) || "";
    }
    t.startDate = (startDate || "").slice(0, 10) || "";
    t.dueDate = (dueDate || "").slice(0, 10) || "";
    persistSectionTasksAndSchedule(obj);
    dateDebug("updateSectionTaskDates OK", {
      sectionId,
      taskId,
      savedDueDate: t.dueDate,
    });
    return true;
  } catch (err) {
    dateDebug("updateSectionTaskDates catch", err);
    return false;
  }
}

function updateSectionTaskTimes(sectionId, taskId, startTime, endTime) {
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.startTime = (startTime || "").trim() || "";
      t.endTime = (endTime || "").trim() || "";
      persistSectionTasksAndSchedule(obj);
      return true;
    }
  } catch (_) {}
  return false;
}

function updateSectionTaskDone(sectionId, taskId, done) {
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      if (String(t.itemType || "todo").toLowerCase() === "schedule")
        return false;
      t.done = !!done;
      persistSectionTasksAndSchedule(obj);
      upsertCalendarSectionTaskRowFromSessionMemory(sectionId, taskId, null);
      return true;
    }
  } catch (_) {}
  return false;
}

function updateSectionTaskEisenhower(sectionId, taskId, eisenhower) {
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.eisenhower = (eisenhower || "").trim() || "";
      persistSectionTasksAndSchedule(obj);
      return true;
    }
  } catch (_) {}
  return false;
}

function updateCustomSectionTaskEisenhower(sectionId, taskId, eisenhower) {
  try {
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.eisenhower = (eisenhower || "").trim() || "";
      persistCustomSectionTasksAndSchedule(obj);
      return true;
    }
  } catch (_) {}
  return false;
}

/** calendar_section_tasks Supabase upsert — kpiTodoId+storageKey 전용 저장 경로 제외 */
function syncCalendarSectionTaskRowToSupabase(sectionId, taskId, listRootEl) {
  upsertCalendarSectionTaskRowFromSessionMemory(sectionId, taskId, listRootEl);
}

/** 캘린더 날짜 셀·주 행에 드롭해 기한을 바꾼 뒤 서버 반영 — KPI 전용 저장(kpiTodoId+storageKey) 제외 */
function syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok) {
  if (!ok || !payload) return;
  if (payload.kpiTodoId && payload.storageKey) return;
  syncCalendarSectionTaskRowToSupabase(payload.sectionId, payload.taskId, null);
}

function addSectionTaskToCalendar(sectionId, taskData) {
  try {
    const obj = readSectionTasksObject();
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
      _calPrevStart:
        (taskData._calPrevStart || "").toString().slice(0, 10) || "",
      _calPrevDue: (taskData._calPrevDue || "").toString().slice(0, 10) || "",
    });
    persistSectionTasksAndSchedule(obj);
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

/** 타임테이블 블록 라벨 글자색 — 세로 강조선(border)과 동일 RGB 톤의 불투명 색 */
function timetableAccentTextColor(accentRgba) {
  if (!accentRgba || typeof accentRgba !== "string") return "";
  const m = accentRgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return "";
  return `rgb(${m[1]}, ${m[2]}, ${m[3]})`;
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
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
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

/** 캘린더 막대 왼쪽 기한초과 강조 — UI에서 쓰지 않음 */
function calendarBarTaskIsOverdueTodo(_task) {
  return false;
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
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      if (String(t.itemType || "todo").toLowerCase() === "schedule")
        return;
      t.done = !!done;
      persistCustomSectionTasksAndSchedule(obj);
      upsertCalendarSectionTaskRowFromSessionMemory(sectionId, taskId, null);
    }
  } catch (_) {}
}

function updateCustomSectionTaskDates(
  sectionId,
  taskId,
  startDate,
  dueDate,
  opts = {},
) {
  const { recordCalendarSidebarRevert = false } = opts;
  try {
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      if (recordCalendarSidebarRevert) {
        t._calPrevStart = (t.startDate || "").slice(0, 10) || "";
        t._calPrevDue = (t.dueDate || "").slice(0, 10) || "";
      }
      t.startDate = (startDate || "").slice(0, 10) || "";
      t.dueDate = (dueDate || "").slice(0, 10) || "";
      persistCustomSectionTasksAndSchedule(obj);
      return true;
    }
  } catch (_) {}
  return false;
}

function updateCustomSectionTaskTimes(sectionId, taskId, startTime, endTime) {
  try {
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.startTime = (startTime || "").trim() || "";
      t.endTime = (endTime || "").trim() || "";
      persistCustomSectionTasksAndSchedule(obj);
      return true;
    }
  } catch (_) {}
  return false;
}

function addCalendarTodoToCustomSection(sectionId, taskData) {
  try {
    const obj = readCustomSectionTasksObject();
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
      _calPrevStart:
        (taskData._calPrevStart || "").toString().slice(0, 10) || "",
      _calPrevDue: (taskData._calPrevDue || "").toString().slice(0, 10) || "",
    });
    persistCustomSectionTasksAndSchedule(obj);
    return true;
  } catch (_) {}
  return false;
}

function addDaysToDateKey(dateKey, days) {
  const d = new Date(dateKey + "T12:00:00");
  d.setDate(d.getDate() + days);
  return formatDateKey(d);
}

function clearSectionTaskCalendarRevertSnapshot(sectionId, taskId) {
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    const t = arr?.find((x) => (x.taskId || "") === taskId);
    if (!t) return;
    delete t._calPrevStart;
    delete t._calPrevDue;
    persistSectionTasksAndSchedule(obj);
  } catch (_) {}
}

function clearCustomSectionTaskCalendarRevertSnapshot(sectionId, taskId) {
  try {
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    const t = arr?.find((x) => (x.taskId || "") === taskId);
    if (!t) return;
    delete t._calPrevStart;
    delete t._calPrevDue;
    persistCustomSectionTasksAndSchedule(obj);
  } catch (_) {}
}

/**
 * 캘린더 막대 → 사이드바: 캘린더에 올리기 직전 스냅샷이 있으면 그때 날짜로 복구,
 * 없으면 시작·마감 비움(날짜 미배정).
 */
function revertTaskToTodoList(barData) {
  const revS =
    (barData.revertStartDate || barData._calPrevStart || "")
      .toString()
      .trim()
      .slice(0, 10) || "";
  const revD =
    (barData.revertDueDate || barData._calPrevDue || "")
      .toString()
      .trim()
      .slice(0, 10) || "";
  let ok = false;
  if (barData.kpiTodoId && barData.storageKey) {
    ok = updateKpiTodo(barData.kpiTodoId, barData.storageKey, {
      startDate: revS,
      dueDate: revD,
    });
    if (ok) {
      clearKpiTodoCalendarRevertSnapshot(barData.kpiTodoId, barData.storageKey);
    }
  } else if (
    KPI_SECTION_IDS.includes(barData.sectionId) &&
    !barData.kpiTodoId
  ) {
    ok = updateSectionTaskDates(barData.sectionId, barData.taskId, revS, revD);
    if (ok) {
      clearSectionTaskCalendarRevertSnapshot(barData.sectionId, barData.taskId);
    }
  } else if (barData.sectionId?.startsWith("custom-")) {
    ok = updateCustomSectionTaskDates(
      barData.sectionId,
      barData.taskId,
      revS,
      revD,
    );
    if (ok) {
      clearCustomSectionTaskCalendarRevertSnapshot(
        barData.sectionId,
        barData.taskId,
      );
    }
  }
  return ok;
}

/** 캘린더 막대 → 사이드바 드롭 시 날짜 제거(dataTransfer 식별용) */
const DRAG_TYPE_CALENDAR_SPAN = "application/x-lp-calendar-span";

function dataTransferHasType(dataTransfer, type) {
  const types = dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes(type);
}

/** 날짜 셀 dragover: 브라우저별 types 차이·막대 이동(application/json) 포함 */
function calendarDragTransferTypesAllowDrop(dataTransfer) {
  return (
    dataTransferHasType(dataTransfer, DRAG_TYPE_TODO_TO_CALENDAR) ||
    dataTransferHasType(dataTransfer, DRAG_TYPE_CALENDAR_SPAN) ||
    dataTransferHasType(dataTransfer, "application/json") ||
    dataTransferHasType(dataTransfer, "text/plain")
  );
}

/** drop: 사이드바 할일·캘린더 막대(DnD MIME이 다름) 동일 페이로드로 처리 */
function readCalendarDropPayloadJson(dataTransfer) {
  if (!dataTransfer) return "";
  return (
    dataTransfer.getData(DRAG_TYPE_TODO_TO_CALENDAR) ||
    dataTransfer.getData(DRAG_TYPE_CALENDAR_SPAN) ||
    dataTransfer.getData("application/json") ||
    ""
  );
}

function calendarSpanBarPayloadJson(b) {
  const revS = (b._calPrevStart || "").toString().slice(0, 10) || "";
  const revD = (b._calPrevDue || "").toString().slice(0, 10) || "";
  return JSON.stringify({
    name: b.name,
    dueDate: b.dueDate,
    startDate: b.startDate || "",
    kpiTodoId: b.kpiTodoId,
    storageKey: b.storageKey,
    taskId: b.taskId,
    sectionId: b.sectionId,
    done: !!b.done,
    itemType: b.itemType || "todo",
    revertStartDate: revS,
    revertDueDate: revD,
  });
}

function bindCalendarSpanBarDragHandlers(bar, b) {
  const canDrag =
    (b.isSingleDay && b.dueDate) ||
    (!b.isSingleDay && b.startDate && b.dueDate);
  if (!canDrag) return;
  bar.draggable = true;
  bar.classList.add("calendar-monthly-span-bar--draggable");
  bar.addEventListener("dragstart", (e) => {
    e.dataTransfer.effectAllowed = "move";
    const json = calendarSpanBarPayloadJson(b);
    e.dataTransfer.setData(DRAG_TYPE_CALENDAR_SPAN, json);
    e.dataTransfer.setData("application/json", json);
    e.dataTransfer.setData("text/plain", b.name || "");
    bar.classList.add("calendar-monthly-span-bar--dragging");
  });
  bar.addEventListener("dragend", () => {
    bar.classList.remove("calendar-monthly-span-bar--dragging");
  });
}

/** 날짜 정하기: 캘린더 막대를 오른쪽 할일 사이드바에 놓으면 시작일·마감일 제거 */
function attachCalendarTodoSidebarSpanRevertDrop(
  sidebarBody,
  renderCalendar,
  refreshTodoList,
) {
  if (!sidebarBody) return;
  const dragOverClass = "calendar-todo-sidebar-drag-over";
  const acceptsSidebarSpanRevert = (dt) =>
    dataTransferHasType(dt, DRAG_TYPE_CALENDAR_SPAN) ||
    (dataTransferHasType(dt, "application/json") &&
      !dataTransferHasType(dt, DRAG_TYPE_TODO_TO_CALENDAR));

  sidebarBody.addEventListener("dragover", (e) => {
    if (acceptsSidebarSpanRevert(e.dataTransfer)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      sidebarBody.classList.add(dragOverClass);
    }
  });
  sidebarBody.addEventListener("dragleave", (e) => {
    if (!sidebarBody.contains(e.relatedTarget)) {
      sidebarBody.classList.remove(dragOverClass);
    }
  });
  sidebarBody.addEventListener("drop", (e) => {
    sidebarBody.classList.remove(dragOverClass);
    if (!acceptsSidebarSpanRevert(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    let json = "";
    if (dataTransferHasType(e.dataTransfer, DRAG_TYPE_CALENDAR_SPAN)) {
      json = e.dataTransfer.getData(DRAG_TYPE_CALENDAR_SPAN);
    }
    if (!json && dataTransferHasType(e.dataTransfer, "application/json")) {
      json = e.dataTransfer.getData("application/json");
    }
    if (!json) return;
    try {
      const payload = JSON.parse(json);
      if (!payload || (!payload.taskId && !payload.kpiTodoId)) return;
      if (!revertTaskToTodoList(payload)) return;
      refreshTodoList?.();
      renderCalendar?.();
    } catch (_) {}
  });
}

/** 날짜 정하기 사이드바: 할일 일정 탭과 동일 목록을 저장소 기준으로 다시 그림 */
function refreshCalendarDateTodoSidebar(layoutWrap) {
  const body = layoutWrap.querySelector(".calendar-todo-sidebar-body");
  if (!body) return;
  const mainWrap = body.querySelector(".calendar-todo-sidebar-main") || body;
  const oldParity = mainWrap.querySelector(".calendar-todo-sidebar-parity");
  const oldList =
    oldParity?.querySelector(".todo-list-in-sidebar") ??
    mainWrap.querySelector(".todo-list-in-sidebar");
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
    if (oldParity) oldParity.remove();
    else oldList.remove();
  }
  const sidebarMode =
    layoutWrap.dataset.lpCalTodoSidebar || LP_CAL_TODO_SIDEBAR_QUADRANT;
  const newList = renderTodoList(
    lpCalendarDateSidebarTodoListOpts(sidebarMode, {
      initialActiveTabIndex: activeIndex,
    }),
  );
  mainWrap.appendChild(lpWrapCalendarTodoSidebarListEl(newList));
}

/** 캘린더·우선순위 뷰: 할일 사이드바 기본 접힘(사용자가 펼침). 아이젠하워는 접힘 시 저장 너비 해제 */
function applyCalendarTodoSidebarInitiallyCollapsed(todoSidebar, opts = {}) {
  const { clearInlineWidth = false } = opts;
  todoSidebar.classList.add("collapsed");
  if (clearInlineWidth) todoSidebar.style.width = "";
  const collapseBtn = todoSidebar.querySelector(
    ".calendar-todo-sidebar-collapse",
  );
  const titleEl = todoSidebar.querySelector(".calendar-todo-sidebar-title");
  const collapseTextEl = todoSidebar.querySelector(
    ".calendar-todo-sidebar-collapse-text",
  );
  if (collapseBtn) collapseBtn.title = "사이드바 펼치기";
  if (titleEl) titleEl.textContent = "할일";
  if (collapseTextEl) collapseTextEl.textContent = "할일";
}

function getCustomSectionTasksForDate(dateKey) {
  const out = [];
  try {
    const obj = readCustomSectionTasksObject();
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
            _calPrevStart:
              (t._calPrevStart || "").toString().slice(0, 10) || "",
            _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
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
    const obj = readCustomSectionTasksObject();
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
            _calPrevStart:
              (t._calPrevStart || "").toString().slice(0, 10) || "",
            _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
          }),
        );
    });
  } catch (_) {}
  const kpiWithRange = kpi
    .filter(
      (t) => (t.startDate || "").slice(0, 10) && (t.dueDate || "").slice(0, 10),
    )
    .map((t) => ({
      ...t,
      startDate: (t.startDate || "").slice(0, 10),
      dueDate: (t.dueDate || "").slice(0, 10),
      _calPrevStart: (t._calPrevStart || "").toString().slice(0, 10) || "",
      _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
    }));
  return [...kpiWithRange, ...sectionRange, ...customRange];
}

/**
 * 할일/일정 카드「+」와 동일 저장 경로: 세션 섹션 할일 + `calendar_section_tasks` upsert.
 * KPI 맵(kpi-*-map)에는 넣지 않음 — 캘린더·날짜 정하기 버블 전용.
 */
function addSectionTodoFromCalendarBubble(sectionId, dueYmd, name, itemType = "todo") {
  const sid = String(sectionId || "").trim();
  const due = String(dueYmd || "")
    .trim()
    .slice(0, 10);
  const todoName = String(name || "").trim();
  if (!sid || !due || !todoName || !KPI_SECTION_IDS.includes(sid)) return false;
  const it =
    String(itemType || "todo").toLowerCase() === "schedule" ? "schedule" : "todo";
  const taskId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "";
  if (!taskId) return false;
  try {
    const obj = readSectionTasksObject();
    if (!obj[sid]) obj[sid] = [];
    const arr = obj[sid];
    const sortOrder = arr.length;
    arr.push({
      taskId,
      name: todoName,
      startDate: "",
      dueDate: due,
      startTime: "",
      endTime: "",
      done: false,
      itemType: it,
    });
    persistSectionTasksAndSchedule(obj);
    const task = {
      taskId,
      name: todoName,
      startDate: "",
      dueDate: due,
      startTime: "",
      endTime: "",
      eisenhower: "",
      done: false,
      itemType: it,
      reminderDate: "",
      reminderTime: "",
    };
    markTodoAddPendingServerLog({ taskId, sectionId: sid });
    void upsertCalendarSectionTaskDirectFromModal({
      task,
      sectionKey: sid,
      isCustom: false,
      sortOrder,
    }).catch(() => {});
    return true;
  } catch (_) {}
  return false;
}

function createCalendarEventBubble(cellRect, dateKey, onSave, onClose) {
  const isMobile = window.matchMedia("(max-width: 48rem)").matches;
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
  bubble.className =
    "calendar-event-bubble" +
    (isMobile ? " calendar-event-bubble--mobile" : "");
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
        <label class="calendar-event-bubble-schedule-check">
          <input type="checkbox" class="calendar-event-bubble-schedule-checkbox" />
          <span>일정으로 변경</span>
        </label>
      </div>
      <button type="button" class="calendar-event-bubble-save">추가</button>
    </div>
  `;

  const close = () => {
    overlayEl?.remove();
    bubble.remove();
    onClose?.();
  };

  bubble
    .querySelector(".calendar-event-bubble-close")
    .addEventListener("click", close);

  const scheduleCheckbox = bubble.querySelector(
    ".calendar-event-bubble-schedule-checkbox",
  );

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
      const asSchedule = !!scheduleCheckbox?.checked;
      const itemType = asSchedule ? "schedule" : "todo";
      if (!addSectionTodoFromCalendarBubble(categoryId, dateKey, name, itemType)) {
        alert("할 일을 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      onSave?.({
        name,
        dueDate: dateKey,
        sectionId: categoryId,
        itemType,
      });
      close();
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
    left: isMobile ? "" : `${cellRect.left}px`,
    top: isMobile ? "" : `${cellRect.bottom + 4}px`,
    zIndex: isMobile ? 1002 : 1000,
  });

  document.body.appendChild(bubble);

  if (!isMobile) {
    const bubbleHeight = bubble.getBoundingClientRect().height;
    if (
      cellRect.bottom + 4 + bubbleHeight >
      window.innerHeight - BUBBLE_PADDING
    ) {
      bubble.style.top = `${cellRect.top - bubbleHeight - 4}px`;
      bubble.classList.add("calendar-event-bubble--above");
    }
  }

  bubble.querySelector(".calendar-event-bubble-input").focus();
  return bubble;
}

/** 기본 행 높이는 이 개수(3개) 분량, 그 이상이면 행을 늘려 전부 표시 */
const MAX_VISIBLE_BARS_PER_DAY = 3;

/** 이전 날짜 확대 버블의 document 클릭 리스너 제거(연간 연속 호버 등으로 close 미경유 DOM 제거 시 누수 방지) */
let _calendarDayExpandOutsideHandler = null;

function createCalendarDayExpandBubble(
  cellRect,
  dateKey,
  tasks,
  onClose,
  options = {},
) {
  const {
    positionBelow = false,
    onAdd = null,
    /** 연간 뷰 등: × 숨김 */
    hideCloseButton = false,
    /** false면 바깥 클릭으로 닫지 않음(호버 전용) */
    dismissOnOutsideClick = false,
    /** 연간 호버 시 모바일 전체 오버레이 생략 */
    useMobileOverlay = true,
  } = options;
  const isMobile = window.matchMedia("(max-width: 48rem)").matches;
  if (_calendarDayExpandOutsideHandler) {
    document.removeEventListener("click", _calendarDayExpandOutsideHandler);
    _calendarDayExpandOutsideHandler = null;
  }
  document
    .querySelectorAll(".calendar-event-bubble, .calendar-day-expand-overlay")
    .forEach((el) => el.remove());
  let overlayEl = null;
  if (isMobile && useMobileOverlay) {
    overlayEl = document.createElement("div");
    overlayEl.className = "calendar-day-expand-overlay";
    document.body.appendChild(overlayEl);
  }
  const bubble = document.createElement("div");
  bubble.className =
    "calendar-event-bubble calendar-day-expand-bubble" +
    (isMobile ? " calendar-day-expand-bubble--mobile" : "") +
    (hideCloseButton ? " calendar-day-expand-bubble--no-close" : "");
  const taskItems = tasks
    .map((t) => {
      const isSchedule =
        String(t.itemType || "todo").toLowerCase() === "schedule";
      const marker = isSchedule
        ? '<span class="calendar-day-expand-schedule-dot" aria-hidden="true"></span>'
        : `<span class="calendar-day-expand-checkbox ${t.done ? "checked" : ""}"></span>`;
      return `
    <div class="calendar-day-expand-item${isSchedule ? " calendar-day-expand-item--schedule" : ""}" data-done="${!!t.done}" data-item-type="${isSchedule ? "schedule" : "todo"}">
      ${marker}
      <span class="calendar-day-expand-text">${escapeHtml(t.name || "")}</span>
      ${t.startTime || t.endTime ? `<span class="calendar-day-expand-time">${[t.startTime, t.endTime].filter(Boolean).join(" ~ ")}</span>` : ""}
    </div>
  `;
    })
    .join("");
  const addBtnHtml = onAdd
    ? '<button type="button" class="calendar-day-expand-add-btn">할일 추가</button>'
    : "";
  const closeBtnHtml = hideCloseButton
    ? ""
    : '<button type="button" class="calendar-event-bubble-close" title="닫기">×</button>';
  bubble.innerHTML = `
    <div class="calendar-event-bubble-body">
      <div class="calendar-event-bubble-header">
        <span class="calendar-event-bubble-date">${dateKey.replace(/-/g, ". ")}</span>
        ${closeBtnHtml}
      </div>
      <div class="calendar-day-expand-list">${taskItems || "<div class='calendar-day-expand-empty'>할일 없음</div>"}</div>
      ${addBtnHtml}
    </div>
  `;

  tasks.forEach((t, i) => {
    const itemEl = bubble.querySelectorAll(".calendar-day-expand-item")[i];
    if (!itemEl) return;
    if (itemEl.dataset.itemType === "schedule") return;
    const toggleDone = (e) => {
      e.stopPropagation();
      const newDone = !t.done;
      t.done = newDone;
      if (t.kpiTodoId && t.storageKey) {
        syncKpiTodoCompleted(t.kpiTodoId, t.storageKey, newDone);
      } else if (KPI_SECTION_IDS.includes(t.sectionId) && t.taskId) {
        updateSectionTaskDone(t.sectionId, t.taskId, newDone);
      } else if ((t.sectionId || "").startsWith("custom-") && t.taskId) {
        updateCustomSectionTaskDone(t.sectionId, t.taskId, newDone);
      }
      itemEl.dataset.done = newDone;
      itemEl
        .querySelector(".calendar-day-expand-checkbox")
        ?.classList.toggle("checked", newDone);
    };
    itemEl.addEventListener("click", (e) => {
      if (
        e.target.closest(".calendar-event-bubble-close") ||
        e.target.closest(".calendar-day-expand-add-btn")
      )
        return;
      toggleDone(e);
    });
  });

  let outsideClickHandler = null;
  const close = () => {
    if (outsideClickHandler) {
      document.removeEventListener("click", outsideClickHandler);
      outsideClickHandler = null;
      _calendarDayExpandOutsideHandler = null;
    }
    bubble.remove();
    if (overlayEl) overlayEl.remove();
    onClose?.();
  };

  if (!hideCloseButton) {
    bubble
      .querySelector(".calendar-event-bubble-close")
      ?.addEventListener("click", close);
  }
  if (onAdd) {
    bubble
      .querySelector(".calendar-day-expand-add-btn")
      ?.addEventListener("click", () => {
        close();
        onAdd();
      });
  }
  if (dismissOnOutsideClick) {
    setTimeout(() => {
      outsideClickHandler = function outside(e) {
        if (
          !bubble.contains(e.target) &&
          !(overlayEl && overlayEl.contains(e.target))
        ) {
          document.removeEventListener("click", outsideClickHandler);
          outsideClickHandler = null;
          _calendarDayExpandOutsideHandler = null;
          close();
        }
      };
      _calendarDayExpandOutsideHandler = outsideClickHandler;
      document.addEventListener("click", outsideClickHandler);
    }, 0);
  }

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
    if (
      cellRect.bottom + 4 + bubbleHeight >
      window.innerHeight - BUBBLE_PADDING
    ) {
      bubble.style.top = `${cellRect.top - bubbleHeight - 4}px`;
    }
  }

  return { bubble, close };
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
      <p class="calendar-bar-revert-desc">캘린더에 올리기 전 날짜로 되돌리거나, 이전에 날짜가 없었으면 미배정으로 돌아갑니다.</p>
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

function renderMonthlyView(
  tabsElement,
  sidebarMode = LP_CAL_TODO_SIDEBAR_QUADRANT,
) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout";
  wrap.dataset.lpCalTodoSidebar = sidebarMode;

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
    refreshCalendarDateTodoSidebar(wrap);
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
        cell.addEventListener(
          "click",
          (e) => {
            if (
              window.matchMedia("(max-width: 48rem)").matches &&
              cell.contains(e.target)
            ) {
              e.stopPropagation();
              e.preventDefault();
              const rect = cell.getBoundingClientRect();
              const tasks = getAllTasksForDateDisplay(key);
              createCalendarDayExpandBubble(rect, key, tasks, () => {}, {
                positionBelow: true,
                onAdd: () => {
                  createCalendarEventBubble(
                    rect,
                    key,
                    () => {
                      renderCalendar();
                      refreshTodoList();
                    },
                    () => {},
                  );
                },
              });
              return;
            }
          },
          true,
        );
        cell.addEventListener("click", (e) => {
          if (e.target.closest(".calendar-event-bubble")) return;
          e.stopPropagation();
          const rect = cell.getBoundingClientRect();
          const isMobile = window.matchMedia("(max-width: 48rem)").matches;
          if (isMobile) {
            return;
          }
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
          if (calendarDragTransferTypesAllowDrop(e.dataTransfer)) {
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
          const json = readCalendarDropPayloadJson(e.dataTransfer);
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
              recordCalendarSidebarRevert: true,
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
              { recordCalendarSidebarRevert: true },
            );
            if (!ok && (payload.name || "").trim()) {
              ok = addCalendarTodoToCustomSection(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
                _calPrevStart: oldStart,
                _calPrevDue: oldDue,
              });
            }
          } else if (
            KPI_SECTION_IDS.includes(payload.sectionId) &&
            ((payload.taskId || "").trim() || (payload.name || "").trim())
          ) {
            if (payload.kpiTodoId && payload.storageKey) {
              ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
                startDate: newStart,
                dueDate: newDue,
                recordCalendarSidebarRevert: true,
              });
            } else {
              ok =
                updateSectionTaskDates(
                  payload.sectionId,
                  payload.taskId,
                  newStart,
                  newDue,
                  { recordCalendarSidebarRevert: true },
                ) ||
                addSectionTaskToCalendar(payload.sectionId, {
                  taskId: payload.taskId,
                  name: payload.name,
                  startDate: newStart,
                  dueDate: newDue,
                  done: !!payload.done,
                  itemType: payload.itemType || "todo",
                  _calPrevStart: oldStart,
                  _calPrevDue: oldDue,
                });
            }
          }
          dateDebug("drop on day", {
            targetDate: key,
            name: payload?.name,
            sectionId: payload?.sectionId,
            taskId: payload?.taskId,
            newStart,
            newDue,
            ok,
          });
          if (ok) {
            syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok);
            renderCalendar();
            refreshTodoList();
          }
        });
        weekRow.appendChild(cell);
      });

      const barsEl = document.createElement("div");
      barsEl.className = "calendar-monthly-bars";
      const BAR_HEIGHT = window.matchMedia("(max-width: 48rem)").matches
        ? 1.35
        : 2.05;
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
          isOverdueBar: calendarBarTaskIsOverdueTodo(t),
          _calPrevStart: (t._calPrevStart || "").toString().slice(0, 10) || "",
          _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
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
            isOverdueBar: calendarBarTaskIsOverdueTodo(t),
            _calPrevStart:
              (t._calPrevStart || "").toString().slice(0, 10) || "",
            _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
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
      /* 기본 3개 높이 유지, 그 이상이면 행을 늘려 전부 표시 (+n 버튼 없음) */
      allBars.forEach((b) => {
        b.isOverflow = false;
      });
      const maxRow = allBars.length
        ? Math.max(...allBars.map((b) => b.row), 0)
        : 0;
      const rowsNeeded = maxRow + 1;
      const BARS_TOP = window.matchMedia("(max-width: 48rem)").matches
        ? 1.35
        : 1.75;
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
          (b.isOverflow ? " calendar-monthly-span-bar--overflow" : "") +
          (b.isOverdueBar ? " calendar-monthly-span-bar--overdue" : "") +
          ((b.itemType || "todo").toLowerCase() !== "todo"
            ? " calendar-monthly-span-bar--schedule-strip"
            : "");
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
              : `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            if (b.isFirstSegment) {
              bar.style.setProperty("--schedule-icon-color", b.color);
              bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" style="border-color:${b.color}"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
            } else {
              bar.innerHTML = `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
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
          if (!window.matchMedia("(max-width: 48rem)").matches)
            bar.addEventListener("click", toggleDone);
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
        bindCalendarSpanBarDragHandlers(bar, b);
        if (b.isSingleDay && b.dueDate) {
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
      weekDateKeys.forEach((dateKey) => {
        const slot = document.createElement("div");
        slot.style.cssText =
          "display:flex;justify-content:center;align-items:flex-end;padding:0 0.15rem;";
        moreEl.appendChild(slot);
      });
      weekWrap.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (calendarDragTransferTypesAllowDrop(e.dataTransfer)) {
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
        let json = readCalendarDropPayloadJson(e.dataTransfer);
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
            { recordCalendarSidebarRevert: true },
          );
          if (!ok && (payload.name || "").trim()) {
            ok = addCalendarTodoToCustomSection(payload.sectionId, {
              taskId: payload.taskId,
              name: payload.name,
              startDate: newStart,
              dueDate: newDue,
              done: !!payload.done,
              itemType: payload.itemType || "todo",
              _calPrevStart: oldStart,
              _calPrevDue: oldDue,
            });
          }
        } else if (
          KPI_SECTION_IDS.includes(payload.sectionId) &&
          ((payload.taskId || "").trim() || (payload.name || "").trim())
        ) {
          if (payload.kpiTodoId && payload.storageKey) {
            ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
              startDate: newStart,
              dueDate: newDue,
              recordCalendarSidebarRevert: true,
            });
          } else {
            ok =
              updateSectionTaskDates(
                payload.sectionId,
                payload.taskId,
                newStart,
                newDue,
                { recordCalendarSidebarRevert: true },
              ) ||
              addSectionTaskToCalendar(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
                _calPrevStart: oldStart,
                _calPrevDue: oldDue,
              });
          }
        }
        if (ok) {
          syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok);
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
  const sidebarTitleExpanded = lpCalendarTodoSidebarExpandedTitle(sidebarMode);
  todoSidebar.innerHTML = `
    <div class="calendar-todo-sidebar-header">
      <span class="calendar-todo-sidebar-title">${sidebarTitleExpanded}</span>
      <button type="button" class="calendar-todo-sidebar-collapse" title="사이드바 접기">
        <span class="calendar-todo-sidebar-collapse-text">접기</span>
      </button>
    </div>
    <div class="calendar-todo-sidebar-body">
      <div class="calendar-todo-sidebar-main"></div>
    </div>
  `;
  const body = todoSidebar.querySelector(".calendar-todo-sidebar-body");
  const mainWrap = body.querySelector(".calendar-todo-sidebar-main");
  const todoListEl = renderTodoList(
    lpCalendarDateSidebarTodoListOpts(sidebarMode),
  );
  mainWrap.appendChild(lpWrapCalendarTodoSidebarListEl(todoListEl));
  lpBindCalendarDateTodoSidebarCollapse(todoSidebar, sidebarMode);
  applyCalendarTodoSidebarInitiallyCollapsed(todoSidebar);
  wrap.appendChild(todoSidebar);
  attachCalendarTodoSidebarSpanRevertDrop(
    body,
    () => renderCalendar(),
    () => refreshTodoList(),
  );

  wrap.addEventListener("dragend", () => {
    wrap
      .querySelectorAll(".calendar-day-drag-over")
      .forEach((el) => el.classList.remove("calendar-day-drag-over"));
  });

  renderCalendar();

  wrap._lpRefreshDateTodoSidebar = refreshTodoList;

  return wrap;
}

function render2WeekView(
  tabsElement,
  sidebarMode = LP_CAL_TODO_SIDEBAR_QUADRANT,
) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout";
  wrap.dataset.lpCalTodoSidebar = sidebarMode;

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
    refreshCalendarDateTodoSidebar(wrap);
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
          if (calendarDragTransferTypesAllowDrop(e.dataTransfer)) {
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
          const json = readCalendarDropPayloadJson(e.dataTransfer);
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
              recordCalendarSidebarRevert: true,
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
              { recordCalendarSidebarRevert: true },
            );
            if (!ok && (payload.name || "").trim()) {
              ok = addCalendarTodoToCustomSection(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
                _calPrevStart: oldStart,
                _calPrevDue: oldDue,
              });
            }
          } else if (
            KPI_SECTION_IDS.includes(payload.sectionId) &&
            ((payload.taskId || "").trim() || (payload.name || "").trim())
          ) {
            if (payload.kpiTodoId && payload.storageKey) {
              ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
                startDate: newStart,
                dueDate: newDue,
                recordCalendarSidebarRevert: true,
              });
            } else {
              ok =
                updateSectionTaskDates(
                  payload.sectionId,
                  payload.taskId,
                  newStart,
                  newDue,
                  { recordCalendarSidebarRevert: true },
                ) ||
                addSectionTaskToCalendar(payload.sectionId, {
                  taskId: payload.taskId,
                  name: payload.name,
                  startDate: newStart,
                  dueDate: newDue,
                  done: !!payload.done,
                  itemType: payload.itemType || "todo",
                  _calPrevStart: oldStart,
                  _calPrevDue: oldDue,
                });
            }
          }
          dateDebug("drop on day", {
            targetDate: key,
            name: payload?.name,
            sectionId: payload?.sectionId,
            taskId: payload?.taskId,
            newStart,
            newDue,
            ok,
          });
          if (ok) {
            syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok);
            renderCalendar();
            refreshTodoList();
          }
        });
        weekRow.appendChild(cell);
      });

      const barsEl = document.createElement("div");
      barsEl.className = "calendar-monthly-bars";
      const BAR_HEIGHT = window.matchMedia("(max-width: 48rem)").matches
        ? 1.35
        : 2.05;
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
          isOverdueBar: calendarBarTaskIsOverdueTodo(t),
          _calPrevStart: (t._calPrevStart || "").toString().slice(0, 10) || "",
          _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
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
            isOverdueBar: calendarBarTaskIsOverdueTodo(t),
            _calPrevStart:
              (t._calPrevStart || "").toString().slice(0, 10) || "",
            _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
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
      /* 기본 3개 높이 유지, 그 이상이면 행을 늘려 전부 표시 (+n 버튼 없음) */
      allBars.forEach((b) => {
        b.isOverflow = false;
      });
      const maxRow = allBars.length
        ? Math.max(...allBars.map((b) => b.row), 0)
        : 0;
      const rowsNeeded = maxRow + 1;
      const BARS_TOP = window.matchMedia("(max-width: 48rem)").matches
        ? 1.35
        : 1.75;
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
          (b.isOverflow ? " calendar-monthly-span-bar--overflow" : "") +
          (b.isOverdueBar ? " calendar-monthly-span-bar--overdue" : "") +
          ((b.itemType || "todo").toLowerCase() !== "todo"
            ? " calendar-monthly-span-bar--schedule-strip"
            : "");
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
              : `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            if (b.isFirstSegment) {
              bar.style.setProperty("--schedule-icon-color", b.color);
              bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" style="border-color:${b.color}"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
            } else {
              bar.innerHTML = `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
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
          if (!window.matchMedia("(max-width: 48rem)").matches)
            bar.addEventListener("click", toggleDone);
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
        bindCalendarSpanBarDragHandlers(bar, b);
        if (b.isSingleDay && b.dueDate) {
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
      weekDateKeys.forEach((dateKey) => {
        const slot = document.createElement("div");
        slot.style.cssText =
          "display:flex;justify-content:center;align-items:flex-end;padding:0 0.15rem;";
        moreEl.appendChild(slot);
      });
      weekWrap.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (calendarDragTransferTypesAllowDrop(e.dataTransfer)) {
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
        let json = readCalendarDropPayloadJson(e.dataTransfer);
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
            { recordCalendarSidebarRevert: true },
          );
          if (!ok && (payload.name || "").trim()) {
            ok = addCalendarTodoToCustomSection(payload.sectionId, {
              taskId: payload.taskId,
              name: payload.name,
              startDate: newStart,
              dueDate: newDue,
              done: !!payload.done,
              itemType: payload.itemType || "todo",
              _calPrevStart: oldStart,
              _calPrevDue: oldDue,
            });
          }
        } else if (
          KPI_SECTION_IDS.includes(payload.sectionId) &&
          ((payload.taskId || "").trim() || (payload.name || "").trim())
        ) {
          if (payload.kpiTodoId && payload.storageKey) {
            ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
              startDate: newStart,
              dueDate: newDue,
              recordCalendarSidebarRevert: true,
            });
          } else {
            ok =
              updateSectionTaskDates(
                payload.sectionId,
                payload.taskId,
                newStart,
                newDue,
                { recordCalendarSidebarRevert: true },
              ) ||
              addSectionTaskToCalendar(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
                _calPrevStart: oldStart,
                _calPrevDue: oldDue,
              });
          }
        }
        if (ok) {
          syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok);
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
  const sidebarTitleExpanded = lpCalendarTodoSidebarExpandedTitle(sidebarMode);
  todoSidebar.innerHTML = `
    <div class="calendar-todo-sidebar-header">
      <span class="calendar-todo-sidebar-title">${sidebarTitleExpanded}</span>
      <button type="button" class="calendar-todo-sidebar-collapse" title="사이드바 접기">
        <span class="calendar-todo-sidebar-collapse-text">접기</span>
      </button>
    </div>
    <div class="calendar-todo-sidebar-body">
      <div class="calendar-todo-sidebar-main"></div>
    </div>
  `;
  const body = todoSidebar.querySelector(".calendar-todo-sidebar-body");
  const mainWrap = body.querySelector(".calendar-todo-sidebar-main");
  const todoListEl = renderTodoList(
    lpCalendarDateSidebarTodoListOpts(sidebarMode),
  );
  mainWrap.appendChild(lpWrapCalendarTodoSidebarListEl(todoListEl));
  lpBindCalendarDateTodoSidebarCollapse(todoSidebar, sidebarMode);
  applyCalendarTodoSidebarInitiallyCollapsed(todoSidebar);
  wrap.appendChild(todoSidebar);
  attachCalendarTodoSidebarSpanRevertDrop(
    body,
    () => renderCalendar(),
    () => refreshTodoList(),
  );

  wrap.addEventListener("dragend", () => {
    wrap
      .querySelectorAll(".calendar-day-drag-over")
      .forEach((el) => el.classList.remove("calendar-day-drag-over"));
  });

  renderCalendar();

  wrap._lpRefreshDateTodoSidebar = refreshTodoList;

  return wrap;
}

function render3WeekView(
  tabsElement,
  sidebarMode = LP_CAL_TODO_SIDEBAR_QUADRANT,
) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout";
  wrap.dataset.lpCalTodoSidebar = sidebarMode;

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
    refreshCalendarDateTodoSidebar(wrap);
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
          if (calendarDragTransferTypesAllowDrop(e.dataTransfer)) {
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
          const json = readCalendarDropPayloadJson(e.dataTransfer);
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
              recordCalendarSidebarRevert: true,
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
              { recordCalendarSidebarRevert: true },
            );
            if (!ok && (payload.name || "").trim()) {
              ok = addCalendarTodoToCustomSection(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
                _calPrevStart: oldStart,
                _calPrevDue: oldDue,
              });
            }
          } else if (
            KPI_SECTION_IDS.includes(payload.sectionId) &&
            ((payload.taskId || "").trim() || (payload.name || "").trim())
          ) {
            if (payload.kpiTodoId && payload.storageKey) {
              ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
                startDate: newStart,
                dueDate: newDue,
                recordCalendarSidebarRevert: true,
              });
            } else {
              ok =
                updateSectionTaskDates(
                  payload.sectionId,
                  payload.taskId,
                  newStart,
                  newDue,
                  { recordCalendarSidebarRevert: true },
                ) ||
                addSectionTaskToCalendar(payload.sectionId, {
                  taskId: payload.taskId,
                  name: payload.name,
                  startDate: newStart,
                  dueDate: newDue,
                  done: !!payload.done,
                  itemType: payload.itemType || "todo",
                  _calPrevStart: oldStart,
                  _calPrevDue: oldDue,
                });
            }
          }
          dateDebug("drop on day", {
            targetDate: key,
            name: payload?.name,
            sectionId: payload?.sectionId,
            taskId: payload?.taskId,
            newStart,
            newDue,
            ok,
          });
          if (ok) {
            syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok);
            renderCalendar();
            refreshTodoList();
          }
        });
        weekRow.appendChild(cell);
      });

      const barsEl = document.createElement("div");
      barsEl.className = "calendar-monthly-bars";
      const BAR_HEIGHT = window.matchMedia("(max-width: 48rem)").matches
        ? 1.35
        : 2.05;
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
          isOverdueBar: calendarBarTaskIsOverdueTodo(t),
          _calPrevStart: (t._calPrevStart || "").toString().slice(0, 10) || "",
          _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
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
            isOverdueBar: calendarBarTaskIsOverdueTodo(t),
            _calPrevStart:
              (t._calPrevStart || "").toString().slice(0, 10) || "",
            _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
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
      /* 기본 3개 높이 유지, 그 이상이면 행을 늘려 전부 표시 (+n 버튼 없음) */
      allBars.forEach((b) => {
        b.isOverflow = false;
      });
      const maxRow = allBars.length
        ? Math.max(...allBars.map((b) => b.row), 0)
        : 0;
      const rowsNeeded = maxRow + 1;
      const BARS_TOP = window.matchMedia("(max-width: 48rem)").matches
        ? 1.35
        : 1.75;
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
          (b.isOverflow ? " calendar-monthly-span-bar--overflow" : "") +
          (b.isOverdueBar ? " calendar-monthly-span-bar--overdue" : "") +
          ((b.itemType || "todo").toLowerCase() !== "todo"
            ? " calendar-monthly-span-bar--schedule-strip"
            : "");
        bar.title = b.name;
        bar.style.cssText = `left:${b.left}%;width:${b.width}%;--bar-bg:${b.color};top:${0.15 + b.row * BAR_HEIGHT}rem`;
        if (b.isSingleDay) {
          if (isTodo) {
            bar.innerHTML = `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            bar.style.setProperty("--schedule-icon-color", b.color);
            bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" aria-hidden="true"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          }
          bar.dataset.date = b.dateKey || "";
          bar.dataset.sectionId = b.sectionId || "";
          bar.dataset.taskId = b.taskId || "";
          bar.dataset.kpiTodoId = b.kpiTodoId || "";
          bar.dataset.storageKey = b.storageKey || "";
          bar.dataset.done = b.done ? "true" : "false";
          bar.dataset.itemType = b.itemType || "todo";
          if (isTodo && b.done) {
            bar.classList.add("is-completed");
            bar
              .querySelector(".calendar-monthly-span-bar-checkbox-inner")
              ?.classList.add("checked");
          }
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
          if (!window.matchMedia("(max-width: 48rem)").matches)
            bar.addEventListener("click", toggleDone);
        } else {
          if (isTodo) {
            bar.innerHTML = showCheckbox
              ? `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`
              : `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            if (b.isFirstSegment) {
              bar.style.setProperty("--schedule-icon-color", b.color);
              bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" aria-hidden="true"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
            } else {
              bar.innerHTML = `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
            }
          }
          if (isTodo && b.done) {
            bar.classList.add("is-completed");
            bar
              .querySelector(".calendar-monthly-span-bar-checkbox-inner")
              ?.classList.add("checked");
          }
          if (isTodo && !window.matchMedia("(max-width: 48rem)").matches) {
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
        bindCalendarSpanBarDragHandlers(bar, b);
        if (b.isSingleDay && b.dueDate) {
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
      weekDateKeys.forEach((dateKey) => {
        const slot = document.createElement("div");
        slot.style.cssText =
          "display:flex;justify-content:center;align-items:flex-end;padding:0 0.15rem;";
        moreEl.appendChild(slot);
      });
      weekWrap.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (calendarDragTransferTypesAllowDrop(e.dataTransfer)) {
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
        let json = readCalendarDropPayloadJson(e.dataTransfer);
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
            { recordCalendarSidebarRevert: true },
          );
          if (!ok && (payload.name || "").trim()) {
            ok = addCalendarTodoToCustomSection(payload.sectionId, {
              taskId: payload.taskId,
              name: payload.name,
              startDate: newStart,
              dueDate: newDue,
              done: !!payload.done,
              itemType: payload.itemType || "todo",
              _calPrevStart: oldStart,
              _calPrevDue: oldDue,
            });
          }
        } else if (
          KPI_SECTION_IDS.includes(payload.sectionId) &&
          ((payload.taskId || "").trim() || (payload.name || "").trim())
        ) {
          if (payload.kpiTodoId && payload.storageKey) {
            ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
              startDate: newStart,
              dueDate: newDue,
              recordCalendarSidebarRevert: true,
            });
          } else {
            ok =
              updateSectionTaskDates(
                payload.sectionId,
                payload.taskId,
                newStart,
                newDue,
                { recordCalendarSidebarRevert: true },
              ) ||
              addSectionTaskToCalendar(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
                _calPrevStart: oldStart,
                _calPrevDue: oldDue,
              });
          }
        }
        if (ok) {
          syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok);
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
  const sidebarTitleExpanded = lpCalendarTodoSidebarExpandedTitle(sidebarMode);
  todoSidebar.innerHTML = `
    <div class="calendar-todo-sidebar-header">
      <span class="calendar-todo-sidebar-title">${sidebarTitleExpanded}</span>
      <button type="button" class="calendar-todo-sidebar-collapse" title="사이드바 접기">
        <span class="calendar-todo-sidebar-collapse-text">접기</span>
      </button>
    </div>
    <div class="calendar-todo-sidebar-body">
      <div class="calendar-todo-sidebar-main"></div>
    </div>
  `;
  const body = todoSidebar.querySelector(".calendar-todo-sidebar-body");
  const mainWrap = body.querySelector(".calendar-todo-sidebar-main");
  const todoListEl = renderTodoList(
    lpCalendarDateSidebarTodoListOpts(sidebarMode),
  );
  mainWrap.appendChild(lpWrapCalendarTodoSidebarListEl(todoListEl));
  lpBindCalendarDateTodoSidebarCollapse(todoSidebar, sidebarMode);
  applyCalendarTodoSidebarInitiallyCollapsed(todoSidebar);
  wrap.appendChild(todoSidebar);
  attachCalendarTodoSidebarSpanRevertDrop(
    body,
    () => renderCalendar(),
    () => refreshTodoList(),
  );

  wrap.addEventListener("dragend", () => {
    wrap
      .querySelectorAll(".calendar-day-drag-over")
      .forEach((el) => el.classList.remove("calendar-day-drag-over"));
  });

  renderCalendar();

  wrap._lpRefreshDateTodoSidebar = refreshTodoList;

  return wrap;
}

/** 표→타임테이블 실시간 동기화: DOM에서 현재 입력값 직접 수집 (표 값 변경 시 즉시 반영) */
const TT_SYNC_DEBUG = false;
if (typeof window !== "undefined") window.TT_SYNC_DEBUG = TT_SYNC_DEBUG;
function collectLiveScheduledFromBudgetColumn(budgetColumn) {
  if (!budgetColumn) {
    return {};
  }
  const byTask = {};
  /*
   * 투두 표(.calendar-1day-todo-table)는 time-budget-scheduled-input 이 없어도
   * dataset·DOM 구조 때문에 잘못 짝지어지면 다른 과제 시간이 섞일 수 있음.
   * 예상 타임라인 동기화는 "투자/소비" 예산 블록 행만 읽는다.
   */
  const rows = budgetColumn.querySelectorAll(
    ".time-daily-budget-table-block tbody tr:not(.time-row-add)",
  );
  rows.forEach((row, idx) => {
    const name = (row.dataset.taskName || "").trim();
    if (!name) return;
    const inputs = row.querySelectorAll(".time-budget-scheduled-input");
    if (inputs.length < 2) return;
    const startRaw = inputs[0]?.value ?? row.dataset.scheduledStart ?? "";
    const endRaw = inputs[1]?.value ?? row.dataset.scheduledEnd ?? "";
    const start = String(startRaw).trim();
    const end = String(endRaw).trim();
    void idx;
    if (!start || !end) return;
    const st = `${start}-${end}`;
    if (!byTask[name]) byTask[name] = [];
    if (!byTask[name].includes(st)) byTask[name].push(st);
  });
  return byTask;
}

/** dateStr(YYYY-MM-DD) 기준 전날 키 반환 */
function getYesterdayKey(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "";
  const parts = dateStr
    .trim()
    .split(/[\/\-]/)
    .map(Number);
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
    (r) =>
      normDate(r.date || parseDateFromTimeStr(r.startTime)) === actualFilterKey,
  );
  const parseHhMmToMinutes = (s) => {
    if (!s || !s.trim()) return null;
    const str = String(s).trim();
    const m = str.match(/^(\d{1,2}):?(\d{0,2})$/);
    if (m) return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
    const m4 = str.match(/^(\d{3,4})$/);
    if (m4) {
      const digits = m4[1];
      const h =
        digits.length === 4
          ? parseInt(digits.slice(0, 2), 10)
          : parseInt(digits.slice(0, 1), 10);
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
  /** 겹침 길이(분). [start,end) 반열린 구간 — 문자열/NaN이면 0 */
  const overlapMinutesBetween = (a, b) => {
    const sa = Number(a?.startMin);
    const ea = Number(a?.endMin);
    const sb = Number(b?.startMin);
    const eb = Number(b?.endMin);
    if (![sa, ea, sb, eb].every((n) => Number.isFinite(n))) return 0;
    const o = Math.min(ea, eb) - Math.max(sa, sb);
    return o > 0 ? o : 0;
  };
  /**
   * 동시(반열): 시간이 1분이라도 겹치면 나란히 배치. (끝=다음 시작은 겹침 아님)
   */
  const assignLanesToSpans = (spans) => {
    const laneOccupants = [];
    let maxLane = 0;
    for (const span of spans) {
      let lane = 0;
      while (lane < laneOccupants.length) {
        const inLane = laneOccupants[lane];
        const conflicts = inLane.some(
          (s) => overlapMinutesBetween(span, s) > 0,
        );
        if (!conflicts) break;
        lane++;
      }
      if (lane >= laneOccupants.length) laneOccupants.push([]);
      laneOccupants[lane].push(span);
      span.lane = lane;
      maxLane = Math.max(maxLane, lane);
    }
    return { spans, maxLane };
  };
  /**
   * 같은 과제명으로 예산표·할일에 겹치게 들어간 구간(수면 등)은 하나로 합쳐 반열 오판 방지
   */
  const mergeOverlappingSameNameSpans = (spans) => {
    let arr = spans.map((s) => ({ ...s }));
    let changed = true;
    while (changed) {
      changed = false;
      outer: for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i];
          const b = arr[j];
          if (
            String(a.taskName || "").trim() !== String(b.taskName || "").trim()
          )
            continue;
          if (overlapMinutesBetween(a, b) <= 0) continue;
          const startMin = Math.min(a.startMin, b.startMin);
          const endMin = Math.max(a.endMin, b.endMin);
          const startSlot = Math.floor(startMin / MIN_PER_SLOT);
          const endSlot = Math.min(
            SLOTS_PER_DAY - 1,
            Math.floor((endMin - 1) / MIN_PER_SLOT),
          );
          const merged = {
            ...a,
            startMin,
            endMin,
            startSlot,
            endSlot: Math.max(endSlot, startSlot),
            startDisplay: fmt(startMin),
            endDisplay: fmt(endMin),
          };
          arr = arr.filter((_, k) => k !== i && k !== j);
          arr.push(merged);
          changed = true;
          break outer;
        }
      }
    }
    return arr;
  };
  /** 과제별로 스팬 직접 생성 - 슬롯 경계에 갇히지 않고 실제 시작/마감 시간 사용 */
  const buildExpectedSpansFromTasks = () => {
    const spans = [];
    for (const [taskName, data] of Object.entries(budgetGoals)) {
      const times = getScheduledTimesForTask(data);
      const taskFromList = tasks.find(
        (t) => (t.name || "").trim() === taskName,
      );
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
          span._taskKey =
            taskFromList.kpiTodoId || taskFromList.taskId || taskFromList.name;
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
    /* 예산표 scheduledTimes 와 할일 start/end 가 같은 구간이면 스팬이 두 번 들어가 레인이 갈라짐 → 한 번만 */
    const spanDedupeKey = (s) =>
      `${String(s.taskName || "").trim()}\0${s.startMin}\0${s.endMin}`;
    const seenSpanKeys = new Set();
    const dedupedSpans = [];
    for (const s of spans) {
      const k = spanDedupeKey(s);
      if (seenSpanKeys.has(k)) continue;
      seenSpanKeys.add(k);
      dedupedSpans.push(s);
    }
    const mergedSameName = mergeOverlappingSameNameSpans(dedupedSpans);
    const sorted = mergedSameName.sort((a, b) => a.startMin - b.startMin);
    const clamped = sorted
      .map((s) => {
        const sm = Number(s.startMin);
        const em = Number(s.endMin);
        if (!Number.isFinite(sm) || !Number.isFinite(em) || em <= sm)
          return null;
        const startMin = Math.max(0, sm);
        const endMin = Math.min(24 * 60, em);
        if (endMin <= startMin) return null;
        const startSlot = Math.floor(startMin / MIN_PER_SLOT);
        const endSlot = Math.min(
          SLOTS_PER_DAY - 1,
          Math.floor((endMin - 1) / MIN_PER_SLOT),
        );
        return {
          ...s,
          startMin,
          endMin,
          startSlot,
          endSlot: Math.max(endSlot, startSlot),
          startDisplay: fmt(startMin),
          endDisplay: fmt(endMin),
        };
      })
      .filter(Boolean);
    const withLanes = assignLanesToSpans(clamped);
    const normalized = withLanes.spans.map((s) => ({
      ...s,
      startDisplay: fmt(s.startMin),
      endDisplay: fmt(s.endMin),
    }));
    return { spans: normalized, maxLane: withLanes.maxLane };
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
    const toMinutes = (str) =>
      parseDateTimeToMinutes(str) ?? parseHhMmToMinutes(str);
    for (const r of actualRows) {
      const startMin = toMinutes(r.startTime);
      const endMin = toMinutes(r.endTime);
      if (startMin == null || endMin == null || endMin <= startMin) continue;
      const prod =
        r.productivity ||
        getTaskOptionByName(r.taskName)?.productivity ||
        "other";
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
        endSlot: Math.min(
          SLOTS_PER_DAY - 1,
          Math.floor((s.endMin - 1) / MIN_PER_SLOT),
        ),
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
  /** 오늘 실제: 너무 짧으면 막대가 사라져 보임 — 시각 최소(분). 모바일 탭 상세는 이보다 길어도 읽기 어려울 때만 */
  const ACTUAL_MIN_VISUAL_MINUTES = 8;
  const ACTUAL_TAP_TOAST_MAX_MINUTES = 18;
  /** 예상·실제 공통: 이 분 이하(포함)는 과제명·시간 라벨 생략 — 20분까지는 표시하지 않음 */
  const TIMETABLE_MAX_MINUTES_TO_HIDE_LABEL = 20;
  /** 오늘실제만: 이 분 이하(포함)는 과제명·시간 한 줄, 초과는 두 줄(기존) */
  const ACTUAL_MAX_MINUTES_ONE_LINE_LABEL = 30;

  const createOverlay = (spans, colors, isActual, _maxLane = 0) => {
    const overlay = document.createElement("div");
    overlay.className = `calendar-1day-time-fill-overlay calendar-1day-time-fill-overlay--${isActual ? "actual" : "expected"}`;
    const spansOverlapForSimultaneousLanes = (a, b) =>
      overlapMinutesBetween(a, b) > 0;
    /**
     * 이 블록과 시간이 직접 겹치는 스팬만 묶음.
     * (이전 BFS는 A↔B↔C 연쇄로, 수면과 오후 일이 안 겹쳐도 한 무리가 되어 전부 반열로 깎였음.)
     */
    const cohortDirectlyOverlapping = (seed) => {
      const rest = spans.filter(
        (o) => o !== seed && spansOverlapForSimultaneousLanes(seed, o),
      );
      return [seed, ...rest];
    };
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
      const visualBlockMin =
        isActual && actualBlockMin > 0
          ? Math.max(actualBlockMin, ACTUAL_MIN_VISUAL_MINUTES)
          : actualBlockMin;
      const fmt = (m) =>
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const cohort = cohortDirectlyOverlapping(first);
      /* 직접 겹치는 일이 2개 이상이면 반열(나란히). 코호트는 직접 겹침만 포함 */
      const useLaneLayout = cohort.length > 1;
      let laneCountLocal = 1;
      let laneLocal = first.lane ?? 0;
      if (useLaneLayout) {
        const sortedCluster = [...cohort].sort(
          (a, b) =>
            a.startMin - b.startMin ||
            String(a.taskName || "").localeCompare(
              String(b.taskName || ""),
              "ko",
            ),
        );
        const copies = sortedCluster.map((s) => ({ ...s }));
        const { maxLane: clusterMaxLane } = assignLanesToSpans(copies);
        laneCountLocal = Math.max(1, clusterMaxLane + 1);
        const seedIdx = sortedCluster.findIndex((s) => s === first);
        laneLocal =
          seedIdx >= 0 ? (copies[seedIdx]?.lane ?? 0) : (first.lane ?? 0);
      }
      const blockFill = document.createElement("div");
      blockFill.className =
        "calendar-1day-time-slot-fill calendar-1day-time-slot-fill--block calendar-1day-time-slot-fill--span" +
        (useLaneLayout ? " calendar-1day-time-slot-fill--lane" : "");
      const MIN_PER_DAY = 24 * 60;
      /*
       * 오버레이가 display:grid일 때 absolute 자식의 % top/height는
       * 자동 배치된 '한 시간 칸' 높이 기준이 되어 하루와 어긋남.
       * 그리드 영역을 1~끝 행·열로 잡아 포함 블록을 하루 전체로 맞춘다.
       */
      const spanFullOverlayGridForAbs = () => {
        blockFill.style.gridColumn = "1 / -1";
        blockFill.style.gridRow = "1 / -1";
      };
      /** 하루 1440분 대비 top + height % (bottom 동시 지정은 일부 환경에서 높이가 어긋날 수 있음) */
      const applyDayVerticalExtents = () => {
        const durationMin = Math.min(
          MIN_PER_DAY - blockStartMin,
          isActual ? visualBlockMin : blockEndMin - blockStartMin,
        );
        const h = Math.max(0, durationMin);
        blockFill.style.top = `calc(${blockStartMin} * 100% / ${MIN_PER_DAY})`;
        blockFill.style.height = `calc(${h} * 100% / ${MIN_PER_DAY})`;
        blockFill.style.bottom = "auto";
        blockFill.style.minHeight = "";
      };
      if (useLaneLayout) {
        /* 겹침 구간: 하루 비율 absolute + 가로 분할 (예상·실제 동일) */
        spanFullOverlayGridForAbs();
        blockFill.style.position = "absolute";
        blockFill.style.left = `${(laneLocal / laneCountLocal) * 100}%`;
        blockFill.style.width = `${100 / laneCountLocal}%`;
        applyDayVerticalExtents();
        blockFill.style.zIndex = String(100 + Math.min(blockStartMin, 2000));
      } else if (isActual) {
        /* 오늘 실제: 전폭 absolute (그리드 행에 걸면 인접 구간 겹침) */
        spanFullOverlayGridForAbs();
        blockFill.style.position = "absolute";
        blockFill.style.left = "0";
        blockFill.style.width = "100%";
        applyDayVerticalExtents();
        blockFill.style.zIndex = String(100 + Math.min(blockStartMin, 2000));
      } else {
        /*
         * 예상·전폭: 반열과 동일하게 '하루 1440분' 비율로만 배치.
         * grid-row+relative+flex % 조합은 일부 브라우저에서 높이가 0에 가깝게 무너짐.
         */
        spanFullOverlayGridForAbs();
        blockFill.style.position = "absolute";
        blockFill.style.left = "0";
        blockFill.style.width = "100%";
        applyDayVerticalExtents();
        blockFill.style.zIndex = String(100 + Math.min(blockStartMin, 2000));
      }
      /* .time-slot-fill { right:0 } 과 width:100%가 겹치면 가로·세로 계산이 흔들릴 수 있음 */
      blockFill.style.right = "auto";
      const heightPct =
        blockHeightMin > 0 && actualBlockMin < blockHeightMin
          ? ((actualBlockMin / blockHeightMin) * 100).toFixed(1)
          : "100";
      blockFill.dataset.debugBlock = `${fmt(blockStartMin)}~${fmt(blockEndMin)} slot${blockStartSlot}-${blockEndSlot} h=${blockHeightMin}m actual=${actualBlockMin}m height=${heightPct}%`;
      /* 단일 스팬: main.css의 .time-slot-fill(display:flex)가 세로 채움을 막는 경우가 있어 block으로 둠 */
      if (group.length === 1) {
        blockFill.style.display = "block";
      } else {
        blockFill.style.display = "flex";
        blockFill.style.flexDirection = "column";
      }
      blockFill.style.gap = "0";
      blockFill.style.padding = "0";
      /* 예상: main.css .time-slot-fill{overflow:hidden} + 여기 hidden이 긴 막대·라벨을 세로로 잘라 냄 */
      blockFill.style.overflow = isActual ? "hidden" : "visible";
      if (useLaneLayout) {
        blockFill.style.borderRadius =
          laneLocal === 0
            ? "0.375rem 0 0 0.375rem"
            : laneLocal === laneCountLocal - 1
              ? "0 0.375rem 0.375rem 0"
              : "0";
      } else {
        blockFill.style.borderRadius = "0.375rem";
        blockFill.style.border = "none";
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
          c = colors[sp.prod] ?? colors.other;
        }
        if (!c) continue;
        if (!firstBorderColor) firstBorderColor = c.border;
        /* actualBlockMin 기준으로 세그먼트 비율 계산 - 블록 높이 축소 시에도 세그먼트가 블록 전체를 채우도록 */
        const segHeightPct =
          actualBlockMin > 0
            ? ((sp.endMin - sp.startMin) / actualBlockMin) * 100
            : 0;
        const seg = document.createElement("div");
        seg.className = "calendar-1day-time-slot-fill-seg";
        /*
         * 부모 높이가 %인 flex 컨테이너에서 자식 flex-basis %가 0으로 무너지는 경우가 있음(장시간 막대가 얇게 보임).
         * 그룹이 한 스팬이면 flex-grow로 부모를 채움.
         */
        if (group.length === 1) {
          seg.style.flex = "none";
          seg.style.height = "100%";
          /* 예상 막대: 짧은 구간에 min-height 주면 1시간 칸만큼 칠해지는 것처럼 보임 */
          seg.style.minHeight =
            isActual && actualBlockMin > 0 && actualBlockMin < 40
              ? "2.5rem"
              : "0";
        } else {
          seg.style.flex = `0 0 ${segHeightPct}%`;
          seg.style.minHeight = isActual ? "2.5rem" : "0";
        }
        seg.style.width = "100%";
        seg.style.display = "flex";
        seg.style.alignItems = "flex-start";
        /* 왼쪽 컬러 바(border-left는 부모 blockFill)와 라벨 사이 — 너무 붙어 보이지 않게 */
        seg.style.padding = "0.25rem 0.375rem 0.25rem 1rem";
        seg.style.backgroundColor = c.bg;
        seg.style.boxSizing = "border-box";
        if (c.border) {
          const edge = rgbaToSoftHorizontalEdge(c.border, 0.26);
          seg.style.borderTop = `0.5px solid ${edge}`;
          seg.style.borderBottom = `0.5px solid ${edge}`;
        }
        if (!isActual) {
          seg.style.overflow = "visible";
        }
        const segDurationMin = Math.max(
          0,
          (sp.endMin ?? 0) - (sp.startMin ?? 0),
        );
        const showTimetableLabel =
          segDurationMin > TIMETABLE_MAX_MINUTES_TO_HIDE_LABEL;
        if (showTimetableLabel) {
          const labelWrap = document.createElement("div");
          /* 짧은 구간(21~30분): 예상·실제 공통 — 과제명 왼쪽, 시간 오른쪽 한 줄(넘침 시 이름만 …) */
          const useCompactOneLineLabel =
            segDurationMin > TIMETABLE_MAX_MINUTES_TO_HIDE_LABEL &&
            segDurationMin <= ACTUAL_MAX_MINUTES_ONE_LINE_LABEL;
          if (useCompactOneLineLabel) {
            labelWrap.className =
              "calendar-1day-time-slot-label-wrap calendar-1day-time-slot-label-wrap--actual-one-line";
            const labelName = document.createElement("span");
            labelName.className =
              "calendar-1day-time-slot-label-name calendar-1day-time-slot-label-name--one-line";
            labelName.textContent = sp.taskName || "";
            const labelTime = document.createElement("span");
            labelTime.className =
              "calendar-1day-time-slot-label-time calendar-1day-time-slot-label-time--one-line";
            labelTime.textContent = `${sp.startDisplay} ~ ${sp.endDisplay}`;
            labelWrap.appendChild(labelName);
            labelWrap.appendChild(labelTime);
          } else {
            labelWrap.className = "calendar-1day-time-slot-label-wrap";
            const labelName = document.createElement("span");
            labelName.className = "calendar-1day-time-slot-label-name";
            labelName.textContent = sp.taskName || "";
            const labelTime = document.createElement("span");
            labelTime.className = "calendar-1day-time-slot-label-time";
            labelTime.textContent = `${sp.startDisplay} ~ ${sp.endDisplay}`;
            labelWrap.appendChild(labelName);
            labelWrap.appendChild(labelTime);
          }
          const labelFg = timetableAccentTextColor(c.border || c.bg);
          if (labelFg) labelWrap.style.color = labelFg;
          seg.appendChild(labelWrap);
        }
        blockFill.appendChild(seg);
      }
      if (firstBorderColor) {
        blockFill.style.borderLeft = `0.125rem solid ${firstBorderColor}`;
        /* 세그먼트 배경·텍스트 전체를 바 안쪽으로 살짝 들여 씀(border와 첫 픽셀 사이) */
        blockFill.style.paddingLeft = "0.4375rem";
      }
      if (isActual && actualBlockMin > 0) {
        const timeRange = `${fmt(blockStartMin)} ~ ${fmt(blockEndMin)}`;
        blockFill.classList.add("calendar-1day-time-slot-fill--actual-block");
        blockFill.setAttribute(
          "title",
          `${(first.taskName || "기록").trim()}\n${timeRange}`,
        );
        if (actualBlockMin < ACTUAL_MIN_VISUAL_MINUTES) {
          blockFill.classList.add("calendar-1day-time-slot-fill--actual-short");
        }
        blockFill.addEventListener("click", (e) => {
          e.stopPropagation();
          if (typeof window === "undefined") return;
          /* 모바일·PC 공통: 짧은 구간만(길면 막대 안에 글자가 보이므로) 토스트로 상세 */
          if (actualBlockMin > ACTUAL_TAP_TOAST_MAX_MINUTES) return;
          showToast((first.taskName || "기록").trim(), timeRange);
        });
      }
      overlay.appendChild(blockFill);
    }
    return overlay;
  };
  return {
    expected: createOverlay(
      expectedSpans,
      prodColorsExpected,
      false,
      expectedMaxLane,
    ),
    actual: createOverlay(actualSpans, prodColorsActual, true, actualMaxLane),
  };
}

function render1DayView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-1day-view";

  let dayOffset = 0;
  /** Date#getDay() 용 (0=일) — 네비 날짜 옆 요일 표기 */
  const NAV_WEEKDAYS_SUN0 = ["일", "월", "화", "수", "목", "금", "토"];

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
  nav.className = "calendar-nav calendar-1day-nav";
  nav.innerHTML = `
    <div class="calendar-nav-controls">
      <button type="button" class="calendar-nav-prev" title="이전 날">&lt;</button>
      <button type="button" class="calendar-nav-today" title="해당 날짜">날짜</button>
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
        const targetTimeDisplay = k.targetTimeRequired
          ? minutesToHhMm(
              String(k.targetTimeRequired).includes(":")
                ? hhMmToMinutes(k.targetTimeRequired)
                : parseInt(k.targetTimeRequired, 10) || 0,
            )
          : "";
        const investedTimeHtml = targetTimeDisplay
          ? `지금까지 투자한 시간 <span class="dream-kpi-card-invested-value">${minutesToHhMm(investedMins)}</span> / <span class="dream-kpi-card-invested-value">${targetTimeDisplay}</span>`
          : `지금까지 투자한 시간 <span class="dream-kpi-card-invested-value">${minutesToHhMm(investedMins)}</span>`;
        const hasTimeTarget = !!k.targetTimeRequired;
        const lower = !!k.directionLower;
        return `
        <div class="kpi-view-card dream-kpi-card calendar-kpi-card ${!hasTimeTarget ? "calendar-kpi-card-no-time" : ""}${lower ? " dream-kpi-card--lower-better" : ""}" data-kpi-id="${escapeHtml(kpiId)}" data-storage-key="${escapeHtml(storageKey)}">
          <div class="dream-kpi-card-inner calendar-kpi-card-inner">
            <div class="dream-kpi-card-name">${escapeHtml(k.name)}${lower ? '<span class="dream-kpi-card-direction-badge" title="낮을수록 좋음 KPI">↓낮음</span>' : ""}</div>
            <div class="dream-kpi-card-target-num">${lower ? '<span class="dream-kpi-card-target-prefix">상한 </span>' : ""}${k.targetValue ? escapeHtml(String(k.targetValue).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) + (k.unit ? '<span class="dream-kpi-card-unit"> ' + escapeHtml(k.unit) + "</span>" : "") : "—"}</div>
            ${k.targetStartDate || k.targetDeadline ? `<div class="dream-kpi-card-deadline">${escapeHtml(formatDeadlineRangeCompact(k.targetStartDate, k.targetDeadline))}</div>` : ""}
            <div class="dream-kpi-card-progress">
              <div class="dream-kpi-card-progress-bar"><div class="dream-kpi-card-progress-fill" style="width:${k.progress}%"></div></div>
              <div class="dream-kpi-card-progress-text">${escapeHtml(k.progressText)}</div>
            </div>
            <div class="dream-kpi-card-invested">${investedTimeHtml}</div>
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
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!(await confirmKpiTodoDelete())) return;
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
    const todayBtn = nav.querySelector(".calendar-nav-today");
    if (todayBtn) {
      const y = targetDate.getFullYear();
      const m = targetDate.getMonth() + 1;
      const d = targetDate.getDate();
      const w = NAV_WEEKDAYS_SUN0[targetDate.getDay()] || "";
      todayBtn.textContent = `${y}. ${m}. ${d}(${w})`;
      todayBtn.title = dayOffset === 0 ? "오늘" : `${y}년 ${m}월 ${d}일`;
    }

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
    const EISENHOWER_KEY_BY_LABEL_1DAY = {
      "긴급+중요": "urgent-important",
      "중요+여유": "important-not-urgent",
      "긴급+덜중요": "urgent-not-important",
      "여유+안중요": "not-urgent-not-important",
    };
    const todoTable = document.createElement("table");
    todoTable.className = "calendar-1day-todo-table time-daily-budget-table";
    todoTable.innerHTML = `
      <colgroup>
        <col class="calendar-1day-todo-col-task" />
        <col class="calendar-1day-todo-col-priority" />
      </colgroup>
      <thead><tr><th>오늘의 할일</th><th>우선순위</th></tr></thead>
      <tbody></tbody>
    `;
    const todoTbody = todoTable.querySelector("tbody");

    const EISENHOWER_ORDER = [
      "urgent-important",
      "important-not-urgent",
      "urgent-not-important",
      "not-urgent-not-important",
    ];
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
        (isTodo ? " calendar-monthly-span-bar--has-checkbox" : "") +
        (calendarBarTaskIsOverdueTodo(t)
          ? " calendar-monthly-span-bar--overdue"
          : "");
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
      if (isTodo && !window.matchMedia("(max-width: 48rem)").matches) {
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
      const priorityTd = document.createElement("td");
      priorityTd.className = "calendar-1day-todo-priority-cell";
      priorityTd.textContent = (t.eisenhower || "").trim()
        ? EISENHOWER_LABELS_1DAY[(t.eisenhower || "").trim()] ||
          (t.eisenhower || "").trim()
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
      requestAnimationFrame(() => {
        const inner = wrap.querySelector(".calendar-1day-time-table-inner");
        if (!inner || !dateStr) {
          return;
        }
        const budgetColOrNull =
          wrap.querySelector(".calendar-1day-budget-column") || null;
        const actualDateKey =
          wrap.dataset.actualShowsYesterday === "true"
            ? getYesterdayKey(dateStr)
            : undefined;
        const { expected, actual } = build1DayTimetableOverlays(
          dateStr,
          budgetColOrNull,
          actualDateKey,
        );
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
      topBarLeft,
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
    const headerLabel = document.createElement("div");
    headerLabel.className = "calendar-1day-time-header-label";
    headerLabel.textContent = "";
    const headerExpected = document.createElement("div");
    headerExpected.className = "calendar-1day-time-header-cell";
    headerExpected.textContent = "예상";
    const headerActual = document.createElement("div");
    headerActual.className =
      "calendar-1day-time-header-cell calendar-1day-time-header-cell--actual-toggle";
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
    for (let i = 0; i < SLOTS_PER_DAY; i++) {
      const row = document.createElement("div");
      row.className = "calendar-1day-time-row";
      row.style.gridColumn = "1";
      row.style.gridRow = `${i + 1}`;
      const timeLabel = document.createElement("div");
      timeLabel.className = "calendar-1day-time-label";
      timeLabel.textContent = `${String(i).padStart(2, "0")}:00`;
      row.appendChild(timeLabel);
      timeTable.appendChild(row);
      const slotExpected = document.createElement("div");
      slotExpected.className =
        "calendar-1day-time-slot calendar-1day-time-slot--expected";
      slotExpected.style.gridColumn = "2";
      slotExpected.style.gridRow = `${i + 1}`;
      slotExpected.dataset.slotIndex = String(i);
      timeTable.appendChild(slotExpected);
      const slotActual = document.createElement("div");
      slotActual.className =
        "calendar-1day-time-slot calendar-1day-time-slot--actual";
      slotActual.style.gridColumn = "3";
      slotActual.style.gridRow = `${i + 1}`;
      timeTable.appendChild(slotActual);
    }
    const actualDateKeyForInit =
      wrap.dataset.actualShowsYesterday === "true"
        ? getYesterdayKey(targetKey)
        : undefined;
    const { expected: fillOverlayExpected, actual: fillOverlayActual } =
      build1DayTimetableOverlays(targetKey, budgetColumn, actualDateKeyForInit);
    const timeTableWrap = document.createElement("div");
    timeTableWrap.className = "calendar-1day-time-table-wrap";
    const timeTableInner = document.createElement("div");
    timeTableInner.className = "calendar-1day-time-table-inner";
    timeTableInner.appendChild(timeTable);
    timeTableInner.appendChild(fillOverlayExpected);
    timeTableInner.appendChild(fillOverlayActual);
    timeTableWrap.appendChild(headerRow);
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

  const topBar = document.createElement("div");
  topBar.className = "calendar-1day-top-bar";
  const topBarLeft = document.createElement("div");
  topBarLeft.className = "calendar-1day-top-bar-left";
  const topBarRight = document.createElement("div");
  topBarRight.className = "calendar-1day-top-bar-right";
  topBarRight.appendChild(nav);
  topBar.appendChild(topBarLeft);
  topBar.appendChild(topBarRight);

  calendarSection.appendChild(topBar);
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
    void source;
    if (!wrapInDoc) return;
    if (timeTableInner && dateStr) {
      const budgetCol = wrap.querySelector(".calendar-1day-budget-column");
      const actualDateKey =
        wrap.dataset.actualShowsYesterday === "true"
          ? getYesterdayKey(dateStr)
          : undefined;
      const { expected, actual } = build1DayTimetableOverlays(
        dateStr,
        budgetCol,
        actualDateKey,
      );
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

  ensureOneDayTimetableDocumentListeners();
  oneDayTimetableRefreshHandler = (e) => refreshTimetableOverlays(e);

  try {
    renderCalendar();
  } catch (err) {
    throw err;
  }

  return wrap;
}

function renderTodoView(tabsElement) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-view-todo";

  if (tabsElement) {
    const topRow = document.createElement("div");
    topRow.className =
      "calendar-view-top-row calendar-view-top-row--todo calendar-view-top-row--with-settings";
    const tabsWrapper = document.createElement("div");
    tabsWrapper.className = "calendar-monthly-tabs-wrap";
    tabsWrapper.appendChild(tabsElement);
    topRow.appendChild(tabsWrapper);
    wrap.appendChild(topRow);
  }

  const todoMain = document.createElement("div");
  todoMain.className = "calendar-monthly-main calendar-todo-main";

  const todoContent = document.createElement("div");
  todoContent.className = "calendar-todo-content";
  const todoListEl = renderTodoList({
    hideHeader: true,
    categoryToolbarRightActions: true,
  });
  todoContent.appendChild(todoListEl);
  todoMain.appendChild(todoContent);

  wrap.appendChild(todoMain);

  return wrap;
}

function render1WeekView(
  tabsElement,
  sidebarMode = LP_CAL_TODO_SIDEBAR_QUADRANT,
) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-1week-view";
  wrap.dataset.lpCalTodoSidebar = sidebarMode;

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
    refreshCalendarDateTodoSidebar(wrap);
  }

  function renderCalendar() {
    const week = getCalendarGridFor1Week(weekOffset);
    const grid = [week];
    /* 월별 뷰와 동일하게 몇 월인지만 표기 */
    const monthIndex = week[0] ? week[0].getMonth() : new Date().getMonth();
    nav.querySelector(".calendar-nav-month").textContent =
      MONTH_NAMES_EN[monthIndex];
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
    const is1WeekView = true;

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

      weekRow.forEach((date, weekDayIndex) => {
        const cell = document.createElement("div");
        cell.className = "calendar-monthly-day";
        if (!date) {
          cell.classList.add("empty");
          weekRowEl.appendChild(cell);
          return;
        }
        const key = formatDateKey(date);
        cell.dataset.date = key;
        const dayHead = document.createElement("div");
        dayHead.className = "calendar-1week-day-head";
        const weekdayEl = document.createElement("span");
        weekdayEl.className = "calendar-1week-day-weekday";
        weekdayEl.textContent = DAY_NAMES[weekDayIndex] || "";
        const dayNum = document.createElement("div");
        dayNum.className = "calendar-monthly-day-num";
        dayNum.textContent = date.getDate();
        dayHead.appendChild(weekdayEl);
        dayHead.appendChild(dayNum);

        const isCurrentMonth = date.getMonth() === primaryMonth;
        if (!isCurrentMonth) cell.classList.add("other-month");
        if (key === todayKey) cell.classList.add("today");
        if (date.getDay() === 0) cell.classList.add("sun");
        if (date.getDay() === 6) cell.classList.add("sat");

        cell.appendChild(dayHead);
        const entriesEl = document.createElement("div");
        entriesEl.className = "calendar-monthly-day-entries";
        cell.appendChild(entriesEl);

        cell.style.cursor = "pointer";
        cell.addEventListener("click", (e) => {
          if (e.target.closest(".calendar-event-bubble")) return;
          if (e.target.closest(".calendar-monthly-span-bar")) return;
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
          if (calendarDragTransferTypesAllowDrop(e.dataTransfer)) {
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
          const json = readCalendarDropPayloadJson(e.dataTransfer);
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
              recordCalendarSidebarRevert: true,
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
              { recordCalendarSidebarRevert: true },
            );
            if (!ok && (payload.name || "").trim()) {
              ok = addCalendarTodoToCustomSection(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
                _calPrevStart: oldStart,
                _calPrevDue: oldDue,
              });
            }
          } else if (
            KPI_SECTION_IDS.includes(payload.sectionId) &&
            ((payload.taskId || "").trim() || (payload.name || "").trim())
          ) {
            if (payload.kpiTodoId && payload.storageKey) {
              ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
                startDate: newStart,
                dueDate: newDue,
                recordCalendarSidebarRevert: true,
              });
            } else {
              ok =
                updateSectionTaskDates(
                  payload.sectionId,
                  payload.taskId,
                  newStart,
                  newDue,
                  { recordCalendarSidebarRevert: true },
                ) ||
                addSectionTaskToCalendar(payload.sectionId, {
                  taskId: payload.taskId,
                  name: payload.name,
                  startDate: newStart,
                  dueDate: newDue,
                  done: !!payload.done,
                  itemType: payload.itemType || "todo",
                  _calPrevStart: oldStart,
                  _calPrevDue: oldDue,
                });
            }
          }
          if (ok) {
            syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok);
            renderCalendar();
            refreshTodoList();
          }
        });
        weekRowEl.appendChild(cell);
      });

      const barsEl = document.createElement("div");
      barsEl.className = "calendar-monthly-bars";
      const BAR_HEIGHT = window.matchMedia("(max-width: 48rem)").matches
        ? 1.35
        : 2.05;
      const overlaps = (a, b) =>
        a.left < b.left + b.width && b.left < a.left + a.width;
      const allBars = [];
      const CELL_GAP = 3.5;
      /* 1주도 월별과 동일: 기간(시작+마감) 할일은 rangeTasks — 빼면 getTasksForDate(…,true)가 기간을 제외해
       * 서버·세션 done 과 다른 표시(또는 누락)가 난다. */
      rangeTasks.forEach((t) => {
        const barStart = t.startDate > firstDayKey ? t.startDate : firstDayKey;
        const barEnd = t.dueDate < lastDayKey ? t.dueDate : lastDayKey;
        if (barStart > barEnd) return;
        const startIdx = weekDateKeys.indexOf(barStart);
        const endIdx = weekDateKeys.indexOf(barEnd);
        if (startIdx < 0 || endIdx < 0) return;
        if (is1WeekView) {
          weekDateKeys.forEach((dayKey, dayIdx) => {
            if (!dayKey) return;
            if (t.startDate > dayKey || t.dueDate < dayKey) return;
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
              dateKey: dayKey,
              itemType: t.itemType || "todo",
              done: !!t.done,
              kpiTodoId: t.kpiTodoId,
              storageKey: t.storageKey,
              taskId: t.taskId,
              sectionId: t.sectionId,
              startDate: t.startDate,
              dueDate: t.dueDate,
              isOverdueBar: calendarBarTaskIsOverdueTodo(t),
              _calPrevStart:
                (t._calPrevStart || "").toString().slice(0, 10) || "",
              _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
            });
          });
          return;
        }
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
          isOverdueBar: calendarBarTaskIsOverdueTodo(t),
          _calPrevStart: (t._calPrevStart || "").toString().slice(0, 10) || "",
          _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
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
            isOverdueBar: calendarBarTaskIsOverdueTodo(t),
            _calPrevStart:
              (t._calPrevStart || "").toString().slice(0, 10) || "",
            _calPrevDue: (t._calPrevDue || "").toString().slice(0, 10) || "",
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
      /* 기본 3개 높이 유지, 그 이상이면 행을 늘려 전부 표시 (+n 버튼 없음) */
      allBars.forEach((b) => {
        b.isOverflow = false;
      });
      const maxRow = allBars.length
        ? Math.max(...allBars.map((b) => b.row), 0)
        : 0;
      const rowsNeeded = maxRow + 1;
      const BARS_TOP = window.matchMedia("(max-width: 48rem)").matches
        ? 1.35
        : 1.75;
      const BOTTOM_PAD = 0.6;
      const DEFAULT_ROW_HEIGHT_REM = BARS_TOP + 3 * BAR_HEIGHT + BOTTOM_PAD;
      const requiredHeight = BARS_TOP + rowsNeeded * BAR_HEIGHT + BOTTOM_PAD;
      weekRowEl.style.minHeight = `${Math.max(DEFAULT_ROW_HEIGHT_REM, requiredHeight)}rem`;
      const isMobileStack = window.matchMedia("(max-width: 48rem)").matches;
      const stackBarsInCells = isMobileStack || is1WeekView;
      if (stackBarsInCells) {
        barsEl.style.display = "none";
        weekRowEl
          .querySelectorAll(
            ".calendar-monthly-day:not(.empty) .calendar-monthly-day-entries",
          )
          .forEach((ent) => {
            ent.innerHTML = "";
            ent.style.position = "relative";
            ent.style.minHeight = "";
          });
      }
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
          (b.isOverflow ? " calendar-monthly-span-bar--overflow" : "") +
          (b.isOverdueBar ? " calendar-monthly-span-bar--overdue" : "") +
          ((b.itemType || "todo").toLowerCase() !== "todo"
            ? " calendar-monthly-span-bar--schedule-strip"
            : "");
        bar.title = b.name;
        bar.style.cssText = `left:${b.left}%;width:${b.width}%;--bar-bg:${b.color};top:${0.15 + b.row * BAR_HEIGHT}rem`;
        if (b.isSingleDay) {
          if (isTodo) {
            bar.innerHTML = `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            bar.style.setProperty("--schedule-icon-color", b.color);
            bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" aria-hidden="true"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          }
          bar.dataset.date = b.dateKey || "";
          bar.dataset.sectionId = b.sectionId || "";
          bar.dataset.taskId = b.taskId || "";
          bar.dataset.kpiTodoId = b.kpiTodoId || "";
          bar.dataset.storageKey = b.storageKey || "";
          bar.dataset.done = b.done ? "true" : "false";
          bar.dataset.itemType = b.itemType || "todo";
          if (isTodo && b.done) {
            bar.classList.add("is-completed");
            bar
              .querySelector(".calendar-monthly-span-bar-checkbox-inner")
              ?.classList.add("checked");
          }
          const toggleDone = (e) => {
            if (e) e.stopPropagation();
            const newDone = bar.dataset.done !== "true";
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
            if (!is1WeekView) renderCalendar();
            refreshTodoList();
          };
          const isMobileBar = window.matchMedia("(max-width: 48rem)").matches;
          if (!isMobileBar || is1WeekView) {
            const attachToggle = (el) => {
              if (!el) return;
              el.addEventListener("click", toggleDone);
              el.addEventListener(
                "touchend",
                (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleDone(e);
                },
                { passive: false },
              );
              el.addEventListener(
                "touchstart",
                (e) => {
                  e.stopPropagation();
                },
                { passive: true },
              );
            };
            attachToggle(bar);
            const cb = bar.querySelector(".calendar-monthly-span-bar-checkbox");
            attachToggle(cb);
            if (cb)
              attachToggle(
                cb.querySelector(".calendar-monthly-span-bar-checkbox-inner"),
              );
          }
        } else {
          if (isTodo) {
            bar.innerHTML = showCheckbox
              ? `<span class="calendar-monthly-span-bar-checkbox" style="border-color:${b.color}"><span class="calendar-monthly-span-bar-checkbox-inner"></span></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`
              : `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            if (b.isFirstSegment) {
              bar.style.setProperty("--schedule-icon-color", b.color);
              bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" aria-hidden="true"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
            } else {
              bar.innerHTML = `<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
            }
          }
          if (isTodo && b.done) {
            bar.classList.add("is-completed");
            bar
              .querySelector(".calendar-monthly-span-bar-checkbox-inner")
              ?.classList.add("checked");
          }
          const isMobileRangeBar =
            window.matchMedia("(max-width: 48rem)").matches;
          if (isTodo && (!isMobileRangeBar || is1WeekView)) {
            const rangeToggleDone = (e) => {
              e.preventDefault();
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
              if (!is1WeekView) renderCalendar();
              refreshTodoList();
            };
            const attachRangeToggle = (el) => {
              if (!el) return;
              el.addEventListener("click", rangeToggleDone);
              el.addEventListener(
                "touchend",
                (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  rangeToggleDone(e);
                },
                { passive: false },
              );
              el.addEventListener(
                "touchstart",
                (e) => {
                  e.stopPropagation();
                },
                { passive: true },
              );
            };
            attachRangeToggle(bar);
            const cbRange = bar.querySelector(
              ".calendar-monthly-span-bar-checkbox",
            );
            attachRangeToggle(cbRange);
            if (cbRange)
              attachRangeToggle(
                cbRange.querySelector(
                  ".calendar-monthly-span-bar-checkbox-inner",
                ),
              );
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
        bindCalendarSpanBarDragHandlers(bar, b);
        if (b.isSingleDay && b.dueDate) {
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
        if (stackBarsInCells && !b.isOverflow) {
          if (b.isSingleDay && b.dateKey) {
            const cell = weekRowEl.querySelector(
              `.calendar-monthly-day[data-date="${b.dateKey}"]`,
            );
            const entries = cell?.querySelector(
              ".calendar-monthly-day-entries",
            );
            if (entries) {
              const daySingles = allBars.filter(
                (x) => x.isSingleDay && x.dateKey === b.dateKey,
              );
              const localIdx = daySingles.indexOf(b);
              bar.style.cssText = `left:0;right:0;width:100%;max-width:100%;box-sizing:border-box;--bar-bg:${b.color};top:${0.1 + localIdx * BAR_HEIGHT}rem;`;
              entries.appendChild(bar);
              entries.style.minHeight = `${0.1 + daySingles.length * BAR_HEIGHT + 0.35}rem`;
              return;
            }
          } else if (!b.isSingleDay && b.startDate && b.dueDate) {
            const anchorKey =
              b.startDate < firstDayKey ? firstDayKey : b.startDate;
            const cell = weekRowEl.querySelector(
              `.calendar-monthly-day[data-date="${anchorKey}"]`,
            );
            const entries = cell?.querySelector(
              ".calendar-monthly-day-entries",
            );
            if (entries) {
              bar.style.cssText = `left:0;right:0;width:100%;max-width:100%;box-sizing:border-box;--bar-bg:${b.color};top:${0.1 + b.row * BAR_HEIGHT}rem;`;
              entries.appendChild(bar);
              const needH = 0.1 + (b.row + 1) * BAR_HEIGHT + 0.35;
              const cur = parseFloat(entries.style.minHeight) || 0;
              if (needH > cur) entries.style.minHeight = `${needH}rem`;
              return;
            }
          }
        }
        barsEl.appendChild(bar);
      });
      const moreEl = document.createElement("div");
      moreEl.className = "calendar-day-more-overlay";
      moreEl.style.cssText =
        "display:grid;grid-template-columns:repeat(7,1fr);position:absolute;inset:0;pointer-events:none;align-content:flex-end;padding:0.2rem 0;";
      if (isMobileStack) {
        moreEl.style.display = "none";
      }
      weekDateKeys.forEach((dateKey) => {
        const slot = document.createElement("div");
        slot.style.cssText =
          "display:flex;justify-content:center;align-items:flex-end;padding:0 0.15rem;";
        moreEl.appendChild(slot);
      });
      weekWrap.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (calendarDragTransferTypesAllowDrop(e.dataTransfer)) {
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
        let json = readCalendarDropPayloadJson(e.dataTransfer);
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
            { recordCalendarSidebarRevert: true },
          );
          if (!ok && (payload.name || "").trim()) {
            ok = addCalendarTodoToCustomSection(payload.sectionId, {
              taskId: payload.taskId,
              name: payload.name,
              startDate: newStart,
              dueDate: newDue,
              done: !!payload.done,
              itemType: payload.itemType || "todo",
              _calPrevStart: oldStart,
              _calPrevDue: oldDue,
            });
          }
        } else if (
          KPI_SECTION_IDS.includes(payload.sectionId) &&
          ((payload.taskId || "").trim() || (payload.name || "").trim())
        ) {
          if (payload.kpiTodoId && payload.storageKey) {
            ok = updateKpiTodo(payload.kpiTodoId, payload.storageKey, {
              startDate: newStart,
              dueDate: newDue,
              recordCalendarSidebarRevert: true,
            });
          } else {
            ok =
              updateSectionTaskDates(
                payload.sectionId,
                payload.taskId,
                newStart,
                newDue,
                { recordCalendarSidebarRevert: true },
              ) ||
              addSectionTaskToCalendar(payload.sectionId, {
                taskId: payload.taskId,
                name: payload.name,
                startDate: newStart,
                dueDate: newDue,
                done: !!payload.done,
                itemType: payload.itemType || "todo",
                _calPrevStart: oldStart,
                _calPrevDue: oldDue,
              });
          }
        }
        if (ok) {
          syncCalendarSectionTaskToServerAfterCalendarDateDrop(payload, ok);
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
  const sidebarTitleExpanded = lpCalendarTodoSidebarExpandedTitle(sidebarMode);
  todoSidebar.innerHTML = `
    <div class="calendar-todo-sidebar-header">
      <span class="calendar-todo-sidebar-title">${sidebarTitleExpanded}</span>
      <button type="button" class="calendar-todo-sidebar-collapse" title="사이드바 접기">
        <span class="calendar-todo-sidebar-collapse-text">접기</span>
      </button>
    </div>
    <div class="calendar-todo-sidebar-body">
      <div class="calendar-todo-sidebar-main"></div>
    </div>
  `;
  const body = todoSidebar.querySelector(".calendar-todo-sidebar-body");
  const mainWrap = body.querySelector(".calendar-todo-sidebar-main");
  const todoListEl = renderTodoList(
    lpCalendarDateSidebarTodoListOpts(sidebarMode),
  );
  mainWrap.appendChild(lpWrapCalendarTodoSidebarListEl(todoListEl));
  lpBindCalendarDateTodoSidebarCollapse(todoSidebar, sidebarMode);
  applyCalendarTodoSidebarInitiallyCollapsed(todoSidebar);
  wrap.appendChild(todoSidebar);
  attachCalendarTodoSidebarSpanRevertDrop(
    body,
    () => renderCalendar(),
    () => refreshTodoList(),
  );

  wrap.addEventListener("dragend", () => {
    wrap
      .querySelectorAll(".calendar-day-drag-over")
      .forEach((el) => el.classList.remove("calendar-day-drag-over"));
  });

  renderCalendar();

  wrap._lpRefreshDateTodoSidebar = refreshTodoList;

  return wrap;
}

/** 연간 뷰: 날짜 칸 호버 버블 — 칸 간 이동 시 닫힘 타이머 충돌 방지 */
let _annualDayExpandHideTimer = null;
let _annualDayExpandClose = null;
function cancelAnnualDayExpandHideTimer() {
  if (_annualDayExpandHideTimer != null) {
    clearTimeout(_annualDayExpandHideTimer);
    _annualDayExpandHideTimer = null;
  }
}
function scheduleAnnualDayExpandHide() {
  cancelAnnualDayExpandHideTimer();
  _annualDayExpandHideTimer = window.setTimeout(() => {
    _annualDayExpandHideTimer = null;
    try {
      _annualDayExpandClose?.();
    } finally {
      _annualDayExpandClose = null;
    }
  }, 220);
}

/** 날짜 칸 확장 버블(연간 호버 등): body에 붙음 — 캘린더 DOM만 지우면 mouseleave 없이 고아가 됨 */
export function dismissCalendarDayExpandUI() {
  cancelAnnualDayExpandHideTimer();
  try {
    _annualDayExpandClose?.();
  } catch (_) {}
  _annualDayExpandClose = null;
  if (_calendarDayExpandOutsideHandler) {
    try {
      document.removeEventListener("click", _calendarDayExpandOutsideHandler);
    } catch (_) {}
    _calendarDayExpandOutsideHandler = null;
  }
  document
    .querySelectorAll(".calendar-day-expand-bubble")
    .forEach((el) => el.remove());
  document
    .querySelectorAll(".calendar-day-expand-overlay")
    .forEach((el) => el.remove());
}

/** 연간 뷰: 왼쪽 월 라벨, 오른쪽 해당 월 날짜 셀 한 행 (Year Planner 구조), 요일 미표시, 호버 시 할일 목록 버블 */
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
      <button type="button" class="calendar-nav-today" title="올해로 이동">${currentYear}</button>
      <button type="button" class="calendar-nav-next" title="다음 해">&gt;</button>
    </div>
  `;
  calendarSection.appendChild(nav);

  const gridWrap = document.createElement("div");
  gridWrap.className = "calendar-annual-grid-wrap";
  const table = document.createElement("div");
  table.className = "calendar-annual-table";

  function renderYear() {
    cancelAnnualDayExpandHideTimer();
    try {
      _annualDayExpandClose?.();
    } catch (_) {}
    _annualDayExpandClose = null;
    nav.querySelector(".calendar-nav-year").textContent = String(currentYear);
    const yearJumpBtn = nav.querySelector(".calendar-nav-today");
    if (yearJumpBtn) yearJumpBtn.textContent = String(currentYear);
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
        const prefersHover =
          typeof window.matchMedia !== "undefined" &&
          window.matchMedia("(hover: hover)").matches;

        const openAnnualDayBubble = () => {
          cancelAnnualDayExpandHideTimer();
          const rect = cell.getBoundingClientRect();
          const tasks = getAllTasksForDateDisplay(key);
          const { bubble, close } = createCalendarDayExpandBubble(
            rect,
            key,
            tasks,
            () => {
              _annualDayExpandClose = null;
            },
            {
              hideCloseButton: true,
              dismissOnOutsideClick: false,
              useMobileOverlay: false,
              positionBelow: true,
            },
          );
          _annualDayExpandClose = close;
          bubble.addEventListener("mouseenter", cancelAnnualDayExpandHideTimer);
          bubble.addEventListener("mouseleave", scheduleAnnualDayExpandHide);
        };

        const openAnnualQuickAddModal = (e) => {
          if (e.target.closest(".calendar-event-bubble")) return;
          e.stopPropagation();
          cancelAnnualDayExpandHideTimer();
          try {
            _annualDayExpandClose?.();
          } catch (_) {}
          _annualDayExpandClose = null;
          const rect = cell.getBoundingClientRect();
          createCalendarEventBubble(
            rect,
            key,
            () => {
              renderYear();
              refreshTodoList();
            },
            () => {},
          );
        };

        cell.style.cursor = "pointer";
        if (prefersHover) {
          cell.addEventListener("mouseenter", openAnnualDayBubble);
          cell.addEventListener("mouseleave", scheduleAnnualDayExpandHide);
          cell.addEventListener("click", openAnnualQuickAddModal);
        } else {
          cell.addEventListener("click", openAnnualQuickAddModal);
        }
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
  { id: "1day", label: "오늘 해치우기" },
];

const MOBILE_SCHEDULE_CAL_SUB_VIEWS = [
  { id: "monthly", label: "월별" },
  { id: "1week", label: "1주" },
  { id: "annual", label: "연간" },
  { id: "1day", label: "오늘 해치우기" },
];

/**
 * 캘린더 탭 하위 뷰(월별·2주·1주·연간·오늘 해치우기) 공통 셸
 * @param {HTMLElement|null} tabsElement 상단에 붙일 외부 탭 행(없으면 null)
 * @param {{ subViewsList?: {id:string,label:string}[], storageKey?: string, forceInitialMonthlyOnMobile?: boolean, keepSubTabsOnTop?: boolean, todoSidebarMode?: string }} opts
 * todoSidebarMode: 사이드 메뉴 단독 캘린더는 LP_CAL_TODO_SIDEBAR_FULL(우선순위 탭과 동일 전체 할일)
 */
function createCalendarSubViewRoot(tabsElement, opts = {}) {
  const isMobile = window.matchMedia("(max-width: 48rem)").matches;
  const baseList = opts.subViewsList || CALENDAR_SUB_VIEWS;
  const subViewsList = isMobile
    ? baseList
    : baseList.filter((v) => v.id !== "2week");
  const storageKey = opts.storageKey || "calendar-sub-view";
  const forceInitialMonthlyOnMobile = !!opts.forceInitialMonthlyOnMobile;
  const keepSubTabsOnTop = !!opts.keepSubTabsOnTop;
  const todoSidebarMode = opts.todoSidebarMode ?? LP_CAL_TODO_SIDEBAR_QUADRANT;

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
  if (keepSubTabsOnTop) {
    wrap.insertBefore(subTabs, contentArea);
  }

  const savedSubView = localStorage.getItem(storageKey) || "monthly";
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

  let _nestedSubViewGen = 0;
  let activeSubViewId = initialSubView;

  /**
   * 월별·1주 등 서브탭 전환 시마다( skipPull 아닐 때) Supabase `calendar_section_tasks` pull 후 렌더.
   * 클릭 시점의 서버 스냅샷을 세션에 반영한 뒤 `getAllTasksWithDateRange` 등이 그린다.
   */
  async function renderSubView(subViewId, subOpts = {}) {
    const skipPull = !!subOpts.skipPull;
    if (activeSubViewId === "1day" && subViewId !== "1day") {
      flushAllPendingTimeDailyBudgetSync();
    }
    activeSubViewId = subViewId;
    dismissCalendarDayExpandUI();
    const gen = ++_nestedSubViewGen;
    dateDebug("renderSubView: saving before switch", {
      subViewId,
      hasSidebar: !!contentArea.querySelector(".calendar-todo-sidebar-body"),
    });
    saveTodoListBeforeUnmount(contentArea);
    if (!skipPull) {
      if (subViewId === "1day") {
        try {
          await pullTimeLedgerTasksFromSupabase();
        } catch (_) {}
      }
      try {
        await pullCalendarSectionTasksFromSupabase({
          reason: `calendar_nested_${subViewId}`,
          subView: "calendar",
        });
      } catch (_) {}
      if (subViewId === "1day") {
        try {
          const yEnd = timeLedgerLocalTodayYmd();
          const yStart = timeLedgerLocalYesterdayYmd();
          await Promise.all([
            pullTimeLedgerEntriesForDateRange(yStart, yEnd),
            pullTimeDailyBudgetFromSupabase(),
          ]);
        } catch (_) {}
      }
    }
    if (gen !== _nestedSubViewGen) return;
    if (subTabs.parentNode) subTabs.remove();
    contentArea.innerHTML = "";
    if (subViewId === "monthly") {
      contentArea.appendChild(renderMonthlyView(null, todoSidebarMode));
    } else if (subViewId === "2week") {
      contentArea.appendChild(render2WeekView(null, todoSidebarMode));
    } else if (subViewId === "1week") {
      contentArea.appendChild(render1WeekView(null, todoSidebarMode));
    } else if (subViewId === "annual") {
      contentArea.appendChild(renderAnnualView(null));
    } else if (subViewId === "1day") {
      contentArea.appendChild(render1DayView(null));
    }
    if (keepSubTabsOnTop) {
      wrap.insertBefore(subTabs, contentArea);
    } else {
      placeSubTabsInNav();
    }
    localStorage.setItem(storageKey, subViewId);
  }

  subTabs.querySelectorAll(".calendar-sub-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      subTabs
        .querySelectorAll(".calendar-sub-tab")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      void renderSubView(btn.dataset.subView);
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
  void renderSubView(initialSubView);

  /** App.setActiveTab 에서 이미 pull 한 뒤 — contentWrap 통째 remount 대신 현재 월별/주 뷰만 다시 그림(상단·서브탭 DOM 유지) */
  wrap._lpCalendarSoftPullRefresh = () => {
    void renderSubView(activeSubViewId, { skipPull: true });
  };

  return wrap;
}

function renderCalendarView(tabsElement) {
  return createCalendarSubViewRoot(tabsElement, {
    subViewsList: CALENDAR_SUB_VIEWS,
    storageKey: "calendar-sub-view",
    forceInitialMonthlyOnMobile: true,
    todoSidebarMode: LP_CAL_TODO_SIDEBAR_QUADRANT,
  });
}

/** 모바일 하단 '캘린더' 탭: 월별·1주·연간·오늘 해치우기(상단 서브탭) */
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

  function mountCalendarSubViews() {
    dismissCalendarDayExpandUI();
    contentWrap.innerHTML = "";
    contentWrap.appendChild(
      createCalendarSubViewRoot(null, {
        subViewsList: MOBILE_SCHEDULE_CAL_SUB_VIEWS,
        storageKey: "calendar-mobile-schedule-sub-view",
        forceInitialMonthlyOnMobile: false,
        keepSubTabsOnTop: true,
        todoSidebarMode: LP_CAL_TODO_SIDEBAR_FULL,
      }),
    );
  }

  el.appendChild(contentWrap);
  mountCalendarSubViews();

  window.__lpCalendarSoftRefresh = () => {
    if (!el.isConnected) return;
    const wrap = contentWrap.querySelector(".calendar-view-with-subtabs");
    if (wrap && typeof wrap._lpCalendarSoftPullRefresh === "function") {
      wrap._lpCalendarSoftPullRefresh();
      return;
    }
    mountCalendarSubViews();
  };

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
  let sidebarCollapsed = true;
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
  let todoListEl = renderTodoListForEisenhowerSidebar({
    enableDragToEisenhower: true,
  });
  todoSidebar
    .querySelector(".calendar-todo-sidebar-body")
    .appendChild(todoListEl);
  const titleEl = todoSidebar.querySelector(".calendar-todo-sidebar-title");
  const collapseTextEl = todoSidebar.querySelector(
    ".calendar-todo-sidebar-collapse-text",
  );
  todoSidebar
    .querySelector(".calendar-todo-sidebar-collapse")
    .addEventListener("click", () => {
      sidebarCollapsed = !sidebarCollapsed;
      todoSidebar.classList.toggle("collapsed", sidebarCollapsed);
      titleEl.textContent = "할일";
      if (collapseTextEl)
        collapseTextEl.textContent = sidebarCollapsed ? "할일" : "접기";
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
  applyCalendarTodoSidebarInitiallyCollapsed(todoSidebar, {
    clearInlineWidth: true,
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
      const obj = readSectionTasksObject();
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
      const cobj = readCustomSectionTasksObject();
      getCustomSections().forEach((s) => {
        const arr = cobj[s.id];
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
    const allTasks = getAllTasksForEisenhower().filter((t) => !t.done);
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
      if (!isKpiTodo) {
        syncCalendarSectionTaskRowToSupabase(sectionId, taskId, todoListEl);
      }
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
      } else {
        const card = todoListEl.querySelector(
          `.todo-card[data-task-id="${taskId}"]`,
        );
        if (card) {
          card.dataset.eisenhower = label;
          card.classList.add("todo-card--priority-assigned");
          card.draggable = false;
          const priorityEl = card.querySelector(".todo-card-priority");
          if (priorityEl) {
            priorityEl.textContent = label;
            priorityEl.hidden = false;
          }
          if (isUrgentImportant) {
            card.dataset.dueDate = todayKey;
            const datesEl = card.querySelector(".todo-card-dates");
            if (datesEl && todayKey) {
              const [, m, d] = todayKey.split("-");
              datesEl.textContent = m && d ? `${m}/${d}` : todayKey;
            }
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
      if (!isKpiTodo) {
        syncCalendarSectionTaskRowToSupabase(sectionId, taskId, todoListEl);
      }
      updateQuadrants();
      const row = todoListEl.querySelector(`tr[data-task-id="${taskId}"]`);
      if (row) {
        row.dataset.eisenhower = "";
        const displaySpan = row.querySelector(".todo-eisenhower-display");
        if (displaySpan) displaySpan.textContent = "";
      } else {
        const card = todoListEl.querySelector(
          `.todo-card[data-task-id="${taskId}"]`,
        );
        if (card) {
          card.dataset.eisenhower = "";
          card.classList.remove("todo-card--priority-assigned");
          card.draggable = true;
          const priorityEl = card.querySelector(".todo-card-priority");
          if (priorityEl) {
            priorityEl.textContent = "";
            priorityEl.hidden = true;
          }
        }
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

  function rebuildEisenhowerTodoSidebar() {
    const body = todoSidebar.querySelector(".calendar-todo-sidebar-body");
    const old = body?.querySelector(".todo-list-eisenhower-sidebar");
    if (!body || !old) return;
    let activeIndex = 0;
    const activeTab = old.querySelector(".todo-category-tab.active");
    const tabs = old.querySelectorAll(
      ".todo-category-tab:not(.todo-category-tab-add)",
    );
    if (activeTab && tabs.length) {
      const idx = Array.from(tabs).indexOf(activeTab);
      if (idx >= 0) activeIndex = idx;
    }
    old.remove();
    const next = renderTodoListForEisenhowerSidebar({
      enableDragToEisenhower: true,
    });
    body.appendChild(next);
    todoListEl = next;
    const newTabs = next.querySelectorAll(
      ".todo-category-tab:not(.todo-category-tab-add)",
    );
    if (newTabs[activeIndex]) {
      newTabs[activeIndex].click();
    } else if (newTabs[0]) {
      newTabs[0].click();
    }
    updateQuadrants();
    refreshEisenhowerQuadrantsIfActive();
  }
  wrap._lpRefreshEisenhowerTodoSidebar = rebuildEisenhowerTodoSidebar;

  updateQuadrants();
  registerEisenhowerQuadrantsRefresh(updateQuadrants);

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

  const contentWrap = document.createElement("div");
  contentWrap.className = "calendar-content-wrap";

  let _renderContentGen = 0;
  /* App.setActiveTab(calendar) 에서 이미 pull 했으면 첫 renderContent 의 중복 await 가
   * 빈 본문 한 번 깜빡이는 원인 — 첫 1회만 서브탭 pull 생략 */
  let _calendarMainSubtabPullPrimedByApp = true;

  async function renderContent(opts = {}) {
    const skipSubtabPull = !!opts.skipSubtabPull;
    const view = "todo";

    saveTodoListBeforeUnmount(contentWrap);
    registerEisenhowerQuadrantsRefresh(null);
    const gen = ++_renderContentGen;

    if (_calendarMainSubtabPullPrimedByApp) {
      _calendarMainSubtabPullPrimedByApp = false;
    } else if (!skipSubtabPull) {
      try {
        await pullCalendarSectionTasksFromSupabase({
          reason: "calendar_main_subtab",
          subView: view,
        });
      } catch (_) {}
      try {
        const yEnd = timeLedgerLocalTodayYmd();
        const yStart = timeLedgerLocalYesterdayYmd();
        await Promise.all([
          pullTimeLedgerEntriesForDateRange(yStart, yEnd),
          pullTimeDailyBudgetFromSupabase(),
        ]);
      } catch (_) {}
    }
    if (gen !== _renderContentGen) return;

    /* App pull 직후(skipSubtabPull): contentWrap 통째 비우면 상단·설정 줄이 잠깐 사라져 깜빡임 — 할일 뷰는 유지 후 목록만 교체 */
    if (skipSubtabPull && contentWrap.querySelector(".calendar-view-todo")) {
      const existingTodo = contentWrap.querySelector(".calendar-view-todo");
      const reuseBtn = existingTodo?.querySelector(
        ".todo-list-toolbar-actions-end .todo-list-settings-btn",
      );
      const todoMain = existingTodo.querySelector(".calendar-todo-main");
      if (existingTodo && todoMain) {
        try {
          todoMain
            .querySelector(".todo-list-view")
            ?._lpTabAbortController?.abort?.();
        } catch (_) {}
        todoMain.querySelector(".calendar-todo-content")?.remove();
        const todoContent = document.createElement("div");
        todoContent.className = "calendar-todo-content";
        todoContent.appendChild(
          renderTodoList({
            hideHeader: true,
            categoryToolbarRightActions: true,
            ...(reuseBtn?.isConnected
              ? { reuseSettingsButtonEl: reuseBtn }
              : {}),
          }),
        );
        todoMain.appendChild(todoContent);
        persistCalendarMainViewIfValid(view);
        return;
      }
    }

    contentWrap.innerHTML = "";
    try {
      contentWrap.appendChild(renderTodoView(null));
      persistCalendarMainViewIfValid(view);
    } catch (err) {
      const errBox = document.createElement("div");
      errBox.className = "calendar-render-error";
      errBox.style.cssText =
        "padding:1rem 1.25rem;margin:1rem;color:#b91c1c;font-size:0.875rem;";
      errBox.innerHTML = `<p><strong>이 화면을 그리는 중 오류가 났습니다.</strong></p><p>${String(err?.message || err)}</p>`;
      contentWrap.appendChild(errBox);
    }
  }

  el.appendChild(contentWrap);

  void renderContent();

  /** App.setActiveTab 에서 pull 후 두 번째 renderMain 대신 — 같은 el 안에서만 할일 본문만 갱신 */
  window.__lpCalendarSoftRefresh = () => {
    if (!el.isConnected) return;
    void renderContent({ skipSubtabPull: true });
  };

  return el;
}

/** 홈 등 다른 화면에서 오늘 해치우기 캘린더만 삽입할 때 사용. tabsElement는 null 가능 */
export { render1DayView };
