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
  openTodoTaskEditFromCalendarBarModel,
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
  getAccumulatedMinutesForKpiId,
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
  isTimeLedgerRowLiveRecording,
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
const KPI_SECTION_IDS = ["dream", "sideincome", "health", "happy"];

/** 할일/일정 패널은 할일만 표시 — 저장값으로 빈 화면·탭 초기화 방지 */
const CALENDAR_MAIN_VIEW_STORAGE_KEY = "lp-calendar-main-subview";
const VALID_CALENDAR_MAIN_VIEWS = new Set(["todo"]);

function persistCalendarMainViewIfValid(view) {
  if (!view || !VALID_CALENDAR_MAIN_VIEWS.has(view)) return;
  try {
    localStorage.setItem(CALENDAR_MAIN_VIEW_STORAGE_KEY, view);
  } catch (_) {}
}

/** 모바일 일정 상단으로 날짜·화살표를 옮긴 뒤에도 갱신 셀렉터가 동작하도록 */
function lpCalendarNavQ(localNav, calendarInnerWrap, selector) {
  try {
    const lifted =
      calendarInnerWrap && calendarInnerWrap._lpCalendarNavQueryRoot;
    if (lifted) {
      if (lifted.isConnected) {
        const hit = lifted.querySelector(selector);
        if (hit) return hit;
      } else {
        try {
          delete calendarInnerWrap._lpCalendarNavQueryRoot;
        } catch (_) {}
      }
    }
  } catch (_) {}
  if (localNav) {
    const fromLocal = localNav.querySelector(selector);
    if (fromLocal) return fromLocal;
  }
  try {
    const calView = calendarInnerWrap?.closest?.(".calendar-view");
    if (calView) {
      const cluster = calView.querySelector(".calendar-sub-tabs-nav-cluster");
      const hit = cluster?.querySelector(selector);
      if (hit) return hit;
    }
  } catch (_) {}
  return null;
}

/** 할일 사이드바에서 날짜·마감 수정 시: 같은 화면 월/주 그리드도 로컬 데이터로 즉시 다시 그림(탭 재클릭·풀 없이) */
let _lpTodoDatesChangedListenerAttached = false;
function lpEnsureTodoDatesChangedListener() {
  if (_lpTodoDatesChangedListenerAttached) return;
  _lpTodoDatesChangedListenerAttached = true;
  document.addEventListener("lp-todo-dates-changed", (ev) => {
    const t = ev.target;
    if (!t || typeof t.closest !== "function") return;
    let layoutNode = t.closest(".calendar-monthly-layout");
    while (layoutNode) {
      if (typeof layoutNode._lpRefreshCalendarView === "function") {
        try {
          layoutNode._lpRefreshCalendarView();
        } catch (_) {}
        break;
      }
      layoutNode =
        layoutNode.parentElement?.closest?.(".calendar-monthly-layout") ??
        null;
    }
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

/** 목록·달력 통합 색 변경 시 그리드·사이드바 바 다시 칠함 */
let _lpAppColorsCalendarListenerAttached = false;
function lpEnsureAppColorsCalendarListener() {
  if (_lpAppColorsCalendarListenerAttached) return;
  _lpAppColorsCalendarListenerAttached = true;
  window.addEventListener("app-colors-changed", () => {
    document.querySelectorAll(".calendar-monthly-layout").forEach((layout) => {
      try {
        layout._lpRefreshCalendarView?.();
      } catch (_) {}
    });
    document.querySelectorAll(".calendar-view-eisenhower").forEach((root) => {
      try {
        root._lpRefreshEisenhowerTodoSidebar?.();
      } catch (_) {}
    });
  });
}
lpEnsureAppColorsCalendarListener();

const CALENDAR_DATE_DEBUG = false;
function dateDebug(_tag, ..._args) {
  void CALENDAR_DATE_DEBUG;
}

/** 캘린더 할일 사이드바 펼침 여부(탭 동기화로 레이아웃이 다시 붙을 때 유지). << 접기면 0, 펼침이면 1 */
const LP_CAL_TODO_SIDEBAR_EXPANDED_KEY = "lp-cal-todo-sidebar-expanded";

/** 날짜 정하기 사이드바: 전체 할일 표시(사분면 필터 없음). 모드 값은 레이아웃·dataset 호환용 */
const LP_CAL_TODO_SIDEBAR_QUADRANT = "quadrant";
const LP_CAL_TODO_SIDEBAR_FULL = "full";
/** 오늘 탭 타임라인 등: 타임그리드 옆 할일 사이드바 없음 */
const LP_CAL_TODO_SIDEBAR_NONE = "none";

/** 타임블록·1주(구글) 시간격자 공통: 1시간 슬롯 하루 24칸 — 예상/실제/주간 블록·DOM 행과 동일 */
const CAL_1DAY_TIMETABLE_SLOTS_PER_DAY = 24;
const CAL_1DAY_TIMETABLE_MIN_PER_SLOT = 60;
/** 타임블록: 칼럼 좌우 안쪽 여백·상하·반열(동시 일정) 사이 간격(px) */
const CAL_1DAY_TIMEBLOCK_INSET_X = 3;
const CAL_1DAY_TIMEBLOCK_INSET_Y = 2;
const CAL_1DAY_TIMEBLOCK_LANE_GAP_PX = 3;
/** 1일·1주 타임블록: 이 분 이하(포함)는 막대 안 글자 숨김 → 호버 시 블록색 툴팁 */
const CAL_TIMEBLOCK_HIDE_LABEL_MAX_MINUTES = 30;

/** 캘린더 막대 할 일: 체크박스 대신 섹션색 세로 막대(|) */
function lpCalendarSpanBarTodoMarkerHtml(sectionColor) {
  const c =
    typeof sectionColor === "string" && sectionColor.trim()
      ? sectionColor.trim()
      : "var(--text-muted)";
  return `<span class="calendar-monthly-span-bar-checkbox" style="color:${c.replace(/"/g, "")}" aria-hidden="true">|</span>`;
}

/** 월간 막대: 줄바꿈 반영 후 행별 실제 높이로 top·주 행 minHeight 맞춤(행 겹침 방지). */
function lpCalendarFinalizeBarRowLayout(
  barsWithRow,
  weekRow,
  BAR_HEIGHT,
  BARS_TOP,
  BOTTOM_PAD,
) {
  if (!barsWithRow.length || !weekRow) return;
  const maxRow = Math.max(...barsWithRow.map((b) => b.row), 0);
  const DEFAULT_ROW_HEIGHT_REM = BARS_TOP + 3 * BAR_HEIGHT + BOTTOM_PAD;
  requestAnimationFrame(() => {
    const rootFont =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const pxToRem = (px) => px / rootFont;
    const rowMaxPx = [];
    for (const b of barsWithRow) {
      const el = b._barEl;
      if (!el || !el.isConnected) continue;
      const h = el.getBoundingClientRect().height;
      const r = b.row;
      rowMaxPx[r] = Math.max(rowMaxPx[r] || 0, h);
    }
    let topAcc = 0.1;
    const rowTopRem = [];
    for (let r = 0; r <= maxRow; r++) {
      rowTopRem[r] = topAcc;
      const slotRem = Math.max(
        BAR_HEIGHT,
        rowMaxPx[r] != null ? pxToRem(rowMaxPx[r]) : BAR_HEIGHT,
      );
      topAcc += slotRem;
    }
    for (const b of barsWithRow) {
      if (b._barEl?.isConnected) {
        b._barEl.style.top = `${rowTopRem[b.row]}rem`;
      }
    }
    const barsBlockRem = topAcc - 0.1;
    const requiredHeight = BARS_TOP + barsBlockRem + BOTTOM_PAD;
    weekRow.style.minHeight = `${Math.max(
      DEFAULT_ROW_HEIGHT_REM,
      requiredHeight,
    )}rem`;
  });
}

/** 사이드바 헤더: 왼쪽 접기(<< / >>), 오른쪽 +·설정(.calendar-todo-sidebar-toolbar-actions) */
function lpCalendarTodoSidebarHeaderMarkup() {
  return `
    <div class="calendar-todo-sidebar-header">
      <button type="button" class="calendar-todo-sidebar-collapse" title="사이드바 접기">
        <span class="calendar-todo-sidebar-collapse-text"><<</span>
      </button>
      <div class="calendar-todo-sidebar-toolbar-actions"></div>
    </div>`;
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

function lpCalendarDateSidebarTodoListOpts(_sidebarMode, extra = {}) {
  const base = {
    hideHeader: true,
    categoryToolbarRightActions: true,
    enableDragToCalendar: true,
    calendarSidebarEmbed: true,
    ...extra,
  };
  /* 우선순위 탭과 동일: 사분면으로 목록을 좁히지 않음(미분류·다른 구역 포함). */
  return {
    ...base,
    enableDragToEisenhower: false,
    eisenhowerSidebarFirst: true,
  };
}

/** 1주 뷰: 사이드바 첫 줄 = 왼쪽 요일 행과 같은 높이만 쓰고, 그 위(월 네비 등)는 padding-top 으로 맞춤 — 헤더 전체를 줄무늬 블록 높이로 키우지 않음 */
function syncCalendar1WeekSidebarHeaderHeight(mainSectionEl, sidebarEl) {
  if (!mainSectionEl || !sidebarEl) return;
  try {
    if (!mainSectionEl.isConnected || !sidebarEl.isConnected) return;
  } catch (_) {
    return;
  }
  const sidebarHeader = sidebarEl.querySelector(
    ".calendar-todo-sidebar-header",
  );
  if (!sidebarHeader) return;

  if (sidebarEl.classList.contains("collapsed")) {
    sidebarHeader.style.removeProperty("height");
    sidebarHeader.style.removeProperty("min-height");
    sidebarHeader.style.removeProperty("max-height");
    sidebarEl.style.removeProperty("padding-top");
    return;
  }

  const weekdayRow = mainSectionEl.querySelector(
    ".calendar-1week-strip-header .calendar-monthly-weekdays",
  );
  if (!weekdayRow) {
    sidebarHeader.style.removeProperty("height");
    sidebarHeader.style.removeProperty("min-height");
    sidebarHeader.style.removeProperty("max-height");
    sidebarEl.style.removeProperty("padding-top");
    return;
  }

  const sectionTop = mainSectionEl.getBoundingClientRect().top;
  const wr = weekdayRow.getBoundingClientRect();
  const padTop = Math.max(0, Math.round(wr.top - sectionTop));
  let rowH = Math.round(wr.height);
  if (rowH < 12) {
    rowH = 48;
  }
  let minH = 48;
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--app-chrome-titlebar-height")
      .trim();
    if (raw.endsWith("rem")) {
      const n = parseFloat(raw);
      if (n > 0) minH = Math.round(n * 16);
    } else if (raw.endsWith("px")) {
      const n = parseFloat(raw);
      if (n > 0) minH = Math.round(n);
    }
  } catch (_) {}
  const headerH = Math.max(minH, rowH);

  sidebarEl.style.setProperty("padding-top", `${padTop}px`);
  sidebarHeader.style.setProperty("height", `${headerH}px`);
  sidebarHeader.style.setProperty("min-height", `${headerH}px`);
  sidebarHeader.style.setProperty("max-height", `${headerH}px`);
}

/** 모바일 1주 플로우: 스크롤 안 세로 격자가 뷰포트까지 오도록 본문 최소 높이를 스크롤창·콘텐츠 중 큰 값으로 맞춤 */
function lpSync1WeekMobileFlowBodyToScrollViewport(scrollEl, bodyEl) {
  if (!scrollEl || !bodyEl) return;
  try {
    if (!scrollEl.isConnected || !bodyEl.isConnected) return;
  } catch (_) {
    return;
  }
  if (
    typeof window === "undefined" ||
    !window.matchMedia("(max-width: 48rem)").matches
  ) {
    bodyEl.style.removeProperty("min-height");
    try {
      delete bodyEl._lpFlowMinHApplied;
    } catch (_) {}
    return;
  }
  bodyEl.style.removeProperty("min-height");
  const natural = bodyEl.scrollHeight;
  const ch = scrollEl.clientHeight;
  const h = Math.round(Math.max(ch, natural));
  if (h <= 0) return;
  const last = bodyEl._lpFlowMinHApplied;
  if (last != null && Math.abs(last - h) <= 2) {
    bodyEl.style.minHeight = `${last}px`;
    return;
  }
  bodyEl._lpFlowMinHApplied = h;
  bodyEl.style.minHeight = `${h}px`;
}

function lpAttach1WeekMobileFlowBodyMinSync(wrap, scrollEl, bodyEl) {
  if (!wrap || !scrollEl || !bodyEl) return;
  try {
    wrap._lp1WeekFlowBodyMinRo?.disconnect();
  } catch (_) {}
  wrap._lp1WeekFlowBodyMinRo = null;
  if (typeof ResizeObserver === "undefined") {
    requestAnimationFrame(() => {
      lpSync1WeekMobileFlowBodyToScrollViewport(scrollEl, bodyEl);
    });
    return;
  }
  let roRaf = null;
  const ro = new ResizeObserver(() => {
    if (roRaf != null) return;
    roRaf = requestAnimationFrame(() => {
      roRaf = null;
      lpSync1WeekMobileFlowBodyToScrollViewport(scrollEl, bodyEl);
    });
  });
  ro.observe(scrollEl);
  wrap._lp1WeekFlowBodyMinRo = ro;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      lpSync1WeekMobileFlowBodyToScrollViewport(scrollEl, bodyEl);
    });
  });
}

function lpBindCalendarDateTodoSidebarCollapse(todoSidebar, onCollapsedChange) {
  let sidebarCollapsed = todoSidebar.classList.contains("collapsed");
  const collapseBtn = todoSidebar.querySelector(
    ".calendar-todo-sidebar-collapse",
  );
  const collapseTextEl = todoSidebar.querySelector(
    ".calendar-todo-sidebar-collapse-text",
  );
  if (!collapseBtn) return;
  collapseBtn.addEventListener("click", () => {
    sidebarCollapsed = !sidebarCollapsed;
    todoSidebar.classList.toggle("collapsed", sidebarCollapsed);
    collapseBtn.title = sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기";
    if (collapseTextEl)
      collapseTextEl.textContent = sidebarCollapsed ? ">>" : "<<";
    try {
      sessionStorage.setItem(
        LP_CAL_TODO_SIDEBAR_EXPANDED_KEY,
        sidebarCollapsed ? "0" : "1",
      );
    } catch (_) {}
    const fire = () => {
      try {
        onCollapsedChange?.();
      } catch (_) {}
    };
    fire();
    requestAnimationFrame(() => {
      requestAnimationFrame(fire);
    });
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

/** 1일·1주 타임블록 면: 격자가 비쳐 어둡게 보이지 않도록 채움 알파 하한(너무 옅은 값만 올림) */
function timetableFillFaceBg(bgRgba, minAlpha = 0.82) {
  const m = String(bgRgba || "").match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i,
  );
  if (!m) return bgRgba;
  const prev = m[4] !== undefined ? parseFloat(m[4]) : 1;
  const a = Math.min(1, Math.max(prev, minAlpha));
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`;
}

/** 타임블록 생산성 면색이 디자인 시트(hex)인지 — 면·테두리·진한 글자 적용 */
function timetableUsesHexSurface(c) {
  return !!(
    c &&
    c.accentText &&
    typeof c.bg === "string" &&
    c.bg.startsWith("#")
  );
}

const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];
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

let _lpTimeBlockHoverTipHideTimer = null;
let _lpTimeBlockTipScrollBound = false;

function lpEnsureTimeBlockHoverTip() {
  let tip = document.getElementById("lp-time-block-hover-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "lp-time-block-hover-tip";
    tip.className = "lp-time-block-hover-tip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
    if (!_lpTimeBlockTipScrollBound) {
      _lpTimeBlockTipScrollBound = true;
      window.addEventListener(
        "scroll",
        () => {
          lpHideTimeBlockHoverTip();
        },
        true,
      );
    }
  }
  return tip;
}

function lpHideTimeBlockHoverTip() {
  clearTimeout(_lpTimeBlockHoverTipHideTimer);
  const tip = document.getElementById("lp-time-block-hover-tip");
  if (tip) tip.classList.remove("lp-time-block-hover-tip--visible");
}

function lpShowTimeBlockHoverTipFromRect(
  rect,
  taskName,
  rangeStr,
  bgCss,
  fgCss,
  memoExtra,
) {
  const tip = lpEnsureTimeBlockHoverTip();
  const fg = fgCss || "#ffffff";
  const memoHtml = (memoExtra || "").trim()
    ? `<div class="lp-time-block-hover-tip__memo">${escapeHtml(String(memoExtra).trim())}</div>`
    : "";
  tip.innerHTML = `<div class="lp-time-block-hover-tip__title">${escapeHtml((taskName || "").trim())}</div><div class="lp-time-block-hover-tip__meta">${escapeHtml(rangeStr || "")}</div>${memoHtml}`;
  tip.style.backgroundColor = bgCss || "#4b5563";
  tip.style.color = fg;
  tip.classList.add("lp-time-block-hover-tip--visible");
  requestAnimationFrame(() => {
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = rect.left + rect.width / 2 - tw / 2;
    let top = rect.bottom + pad;
    if (top + th > vh - pad) top = Math.max(pad, rect.top - th - pad);
    if (left < pad) left = pad;
    if (left + tw > vw - pad) left = Math.max(pad, vw - tw - pad);
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  });
}

/** 좁은 타임블록: 본문 대신 호버 시 블록 배경색 맞춤 툴팁(터치는 토스트) */
function lpAttachColoredTimeBlockTooltip(el, opts) {
  if (!el || typeof el.addEventListener !== "function") return;
  const taskName = (opts.taskName || "").trim();
  const rangeStr = opts.rangeStr || "";
  const memoStr = (opts.memo || "").trim();
  const bgCss = opts.bgCss || "";
  const fgCss = opts.accentCss || opts.fgCss || "";
  const show = () => {
    clearTimeout(_lpTimeBlockHoverTipHideTimer);
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    lpShowTimeBlockHoverTipFromRect(
      r,
      taskName,
      rangeStr,
      bgCss,
      fgCss || "#ffffff",
      memoStr,
    );
  };
  const hide = () => {
    _lpTimeBlockHoverTipHideTimer = setTimeout(lpHideTimeBlockHoverTip, 60);
  };
  el.addEventListener("mouseenter", show);
  el.addEventListener("mouseleave", hide);
  el.addEventListener("mousedown", hide);
  try {
    if (window.matchMedia("(hover: none)").matches) {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        showToast(
          [taskName || "일정", rangeStr, memoStr].filter(Boolean).join("\n"),
        );
      });
    }
  } catch (_) {}
}

const CALENDAR_CATEGORIES = [
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

/** 할일·일정 막대 클릭 → 할 일 목록과 동일 수정 모달(셀 빈 곳 클릭 추가 모달과 구분: stopPropagation) */
function lpAttachCalendarBarOpenTodoEdit(bar, b, renderCalendar, refreshTodoList) {
  const sid = String(b.sectionId || "").trim();
  const tid = String(b.taskId || "").trim();
  const kid = String(b.kpiTodoId || "").trim();
  const sk = String(b.storageKey || "").trim();
  if (!kid && (!tid || !sid)) return;
  bar.addEventListener("click", (e) => {
    e.stopPropagation();
    openTodoTaskEditFromCalendarBarModel(b, {
      selectionEl: bar,
      onAfterApply: () => {
        try {
          renderCalendar?.();
        } catch (_) {}
        try {
          refreshTodoList?.();
        } catch (_) {}
      },
    });
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
  const toolbarActionsSlot = layoutWrap.querySelector(
    ".calendar-todo-sidebar-toolbar-actions",
  );
  const newList = renderTodoList(
    lpCalendarDateSidebarTodoListOpts(sidebarMode, {
      initialActiveTabIndex: activeIndex,
      ...(toolbarActionsSlot
        ? { categoryToolbarActionsSlot: toolbarActionsSlot }
        : {}),
    }),
  );
  mainWrap.appendChild(lpWrapCalendarTodoSidebarListEl(newList));
}

/** 캘린더·우선순위 뷰: 할일 사이드바 기본 접힘(사용자가 펼침). 아이젠하워는 접힘 시 저장 너비 해제 */
function applyCalendarTodoSidebarInitiallyCollapsed(todoSidebar, opts = {}) {
  const { clearInlineWidth = false } = opts;
  let collapsed = true;
  try {
    collapsed = sessionStorage.getItem(LP_CAL_TODO_SIDEBAR_EXPANDED_KEY) !== "1";
  } catch (_) {}
  const collapseBtn = todoSidebar.querySelector(
    ".calendar-todo-sidebar-collapse",
  );
  const collapseTextEl = todoSidebar.querySelector(
    ".calendar-todo-sidebar-collapse-text",
  );
  if (collapsed) {
    todoSidebar.classList.add("collapsed");
    if (clearInlineWidth) todoSidebar.style.width = "";
    if (collapseBtn) collapseBtn.title = "사이드바 펼치기";
    if (collapseTextEl) collapseTextEl.textContent = ">>";
  } else {
    todoSidebar.classList.remove("collapsed");
    if (collapseBtn) collapseBtn.title = "사이드바 접기";
    if (collapseTextEl) collapseTextEl.textContent = "<<";
  }
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

/** 할일 추가 버블(날짜 칸 클릭): document 바깥 클릭 시 닫기 — 리스너 정리용 */
let _calendarEventBubbleOutsideHandler = null;

function detachCalendarEventBubbleOutsideListener() {
  if (!_calendarEventBubbleOutsideHandler) return;
  try {
    document.removeEventListener(
      "pointerdown",
      _calendarEventBubbleOutsideHandler,
    );
  } catch (_) {}
  _calendarEventBubbleOutsideHandler = null;
}

function createCalendarEventBubble(cellRect, dateKey, onSave, onClose) {
  const isMobile = window.matchMedia("(max-width: 48rem)").matches;
  detachCalendarEventBubbleOutsideListener();
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
    detachCalendarEventBubbleOutsideListener();
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

  setTimeout(() => {
    _calendarEventBubbleOutsideHandler = (e) => {
      if (bubble.contains(e.target)) return;
      close();
    };
    document.addEventListener(
      "pointerdown",
      _calendarEventBubbleOutsideHandler,
    );
  }, 0);

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
    /** 할일·일정 항목에서 수정 모달 저장/삭제 후 그리드 갱신 */
    onAfterTaskEdit = null,
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
  detachCalendarEventBubbleOutsideListener();
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
    const kid = String(t.kpiTodoId || "").trim();
    const sk = String(t.storageKey || "").trim();
    const tid = String(t.taskId || "").trim();
    const sid = String(t.sectionId || "").trim();
    if (!kid && (!tid || !sid)) return;
    itemEl.addEventListener("click", (e) => {
      if (
        e.target.closest(".calendar-event-bubble-close") ||
        e.target.closest(".calendar-day-expand-add-btn")
      )
        return;
      e.stopPropagation();
      try {
        close();
      } catch (_) {}
      openTodoTaskEditFromCalendarBarModel(t, {
        selectionEl: itemEl,
        onAfterApply: () => {
          try {
            onAfterTaskEdit?.();
          } catch (_) {}
        },
      });
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
  detachCalendarEventBubbleOutsideListener();
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
  detachCalendarEventBubbleOutsideListener();
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
      <button type="button" class="calendar-nav-today" title="Today">Today</button>
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
    lpCalendarNavQ(nav, wrap, ".calendar-nav-month").textContent =
      MONTH_NAMES_EN[currentMonth];
    lpCalendarNavQ(nav, wrap, ".calendar-nav-year").textContent = String(currentYear);

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
            if (e.target.closest?.(".calendar-monthly-span-bar")) return;
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
                onAfterTaskEdit: () => {
                  renderCalendar();
                  refreshTodoList();
                },
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
        ? 1.02
        : 1.78;
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
        ? 1.62
        : 2.25;
      const BOTTOM_PAD = window.matchMedia("(max-width: 48rem)").matches
        ? 0.34
        : 0.42;
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
        bar.style.cssText = `left:${b.left}%;width:${b.width}%;--bar-bg:${b.color};top:${0.1 + b.row * BAR_HEIGHT}rem`;
        if (b.isSingleDay) {
          if (isTodo) {
            bar.innerHTML = `${lpCalendarSpanBarTodoMarkerHtml(b.color)}<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            bar.style.setProperty("--schedule-icon-color", b.color);
            bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" style="border-color:${b.color}"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          }
        } else {
          if (isTodo) {
            bar.innerHTML = showCheckbox
              ? `${lpCalendarSpanBarTodoMarkerHtml(b.color)}<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`
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
            .querySelector(".calendar-monthly-span-bar-checkbox")
            ?.classList.add("checked");
        }
        lpAttachCalendarBarOpenTodoEdit(bar, b, renderCalendar, refreshTodoList);
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
        b._barEl = bar;
        barsEl.appendChild(bar);
      });
      lpCalendarFinalizeBarRowLayout(
        barsWithRow,
        weekRow,
        BAR_HEIGHT,
        BARS_TOP,
        BOTTOM_PAD,
      );
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

  lpCalendarNavQ(nav, wrap, ".calendar-nav-today").addEventListener("click", () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    renderCalendar();
  });
  lpCalendarNavQ(nav, wrap, ".calendar-nav-prev").addEventListener("click", () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar();
  });
  lpCalendarNavQ(nav, wrap, ".calendar-nav-next").addEventListener("click", () => {
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
  todoSidebar.innerHTML = `
    ${lpCalendarTodoSidebarHeaderMarkup()}
    <div class="calendar-todo-sidebar-body">
      <div class="calendar-todo-sidebar-main"></div>
    </div>
  `;
  const body = todoSidebar.querySelector(".calendar-todo-sidebar-body");
  const mainWrap = body.querySelector(".calendar-todo-sidebar-main");
  const toolbarActionsSlot = todoSidebar.querySelector(
    ".calendar-todo-sidebar-toolbar-actions",
  );
  const todoListEl = renderTodoList(
    lpCalendarDateSidebarTodoListOpts(sidebarMode, {
      categoryToolbarActionsSlot: toolbarActionsSlot,
    }),
  );
  mainWrap.appendChild(lpWrapCalendarTodoSidebarListEl(todoListEl));
  applyCalendarTodoSidebarInitiallyCollapsed(todoSidebar);
  lpBindCalendarDateTodoSidebarCollapse(todoSidebar);
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
  wrap._lpRefreshCalendarView = () => {
    renderCalendar();
    refreshTodoList();
  };

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
      <button type="button" class="calendar-nav-today" title="Today">Today</button>
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
    lpCalendarNavQ(nav, wrap, ".calendar-nav-month").textContent =
      format2WeekNavRange(grid);
    lpCalendarNavQ(nav, wrap, ".calendar-nav-year").textContent = grid[0]?.[0]
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
        ? 1.02
        : 1.78;
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
        ? 1.62
        : 2.25;
      const BOTTOM_PAD = window.matchMedia("(max-width: 48rem)").matches
        ? 0.34
        : 0.42;
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
        bar.style.cssText = `left:${b.left}%;width:${b.width}%;--bar-bg:${b.color};top:${0.1 + b.row * BAR_HEIGHT}rem`;
        if (b.isSingleDay) {
          if (isTodo) {
            bar.innerHTML = `${lpCalendarSpanBarTodoMarkerHtml(b.color)}<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          } else {
            bar.style.setProperty("--schedule-icon-color", b.color);
            bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" style="border-color:${b.color}"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
          }
        } else {
          if (isTodo) {
            bar.innerHTML = showCheckbox
              ? `${lpCalendarSpanBarTodoMarkerHtml(b.color)}<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`
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
            .querySelector(".calendar-monthly-span-bar-checkbox")
            ?.classList.add("checked");
        }
        lpAttachCalendarBarOpenTodoEdit(bar, b, renderCalendar, refreshTodoList);
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
        b._barEl = bar;
        barsEl.appendChild(bar);
      });
      lpCalendarFinalizeBarRowLayout(
        barsWithRow,
        weekRow,
        BAR_HEIGHT,
        BARS_TOP,
        BOTTOM_PAD,
      );
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

  lpCalendarNavQ(nav, wrap, ".calendar-nav-today").addEventListener("click", () => {
    weekOffset = 0;
    renderCalendar();
  });
  lpCalendarNavQ(nav, wrap, ".calendar-nav-prev").addEventListener("click", () => {
    weekOffset--;
    renderCalendar();
  });
  lpCalendarNavQ(nav, wrap, ".calendar-nav-next").addEventListener("click", () => {
    weekOffset++;
    renderCalendar();
  });

  calendarSection.appendChild(nav);
  calendarSection.appendChild(calendarGrid);
  wrap.appendChild(calendarSection);

  const todoSidebar = document.createElement("aside");
  todoSidebar.className = "calendar-todo-sidebar";
  todoSidebar.innerHTML = `
    ${lpCalendarTodoSidebarHeaderMarkup()}
    <div class="calendar-todo-sidebar-body">
      <div class="calendar-todo-sidebar-main"></div>
    </div>
  `;
  const body = todoSidebar.querySelector(".calendar-todo-sidebar-body");
  const mainWrap = body.querySelector(".calendar-todo-sidebar-main");
  const toolbarActionsSlot = todoSidebar.querySelector(
    ".calendar-todo-sidebar-toolbar-actions",
  );
  const todoListEl = renderTodoList(
    lpCalendarDateSidebarTodoListOpts(sidebarMode, {
      categoryToolbarActionsSlot: toolbarActionsSlot,
    }),
  );
  mainWrap.appendChild(lpWrapCalendarTodoSidebarListEl(todoListEl));
  applyCalendarTodoSidebarInitiallyCollapsed(todoSidebar);
  lpBindCalendarDateTodoSidebarCollapse(todoSidebar);
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
  wrap._lpRefreshCalendarView = () => {
    renderCalendar();
    refreshTodoList();
  };

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
      <button type="button" class="calendar-nav-today" title="Today">Today</button>
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
    lpCalendarNavQ(nav, wrap, ".calendar-nav-month").textContent =
      format3WeekNavRange(grid);
    lpCalendarNavQ(nav, wrap, ".calendar-nav-year").textContent = grid[0]?.[0]
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
        ? 1.02
        : 1.78;
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
        ? 1.62
        : 2.25;
      const BOTTOM_PAD = window.matchMedia("(max-width: 48rem)").matches
        ? 0.34
        : 0.42;
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
        bar.style.cssText = `left:${b.left}%;width:${b.width}%;--bar-bg:${b.color};top:${0.1 + b.row * BAR_HEIGHT}rem`;
        if (b.isSingleDay) {
          if (isTodo) {
            bar.innerHTML = `${lpCalendarSpanBarTodoMarkerHtml(b.color)}<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
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
              .querySelector(".calendar-monthly-span-bar-checkbox")
              ?.classList.add("checked");
          }
        } else {
          if (isTodo) {
            bar.innerHTML = showCheckbox
              ? `${lpCalendarSpanBarTodoMarkerHtml(b.color)}<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`
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
              .querySelector(".calendar-monthly-span-bar-checkbox")
              ?.classList.add("checked");
          }
        }
        lpAttachCalendarBarOpenTodoEdit(bar, b, renderCalendar, refreshTodoList);
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
        b._barEl = bar;
        barsEl.appendChild(bar);
      });
      lpCalendarFinalizeBarRowLayout(
        barsWithRow,
        weekRow,
        BAR_HEIGHT,
        BARS_TOP,
        BOTTOM_PAD,
      );
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

  lpCalendarNavQ(nav, wrap, ".calendar-nav-today").addEventListener("click", () => {
    weekOffset = 0;
    renderCalendar();
  });
  lpCalendarNavQ(nav, wrap, ".calendar-nav-prev").addEventListener("click", () => {
    weekOffset--;
    renderCalendar();
  });
  lpCalendarNavQ(nav, wrap, ".calendar-nav-next").addEventListener("click", () => {
    weekOffset++;
    renderCalendar();
  });

  calendarSection.appendChild(nav);
  calendarSection.appendChild(calendarGrid);
  wrap.appendChild(calendarSection);

  const todoSidebar = document.createElement("aside");
  todoSidebar.className = "calendar-todo-sidebar";
  todoSidebar.innerHTML = `
    ${lpCalendarTodoSidebarHeaderMarkup()}
    <div class="calendar-todo-sidebar-body">
      <div class="calendar-todo-sidebar-main"></div>
    </div>
  `;
  const body = todoSidebar.querySelector(".calendar-todo-sidebar-body");
  const mainWrap = body.querySelector(".calendar-todo-sidebar-main");
  const toolbarActionsSlot = todoSidebar.querySelector(
    ".calendar-todo-sidebar-toolbar-actions",
  );
  const todoListEl = renderTodoList(
    lpCalendarDateSidebarTodoListOpts(sidebarMode, {
      categoryToolbarActionsSlot: toolbarActionsSlot,
    }),
  );
  mainWrap.appendChild(lpWrapCalendarTodoSidebarListEl(todoListEl));
  applyCalendarTodoSidebarInitiallyCollapsed(todoSidebar);
  lpBindCalendarDateTodoSidebarCollapse(todoSidebar);
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
  wrap._lpRefreshCalendarView = () => {
    renderCalendar();
    refreshTodoList();
  };

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
    let start = "";
    let end = "";
    if (inputs.length >= 2) {
      start = String(inputs[0]?.value ?? row.dataset.scheduledStart ?? "").trim();
      end = String(inputs[1]?.value ?? row.dataset.scheduledEnd ?? "").trim();
    } else {
      start = String(row.dataset.scheduledStart ?? "").trim();
      end = String(row.dataset.scheduledEnd ?? "").trim();
    }
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

/**
 * dateKey 기준: 저장된 일간예산 scheduledTimes + 해당 날 할일 시작·종료 → 예상 블록(겹침 레인 포함).
 * 오늘 해치우기 예산 DOM에만 있는 미저장 입력은 반영하지 않음.
 */
export function buildExpectedScheduleSpansForDateKey(dateKey) {
  const budgetGoals = getBudgetGoals(dateKey);
  const tasks = getAllTasksForDateDisplay(dateKey);
  const SLOTS_PER_DAY = CAL_1DAY_TIMETABLE_SLOTS_PER_DAY;
  const MIN_PER_SLOT = CAL_1DAY_TIMETABLE_MIN_PER_SLOT;
  const fmt = (m) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
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
  const getScheduledTimesForTask = (data) => {
    if (!data) return [];
    if (Array.isArray(data.scheduledTimes))
      return data.scheduledTimes.filter((x) => x && String(x).trim());
    if (data.scheduledTime && String(data.scheduledTime).trim())
      return [String(data.scheduledTime).trim()];
    return [];
  };
  const overlapMinutesBetween = (a, b) => {
    const sa = Number(a?.startMin);
    const ea = Number(a?.endMin);
    const sb = Number(b?.startMin);
    const eb = Number(b?.endMin);
    if (![sa, ea, sb, eb].every((n) => Number.isFinite(n))) return 0;
    const o = Math.min(ea, eb) - Math.max(sa, sb);
    return o > 0 ? o : 0;
  };
  const assignLanesToSpans = (spans) => {
    const laneOccupants = [];
    let maxLane = 0;
    for (const span of spans) {
      let lane = 0;
      while (lane < laneOccupants.length) {
        const inLane = laneOccupants[lane];
        const conflicts = inLane.some(
          (x) => overlapMinutesBetween(span, x) > 0,
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
          const memoJoin = [a.scheduleMemo, b.scheduleMemo]
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .join(" · ");
          const merged = {
            ...a,
            startMin,
            endMin,
            startSlot,
            endSlot: Math.max(endSlot, startSlot),
            startDisplay: fmt(startMin),
            endDisplay: fmt(endMin),
          };
          if (memoJoin) merged.scheduleMemo = memoJoin;
          else delete merged.scheduleMemo;
          arr = arr.filter((_, k) => k !== i && k !== j);
          arr.push(merged);
          changed = true;
          break outer;
        }
      }
    }
    return arr;
  };

  const spans = [];
  for (const [taskName, data] of Object.entries(budgetGoals)) {
    const times = getScheduledTimesForTask(data);
    const memos = Array.isArray(data?.scheduleMemos) ? data.scheduleMemos : [];
    const taskFromList = tasks.find((t) => (t.name || "").trim() === taskName);
    times.forEach((st, timeIdx) => {
      if (!st.trim()) return;
      const parts = st.trim().split("-");
      const startMin = parseHhMmToMinutes(parts[0]);
      const endMin = parts[1] ? parseHhMmToMinutes(parts[1]) : null;
      if (startMin == null || endMin == null) return;
      const startSlot = Math.floor(startMin / MIN_PER_SLOT);
      const endSlot = Math.min(
        SLOTS_PER_DAY - 1,
        Math.floor((endMin - 1) / MIN_PER_SLOT),
      );
      const opt = getTaskOptionByName(taskName);
      const prod = opt?.productivity || "other";
      const scheduleMemo = String(memos[timeIdx] || "").trim();
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
      if (scheduleMemo) span.scheduleMemo = scheduleMemo;
      if (taskFromList) {
        span.sectionId = taskFromList.sectionId;
        span._task = taskFromList;
        span._taskKey =
          taskFromList.kpiTodoId || taskFromList.taskId || taskFromList.name;
      }
      spans.push(span);
    });
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
}

function prodKeyForWeekExpectedSpan(span) {
  const pk = String(span?.prod || "other").toLowerCase();
  if (pk === "productive" || pk === "nonproductive") return pk;
  return "other";
}

function normLedgerRowDateYmd(s) {
  return String(s || "").replace(/\//g, "-").trim().slice(0, 10);
}

function parseYmdFromLedgerTimeStr(str) {
  if (!str || typeof str !== "string") return "";
  const m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  return m
    ? `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
    : "";
}

function ledgerRowsForCalendarYmd(allRows, ymd) {
  if (!ymd || !Array.isArray(allRows)) return [];
  return allRows.filter((r) => {
    const d = normLedgerRowDateYmd(
      r?.date || parseYmdFromLedgerTimeStr(r?.startTime),
    );
    return d === ymd;
  });
}

function normTaskNameForWeekFlowMatch(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** 같은 날 실제 과제 기록에 예상 행동과제명(또는 할일 taskId)이 있으면 true */
function weekFlowExpectedSpanHasLedgerMatch(dayRows, span) {
  if (!Array.isArray(dayRows) || dayRows.length === 0 || !span) return false;
  const expName = normTaskNameForWeekFlowMatch(span.taskName);
  const expTid = String(span._task?.taskId || "").trim();
  for (const r of dayRows) {
    const rtid = String(r?.taskId || "").trim();
    if (expTid && rtid && expTid === rtid) return true;
    const rn = normTaskNameForWeekFlowMatch(r?.taskName);
    if (expName && rn && expName === rn) return true;
  }
  return false;
}

/** 예상 과제와 같은 이름·taskId로, 지금 마감 없이 짜고 있는 실제 기록이 있는지 */
function weekFlowSpanHasMatchingLiveRecording(dayRows, span) {
  if (!Array.isArray(dayRows) || dayRows.length === 0 || !span) return false;
  const expName = normTaskNameForWeekFlowMatch(span.taskName);
  const expTid = String(span._task?.taskId || "").trim();
  for (const r of dayRows) {
    if (!isTimeLedgerRowLiveRecording(r)) continue;
    const rtid = String(r?.taskId || "").trim();
    if (expTid && rtid && expTid === rtid) return true;
    const rn = normTaskNameForWeekFlowMatch(r?.taskName);
    if (expName && rn && expName === rn) return true;
  }
  return false;
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
  const SLOTS_PER_DAY = CAL_1DAY_TIMETABLE_SLOTS_PER_DAY;
  const MIN_PER_SLOT = CAL_1DAY_TIMETABLE_MIN_PER_SLOT;
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
          const memoJoin = [a.scheduleMemo, b.scheduleMemo]
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .join(" · ");
          const merged = {
            ...a,
            startMin,
            endMin,
            startSlot,
            endSlot: Math.max(endSlot, startSlot),
            startDisplay: fmt(startMin),
            endDisplay: fmt(endMin),
          };
          if (memoJoin) merged.scheduleMemo = memoJoin;
          else delete merged.scheduleMemo;
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
      const memos = Array.isArray(data?.scheduleMemos)
        ? data.scheduleMemos
        : [];
      const taskFromList = tasks.find(
        (t) => (t.name || "").trim() === taskName,
      );
      times.forEach((st, timeIdx) => {
        if (!st.trim()) return;
        const parts = st.trim().split("-");
        const startMin = parseHhMmToMinutes(parts[0]);
        const endMin = parts[1] ? parseHhMmToMinutes(parts[1]) : null;
        if (startMin == null || endMin == null) return;
        const startSlot = Math.floor(startMin / MIN_PER_SLOT);
        const endSlot = Math.min(
          SLOTS_PER_DAY - 1,
          Math.floor((endMin - 1) / MIN_PER_SLOT),
        );
        const opt = getTaskOptionByName(taskName);
        const prod = opt?.productivity || "other";
        const scheduleMemo = String(memos[timeIdx] || "").trim();
        const span = {
          startSlot,
          endSlot: Math.max(endSlot, startSlot),
          startMin,
          endMin,
          taskName,
          prod,
          startDisplay: fmt(startMin),
          endDisplay: fmt(endMin),
          scheduleMemo,
        };
        if (taskFromList) {
          span.sectionId = taskFromList.sectionId;
          span._task = taskFromList;
          span._taskKey =
            taskFromList.kpiTodoId || taskFromList.taskId || taskFromList.name;
        }
        spans.push(span);
      });
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
    "dream",
    "sideincome",
    "health",
    "happy",
  ];
  /** 오늘 실제: 너무 짧으면 막대가 사라져 보임 — 시각 최소(분). 모바일 탭 상세는 이보다 길어도 읽기 어려울 때만 */
  const ACTUAL_MIN_VISUAL_MINUTES = 8;
  const ACTUAL_TAP_TOAST_MAX_MINUTES = 18;
  /** 예상·실제 공통: 이 분 이하(포함)는 과제명·시간 라벨 생략 — 호버 툴팁만 */
  const TIMETABLE_MAX_MINUTES_TO_HIDE_LABEL =
    CAL_TIMEBLOCK_HIDE_LABEL_MAX_MINUTES;
  /** 30분 초과 구간: 한 줄 라벨(과제명+시간) 적용 상한 */
  const ACTUAL_MAX_MINUTES_ONE_LINE_LABEL = 55;

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
      const insetX = CAL_1DAY_TIMEBLOCK_INSET_X;
      const insetY = CAL_1DAY_TIMEBLOCK_INSET_Y;
      const laneGapPx = CAL_1DAY_TIMEBLOCK_LANE_GAP_PX;
      if (useLaneLayout) {
        /* 겹침 구간: 칼럼 안쪽 여백 + 반열 사이 gap 으로 카드 분리 */
        spanFullOverlayGridForAbs();
        blockFill.style.position = "absolute";
        const n = laneCountLocal;
        const totalPxReduce = 2 * insetX + (n - 1) * laneGapPx;
        blockFill.style.width = `calc((100% - ${totalPxReduce}px) / ${n})`;
        blockFill.style.left = `calc(${insetX}px + ${laneLocal} * (((100% - ${totalPxReduce}px) / ${n}) + ${laneGapPx}px))`;
        applyDayVerticalExtents();
        blockFill.style.zIndex = String(100 + Math.min(blockStartMin, 2000));
      } else if (isActual) {
        /* 오늘 실제: 전폭 absolute (그리드 행에 걸면 인접 구간 겹침) */
        spanFullOverlayGridForAbs();
        blockFill.style.position = "absolute";
        blockFill.style.left = `${insetX}px`;
        blockFill.style.width = `calc(100% - ${2 * insetX}px)`;
        applyDayVerticalExtents();
        blockFill.style.zIndex = String(100 + Math.min(blockStartMin, 2000));
      } else {
        /*
         * 예상·전폭: 반열과 동일하게 '하루 1440분' 비율로만 배치.
         * grid-row+relative+flex % 조합은 일부 브라우저에서 높이가 0에 가깝게 무너짐.
         */
        spanFullOverlayGridForAbs();
        blockFill.style.position = "absolute";
        blockFill.style.left = `${insetX}px`;
        blockFill.style.width = `calc(100% - ${2 * insetX}px)`;
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
      /* 상하는 격자선과 살짝 띄움 — 좌우는 absolute left/width inset 로 처리 */
      blockFill.style.padding = `${insetY}px 0`;
      blockFill.style.border = "none";
      /* 예상: 직전 visible이 레인에서는 가로 삐져나옴 → 겹침(반열)만 hidden으로 자름 */
      blockFill.style.overflow =
        useLaneLayout || isActual ? "hidden" : "visible";
      /* 반열 각각 독립 카드처럼 모서리 둥글게 */
      blockFill.style.borderRadius = "0.375rem";
      blockFill.style.boxSizing = "border-box";
      /* 타임박스: 살짝 둥근 카드형, 면 채움 위주(왼쪽 굵은 실선·세그먼트 상하선 없음) */
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
        seg.style.flexDirection = "column";
        seg.style.alignItems = "stretch";
        seg.style.gap = "0.2rem";
        seg.style.padding = "0.25rem 0.5rem";
        const surfHex = timetableUsesHexSurface(c);
        if (surfHex && c.border) {
          seg.classList.add("calendar-1day-time-slot-fill-seg--surface-spec");
          seg.style.backgroundColor = c.bg;
          seg.style.border = `1px solid ${c.border}`;
          if (c.accentText) {
            seg.style.setProperty("--calendar-tb-fg", c.accentText);
            seg.style.setProperty(
              "--calendar-tb-fg-muted",
              c.accentMuted || c.accentText,
            );
          }
        } else {
          seg.style.backgroundColor = timetableFillFaceBg(c.bg);
          seg.style.border = "none";
        }
        seg.style.boxSizing = "border-box";
        /* 예상: 기본은 overflow visible 이지만 반열 겹침은 인라인 visible이 우선되어 밖으로 새어 나감 */
        if (!isActual) {
          seg.style.overflow = useLaneLayout ? "hidden" : "visible";
        }
        const segDurationMin = Math.max(
          0,
          (sp.endMin ?? 0) - (sp.startMin ?? 0),
        );
        const showTimetableLabel =
          segDurationMin > TIMETABLE_MAX_MINUTES_TO_HIDE_LABEL;
        if (showTimetableLabel) {
          const labelWrap = document.createElement("div");
          /* 동시구간 반열: 폭이 1/N로 줄어 시간 문자열이 겹침·삐져나옴 → 과제명만, 시간은 tooltip */
          const useLaneNameOnly = useLaneLayout;
          /* 짧은 구간: 제목+시간을 최대 3줄까지 말줄임(칸 높이 한정) */
          const useCompactOneLineLabel =
            !useLaneNameOnly &&
            segDurationMin > TIMETABLE_MAX_MINUTES_TO_HIDE_LABEL &&
            segDurationMin <= ACTUAL_MAX_MINUTES_ONE_LINE_LABEL;
          if (useLaneNameOnly) {
            labelWrap.className =
              "calendar-1day-time-slot-label-wrap calendar-1day-time-slot-label-wrap--lane-name-only";
            const labelName = document.createElement("span");
            labelName.className =
              "calendar-1day-time-slot-label-name calendar-1day-time-slot-label-name--lane-small";
            labelName.textContent = sp.taskName || "";
            labelWrap.appendChild(labelName);
            labelWrap.title = `${String(sp.taskName || "").trim()}\n${sp.startDisplay} ~ ${sp.endDisplay}`;
          } else {
            /* 과제명 - 시간 한 흐름(줄바꿈 시에도 시간이 옆 열로 밀리지 않음), 메모는 아래 */
            labelWrap.className =
              "calendar-1day-time-slot-label-wrap" +
              (useCompactOneLineLabel
                ? " calendar-1day-time-slot-label-wrap--compact"
                : "");
            const titleTimeRow = document.createElement("div");
            titleTimeRow.className = "calendar-1day-time-slot-label-title-time";
            const labelName = document.createElement("span");
            labelName.className = "calendar-1day-time-slot-label-name";
            labelName.textContent = String(sp.taskName || "").trim();
            const labelTime = document.createElement("span");
            labelTime.className = "calendar-1day-time-slot-label-time";
            const taskStr = String(sp.taskName || "").trim();
            labelTime.textContent = taskStr
              ? ` - ${sp.startDisplay} ~ ${sp.endDisplay}`
              : `${sp.startDisplay} ~ ${sp.endDisplay}`;
            titleTimeRow.appendChild(labelName);
            titleTimeRow.appendChild(labelTime);
            labelWrap.appendChild(titleTimeRow);
          }
          const labelFg =
            c.accentText || timetableAccentTextColor(c.border || c.bg);
          if (!surfHex) {
            if (labelFg) labelWrap.style.color = labelFg;
            if (c.accentMuted) {
              const tmEl = labelWrap.querySelector(
                ".calendar-1day-time-slot-label-time",
              );
              if (tmEl) tmEl.style.color = c.accentMuted;
            }
          }
          seg.appendChild(labelWrap);
          if ((sp.scheduleMemo || "").trim()) {
            const memoLine = document.createElement("div");
            memoLine.className = "calendar-1day-time-slot-label-memo";
            memoLine.textContent = String(sp.scheduleMemo || "").trim();
            if (labelFg) memoLine.style.color = labelFg;
            seg.appendChild(memoLine);
          }
        } else {
          seg.classList.add("calendar-1day-time-slot-fill-seg--tooltip-only");
          lpAttachColoredTimeBlockTooltip(seg, {
            taskName: sp.taskName,
            rangeStr: `${sp.startDisplay} ~ ${sp.endDisplay}`,
            memo: (sp.scheduleMemo || "").trim(),
            bgCss: surfHex ? c.bg : timetableFillFaceBg(c.bg),
            accentCss:
              c.accentText ||
              timetableAccentTextColor(c.border || c.bg) ||
              "#ffffff",
          });
        }
        blockFill.appendChild(seg);
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

function render1DayView(
  tabsElement,
  sidebarMode = LP_CAL_TODO_SIDEBAR_QUADRANT,
  /** 모바일 일정 상단 슬롯 — 1일 뷰가 아직 DOM에 안 붙었을 때도 안정적으로 + 위치 고정 */
  calendarScheduleBudgetAddSlot = null,
  /** true: 홈 「오늘」타임라인 전용 카드 UI. 일정 탭 타임블록(1일)은 false → 기존 타임테이블 */
  useHomeTodayTimeline = false,
) {
  const wrap = document.createElement("div");
  wrap.className = "calendar-monthly-layout calendar-1day-view";
  wrap.dataset.lpCalTodoSidebar = sidebarMode;
  if (useHomeTodayTimeline) {
    wrap.dataset.lpHomeTodayTimeline = "1";
  }

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
    refreshCalendarDateTodoSidebar(wrap);
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
        const investedMins = getAccumulatedMinutesForKpiId(k.kpiId || k.id);
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
            <div class="dream-kpi-card-target-num">${k.heroValueHtml}</div>
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
    const todayBtn = lpCalendarNavQ(nav, wrap, ".calendar-nav-today");
    if (todayBtn) {
      const y = targetDate.getFullYear();
      const m = targetDate.getMonth() + 1;
      const d = targetDate.getDate();
      const w = NAV_WEEKDAYS_SUN0[targetDate.getDay()] || "";
      todayBtn.textContent = `${y}. ${m}. ${d}(${w})`;
      todayBtn.title = dayOffset === 0 ? "Today" : `${y}년 ${m}월 ${d}일`;
    }

    if (topBar.parentNode) topBar.parentNode.removeChild(topBar);

    calendarGrid.innerHTML = "";
    calendarGrid.className =
      "calendar-monthly-grid calendar-1day-time-grid calendar-1day-split-layout";

    const targetKey = formatDateKey(targetDate);

    const budgetColumn = document.createElement("div");
    budgetColumn.className = "calendar-1day-budget-column";
    budgetColumn.appendChild(topBar);
    const timeColumn = document.createElement("div");
    timeColumn.className = "calendar-1day-time-column";

    const tasks = getAllTasksForDateDisplay(targetKey);
    const budgetGoals = getBudgetGoals(targetKey);

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
    const skipBudgetTaskNames = new Set();
    sortedTasks.forEach((t) => {
      const n = (t.name || "").trim();
      if (n) skipBudgetTaskNames.add(n);
    });

    const SECTION_LABELS = {
      dream: "꿈",
      sideincome: "부수입",
      health: "건강",
      happy: "행복",
    };
    const taskStats = {};
    ["dream", "sideincome", "health", "happy"].forEach((sid) => {
      const sectionTasks = tasks.filter((t) => t.sectionId === sid);
      const total = sectionTasks.length;
      const done = sectionTasks.filter((t) => t.done).length;
      taskStats[sid] = { done, total, label: SECTION_LABELS[sid] || sid };
    });

    const onScheduledUpdate = (dateStr) => {
      if (dayOffset === 0 && useHomeTodayTimeline) {
        requestAnimationFrame(() => renderCalendar());
        return;
      }
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
    const budgetAddBtnMount =
      calendarScheduleBudgetAddSlot ??
      wrap.closest(".calendar-view-with-subtabs")?.querySelector(
        ".calendar-schedule-budget-add-slot",
      ) ??
      null;
    renderTimeBudgetTablesForCalendar(
      budgetColumn,
      targetKey,
      null,
      onScheduledUpdate,
      onOverlapCleared,
      topBarLeft,
      skipBudgetTaskNames,
      budgetAddBtnMount,
    );
    calendarGrid.appendChild(budgetColumn);
    refreshKpiSidebar(taskStats);
    calendarGrid.appendChild(timeColumn);

    /* 구분선 */
    const divider = document.createElement("div");
    divider.className = "calendar-1day-divider";
    timeColumn.appendChild(divider);

    const isViewingToday = dayOffset === 0 && useHomeTodayTimeline;

    if (isViewingToday) {
      const nowForTimeline = new Date();
      const nowMinuteClockTL =
        nowForTimeline.getHours() * 60 + nowForTimeline.getMinutes();
      const todayYmdForTimeline = timeLedgerLocalTodayYmd();
      const dayLedgerRowsTL = ledgerRowsForCalendarYmd(
        loadTimeRows(),
        targetKey,
      );
      const prodColorsTL = getTimeCategoryColorsForTimetableExpected();
      const TL_SECTION_LABELS = {
        dream: "꿈",
        sideincome: "부수입",
        health: "건강",
        happy: "행복",
      };

      const timelineWrap = document.createElement("div");
      timelineWrap.className = "calendar-1day-timeline-wrap";

      const timelineList = document.createElement("div");
      timelineList.className = "calendar-1day-timeline-list";

      const { spans: daySpansTl } =
        buildExpectedScheduleSpansForDateKey(targetKey);
      const spansSortedTl = [...daySpansTl].sort(
        (a, b) =>
          a.startMin - b.startMin ||
          (a.lane ?? 0) - (b.lane ?? 0) ||
          String(a.taskName || "").localeCompare(
            String(b.taskName || ""),
            "ko",
          ),
      );

      if (spansSortedTl.length === 0) {
        const emptyTl = document.createElement("p");
        emptyTl.className = "calendar-1day-timeline-empty";
        emptyTl.textContent = "예정된 일정이 없습니다.";
        timelineList.appendChild(emptyTl);
      } else {
        spansSortedTl.forEach((span) => {
          const pk = prodKeyForWeekExpectedSpan(span);
          const c = prodColorsTL[pk] || prodColorsTL.other;
          const taskLabel = String(span.taskName || "").trim();
          const memoTextStored = String(span.scheduleMemo || "").trim();
          const durMin = Math.max(0, span.endMin - span.startMin);
          const ledgerMatched = weekFlowExpectedSpanHasLedgerMatch(
            dayLedgerRowsTL,
            span,
          );
          const inExpectedWindow =
            targetKey === todayYmdForTimeline &&
            span.startMin <= nowMinuteClockTL &&
            nowMinuteClockTL < span.endMin;
          const liveRecordingThisSpan =
            inExpectedWindow &&
            weekFlowSpanHasMatchingLiveRecording(dayLedgerRowsTL, span);

          const item = document.createElement("div");
          item.className = "calendar-1day-timeline-item";

          const spot = document.createElement("div");
          spot.className = "calendar-1day-timeline-spot";
          const spotMark = document.createElement("div");
          spotMark.className = "calendar-1day-timeline-spot-mark";
          const sidRaw = String(span.sectionId || "").trim();
          let accent = "";
          if (sidRaw && !sidRaw.startsWith("custom-")) {
            try {
              accent = getSectionColor(sidRaw) || "";
            } catch (_) {
              accent = "";
            }
          }
          if (!accent && c.border) accent = c.border;
          if (accent) {
            spotMark.style.backgroundColor = withMoreTransparency(accent, 0.14);
            spotMark.style.border = `2px solid ${accent}`;
          } else {
            spotMark.style.backgroundColor = "";
            spotMark.style.border = "2px solid rgba(0, 0, 0, 0.12)";
          }
          /* 배경 틴트와 같은 밝기의 글자색은 쓰지 않음 — 항상 본문 잉크 */
          spotMark.textContent = span.startDisplay;
          spotMark.setAttribute(
            "aria-label",
            `${span.startDisplay}에 시작하는 일정`,
          );

          spot.appendChild(spotMark);

          const card = document.createElement("div");
          card.className = "calendar-1day-timeline-card";
          const titleBase = memoTextStored
            ? `${taskLabel} (${span.startDisplay} ~ ${span.endDisplay})\n${memoTextStored}`
            : `${taskLabel} (${span.startDisplay} ~ ${span.endDisplay})`;
          if (ledgerMatched) {
            card.classList.add("calendar-1day-timeline-card--done");
            card.title = `${titleBase}\n실제 과제 기록에 반영됨`;
          } else {
            card.title = titleBase;
          }
          if (liveRecordingThisSpan) {
            card.classList.add("calendar-1day-timeline-card--in-progress");
          }
          if (
            inExpectedWindow &&
            !liveRecordingThisSpan &&
            !ledgerMatched
          ) {
            card.classList.add("calendar-1day-timeline-card--expected-now");
          }
          if (accent) {
            card.style.borderLeftColor = accent;
          }

          const titleRow = document.createElement("div");
          titleRow.className = "calendar-1day-timeline-card-title-row";
          const titleEl = document.createElement("div");
          titleEl.className = "calendar-1day-timeline-card-title";
          titleEl.textContent = taskLabel;
          titleRow.appendChild(titleEl);
          if (ledgerMatched) {
            const checkEl = document.createElement("span");
            checkEl.className = "calendar-1day-timeline-card-check";
            checkEl.setAttribute("role", "img");
            checkEl.setAttribute("aria-label", "기록 완료");
            checkEl.textContent = "✓";
            titleRow.appendChild(checkEl);
          }
          card.appendChild(titleRow);

          const meta = document.createElement("div");
          meta.className = "calendar-1day-timeline-card-meta";
          const timeRange = document.createElement("span");
          timeRange.className = "calendar-1day-timeline-card-time";
          timeRange.textContent = `${span.startDisplay} - ${span.endDisplay}`;
          meta.appendChild(timeRange);

          let badgeText = "";
          if (sidRaw && TL_SECTION_LABELS[sidRaw]) {
            badgeText = TL_SECTION_LABELS[sidRaw];
          } else if (sidRaw.startsWith("custom-")) {
            badgeText = "커스텀";
          }
          if (badgeText) {
            const badge = document.createElement("span");
            badge.className = "calendar-1day-timeline-card-badge";
            badge.textContent = badgeText;
            if (accent) {
              badge.style.backgroundColor = withMoreTransparency(accent, 0.22);
              badge.style.color =
                timetableAccentTextColor(accent) || accent;
            }
            meta.appendChild(badge);
          }
          const durEl = document.createElement("span");
          durEl.className = "calendar-1day-timeline-card-duration";
          durEl.textContent = `${durMin}분`;
          meta.appendChild(durEl);
          if (liveRecordingThisSpan) {
            const prog = document.createElement("span");
            prog.className = "calendar-1day-timeline-card-progress";
            prog.textContent = "진행 중";
            meta.appendChild(prog);
          }
          card.appendChild(meta);
          if (memoTextStored) {
            const memoEl = document.createElement("div");
            memoEl.className = "calendar-1day-timeline-card-memo";
            memoEl.textContent = memoTextStored;
            card.appendChild(memoEl);
          }

          item.appendChild(spot);
          item.appendChild(card);
          timelineList.appendChild(item);
        });
      }

      timelineWrap.appendChild(timelineList);
      timeColumn.appendChild(timelineWrap);

      const timeTableInnerStub = document.createElement("div");
      timeTableInnerStub.className =
        "calendar-1day-time-table-inner calendar-1day-time-table-inner--timeline-only";
      timeTableInnerStub.setAttribute("aria-hidden", "true");
      timeColumn.appendChild(timeTableInnerStub);
    } else {
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
    const SLOTS_PER_DAY = CAL_1DAY_TIMETABLE_SLOTS_PER_DAY;
    const MIN_PER_SLOT = CAL_1DAY_TIMETABLE_MIN_PER_SLOT;
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
      const slotStartMin = i * MIN_PER_SLOT;
      const th = Math.floor(slotStartMin / 60);
      const tm = slotStartMin % 60;
      timeLabel.textContent = `${String(th).padStart(2, "0")}:${String(tm).padStart(2, "0")}`;
      if (tm !== 0) timeLabel.classList.add("calendar-1day-time-label--subslot");
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
    }

    if (sidebarMode !== LP_CAL_TODO_SIDEBAR_NONE) {
      const todoSidebar = document.createElement("aside");
      todoSidebar.className = "calendar-todo-sidebar";
      todoSidebar.innerHTML = `
    ${lpCalendarTodoSidebarHeaderMarkup()}
    <div class="calendar-todo-sidebar-body">
      <div class="calendar-todo-sidebar-main"></div>
    </div>
  `;
      const sidebarBody = todoSidebar.querySelector(
        ".calendar-todo-sidebar-body",
      );
      const sidebarMain =
        sidebarBody.querySelector(".calendar-todo-sidebar-main");
      const toolbarActionsSlot = todoSidebar.querySelector(
        ".calendar-todo-sidebar-toolbar-actions",
      );
      const todoListEl = renderTodoList(
        lpCalendarDateSidebarTodoListOpts(sidebarMode, {
          categoryToolbarActionsSlot: toolbarActionsSlot,
        }),
      );
      sidebarMain.appendChild(lpWrapCalendarTodoSidebarListEl(todoListEl));
      applyCalendarTodoSidebarInitiallyCollapsed(todoSidebar);
      lpBindCalendarDateTodoSidebarCollapse(todoSidebar);
      calendarGrid.appendChild(todoSidebar);
      attachCalendarTodoSidebarSpanRevertDrop(
        sidebarBody,
        () => renderCalendar(),
        () => refreshTodoList(),
      );
    }

    wrap.dataset.dateStr = targetKey;
    /* 날짜 이동 등 renderCalendar만 다시 돌 때도 예산·시간 열에 글로벌 flex:6/4 가 붙음 → 모바일 일정 탭에서 재스탬프 */
    const scheduleMob = wrap.closest(".calendar-view--mobile-schedule");
    if (
      scheduleMob &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 48rem)").matches
    ) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const split = wrap.querySelector(".calendar-1day-split-layout");
          if (split) {
            try {
              split.style.setProperty("flex-direction", "column", "important");
              split.style.setProperty("width", "100%", "important");
              split.style.setProperty("max-width", "100%", "important");
              split.style.setProperty("min-width", "0", "important");
              split.style.setProperty("align-items", "stretch", "important");
              split.style.setProperty("box-sizing", "border-box", "important");
            } catch (_) {}
          }
          [".calendar-1day-budget-column", ".calendar-1day-time-column"].forEach(
            (sel) => {
              const el = split?.querySelector(sel);
              if (!el) return;
              try {
                el.style.setProperty("flex", "0 0 auto", "important");
                el.style.setProperty("min-height", "min-content", "important");
                el.style.setProperty("max-height", "none", "important");
                el.style.setProperty("width", "100%", "important");
                el.style.setProperty("max-width", "100%", "important");
                el.style.setProperty("min-width", "0", "important");
                el.style.setProperty("box-sizing", "border-box", "important");
                if (sel === ".calendar-1day-budget-column") {
                  el.style.setProperty("overflow-x", "auto", "important");
                  el.style.setProperty("overflow-y", "visible", "important");
                } else {
                  el.style.setProperty("overflow", "visible", "important");
                  el.style.setProperty("overflow-x", "hidden", "important");
                }
              } catch (_) {}
            },
          );
        });
      });
    }
  }

  lpCalendarNavQ(nav, wrap, ".calendar-nav-today").addEventListener("click", () => {
    dayOffset = 0;
    renderCalendar();
  });
  lpCalendarNavQ(nav, wrap, ".calendar-nav-prev").addEventListener("click", () => {
    dayOffset--;
    renderCalendar();
  });
  lpCalendarNavQ(nav, wrap, ".calendar-nav-next").addEventListener("click", () => {
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
    if (e?.detail?.rebuildBudgetTables) {
      renderCalendar();
      return;
    }
    const source = e?.type || "unknown";
    const wrapInDoc = document.contains(wrap);
    const dateStr = e?.detail?.dateStr || wrap.dataset?.dateStr;
    const timeTableInner = wrap.querySelector(
      ".calendar-1day-time-table-inner",
    );
    void source;
    if (!wrapInDoc) return;
    if (
      timeTableInner?.classList.contains(
        "calendar-1day-time-table-inner--timeline-only",
      )
    ) {
      renderCalendar();
      return;
    }
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

  wrap._lpRefreshCalendarView = () => {
    renderCalendar();
  };
  wrap._lpRefreshDateTodoSidebar = refreshTodoList;

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
  let _1weekRenderGen = 0;

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
      <button type="button" class="calendar-nav-today" title="이번 주">Today</button>
      <button type="button" class="calendar-nav-next" title="다음 주">&gt;</button>
    </div>
  `;
  nav.classList.add("calendar-monthly-nav");

  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-monthly-grid";

  function refreshTodoList() {
    refreshCalendarDateTodoSidebar(wrap);
  }

  function renderCalendar(opts = {}) {
    const skipWeekPull = !!opts.skipWeekPull;
    const week = getCalendarGridFor1Week(weekOffset);
    const weekKeysForPull = week
      .map((d) => (d ? formatDateKey(d) : ""))
      .filter(Boolean);
    const firstPullKey = weekKeysForPull[0] || "";
    const lastPullKey =
      weekKeysForPull[weekKeysForPull.length - 1] || "";
    if (!skipWeekPull && firstPullKey && lastPullKey) {
      const pullGen = ++_1weekRenderGen;
      void (async () => {
        try {
          await pullTimeLedgerEntriesForDateRange(firstPullKey, lastPullKey);
          await pullTimeDailyBudgetFromSupabase();
        } catch (_) {}
        if (pullGen !== _1weekRenderGen) return;
        requestAnimationFrame(() => {
          if (pullGen !== _1weekRenderGen) return;
          renderCalendar({ skipWeekPull: true });
        });
      })();
    }

    const monthIndex = week[0] ? week[0].getMonth() : new Date().getMonth();
    const navMonth = lpCalendarNavQ(nav, wrap, ".calendar-nav-month");
    const navYear = lpCalendarNavQ(nav, wrap, ".calendar-nav-year");
    if (navMonth) navMonth.textContent = MONTH_NAMES_EN[monthIndex];
    if (navYear)
      navYear.textContent = week[0] ? String(week[0].getFullYear()) : "";

    try {
      wrap._lp1WeekFlowBodyMinRo?.disconnect();
    } catch (_) {}
    wrap._lp1WeekFlowBodyMinRo = null;

    calendarGrid.innerHTML = "";
    calendarGrid.className =
      "calendar-monthly-grid calendar-monthly-grid--1week-timegrid";

    const todayYmd = timeLedgerLocalTodayYmd();
    const prodColorsExpected = getTimeCategoryColorsForTimetableExpected();
    const nowForWeek = new Date();
    const nowMinuteClock =
      nowForWeek.getHours() * 60 + nowForWeek.getMinutes();
    const WEEK_FLOW_SECTION_LABELS = {
      dream: "꿈",
      sideincome: "부수입",
      health: "건강",
      happy: "행복",
    };

    const allLedgerRowsForWeek = loadTimeRows();

    function applyWeekDropToDate(targetDate, payload) {
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
        renderCalendar({ skipWeekPull: true });
        refreshTodoList();
      }
    }

    const outer = document.createElement("div");
    outer.className =
      "calendar-1week-time-grid-google calendar-1week-time-grid-google--flow";

    const weekDateKeys = week
      .map((d) => (d ? formatDateKey(d) : ""))
      .filter(Boolean);
    const firstDayKey = weekDateKeys[0] || "";
    const lastDayKey =
      weekDateKeys[weekDateKeys.length - 1] || "";
    const rangeTasks = getAllTasksWithDateRange();

    const stripHeader = document.createElement("div");
    stripHeader.className = "calendar-1week-strip-header";

    const dayHeader = document.createElement("div");
    dayHeader.className = "calendar-monthly-weekdays";
    DAY_NAMES.forEach((name) => {
      const cell = document.createElement("div");
      cell.className = "calendar-monthly-weekday";
      cell.textContent = name;
      dayHeader.appendChild(cell);
    });
    stripHeader.appendChild(dayHeader);

    const weekWrap = document.createElement("div");
    weekWrap.className = "calendar-monthly-week-wrap";
    const weekRow = document.createElement("div");
    weekRow.className = "calendar-monthly-week";
    const currentMonth = week[0]
      ? week[0].getMonth()
      : new Date().getMonth();

    week.forEach((date) => {
      if (!date) return;
      const cell = document.createElement("div");
      cell.className = "calendar-monthly-day";
      const key = formatDateKey(date);
      cell.dataset.date = key;
      const dayNum = document.createElement("div");
      dayNum.className = "calendar-monthly-day-num";
      dayNum.textContent = date.getDate();

      const isCurrentMonth = date.getMonth() === currentMonth;
      if (!isCurrentMonth) cell.classList.add("other-month");
      if (key === todayYmd) cell.classList.add("today");
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
          if (e.target.closest?.(".calendar-monthly-span-bar")) return;
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
              onAfterTaskEdit: () => {
                renderCalendar();
                refreshTodoList();
              },
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
        applyWeekDropToDate(key, payload);
      });
      weekRow.appendChild(cell);
    });

    const barsEl = document.createElement("div");
    barsEl.className = "calendar-monthly-bars";
    const BAR_HEIGHT = window.matchMedia("(max-width: 48rem)").matches
      ? 1.02
      : 1.78;
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
      const width =
        ((endIdx - startIdx + 1) / 7) * 100 - (CELL_GAP * 2) / 7;
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
    allBars.forEach((b) => {
      b.isOverflow = false;
    });
    const maxRow = allBars.length
      ? Math.max(...allBars.map((b) => b.row), 0)
      : 0;
    const rowsNeeded = maxRow + 1;
    const BARS_TOP = window.matchMedia("(max-width: 48rem)").matches
      ? 1.62
      : 2.25;
    const BOTTOM_PAD = window.matchMedia("(max-width: 48rem)").matches
      ? 0.34
      : 0.42;
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
      bar.style.cssText = `left:${b.left}%;width:${b.width}%;--bar-bg:${b.color};top:${0.1 + b.row * BAR_HEIGHT}rem`;
      if (b.isSingleDay) {
        if (isTodo) {
          bar.innerHTML = `${lpCalendarSpanBarTodoMarkerHtml(b.color)}<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
        } else {
          bar.style.setProperty("--schedule-icon-color", b.color);
          bar.innerHTML = `<span class="calendar-monthly-span-bar-icon calendar-monthly-span-bar-icon--schedule" style="border-color:${b.color}"></span><span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`;
        }
      } else {
        if (isTodo) {
          bar.innerHTML = showCheckbox
            ? `${lpCalendarSpanBarTodoMarkerHtml(b.color)}<span class="calendar-monthly-span-bar-text">${escapeHtml(b.name || "")}</span>`
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
          .querySelector(".calendar-monthly-span-bar-checkbox")
          ?.classList.add("checked");
      }
      lpAttachCalendarBarOpenTodoEdit(bar, b, renderCalendar, refreshTodoList);
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
      b._barEl = bar;
      barsEl.appendChild(bar);
    });
    lpCalendarFinalizeBarRowLayout(
      barsWithRow,
      weekRow,
      BAR_HEIGHT,
      BARS_TOP,
      BOTTOM_PAD,
    );
    const moreEl = document.createElement("div");
    moreEl.className = "calendar-day-more-overlay";
    moreEl.style.cssText =
      "display:grid;grid-template-columns:repeat(7,1fr);position:absolute;inset:0;pointer-events:none;align-content:flex-end;padding:0.2rem 0;";
    weekDateKeys.forEach((_dateKey) => {
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
      applyWeekDropToDate(cell.dataset.date, payload);
    });
    weekWrap.appendChild(weekRow);
    weekWrap.appendChild(barsEl);
    weekWrap.appendChild(moreEl);
    stripHeader.appendChild(weekWrap);

    const scrollArea = document.createElement("div");
    scrollArea.className = "calendar-1week-google-scroll";

    const bodyGrid = document.createElement("div");
    bodyGrid.className = "calendar-1week-google-body";

    const colsWrap = document.createElement("div");
    colsWrap.className = "calendar-1week-google-cols";

    const weekFlowMobileHoursOnly =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 48rem)").matches;
    const weekFlowHourToken = (hhmm) => {
      const m = String(hhmm || "").trim().match(/^(\d{1,2})/);
      return m != null ? String(parseInt(m[1], 10)) : String(hhmm || "");
    };

    week.forEach((date) => {
      if (!date) return;
      const key = formatDateKey(date);
      const dayLedgerRows = ledgerRowsForCalendarYmd(allLedgerRowsForWeek, key);
      const col = document.createElement("div");
      col.className =
        "calendar-1week-google-col calendar-1week-google-col--flow";
      col.dataset.date = key;
      if (key === todayYmd) col.classList.add("is-today");

      const stack = document.createElement("div");
      stack.className = "calendar-1week-flow-stack";

      const prodColors = prodColorsExpected;
      const { spans: daySpans } = buildExpectedScheduleSpansForDateKey(key);
      const spansSorted = [...daySpans].sort(
        (a, b) =>
          a.startMin - b.startMin ||
          (a.lane ?? 0) - (b.lane ?? 0) ||
          String(a.taskName || "").localeCompare(
            String(b.taskName || ""),
            "ko",
          ),
      );

      spansSorted.forEach((span) => {
        const pk = prodKeyForWeekExpectedSpan(span);
        const c = prodColors[pk] || prodColors.other;
        const taskLabel = String(span.taskName || "").trim();
        const memoTextStored = String(span.scheduleMemo || "").trim();
        const rangeHuman = weekFlowMobileHoursOnly
          ? `${weekFlowHourToken(span.startDisplay)} - ${weekFlowHourToken(span.endDisplay)}`
          : `${span.startDisplay} - ${span.endDisplay}`;

        const ledgerMatched = weekFlowExpectedSpanHasLedgerMatch(
          dayLedgerRows,
          span,
        );

        const card = document.createElement("div");
        card.className = "calendar-1week-flow-card";
        const titleBase = memoTextStored
          ? `${taskLabel} (${span.startDisplay} ~ ${span.endDisplay})\n${memoTextStored}`
          : `${taskLabel} (${span.startDisplay} ~ ${span.endDisplay})`;
        card.title = ledgerMatched
          ? `${titleBase}\n실제 과제 기록에도 있음`
          : titleBase;
        if (ledgerMatched) {
          card.classList.add("calendar-1week-flow-card--ledger-done");
        }

        const sidRaw = String(span.sectionId || "").trim();
        let accent = "";
        if (sidRaw && !sidRaw.startsWith("custom-")) {
          try {
            accent = getSectionColor(sidRaw) || "";
          } catch (_) {
            accent = "";
          }
        }
        if (!accent && c.border) accent = c.border;
        if (accent) {
          card.style.borderLeftColor = accent;
        }

        const titleEl = document.createElement("div");
        titleEl.className = "calendar-1week-flow-card-title";
        titleEl.textContent = taskLabel;
        titleEl.style.flex = "1";
        titleEl.style.minWidth = "0";

        const titleRow = document.createElement("div");
        titleRow.className = "calendar-1week-flow-card-title-row";
        titleRow.style.cssText =
          "display:flex;align-items:flex-start;justify-content:space-between;gap:0.35rem;";
        titleRow.appendChild(titleEl);
        if (ledgerMatched) {
          const checkEl = document.createElement("span");
          checkEl.className = "calendar-1week-flow-card-done-check";
          checkEl.setAttribute("role", "img");
          checkEl.setAttribute("aria-label", "실제 기록에 반영됨");
          checkEl.textContent = "✓";
          titleRow.appendChild(checkEl);
        }

        const meta = document.createElement("div");
        meta.className = "calendar-1week-flow-card-meta";

        const timeSpan = document.createElement("span");
        timeSpan.className = "calendar-1week-flow-card-time";
        timeSpan.textContent = rangeHuman;
        meta.appendChild(timeSpan);

        let badgeText = "";
        if (sidRaw && WEEK_FLOW_SECTION_LABELS[sidRaw]) {
          badgeText = WEEK_FLOW_SECTION_LABELS[sidRaw];
        } else if (sidRaw.startsWith("custom-")) {
          badgeText = "커스텀";
        }
        if (badgeText) {
          const badge = document.createElement("span");
          badge.className = "calendar-1week-flow-card-badge";
          badge.textContent = badgeText;
          if (accent) {
            badge.style.backgroundColor = withMoreTransparency(accent, 0.22);
            badge.style.color = timetableAccentTextColor(accent) || accent;
          }
          meta.appendChild(badge);
        }

        const inExpectedWindow =
          key === todayYmd &&
          span.startMin <= nowMinuteClock &&
          nowMinuteClock < span.endMin;
        const liveRecordingThisSpan =
          inExpectedWindow &&
          weekFlowSpanHasMatchingLiveRecording(dayLedgerRows, span);

        if (liveRecordingThisSpan) {
          card.classList.add("calendar-1week-flow-card--in-progress");
          const prog = document.createElement("span");
          prog.className = "calendar-1week-flow-card-progress";
          prog.textContent = "진행 중";
          meta.appendChild(prog);
        } else if (
          inExpectedWindow &&
          !liveRecordingThisSpan &&
          !ledgerMatched
        ) {
          card.classList.add("calendar-1week-flow-card--expected-now");
        } else if (!ledgerMatched) {
          card.classList.add("calendar-1week-flow-card--ledger-pending");
        }

        card.appendChild(titleRow);
        card.appendChild(meta);
        if (memoTextStored) {
          const memoEl = document.createElement("div");
          memoEl.className = "calendar-1week-flow-card-memo";
          memoEl.textContent = memoTextStored;
          card.appendChild(memoEl);
        }
        stack.appendChild(card);
      });

      col.appendChild(stack);
      colsWrap.appendChild(col);
    });

    bodyGrid.appendChild(colsWrap);
    scrollArea.appendChild(bodyGrid);

    scrollArea.addEventListener("dragover", (e) => {
      if (!calendarDragTransferTypesAllowDrop(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      let col = e.target.closest(".calendar-1week-google-col");
      if (!col) {
        col = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest(".calendar-1week-google-col");
      }
      scrollArea
        .querySelectorAll(".calendar-day-drag-over")
        .forEach((el) => el.classList.remove("calendar-day-drag-over"));
      if (col) col.classList.add("calendar-day-drag-over");
    });
    scrollArea.addEventListener("dragleave", (e) => {
      if (!scrollArea.contains(e.relatedTarget)) {
        scrollArea
          .querySelectorAll(".calendar-day-drag-over")
          .forEach((el) => el.classList.remove("calendar-day-drag-over"));
      }
    });
    scrollArea.addEventListener("drop", (e) => {
      scrollArea
        .querySelectorAll(".calendar-day-drag-over")
        .forEach((el) => el.classList.remove("calendar-day-drag-over"));
      const json = readCalendarDropPayloadJson(e.dataTransfer);
      if (!json) return;
      e.preventDefault();
      let payload;
      try {
        payload = JSON.parse(json);
      } catch (_) {
        return;
      }
      let col = e.target.closest(".calendar-1week-google-col");
      if (!col) {
        col = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest(".calendar-1week-google-col");
      }
      if (!col) return;
      const targetDate = col.dataset.date || "";
      if (!targetDate) return;
      applyWeekDropToDate(targetDate, payload);
    });

    outer.appendChild(stripHeader);
    outer.appendChild(scrollArea);
    calendarGrid.appendChild(outer);
    lpAttach1WeekMobileFlowBodyMinSync(wrap, scrollArea, bodyGrid);
    /* lpAttach 쪽에서 이미 min-height 동기화 rAF를 돌림 — 여기서 lpSync를 또 부르면 같은 프레임에 패딩·minHeight가 연달아 바뀌어 화면이 여러 번 튐 */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        syncCalendar1WeekSidebarHeaderHeight(calendarSection, todoSidebar);
      });
    });
  }

  lpCalendarNavQ(nav, wrap, ".calendar-nav-today").addEventListener("click", () => {
    weekOffset = 0;
    renderCalendar();
  });
  lpCalendarNavQ(nav, wrap, ".calendar-nav-prev").addEventListener("click", () => {
    weekOffset--;
    renderCalendar();
  });
  lpCalendarNavQ(nav, wrap, ".calendar-nav-next").addEventListener("click", () => {
    weekOffset++;
    renderCalendar();
  });

  calendarSection.appendChild(nav);
  calendarSection.appendChild(calendarGrid);
  wrap.appendChild(calendarSection);

  const todoSidebar = document.createElement("aside");
  todoSidebar.className = "calendar-todo-sidebar";
  todoSidebar.innerHTML = `
    ${lpCalendarTodoSidebarHeaderMarkup()}
    <div class="calendar-todo-sidebar-body">
      <div class="calendar-todo-sidebar-main"></div>
    </div>
  `;
  const body = todoSidebar.querySelector(".calendar-todo-sidebar-body");
  const mainWrap = body.querySelector(".calendar-todo-sidebar-main");
  const toolbarActionsSlot = todoSidebar.querySelector(
    ".calendar-todo-sidebar-toolbar-actions",
  );
  const todoListEl = renderTodoList(
    lpCalendarDateSidebarTodoListOpts(sidebarMode, {
      categoryToolbarActionsSlot: toolbarActionsSlot,
    }),
  );
  mainWrap.appendChild(lpWrapCalendarTodoSidebarListEl(todoListEl));
  applyCalendarTodoSidebarInitiallyCollapsed(todoSidebar);
  lpBindCalendarDateTodoSidebarCollapse(todoSidebar, () => {
    syncCalendar1WeekSidebarHeaderHeight(calendarSection, todoSidebar);
  });
  wrap.appendChild(todoSidebar);
  try {
    wrap._lpWeekSidebarRo?.disconnect();
    wrap._lpWeekSidebarRo = null;
  } catch (_) {}
  if (typeof ResizeObserver !== "undefined") {
    let weekSidebarRaf = null;
    wrap._lpWeekSidebarRo = new ResizeObserver(() => {
      if (weekSidebarRaf != null) return;
      weekSidebarRaf = requestAnimationFrame(() => {
        weekSidebarRaf = null;
        requestAnimationFrame(() => {
          syncCalendar1WeekSidebarHeaderHeight(calendarSection, todoSidebar);
        });
      });
    });
    wrap._lpWeekSidebarRo.observe(calendarSection);
  }
  attachCalendarTodoSidebarSpanRevertDrop(
    body,
    () => renderCalendar({ skipWeekPull: true }),
    () => refreshTodoList(),
  );

  wrap.addEventListener("dragend", () => {
    wrap
      .querySelectorAll(".calendar-day-drag-over")
      .forEach((el) => el.classList.remove("calendar-day-drag-over"));
  });

  /* 상위 renderSubView 가 같은 주간에 이미 시간·예산을 pull 한 뒤 호출함 — 여기서 또 pull 하면 전체 격자가 연달아 다시 그려져 줄이 여러 번 튐 */
  renderCalendar({ skipWeekPull: true });

  wrap._lpRefreshDateTodoSidebar = refreshTodoList;
  wrap._lpRefreshCalendarView = () => {
    renderCalendar({ skipWeekPull: true });
    refreshTodoList();
  };

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

/** body에 붙은 캘린더 떠있는 UI(할일 추가 버블·날짜 확장·반투명 오버레이) — 탭·서브뷰 전환 시 정리 */
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
  detachCalendarEventBubbleOutsideListener();
  document
    .querySelectorAll(".calendar-event-bubble")
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

  function refreshTodoList() {}

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
    const yearJumpBtn = lpCalendarNavQ(nav, wrap, ".calendar-nav-today");
    if (yearJumpBtn) yearJumpBtn.textContent = String(currentYear);
    table.innerHTML = "";

    for (let month = 0; month < 12; month++) {
      const lastDay = new Date(currentYear, month + 1, 0).getDate();
      const row = document.createElement("div");
      row.className = "calendar-annual-row";

      const monthLabel = document.createElement("div");
      monthLabel.className = "calendar-annual-row-month";
      monthLabel.textContent = MONTH_NAMES_EN[month];
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
              onAfterTaskEdit: () => {
                renderYear();
                refreshTodoList();
              },
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

  lpCalendarNavQ(nav, wrap, ".calendar-nav-today").addEventListener("click", () => {
    currentYear = new Date().getFullYear();
    renderYear();
  });
  lpCalendarNavQ(nav, wrap, ".calendar-nav-prev").addEventListener("click", () => {
    currentYear--;
    renderYear();
  });
  lpCalendarNavQ(nav, wrap, ".calendar-nav-next").addEventListener("click", () => {
    currentYear++;
    renderYear();
  });

  wrap._lpRefreshCalendarView = () => {
    renderYear();
  };

  return wrap;
}

const CALENDAR_SUB_VIEWS = [
  { id: "monthly", label: "월별" },
  { id: "2week", label: "2주" },
  { id: "1week", label: "1주" },
  { id: "annual", label: "연간" },
  { id: "1day", label: "타임블록" },
];

const MOBILE_SCHEDULE_CAL_SUB_VIEWS = [
  { id: "monthly", label: "월별" },
  { id: "1week", label: "1주" },
  { id: "annual", label: "연간" },
  { id: "1day", label: "타임블록" },
];

/**
 * 캘린더 탭 하위 뷰(월별·2주·1주·연간·오늘 해치우기) 공통 셸
 * @param {HTMLElement|null} tabsElement 상단에 붙일 외부 탭 행(없으면 null)
 * @param {{ subViewsList?: {id:string,label:string}[], storageKey?: string, forceInitialMonthlyOnMobile?: boolean, keepSubTabsOnTop?: boolean, todoSidebarMode?: string }} opts
 * todoSidebarMode: QUADRANT|FULL 모두 사이드바에 전체 할일 표시. NONE만 사이드바 생략.
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

  /** @type {HTMLElement | null} */
  let navLiftSlot = null;
  /** 모바일 일정 — 예상 일정 + 전용 슬롯(서브탭 줄 왼쪽), `render1DayView`에 직접 전달 */
  let scheduleMobileBudgetAddSlot = null;
  /** @type {HTMLElement} */
  let subTabsMountOuter;
  const subTabsControlRoot = document.createElement("div");

  function appendSubTabButtons() {
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
      subTabsControlRoot.appendChild(btn);
    });
  }

  function syncCalendarSubTabsSegmentThumb() {
    if (!subTabsControlRoot.classList.contains("time-view-tabs--segmented"))
      return;
    const btns = [...subTabsControlRoot.querySelectorAll(".time-view-tab")];
    const n = Math.max(1, btns.length);
    const idx = Math.max(
      0,
      btns.findIndex((b) => b.classList.contains("active")),
    );
    subTabsControlRoot.style.setProperty("--time-segment-count", String(n));
    subTabsControlRoot.style.setProperty("--thumb-col-start", String(idx + 1));
  }

  if (keepSubTabsOnTop) {
    navLiftSlot = document.createElement("div");
    navLiftSlot.className =
      "calendar-sub-tabs-strip calendar-sub-tabs-strip--right calendar-sub-tabs-nav-slot";

    subTabsControlRoot.className =
      "calendar-sub-tabs calendar-sub-tabs-segment calendar-schedule-segment-tabs time-view-tabs--segmented";

    const thumb = document.createElement("span");
    thumb.className = "time-view-tabs-thumb";
    thumb.setAttribute("aria-hidden", "true");
    subTabsControlRoot.appendChild(thumb);
    appendSubTabButtons();

    const bar = document.createElement("div");
    bar.className =
      "calendar-sub-tabs-bar calendar-sub-tabs-bar--schedule-mobile";

    const headerRow = document.createElement("div");
    headerRow.className =
      "calendar-sub-tab-header-row calendar-schedule-mobile-tab-header-row";

    const topLine = document.createElement("div");
    topLine.className = "calendar-schedule-tab-top-line";

    const budgetAddSlot = document.createElement("div");
    budgetAddSlot.className =
      "calendar-sub-tabs-strip calendar-sub-tabs-strip--left calendar-schedule-budget-add-slot";
    scheduleMobileBudgetAddSlot = budgetAddSlot;

    const centerStrip = document.createElement("div");
    centerStrip.className =
      "calendar-sub-tabs-strip calendar-sub-tabs-strip--center";
    centerStrip.appendChild(subTabsControlRoot);

    const topLineRightSpacer = document.createElement("div");
    topLineRightSpacer.className = "calendar-schedule-tab-top-line-spacer";
    topLineRightSpacer.setAttribute("aria-hidden", "true");

    topLine.appendChild(budgetAddSlot);
    topLine.appendChild(centerStrip);
    topLine.appendChild(topLineRightSpacer);
    headerRow.appendChild(topLine);
    headerRow.appendChild(navLiftSlot);
    bar.appendChild(headerRow);
    subTabsMountOuter = bar;
  } else {
    subTabsControlRoot.className = "calendar-sub-tabs";
    appendSubTabButtons();
    subTabsMountOuter = subTabsControlRoot;
  }

  wrap.appendChild(topRow);

  const contentArea = document.createElement("div");
  contentArea.className = "calendar-view-content-area";
  wrap.appendChild(contentArea);
  if (keepSubTabsOnTop) {
    wrap.insertBefore(subTabsMountOuter, contentArea);
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
    if (
      nav &&
      controls &&
      subTabsControlRoot.parentNode !== nav
    ) {
      subTabsControlRoot.remove();
      nav.insertBefore(subTabsControlRoot, controls);
    }
  }

  function liftMobileScheduleNavChrome() {
    if (!keepSubTabsOnTop || !navLiftSlot) return;
    navLiftSlot.replaceChildren();
    const layouts = contentArea.querySelectorAll(
      ".calendar-monthly-layout, .calendar-1day-view, .calendar-annual-view",
    );
    layouts.forEach((el) => {
      try {
        delete el._lpCalendarNavQueryRoot;
      } catch (_) {}
    });
    contentArea
      .querySelectorAll(".calendar-monthly-nav--chrome-lifted")
      .forEach((n) =>
        n.classList.remove("calendar-monthly-nav--chrome-lifted"),
      );

    const nav = contentArea.querySelector(
      ".calendar-monthly-nav, .calendar-1day-nav",
    );
    if (!nav) return;
    const dateEl = nav.querySelector(".calendar-nav-date");
    const controls = nav.querySelector(".calendar-nav-controls");
    if (!dateEl && !controls) return;
    const cluster = document.createElement("div");
    cluster.className = "calendar-sub-tabs-nav-cluster";
    if (dateEl) cluster.appendChild(dateEl);
    if (controls) cluster.appendChild(controls);
    navLiftSlot.appendChild(cluster);
    nav.classList.add("calendar-monthly-nav--chrome-lifted");
    nav.replaceChildren();
    layouts.forEach((el) => {
      el._lpCalendarNavQueryRoot = cluster;
    });
  }

  let _nestedSubViewGen = 0;
  let activeSubViewId = initialSubView;

  /**
   * 월별·1주 등 서브탭 전환: 먼저 뷰를 그린 뒤(즉시 반응), skipPull 아닐 때만 서버 pull 후 `_lpRefreshCalendarView`로 반영.
   * 예전에는 pull을 전부 await 한 다음에야 DOM을 바꿔 네트워크 지연만큼 탭이 멈춘 것처럼 보였음.
   */
  function renderSubView(subViewId, subOpts = {}) {
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

    if (gen !== _nestedSubViewGen) return;
    if (navLiftSlot) navLiftSlot.replaceChildren();
    wrap
      .querySelector(".calendar-schedule-budget-add-slot")
      ?.replaceChildren();
    if (subTabsMountOuter.parentNode) subTabsMountOuter.remove();
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
      contentArea.appendChild(
        render1DayView(
          null,
          todoSidebarMode,
          keepSubTabsOnTop ? scheduleMobileBudgetAddSlot : null,
        ),
      );
    }
    if (keepSubTabsOnTop) {
      wrap.insertBefore(subTabsMountOuter, contentArea);
      liftMobileScheduleNavChrome();
      syncCalendarSubTabsSegmentThumb();
    } else {
      placeSubTabsInNav();
    }
    localStorage.setItem(storageKey, subViewId);
    syncMobileSchedule1dayOverflowChain();

    if (skipPull) return;

    void (async () => {
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
      } else if (subViewId === "1week") {
        try {
          const wk = getCalendarGridFor1Week(0);
          const ks = wk
            .map((d) => (d ? formatDateKey(d) : ""))
            .filter(Boolean);
          const rs0 = ks[0];
          const re0 = ks[ks.length - 1];
          if (rs0 && re0) {
            await Promise.all([
              pullTimeLedgerEntriesForDateRange(rs0, re0),
              pullTimeDailyBudgetFromSupabase(),
            ]);
          }
        } catch (_) {}
      }
      if (gen !== _nestedSubViewGen) return;
      const layout = contentArea.querySelector(".calendar-monthly-layout");
      try {
        layout?._lpRefreshCalendarView?.();
      } catch (_) {}
    })();
  }

  /** 하단 일정 탭 · 모바일(≤48rem): flex/overflow가 CSS 순서에 밀리지 않게 1일 뷰 체인을 인라인으로 확정 */
  function syncMobileSchedule1dayOverflowChain() {
    if (!keepSubTabsOnTop) return;
    const scheduleRoot = wrap.closest(".calendar-view--mobile-schedule");
    if (!scheduleRoot) return;
    const mq =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 48rem)").matches;
    const props = [
      "overflow",
      "overflow-x",
      "overflow-y",
      "flex",
      "flex-direction",
      "align-items",
      "min-height",
      "max-height",
      "max-width",
      "min-width",
      "width",
      "box-sizing",
    ];
    const clearEl = (el) => {
      if (!el) return;
      props.forEach((p) => {
        try {
          el.style.removeProperty(p);
        } catch (_) {}
      });
    };
    const stampEl = (el) => {
      if (!el) return;
      try {
        /* flex:0 0 auto 만 주면 자식 min-content 폭만큼 부모가 늘어나 뷰포트를 밀어냄 → 폭 상한·min-width:0 필수 */
        el.style.setProperty("box-sizing", "border-box", "important");
        el.style.setProperty("max-width", "100%", "important");
        el.style.setProperty("min-width", "0", "important");
        el.style.setProperty("flex", "0 0 auto", "important");
        el.style.setProperty("min-height", "min-content", "important");
        el.style.setProperty("max-height", "none", "important");
        if (el.classList.contains("calendar-1day-split-layout")) {
          el.style.setProperty("flex-direction", "column", "important");
          el.style.setProperty("width", "100%", "important");
          el.style.setProperty("align-items", "stretch", "important");
        }
        if (el.classList.contains("calendar-1day-budget-column")) {
          el.style.setProperty("overflow-x", "auto", "important");
          el.style.setProperty("overflow-y", "visible", "important");
        } else if (el.classList.contains("calendar-1day-time-column")) {
          el.style.setProperty("width", "100%", "important");
          el.style.setProperty("overflow-x", "hidden", "important");
          el.style.setProperty("overflow-y", "visible", "important");
        } else {
          el.style.setProperty("overflow", "visible", "important");
        }
      } catch (_) {}
    };
    const chainEls = () => {
      const one = contentArea.querySelector(".calendar-1day-view");
      const split = one?.querySelector(".calendar-1day-split-layout");
      return [
        scheduleRoot.querySelector(".calendar-content-wrap"),
        wrap,
        contentArea,
        one,
        one?.querySelector(".calendar-monthly-main"),
        split,
        split?.querySelector(".calendar-1day-budget-column"),
        split?.querySelector(".calendar-1day-time-column"),
      ];
    };
    if (!mq || activeSubViewId !== "1day") {
      chainEls().forEach(clearEl);
      return;
    }
    /* 이중 rAF 는 첫 1~2프레임 동안 인라인이 비어 데스크톱형 flex(가로 6:4)가 잠깐 보이는 원인 — CSS로 체인 보강 후 동기 스탬프 */
    chainEls().forEach(stampEl);
  }

  subTabsControlRoot.querySelectorAll(".calendar-sub-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      subTabsControlRoot
        .querySelectorAll(".calendar-sub-tab")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      syncCalendarSubTabsSegmentThumb();
      void renderSubView(btn.dataset.subView);
    });
  });

  const activeBtn = subTabsControlRoot.querySelector(
    `[data-sub-view="${initialSubView}"]`,
  );
  if (activeBtn) {
    subTabsControlRoot
      .querySelectorAll(".calendar-sub-tab")
      .forEach((b) => b.classList.remove("active"));
    activeBtn.classList.add("active");
  }
  syncCalendarSubTabsSegmentThumb();
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

/** 모바일 하단 '일정' 탭: 월별·1주·연간·오늘 해치우기(상단 서브탭) */
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
  titleEl.textContent = "일정";
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
        /* 모바일: 화면 세로 한정 — 할일 사이드바 생략, 예산 표 + 24h 타임테이블만 */
        todoSidebarMode: LP_CAL_TODO_SIDEBAR_NONE,
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
  const savedWidth = parseInt(
    localStorage.getItem(EISENHOWER_SIDEBAR_WIDTH_KEY),
    10,
  );
  const sidebarWidth = Number.isFinite(savedWidth)
    ? Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, savedWidth))
    : DEFAULT_SIDEBAR_WIDTH;
  todoSidebar.style.width = `${sidebarWidth}px`;
  todoSidebar.innerHTML = `
    ${lpCalendarTodoSidebarHeaderMarkup()}
    <div class="calendar-todo-sidebar-body" title="우선순위 취소: 사분면 항목을 여기로 드래그"></div>
  `;
  let todoListEl = renderTodoListForEisenhowerSidebar({
    enableDragToEisenhower: true,
  });
  todoSidebar
    .querySelector(".calendar-todo-sidebar-body")
    .appendChild(todoListEl);
  applyCalendarTodoSidebarInitiallyCollapsed(todoSidebar, {
    clearInlineWidth: true,
  });
  let sidebarCollapsed = todoSidebar.classList.contains("collapsed");
  const collapseTextEl = todoSidebar.querySelector(
    ".calendar-todo-sidebar-collapse-text",
  );
  todoSidebar
    .querySelector(".calendar-todo-sidebar-collapse")
    .addEventListener("click", () => {
      sidebarCollapsed = !sidebarCollapsed;
      todoSidebar.classList.toggle("collapsed", sidebarCollapsed);
      if (collapseTextEl)
        collapseTextEl.textContent = sidebarCollapsed ? ">>" : "<<";
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
      try {
        sessionStorage.setItem(
          LP_CAL_TODO_SIDEBAR_EXPANDED_KEY,
          sidebarCollapsed ? "0" : "1",
        );
      } catch (_) {}
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
  titleEl.textContent = "할일";
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
          ".time-ledger-toolbar-icons .todo-list-settings-btn, .todo-list-settings-btn",
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
export { render1DayView, LP_CAL_TODO_SIDEBAR_NONE };
